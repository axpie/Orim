using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using MudBlazor.Services;
using Orim.Core.Models;
using Orim.Core.Services;
using Orim.Infrastructure;
using Orim.Web.Components;

var builder = WebApplication.CreateBuilder(args);

var dataPath = builder.Configuration.GetValue<string>("DataPath") ?? "data";
if (!Path.IsPathRooted(dataPath))
    dataPath = Path.Combine(builder.Environment.ContentRootPath, dataPath);

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

builder.Services.AddMudServices();
builder.Services.AddOrimInfrastructure(dataPath);

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath = "/login";
        options.LogoutPath = "/api/auth/logout";
        options.AccessDeniedPath = "/login";
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
    });
builder.Services.AddAuthorization();
builder.Services.AddCascadingAuthenticationState();
builder.Services.AddHttpContextAccessor();
builder.Services.AddLocalization(options => options.ResourcesPath = "Resources");

var app = builder.Build();

// Seed admin user
using (var scope = app.Services.CreateScope())
{
    var userService = scope.ServiceProvider.GetRequiredService<UserService>();
    var seedUsername = app.Configuration.GetValue<string>("SeedAdmin:Username") ?? "admin";
    var seedPassword = app.Configuration.GetValue<string>("SeedAdmin:Password") ?? "Admin123!";
    var existingAdmin = await userService.GetByUsernameAsync(seedUsername);
    if (existingAdmin is null)
    {
        await userService.CreateUserAsync(seedUsername, seedPassword, UserRole.Admin);
    }
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();
}
app.UseStatusCodePagesWithReExecute("/not-found", createScopeForStatusCodePages: true);
app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();

app.UseRequestLocalization(new RequestLocalizationOptions()
    .SetDefaultCulture("de")
    .AddSupportedCultures("de", "en")
    .AddSupportedUICultures("de", "en"));

// Auth endpoints (minimal API for form-based login/logout)
app.MapPost("/api/auth/login", async (HttpContext context, UserService userService) =>
{
    var form = await context.Request.ReadFormAsync();
    var username = form["username"].ToString();
    var password = form["password"].ToString();

    var user = await userService.AuthenticateAsync(username, password);
    if (user is null)
    {
        context.Response.Redirect("/login?error=1");
        return;
    }

    var claims = new List<Claim>
    {
        new(ClaimTypes.NameIdentifier, user.Id.ToString()),
        new(ClaimTypes.Name, user.Username),
        new(ClaimTypes.Role, user.Role.ToString())
    };
    var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
    var principal = new ClaimsPrincipal(identity);

    await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal);
    context.Response.Redirect("/");
});

app.MapPost("/api/auth/logout", async (HttpContext context) =>
{
    await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    context.Response.Redirect("/login");
});

app.MapGet("/api/export/pdf/{boardId:guid}", async (Guid boardId, BoardService boardService, HttpContext context) =>
{
    var board = await boardService.GetBoardAsync(boardId);
    if (board is null) return Results.NotFound();

    using var document = new PdfSharp.Pdf.PdfDocument();
    var page = document.AddPage();
    page.Width = PdfSharp.Drawing.XUnit.FromPoint(842); // A4 landscape
    page.Height = PdfSharp.Drawing.XUnit.FromPoint(595);
    var gfx = PdfSharp.Drawing.XGraphics.FromPdfPage(page);

    // Draw white background
    gfx.DrawRectangle(PdfSharp.Drawing.XBrushes.White, 0, 0, page.Width.Point, page.Height.Point);

    foreach (var element in board.Elements.OrderBy(e => e.ZIndex))
    {
        switch (element)
        {
            case Orim.Core.Models.ShapeElement shape:
                var fillBrush = new PdfSharp.Drawing.XSolidBrush(PdfSharp.Drawing.XColor.FromArgb(
                    ParseHexColor(shape.FillColor)));
                var strokePen = new PdfSharp.Drawing.XPen(PdfSharp.Drawing.XColor.FromArgb(
                    ParseHexColor(shape.StrokeColor)), shape.StrokeWidth);
                switch (shape.ShapeType)
                {
                    case Orim.Core.Models.ShapeType.Rectangle:
                        gfx.DrawRectangle(strokePen, fillBrush, shape.X, shape.Y, shape.Width, shape.Height);
                        break;
                    case Orim.Core.Models.ShapeType.Ellipse:
                        gfx.DrawEllipse(strokePen, fillBrush, shape.X, shape.Y, shape.Width, shape.Height);
                        break;
                    case Orim.Core.Models.ShapeType.Triangle:
                        var points = new PdfSharp.Drawing.XPoint[]
                        {
                            new(shape.X + shape.Width / 2, shape.Y),
                            new(shape.X, shape.Y + shape.Height),
                            new(shape.X + shape.Width, shape.Y + shape.Height)
                        };
                        gfx.DrawPolygon(strokePen, fillBrush, points, PdfSharp.Drawing.XFillMode.Winding);
                        break;
                }
                break;
            case Orim.Core.Models.TextElement text:
                var fontStyle = PdfSharp.Drawing.XFontStyleEx.Regular;
                if (text.IsBold && text.IsItalic) fontStyle = PdfSharp.Drawing.XFontStyleEx.BoldItalic;
                else if (text.IsBold) fontStyle = PdfSharp.Drawing.XFontStyleEx.Bold;
                else if (text.IsItalic) fontStyle = PdfSharp.Drawing.XFontStyleEx.Italic;
                var font = new PdfSharp.Drawing.XFont("Helvetica", text.FontSize, fontStyle);
                var textBrush = new PdfSharp.Drawing.XSolidBrush(PdfSharp.Drawing.XColor.FromArgb(
                    ParseHexColor(text.Color)));
                gfx.DrawString(text.Text, font, textBrush, text.X, text.Y + text.FontSize);
                break;
        }
    }

    using var ms = new MemoryStream();
    document.Save(ms, false);
    return Results.File(ms.ToArray(), "application/pdf", $"{board.Title}.pdf");
});

static int ParseHexColor(string hex)
{
    hex = hex.TrimStart('#');
    if (hex.Length == 6) hex = "FF" + hex;
    return (int)uint.Parse(hex, System.Globalization.NumberStyles.HexNumber);
}

app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.Run();
