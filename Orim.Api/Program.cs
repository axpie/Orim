using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.IdentityModel.Tokens;
using PdfSharp.Fonts;
using Orim.Api.Contracts;
using Orim.Api.Hubs;
using Orim.Api.Infrastructure;
using Orim.Api.Services;
using Orim.Core;
using Orim.Core.Models;
using Orim.Core.Services;
using Orim.Infrastructure;

if (OperatingSystem.IsWindows())
{
    GlobalFontSettings.UseWindowsFontsUnderWindows = true;
}

var builder = WebApplication.CreateBuilder(args);

// --- Data path ---
var configuredDataPath = builder.Configuration.GetValue<string>("DataPath");
var dataPath = ApiDataPath.ResolveDataPath(configuredDataPath, builder.Environment.ContentRootPath);
var migratedLegacyDataPath = ApiDataPath.TryMigrateLegacyDataPath(configuredDataPath, builder.Environment.ContentRootPath, dataPath);

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
builder.Services.AddSingleton(new ThemeCatalogApiService(ThemeCatalogApiService.ResolveThemesPath(dataPath)));
builder.Services.AddSingleton<BoardPdfExportService>();
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

app.Logger.LogInformation("Using data path {DataPath}.", dataPath);
if (migratedLegacyDataPath)
{
    app.Logger.LogInformation("Migrated legacy content-root data into persistent storage at {DataPath}.", dataPath);
}

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

app.MapGet("/api/boards/{id:guid}/export/pdf", [Authorize] async (Guid id, HttpContext context, BoardService boardService, BoardPdfExportService pdfExportService) =>
{
    var board = await boardService.GetBoardAsync(id);
    if (board is null) return Results.NotFound();

    if (!boardService.HasAccess(board, GetUserId(context)))
        return Results.Forbid();

    var pdfBytes = pdfExportService.Export(board);
    return Results.File(pdfBytes, "application/pdf", $"{board.Title}.pdf");
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
