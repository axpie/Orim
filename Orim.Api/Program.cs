using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.IdentityModel.Tokens;
using Orim.Api.Hubs;
using Orim.Api.Services;
using Orim.Core;
using Orim.Core.Models;
using Orim.Core.Services;
using Orim.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

// --- Data path ---
var dataPath = builder.Configuration.GetValue<string>("DataPath") ?? "data";
if (!Path.IsPathRooted(dataPath))
    dataPath = Path.Combine(builder.Environment.ContentRootPath, dataPath);

#if DEBUG
const bool useDebugStorage = true;
#else
const bool useDebugStorage = false;
#endif

// --- Services ---
builder.Services.AddOrimInfrastructure(dataPath, useDebugStorage);
builder.Services.AddSingleton(sp => new AssistantSettingsService(
    Path.Combine(dataPath, "assistant-settings.json"),
    builder.Configuration,
    sp.GetRequiredService<ILogger<AssistantSettingsService>>()));
builder.Services.AddSingleton<DiagramAssistantService>();
builder.Services.AddSingleton(new ThemeCatalogApiService(ThemeCatalogApiService.ResolveThemesPath(dataPath, builder.Environment.ContentRootPath)));
builder.Services.AddSignalR().AddJsonProtocol(options =>
{
    options.PayloadSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.PayloadSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
});

// --- JWT Authentication ---
var jwtKey = builder.Configuration["Jwt:Key"]?.Trim();
if (string.IsNullOrWhiteSpace(jwtKey))
{
    throw new InvalidOperationException(
        "Jwt:Key is not configured. Set Jwt__Key in Azure App Service application settings or provide it via an Azure Key Vault reference before startup.");
}

if (Encoding.UTF8.GetByteCount(jwtKey) < 32)
{
    throw new InvalidOperationException(
        "Jwt:Key is too short. Configure Jwt__Key with at least 32 characters for HMAC-SHA256 signing.");
}

var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "OrimApi";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "OrimSpa";
var jwtExpiryMinutes = builder.Configuration.GetValue("Jwt:ExpiryMinutes", 480);

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };

        // Allow SignalR to receive the JWT via query string
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
                {
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

// --- CORS ---
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? ["http://localhost:5173"];

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
});

var app = builder.Build();

// --- Seed admin user ---
using (var scope = app.Services.CreateScope())
{
    var userService = scope.ServiceProvider.GetRequiredService<UserService>();
    var seedUsername = app.Configuration.GetValue<string>("SeedAdmin:Username") ?? "admin";
    var seedPassword = app.Configuration.GetValue<string>("SeedAdmin:Password");
    var resetPasswordOnStartup = app.Configuration.GetValue<bool>("SeedAdmin:ResetPasswordOnStartup");
    var existingAdmin = await userService.GetByUsernameAsync(seedUsername);

    if (existingAdmin is null && !string.IsNullOrWhiteSpace(seedPassword))
    {
        await userService.CreateUserAsync(seedUsername, seedPassword, UserRole.Admin);
        app.Logger.LogInformation("Seeded initial admin user '{Username}'.", seedUsername);
    }
    else if (existingAdmin is not null && resetPasswordOnStartup && !string.IsNullOrWhiteSpace(seedPassword))
    {
        await userService.SetPasswordAsync(existingAdmin.Id, seedPassword);
        app.Logger.LogWarning("Admin password for '{Username}' was reset.", seedUsername);
    }
}

// --- Middleware ---
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseDefaultFiles();
app.UseStaticFiles();

// --- Helper to generate JWT ---
string GenerateJwtToken(User user)
{
    var claims = new[]
    {
        new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
        new Claim(ClaimTypes.Name, user.Username),
        new Claim(ClaimTypes.Role, user.Role.ToString())
    };

    var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
    var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
    var token = new JwtSecurityToken(
        issuer: jwtIssuer,
        audience: jwtAudience,
        claims: claims,
        expires: DateTime.UtcNow.AddMinutes(jwtExpiryMinutes),
        signingCredentials: credentials);

    return new JwtSecurityTokenHandler().WriteToken(token);
}

Guid GetUserId(HttpContext context) =>
    Guid.Parse(context.User.FindFirstValue(ClaimTypes.NameIdentifier)!);

string GetUsername(HttpContext context) =>
    context.User.FindFirstValue(ClaimTypes.Name)!;

bool IsAdmin(HttpContext context) =>
    context.User.IsInRole("Admin");

// ==========================================================================
// AUTH ENDPOINTS
// ==========================================================================

app.MapPost("/api/auth/login", async (LoginRequest request, UserService userService) =>
{
    var user = await userService.AuthenticateAsync(request.Username, request.Password);
    if (user is null)
        return Results.Unauthorized();

    var token = GenerateJwtToken(user);
    return Results.Ok(new LoginResponse(token, user.Id, user.Username, user.Role));
});

app.MapPost("/api/auth/refresh", [Authorize] async (HttpContext context, UserService userService) =>
{
    var userId = GetUserId(context);
    var user = await userService.GetByIdAsync(userId);
    if (user is null || !user.IsActive)
        return Results.Unauthorized();

    var token = GenerateJwtToken(user);
    return Results.Ok(new LoginResponse(token, user.Id, user.Username, user.Role));
});

// ==========================================================================
// USER ENDPOINTS
// ==========================================================================

app.MapGet("/api/users", [Authorize(Roles = "Admin")] async (UserService userService) =>
{
    var users = await userService.GetAllUsersAsync();
    return Results.Ok(users.Select(u => new UserDto(u.Id, u.Username, u.Role, u.IsActive, u.CreatedAt)));
});

app.MapGet("/api/users/{id:guid}", [Authorize] async (Guid id, HttpContext context, UserService userService) =>
{
    if (!IsAdmin(context) && GetUserId(context) != id)
        return Results.Forbid();

    var user = await userService.GetByIdAsync(id);
    return user is null ? Results.NotFound() : Results.Ok(new UserDto(user.Id, user.Username, user.Role, user.IsActive, user.CreatedAt));
});

app.MapPost("/api/users", [Authorize(Roles = "Admin")] async (CreateUserRequest request, UserService userService) =>
{
    var user = await userService.CreateUserAsync(request.Username, request.Password, request.Role);
    return Results.Created($"/api/users/{user.Id}", new UserDto(user.Id, user.Username, user.Role, user.IsActive, user.CreatedAt));
});

app.MapPut("/api/users/{id:guid}/password", [Authorize] async (Guid id, ChangePasswordRequest request, HttpContext context, UserService userService) =>
{
    if (!IsAdmin(context) && GetUserId(context) != id)
        return Results.Forbid();

    await userService.SetPasswordAsync(id, request.NewPassword);
    return Results.NoContent();
});

app.MapPut("/api/users/{id:guid}/deactivate", [Authorize(Roles = "Admin")] async (Guid id, UserService userService) =>
{
    await userService.DeactivateUserAsync(id);
    return Results.NoContent();
});

app.MapDelete("/api/users/{id:guid}", [Authorize(Roles = "Admin")] async (Guid id, UserService userService) =>
{
    await userService.DeleteUserAsync(id);
    return Results.NoContent();
});

app.MapGet("/api/boards/{id:guid}/shareable-users", [Authorize] async (Guid id, string? query, HttpContext context, BoardService boardService, UserService userService) =>
{
    var board = await boardService.GetBoardAsync(id);
    if (board is null) return Results.NotFound();

    if (!boardService.HasAccess(board, GetUserId(context), BoardRole.Owner))
        return Results.Forbid();

    var memberIds = board.Members
        .Select(member => member.UserId)
        .Append(board.OwnerId)
        .ToHashSet();

    var normalizedQuery = query?.Trim();
    var users = await userService.GetAllUsersAsync();
    var results = users
        .Where(user => user.IsActive)
        .Where(user => !memberIds.Contains(user.Id))
        .Where(user => string.IsNullOrWhiteSpace(normalizedQuery) ||
                       user.Username.Contains(normalizedQuery, StringComparison.OrdinalIgnoreCase))
        .OrderBy(user => user.Username, StringComparer.OrdinalIgnoreCase)
        .Take(20)
        .Select(user => new UserDto(user.Id, user.Username, user.Role, user.IsActive, user.CreatedAt));

    return Results.Ok(results);
});

app.MapGet("/api/themes", [Authorize] async (ThemeCatalogApiService themeCatalogService) =>
{
    var themes = await themeCatalogService.GetEnabledThemesAsync();
    return Results.Ok(themes);
}).AllowAnonymous();

app.MapGet("/api/admin/themes", [Authorize(Roles = "Admin")] async (ThemeCatalogApiService themeCatalogService) =>
{
    var themes = await themeCatalogService.GetThemesAsync();
    return Results.Ok(themes);
});

app.MapPost("/api/admin/themes/import", [Authorize(Roles = "Admin")] async (HttpRequest request, ThemeCatalogApiService themeCatalogService) =>
{
    var form = await request.ReadFormAsync();
    var file = form.Files["file"];
    if (file is null || file.Length == 0)
    {
        return Results.BadRequest("No theme file uploaded.");
    }

    try
    {
        await using var stream = file.OpenReadStream();
        var theme = await themeCatalogService.ImportThemeAsync(stream);
        return Results.Ok(theme);
    }
    catch (Exception ex) when (ex is InvalidOperationException or JsonException)
    {
        return Results.BadRequest(ex.Message);
    }
});

app.MapPut("/api/admin/themes/{key}/enabled", [Authorize(Roles = "Admin")] async (string key, ThemeAvailabilityRequest request, ThemeCatalogApiService themeCatalogService) =>
{
    try
    {
        await themeCatalogService.SetEnabledAsync(key, request.Enabled);
        return Results.NoContent();
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(ex.Message);
    }
});

app.MapGet("/api/admin/themes/{key}/export", [Authorize(Roles = "Admin")] async (string key, ThemeCatalogApiService themeCatalogService) =>
{
    try
    {
        var json = await themeCatalogService.ExportThemeJsonAsync(key);
        return Results.File(Encoding.UTF8.GetBytes(json), "application/json", $"{key}.json");
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(ex.Message);
    }
});

app.MapDelete("/api/admin/themes/{key}", [Authorize(Roles = "Admin")] async (string key, ThemeCatalogApiService themeCatalogService) =>
{
    try
    {
        await themeCatalogService.DeleteThemeAsync(key);
        return Results.NoContent();
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(ex.Message);
    }
});

app.MapGet("/api/admin/assistant-settings", [Authorize(Roles = "Admin")] (AssistantSettingsService assistantSettingsService) =>
{
    return Results.Ok(assistantSettingsService.GetAdminSettings());
});

app.MapGet("/api/assistant/status", [Authorize] (AssistantSettingsService assistantSettingsService) =>
{
    var snapshot = assistantSettingsService.GetSnapshot();
    return Results.Ok(new AssistantAvailability(snapshot.IsEnabled, snapshot.IsConfigured));
});

app.MapPut("/api/admin/assistant-settings", [Authorize(Roles = "Admin")] async (AssistantSettingsRequest request, AssistantSettingsService assistantSettingsService, HttpContext context) =>
{
    try
    {
        var updated = await assistantSettingsService.UpdateAsync(
            new AssistantSettingsUpdate(
                request.Enabled,
                request.Endpoint,
                request.DeploymentName,
                request.ApiKey),
            context.RequestAborted);

        return Results.Ok(updated);
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(ex.Message);
    }
});

// ==========================================================================
// BOARD ENDPOINTS
// ==========================================================================

app.MapGet("/api/boards", [Authorize] async (HttpContext context, BoardService boardService) =>
{
    var userId = GetUserId(context);
    var summaries = await boardService.GetAccessibleBoardSummariesAsync(userId);
    return Results.Ok(summaries);
});

app.MapGet("/api/boards/templates", [Authorize] (BoardService boardService) =>
{
    return Results.Ok(boardService.GetTemplates());
});

app.MapGet("/api/boards/{id:guid}", [Authorize] async (Guid id, HttpContext context, BoardService boardService) =>
{
    var board = await boardService.GetBoardAsync(id);
    if (board is null) return Results.NotFound();

    var userId = GetUserId(context);
    if (!boardService.HasAccess(board, userId))
        return Results.Forbid();

    return Results.Ok(board);
});

app.MapPost("/api/boards", [Authorize] async (CreateBoardRequest request, HttpContext context, BoardService boardService) =>
{
    var userId = GetUserId(context);
    var username = GetUsername(context);
    var board = await boardService.CreateBoardAsync(request.Title, userId, username, request.TemplateId);
    return Results.Created($"/api/boards/{board.Id}", board);
});

app.MapPut("/api/boards/{id:guid}", [Authorize] async (Guid id, Board updatedBoard, HttpContext context, BoardService boardService) =>
{
    var board = await boardService.GetBoardAsync(id);
    if (board is null) return Results.NotFound();

    var userId = GetUserId(context);
    if (!boardService.HasAccess(board, userId, BoardRole.Editor))
        return Results.Forbid();

    updatedBoard.Id = id;
    updatedBoard.OwnerId = board.OwnerId;
    await boardService.UpdateBoardAsync(updatedBoard);
    return Results.Ok(updatedBoard);
});

app.MapDelete("/api/boards/{id:guid}", [Authorize] async (Guid id, HttpContext context, BoardService boardService) =>
{
    var board = await boardService.GetBoardAsync(id);
    if (board is null) return Results.NotFound();

    var userId = GetUserId(context);
    if (!boardService.HasAccess(board, userId, BoardRole.Owner))
        return Results.Forbid();

    await boardService.DeleteBoardAsync(id);
    return Results.NoContent();
});

// ==========================================================================
// BOARD SHARING & MEMBERS
// ==========================================================================

app.MapPut("/api/boards/{id:guid}/visibility", [Authorize] async (Guid id, SetVisibilityRequest request, HttpContext context, BoardService boardService) =>
{
    var board = await boardService.GetBoardAsync(id);
    if (board is null) return Results.NotFound();

    if (!boardService.HasAccess(board, GetUserId(context), BoardRole.Owner))
        return Results.Forbid();

    board.Visibility = request.Visibility;
    board.SharedAllowAnonymousEditing = request.Visibility == BoardVisibility.Public && request.AllowAnonymousEditing;
    await boardService.UpdateBoardAsync(board, kind: BoardChangeKind.Metadata);
    return Results.Ok(board);
});

app.MapPost("/api/boards/{id:guid}/share-token", [Authorize] async (Guid id, HttpContext context, BoardService boardService) =>
{
    var board = await boardService.GetBoardAsync(id);
    if (board is null) return Results.NotFound();

    if (!boardService.HasAccess(board, GetUserId(context), BoardRole.Owner))
        return Results.Forbid();

    board.ShareLinkToken = boardService.GenerateShareLinkToken();
    await boardService.UpdateBoardAsync(board, kind: BoardChangeKind.Metadata);
    return Results.Ok(new { board.ShareLinkToken });
});

app.MapGet("/api/boards/shared/{token}", async (string token, BoardService boardService) =>
{
    var board = await boardService.GetBoardByShareTokenAsync(token);
    if (board is null) return Results.NotFound();
    if (board.Visibility != BoardVisibility.Public) return Results.NotFound();
    if (boardService.IsSharePasswordProtected(board))
        return Results.Ok(new { requiresPassword = true, boardId = board.Id, title = board.Title });
    return Results.Ok(board);
}).AllowAnonymous();

app.MapPost("/api/boards/shared/{token}/validate-password", async (string token, ValidatePasswordRequest request, BoardService boardService) =>
{
    var board = await boardService.GetBoardByShareTokenAsync(token);
    if (board is null) return Results.NotFound();

    if (!boardService.ValidateSharePassword(board, request.Password))
        return Results.Json(new { valid = false }, statusCode: 403);

    return Results.Ok(board);
}).AllowAnonymous();

app.MapPut("/api/boards/shared/{token}/content", async (string token, SharedBoardUpdateRequest request, BoardService boardService) =>
{
    var board = await boardService.GetBoardByShareTokenAsync(token);
    if (board is null) return Results.NotFound();
    if (!string.Equals(board.ShareLinkToken, token, StringComparison.Ordinal)) return Results.NotFound();
    if (!boardService.HasSharedLinkAccess(board, request.Password, BoardRole.Editor)) return Results.Forbid();

    boardService.ReplaceBoardContent(board, request.Board);
    await boardService.UpdateBoardAsync(board, request.SourceClientId, BoardChangeKind.Content);
    return Results.Ok(board);
}).AllowAnonymous();

app.MapPost("/api/boards/{id:guid}/share-password", [Authorize] async (Guid id, SetSharePasswordRequest request, HttpContext context, BoardService boardService) =>
{
    var board = await boardService.GetBoardAsync(id);
    if (board is null) return Results.NotFound();

    if (!boardService.HasAccess(board, GetUserId(context), BoardRole.Owner))
        return Results.Forbid();

    if (string.IsNullOrWhiteSpace(request.Password))
        boardService.ClearSharePassword(board);
    else
        boardService.SetSharePassword(board, request.Password);

    await boardService.UpdateBoardAsync(board, kind: BoardChangeKind.Metadata);
    return Results.NoContent();
});

app.MapPost("/api/boards/{id:guid}/members", [Authorize] async (Guid id, AddMemberRequest request, HttpContext context, BoardService boardService, UserService userService) =>
{
    var board = await boardService.GetBoardAsync(id);
    if (board is null) return Results.NotFound();

    if (!boardService.HasAccess(board, GetUserId(context), BoardRole.Owner))
        return Results.Forbid();

    var user = await userService.GetByUsernameAsync(request.Username);
    if (user is null) return Results.NotFound("User not found.");

    boardService.AddMember(board, user, request.Role);
    await boardService.UpdateBoardAsync(board, kind: BoardChangeKind.Metadata);
    return Results.Ok(board.Members);
});

app.MapDelete("/api/boards/{id:guid}/members/{userId:guid}", [Authorize] async (Guid id, Guid userId, HttpContext context, BoardService boardService) =>
{
    var board = await boardService.GetBoardAsync(id);
    if (board is null) return Results.NotFound();

    if (!boardService.HasAccess(board, GetUserId(context), BoardRole.Owner))
        return Results.Forbid();

    boardService.RemoveMember(board, userId);
    await boardService.UpdateBoardAsync(board, kind: BoardChangeKind.Metadata);
    return Results.NoContent();
});

app.MapPut("/api/boards/{id:guid}/members/{userId:guid}/role", [Authorize] async (Guid id, Guid userId, UpdateMemberRoleRequest request, HttpContext context, BoardService boardService) =>
{
    var board = await boardService.GetBoardAsync(id);
    if (board is null) return Results.NotFound();

    if (!boardService.HasAccess(board, GetUserId(context), BoardRole.Owner))
        return Results.Forbid();

    boardService.UpdateMemberRole(board, userId, request.Role);
    await boardService.UpdateBoardAsync(board, kind: BoardChangeKind.Metadata);
    return Results.NoContent();
});

// ==========================================================================
// SNAPSHOTS & CONTENT
// ==========================================================================

app.MapPost("/api/boards/{id:guid}/snapshots", [Authorize] async (Guid id, CreateSnapshotRequest request, HttpContext context, BoardService boardService) =>
{
    var board = await boardService.GetBoardAsync(id);
    if (board is null) return Results.NotFound();

    if (!boardService.HasAccess(board, GetUserId(context), BoardRole.Editor))
        return Results.Forbid();

    var userId = GetUserId(context);
    var username = GetUsername(context);
    var snapshot = boardService.CreateSnapshot(board, request.Name, userId, username);
    await boardService.UpdateBoardAsync(board, kind: BoardChangeKind.Metadata);
    return Results.Created($"/api/boards/{id}/snapshots/{snapshot.Id}", snapshot);
});

app.MapPost("/api/boards/{id:guid}/snapshots/{snapshotId:guid}/restore", [Authorize] async (Guid id, Guid snapshotId, HttpContext context, BoardService boardService) =>
{
    var board = await boardService.GetBoardAsync(id);
    if (board is null) return Results.NotFound();

    if (!boardService.HasAccess(board, GetUserId(context), BoardRole.Editor))
        return Results.Forbid();

    boardService.RestoreSnapshot(board, snapshotId);
    await boardService.UpdateBoardAsync(board);
    return Results.Ok(board);
});

app.MapPut("/api/boards/{id:guid}/content", [Authorize] async (Guid id, Board importedBoard, HttpContext context, BoardService boardService) =>
{
    var board = await boardService.GetBoardAsync(id);
    if (board is null) return Results.NotFound();

    if (!boardService.HasAccess(board, GetUserId(context), BoardRole.Editor))
        return Results.Forbid();

    boardService.ReplaceBoardContent(board, importedBoard);
    await boardService.UpdateBoardAsync(board);
    return Results.Ok(board);
});

app.MapPost("/api/boards/import", [Authorize] async (ImportBoardRequest request, HttpContext context, BoardService boardService) =>
{
    var userId = GetUserId(context);
    var username = GetUsername(context);
    var importedBoard = JsonSerializer.Deserialize<Board>(request.BoardJson, OrimJsonOptions.Default);
    if (importedBoard is null) return Results.BadRequest("Invalid board JSON.");

    var board = await boardService.CreateBoardFromImportAsync(importedBoard, request.Title ?? importedBoard.Title, userId, username);
    return Results.Created($"/api/boards/{board.Id}", board);
});

app.MapGet("/api/boards/{id:guid}/export/json", [Authorize] async (Guid id, HttpContext context, BoardService boardService) =>
{
    var board = await boardService.GetBoardAsync(id);
    if (board is null) return Results.NotFound();

    if (!boardService.HasAccess(board, GetUserId(context)))
        return Results.Forbid();

    var json = JsonSerializer.Serialize(board, OrimJsonOptions.Indented);
    return Results.Text(json, "application/json");
});

app.MapGet("/api/boards/{id:guid}/export/pdf", [Authorize] async (Guid id, HttpContext context, BoardService boardService) =>
{
    var board = await boardService.GetBoardAsync(id);
    if (board is null) return Results.NotFound();

    if (!boardService.HasAccess(board, GetUserId(context)))
        return Results.Forbid();

    using var document = new PdfSharp.Pdf.PdfDocument();
    var page = document.AddPage();
    page.Width = PdfSharp.Drawing.XUnit.FromPoint(842);
    page.Height = PdfSharp.Drawing.XUnit.FromPoint(595);
    var gfx = PdfSharp.Drawing.XGraphics.FromPdfPage(page);
    gfx.DrawRectangle(PdfSharp.Drawing.XBrushes.White, 0, 0, page.Width.Point, page.Height.Point);

    foreach (var element in board.Elements.OrderBy(e => e.ZIndex))
    {
        if (element is ShapeElement shape)
        {
            var fillBrush = new PdfSharp.Drawing.XSolidBrush(PdfSharp.Drawing.XColor.FromArgb(ParseColor(shape.FillColor)));
            var strokePen = new PdfSharp.Drawing.XPen(PdfSharp.Drawing.XColor.FromArgb(ParseColor(shape.StrokeColor)), shape.StrokeWidth);
            switch (shape.ShapeType)
            {
                case ShapeType.Rectangle:
                    gfx.DrawRectangle(strokePen, fillBrush, shape.X, shape.Y, shape.Width, shape.Height);
                    break;
                case ShapeType.Ellipse:
                    gfx.DrawEllipse(strokePen, fillBrush, shape.X, shape.Y, shape.Width, shape.Height);
                    break;
                case ShapeType.Triangle:
                    var pts = new PdfSharp.Drawing.XPoint[]
                    {
                        new(shape.X + shape.Width / 2, shape.Y),
                        new(shape.X, shape.Y + shape.Height),
                        new(shape.X + shape.Width, shape.Y + shape.Height)
                    };
                    var path = new PdfSharp.Drawing.XGraphicsPath();
                    path.AddPolygon(pts);
                    gfx.DrawPath(strokePen, fillBrush, path);
                    break;
            }

            if (!string.IsNullOrWhiteSpace(shape.Label))
            {
                var font = new PdfSharp.Drawing.XFont("Arial", Math.Max(8, shape.LabelFontSize ?? 12));
                gfx.DrawString(shape.Label, font, PdfSharp.Drawing.XBrushes.Black,
                    new PdfSharp.Drawing.XRect(shape.X, shape.Y, shape.Width, shape.Height),
                    PdfSharp.Drawing.XStringFormats.Center);
            }
        }
        else if (element is TextElement text)
        {
            var font = new PdfSharp.Drawing.XFont("Arial", text.FontSize,
                (text.IsBold ? PdfSharp.Drawing.XFontStyleEx.Bold : 0) |
                (text.IsItalic ? PdfSharp.Drawing.XFontStyleEx.Italic : 0));
            var brush = new PdfSharp.Drawing.XSolidBrush(PdfSharp.Drawing.XColor.FromArgb(ParseColor(text.Color)));
            gfx.DrawString(text.Text, font, brush,
                new PdfSharp.Drawing.XRect(text.X, text.Y, Math.Max(text.Width, 100), Math.Max(text.Height, 30)),
                PdfSharp.Drawing.XStringFormats.TopLeft);
        }
    }

    using var ms = new MemoryStream();
    document.Save(ms, false);
    return Results.File(ms.ToArray(), "application/pdf", $"{board.Title}.pdf");
});

// ==========================================================================
// AI ASSISTANT
// ==========================================================================

app.MapPost("/api/boards/{id:guid}/assistant", [Authorize] async (Guid id, AssistantRequest request, HttpContext context, BoardService boardService, DiagramAssistantService assistantService) =>
{
    var board = await boardService.GetBoardAsync(id);
    if (board is null) return Results.NotFound();

    if (!boardService.HasAccess(board, GetUserId(context), BoardRole.Editor))
        return Results.Forbid();

    var unavailableReason = assistantService.GetUnavailableReason();
    if (unavailableReason is not null)
        return Results.Json(new { error = unavailableReason }, statusCode: 503);

    var events = new List<DiagramAssistantEvent>();
    await foreach (var evt in assistantService.StreamDiagramAsync(board, request.Messages, context.RequestAborted))
    {
        events.Add(evt);
    }

    // Save updated board if elements were modified
    if (events.Any(e => e.Type is EventType.ElementAdded or EventType.ElementUpdated or EventType.ElementRemoved or EventType.BoardCleared))
    {
        await boardService.UpdateBoardAsync(board);
    }

    return Results.Ok(new { events, board });
});

// ==========================================================================
// PRESENCE (anonymous fallback for page unload)
// ==========================================================================

app.MapPost("/api/presence/leave", async (PresenceLeaveRequest request, BoardPresenceService presenceService) =>
{
    if (request.BoardId == Guid.Empty || string.IsNullOrWhiteSpace(request.ClientId))
        return Results.BadRequest();

    await presenceService.RemoveCursorAsync(request.BoardId, request.ClientId);
    return Results.Ok();
}).AllowAnonymous();

// ==========================================================================
// SignalR Hub
// ==========================================================================

app.MapHub<BoardHub>("/hubs/board");
app.MapFallbackToFile("/index.html");

app.Run();

static int ParseColor(string hex)
{
    if (string.IsNullOrWhiteSpace(hex))
        return unchecked((int)0xFF000000);

    var value = hex.TrimStart('#');
    if (value.Length == 3)
        value = string.Concat(value.Select(c => new string(c, 2)));

    if (int.TryParse(value, System.Globalization.NumberStyles.HexNumber, null, out var color))
        return unchecked((int)(0xFF000000 | (uint)color));

    return unchecked((int)0xFF000000);
}

// ==========================================================================
// Request / Response DTOs
// ==========================================================================

record LoginRequest(string Username, string Password);
record LoginResponse(string Token, Guid UserId, string Username, UserRole Role);
record UserDto(Guid Id, string Username, UserRole Role, bool IsActive, DateTime CreatedAt);
record CreateUserRequest(string Username, string Password, UserRole Role);
record ChangePasswordRequest(string NewPassword);
record CreateBoardRequest(string Title, string? TemplateId = null);
record SetVisibilityRequest(BoardVisibility Visibility, bool AllowAnonymousEditing = false);
record ValidatePasswordRequest(string Password);
record SharedBoardUpdateRequest(Board Board, string? Password, string? SourceClientId = null);
record SetSharePasswordRequest(string? Password);
record AddMemberRequest(string Username, BoardRole Role);
record UpdateMemberRoleRequest(BoardRole Role);
record CreateSnapshotRequest(string? Name);
record ImportBoardRequest(string BoardJson, string? Title);
record AssistantRequest(IReadOnlyList<ChatMessageEntry> Messages);
record AssistantSettingsRequest(bool Enabled, string Endpoint, string DeploymentName, string? ApiKey);
record PresenceLeaveRequest(Guid BoardId, string ClientId);
record ThemeAvailabilityRequest(bool Enabled);

sealed class ThemeCatalogApiService
{
    private readonly string _themesPath;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private List<ApiThemeDefinition>? _cache;

    public ThemeCatalogApiService(string themesPath)
    {
        _themesPath = themesPath;
    }

    public static string ResolveThemesPath(string dataPath, string contentRootPath)
    {
        var apiThemesPath = Path.Combine(dataPath, "themes");
        if (Directory.Exists(apiThemesPath) && Directory.EnumerateFiles(apiThemesPath, "*.json").Any())
            return apiThemesPath;

        var webThemesPath = Path.GetFullPath(Path.Combine(contentRootPath, "..", "Orim.Web", "data", "themes"));
        return Directory.Exists(webThemesPath) ? webThemesPath : apiThemesPath;
    }

    public async Task<IReadOnlyList<ApiThemeDefinition>> GetThemesAsync()
    {
        var themes = await EnsureCacheAsync();
        return themes.Select(theme => theme.Clone()).ToList();
    }

    public async Task<IReadOnlyList<ApiThemeDefinition>> GetEnabledThemesAsync()
    {
        var themes = await EnsureCacheAsync();
        return themes.Where(theme => theme.IsEnabled).Select(theme => theme.Clone()).ToList();
    }

    public async Task<ApiThemeDefinition?> GetThemeAsync(string key)
    {
        var themes = await EnsureCacheAsync();
        var normalizedKey = NormalizeKey(key);
        return themes.FirstOrDefault(theme => theme.Key == normalizedKey)?.Clone();
    }

    public async Task<ApiThemeDefinition> ImportThemeAsync(Stream stream, string? expectedKey = null)
    {
        var importedTheme = await JsonSerializer.DeserializeAsync<ApiThemeDefinition>(stream, OrimJsonOptions.Default);
        if (importedTheme is null)
        {
            throw new InvalidOperationException("The uploaded theme JSON could not be read.");
        }

        if (!string.IsNullOrWhiteSpace(expectedKey)
            && !string.Equals(NormalizeKey(importedTheme.Key), NormalizeKey(expectedKey), StringComparison.Ordinal))
        {
            throw new InvalidOperationException("The uploaded theme key does not match the selected theme.");
        }

        return await SaveThemeAsync(importedTheme);
    }

    public async Task SetEnabledAsync(string key, bool enabled)
    {
        await _gate.WaitAsync();
        try
        {
            var themes = await EnsureCacheCoreAsync();
            var normalizedKey = NormalizeKey(key);
            var theme = themes.FirstOrDefault(candidate => candidate.Key == normalizedKey)
                ?? throw new InvalidOperationException("The selected theme does not exist.");

            if (theme.IsProtected)
            {
                throw new InvalidOperationException("The default light theme is protected and cannot be changed.");
            }

            theme.IsEnabled = enabled;
            await WriteThemeFileAsync(theme);
            SortThemes(themes);
            _cache = themes;
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task DeleteThemeAsync(string key)
    {
        await _gate.WaitAsync();
        try
        {
            var themes = await EnsureCacheCoreAsync();
            var normalizedKey = NormalizeKey(key);
            var theme = themes.FirstOrDefault(candidate => candidate.Key == normalizedKey)
                ?? throw new InvalidOperationException("The selected theme does not exist.");

            if (theme.IsProtected)
            {
                throw new InvalidOperationException("The default light theme is protected and cannot be deleted.");
            }

            themes.RemoveAll(candidate => candidate.Key == normalizedKey);
            var filePath = GetThemeFilePath(normalizedKey);
            if (File.Exists(filePath))
            {
                File.Delete(filePath);
            }

            SortThemes(themes);
            _cache = themes;
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<string> ExportThemeJsonAsync(string key)
    {
        var theme = await GetThemeAsync(key)
            ?? throw new InvalidOperationException("The selected theme does not exist.");
        return JsonSerializer.Serialize(theme, OrimJsonOptions.Indented);
    }

    private async Task<ApiThemeDefinition> SaveThemeAsync(ApiThemeDefinition theme)
    {
        await _gate.WaitAsync();
        try
        {
            var themes = await EnsureCacheCoreAsync();
            var normalizedTheme = NormalizeAndValidate(theme);
            var existingTheme = themes.FirstOrDefault(candidate => candidate.Key == normalizedTheme.Key);

            if (existingTheme?.IsProtected == true)
            {
                throw new InvalidOperationException("The default light theme is protected and cannot be changed.");
            }

            themes.RemoveAll(candidate => candidate.Key == normalizedTheme.Key);
            themes.Add(normalizedTheme);
            SortThemes(themes);
            await WriteThemeFileAsync(normalizedTheme);
            _cache = themes;
            return normalizedTheme.Clone();
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<List<ApiThemeDefinition>> EnsureCacheAsync()
    {
        if (_cache is not null)
            return _cache;

        await _gate.WaitAsync();
        try
        {
            if (_cache is not null)
                return _cache;

            return await EnsureCacheCoreAsync();
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<List<ApiThemeDefinition>> EnsureCacheCoreAsync()
    {
        if (_cache is not null)
            return _cache;

        if (!Directory.Exists(_themesPath))
        {
            _cache = [CreateFallbackTheme()];
            return _cache;
        }

        var themes = new List<ApiThemeDefinition>();
        foreach (var filePath in Directory.EnumerateFiles(_themesPath, "*.json"))
        {
            try
            {
                await using var stream = File.OpenRead(filePath);
                var theme = await JsonSerializer.DeserializeAsync<ApiThemeDefinition>(stream, OrimJsonOptions.Default);
                if (theme is null)
                    continue;

                var normalizedTheme = NormalizeAndValidate(theme);
                themes.RemoveAll(candidate => candidate.Key == normalizedTheme.Key);
                themes.Add(normalizedTheme);
            }
            catch
            {
                continue;
            }
        }

        _cache = themes.Count > 0
            ? SortThemes(themes)
            : [CreateFallbackTheme()];

        return _cache;
    }

    private static ApiThemeDefinition CreateFallbackTheme() => new()
    {
        Key = "light",
        Name = "Light",
        IsDarkMode = false,
        IsEnabled = true,
        IsProtected = true,
        FontFamily = ["Inter", "system-ui", "-apple-system", "sans-serif"],
        Palette = new ApiThemePaletteDefinition
        {
            Primary = "#6E40C9",
            Secondary = "#1F8A5B",
            Tertiary = "#EA580C",
            AppbarBackground = "#0D1117",
            AppbarText = "#FFFFFF",
            Background = "#F6F8FA",
            Surface = "#FFFFFF",
            DrawerBackground = "#161B22",
            DrawerText = "#C9D1D9",
            DrawerIcon = "#C9D1D9",
            TextPrimary = "#24292F",
            TextSecondary = "#57606A",
            LinesDefault = "#D0D7DE",
            Success = "#1F8A5B",
            Warning = "#EA580C",
            Info = "#6E40C9"
        },
        CssVariables = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase),
        BoardDefaults = new ApiThemeBoardDefaultsDefinition
        {
            SurfaceColor = "#FFFFFF",
            GridColor = "#EEF2F7",
            ShapeFillColor = "#FFFFFF",
            StrokeColor = "#0F172A",
            IconColor = "#0F172A",
            SelectionColor = "#2563EB",
            SelectionTintRgb = "37, 99, 235",
            HandleSurfaceColor = "#FFFFFF",
            DockTargetColor = "#0F766E"
        }
    };

    private async Task WriteThemeFileAsync(ApiThemeDefinition theme)
    {
        Directory.CreateDirectory(_themesPath);
        var filePath = GetThemeFilePath(theme.Key);
        await File.WriteAllTextAsync(filePath, JsonSerializer.Serialize(theme, OrimJsonOptions.Indented));
    }

    private string GetThemeFilePath(string key) => Path.Combine(_themesPath, $"{NormalizeKey(key)}.json");

    private static List<ApiThemeDefinition> SortThemes(List<ApiThemeDefinition> themes)
    {
        themes.Sort((left, right) =>
        {
            if (left.Key == "light" && right.Key != "light")
            {
                return -1;
            }

            if (left.Key != "light" && right.Key == "light")
            {
                return 1;
            }

            return string.Compare(left.Name, right.Name, StringComparison.OrdinalIgnoreCase);
        });

        return themes;
    }

    private static ApiThemeDefinition NormalizeAndValidate(ApiThemeDefinition source)
    {
        var normalizedKey = NormalizeKey(source.Key);
        if (string.IsNullOrWhiteSpace(normalizedKey))
        {
            throw new InvalidOperationException("A theme key is required.");
        }

        if (string.IsNullOrWhiteSpace(source.Name))
        {
            throw new InvalidOperationException("A theme name is required.");
        }

        if (source.FontFamily.Count == 0)
        {
            source.FontFamily = ["Inter", "system-ui", "-apple-system", "sans-serif"];
        }

        ValidatePalette(source.Palette);
        ValidateBoardDefaults(source.BoardDefaults);

        var normalized = source.Clone();
        normalized.Key = normalizedKey;
        normalized.Name = source.Name.Trim();
        normalized.IsProtected = normalizedKey == "light" || source.IsProtected;
        normalized.IsEnabled = normalized.IsProtected || source.IsEnabled;

        if (normalizedKey == "light")
        {
            normalized.IsProtected = true;
            normalized.IsEnabled = true;
        }

        return normalized;
    }

    private static void ValidatePalette(ApiThemePaletteDefinition palette)
    {
        var values = new Dictionary<string, string?>
        {
            [nameof(palette.Primary)] = palette.Primary,
            [nameof(palette.Secondary)] = palette.Secondary,
            [nameof(palette.Tertiary)] = palette.Tertiary,
            [nameof(palette.AppbarBackground)] = palette.AppbarBackground,
            [nameof(palette.AppbarText)] = palette.AppbarText,
            [nameof(palette.Background)] = palette.Background,
            [nameof(palette.Surface)] = palette.Surface,
            [nameof(palette.DrawerBackground)] = palette.DrawerBackground,
            [nameof(palette.DrawerText)] = palette.DrawerText,
            [nameof(palette.DrawerIcon)] = palette.DrawerIcon,
            [nameof(palette.TextPrimary)] = palette.TextPrimary,
            [nameof(palette.TextSecondary)] = palette.TextSecondary,
            [nameof(palette.LinesDefault)] = palette.LinesDefault,
        };

        foreach (var entry in values)
        {
            if (string.IsNullOrWhiteSpace(entry.Value))
            {
                throw new InvalidOperationException($"Palette value '{entry.Key}' is required.");
            }
        }
    }

    private static void ValidateBoardDefaults(ApiThemeBoardDefaultsDefinition defaults)
    {
        var values = new Dictionary<string, string?>
        {
            [nameof(defaults.SurfaceColor)] = defaults.SurfaceColor,
            [nameof(defaults.GridColor)] = defaults.GridColor,
            [nameof(defaults.ShapeFillColor)] = defaults.ShapeFillColor,
            [nameof(defaults.StrokeColor)] = defaults.StrokeColor,
            [nameof(defaults.IconColor)] = defaults.IconColor,
            [nameof(defaults.SelectionColor)] = defaults.SelectionColor,
            [nameof(defaults.SelectionTintRgb)] = defaults.SelectionTintRgb,
            [nameof(defaults.HandleSurfaceColor)] = defaults.HandleSurfaceColor,
            [nameof(defaults.DockTargetColor)] = defaults.DockTargetColor,
        };

        foreach (var entry in values)
        {
            if (string.IsNullOrWhiteSpace(entry.Value))
            {
                throw new InvalidOperationException($"Board default '{entry.Key}' is required.");
            }
        }
    }

    private static string NormalizeKey(string? key)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return string.Empty;
        }

        Span<char> buffer = stackalloc char[key.Length];
        var length = 0;
        var previousWasDash = false;

        foreach (var character in key.Trim().ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(character))
            {
                buffer[length++] = character;
                previousWasDash = false;
                continue;
            }

            if ((character == '-' || character == '_' || char.IsWhiteSpace(character)) && !previousWasDash && length > 0)
            {
                buffer[length++] = '-';
                previousWasDash = true;
            }
        }

        if (length > 0 && buffer[length - 1] == '-')
        {
            length--;
        }

        return new string(buffer[..length]);
    }
}

sealed class ApiThemeDefinition
{
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsDarkMode { get; set; }
    public bool IsEnabled { get; set; } = true;
    public bool IsProtected { get; set; }
    public List<string> FontFamily { get; set; } = [];
    public ApiThemePaletteDefinition Palette { get; set; } = new();
    public Dictionary<string, string> CssVariables { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public ApiThemeBoardDefaultsDefinition BoardDefaults { get; set; } = new();

    public ApiThemeDefinition Clone() => new()
    {
        Key = Key,
        Name = Name,
        IsDarkMode = IsDarkMode,
        IsEnabled = IsEnabled,
        IsProtected = IsProtected,
        FontFamily = [.. FontFamily],
        Palette = Palette.Clone(),
        CssVariables = CssVariables.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.OrdinalIgnoreCase),
        BoardDefaults = BoardDefaults.Clone(),
    };
}

sealed class ApiThemePaletteDefinition
{
    public string Primary { get; set; } = "#6E40C9";
    public string Secondary { get; set; } = "#1F8A5B";
    public string Tertiary { get; set; } = "#EA580C";
    public string AppbarBackground { get; set; } = "#0D1117";
    public string AppbarText { get; set; } = "#FFFFFF";
    public string Background { get; set; } = "#F6F8FA";
    public string Surface { get; set; } = "#FFFFFF";
    public string DrawerBackground { get; set; } = "#161B22";
    public string DrawerText { get; set; } = "#C9D1D9";
    public string DrawerIcon { get; set; } = "#C9D1D9";
    public string TextPrimary { get; set; } = "#24292F";
    public string TextSecondary { get; set; } = "#57606A";
    public string LinesDefault { get; set; } = "#D0D7DE";
    public string? Success { get; set; }
    public string? Warning { get; set; }
    public string? Info { get; set; }

    public ApiThemePaletteDefinition Clone() => new()
    {
        Primary = Primary,
        Secondary = Secondary,
        Tertiary = Tertiary,
        AppbarBackground = AppbarBackground,
        AppbarText = AppbarText,
        Background = Background,
        Surface = Surface,
        DrawerBackground = DrawerBackground,
        DrawerText = DrawerText,
        DrawerIcon = DrawerIcon,
        TextPrimary = TextPrimary,
        TextSecondary = TextSecondary,
        LinesDefault = LinesDefault,
        Success = Success,
        Warning = Warning,
        Info = Info,
    };
}

sealed class ApiThemeBoardDefaultsDefinition
{
    public string SurfaceColor { get; set; } = "#FFFFFF";
    public string GridColor { get; set; } = "#EEF2F7";
    public string ShapeFillColor { get; set; } = "#FFFFFF";
    public string StrokeColor { get; set; } = "#0F172A";
    public string IconColor { get; set; } = "#0F172A";
    public string SelectionColor { get; set; } = "#2563EB";
    public string SelectionTintRgb { get; set; } = "37, 99, 235";
    public string HandleSurfaceColor { get; set; } = "#FFFFFF";
    public string DockTargetColor { get; set; } = "#0F766E";

    public ApiThemeBoardDefaultsDefinition Clone() => new()
    {
        SurfaceColor = SurfaceColor,
        GridColor = GridColor,
        ShapeFillColor = ShapeFillColor,
        StrokeColor = StrokeColor,
        IconColor = IconColor,
        SelectionColor = SelectionColor,
        SelectionTintRgb = SelectionTintRgb,
        HandleSurfaceColor = HandleSurfaceColor,
        DockTargetColor = DockTargetColor,
    };
}
