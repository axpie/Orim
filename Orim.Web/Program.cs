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

app.MapGet("/api/auth/logout", async (HttpContext context) =>
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
                    ParseColor(shape.FillColor)));
                var strokePen = new PdfSharp.Drawing.XPen(PdfSharp.Drawing.XColor.FromArgb(
                    ParseColor(shape.StrokeColor)), shape.StrokeWidth);
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

                if (!string.IsNullOrWhiteSpace(shape.Label))
                {
                    var labelFont = new PdfSharp.Drawing.XFont("Helvetica", ResolveLabelFontSize(shape), PdfSharp.Drawing.XFontStyleEx.Bold);
                    var labelBrush = new PdfSharp.Drawing.XSolidBrush(PdfSharp.Drawing.XColor.FromArgb(
                        ParseColor(shape.StrokeColor)));
                    var format = new PdfSharp.Drawing.XStringFormat
                    {
                        Alignment = shape.LabelHorizontalAlignment switch
                        {
                            HorizontalLabelAlignment.Left => PdfSharp.Drawing.XStringAlignment.Near,
                            HorizontalLabelAlignment.Right => PdfSharp.Drawing.XStringAlignment.Far,
                            _ => PdfSharp.Drawing.XStringAlignment.Center
                        },
                        LineAlignment = shape.LabelVerticalAlignment switch
                        {
                            VerticalLabelAlignment.Top => PdfSharp.Drawing.XLineAlignment.Near,
                            VerticalLabelAlignment.Bottom => PdfSharp.Drawing.XLineAlignment.Far,
                            _ => PdfSharp.Drawing.XLineAlignment.Center
                        }
                    };
                    gfx.DrawString(
                        shape.Label,
                        labelFont,
                        labelBrush,
                        new PdfSharp.Drawing.XRect(shape.X, shape.Y, shape.Width, shape.Height),
                        format);
                }

                break;
            case Orim.Core.Models.TextElement text:
                var fontStyle = PdfSharp.Drawing.XFontStyleEx.Regular;
                if (text.IsBold && text.IsItalic) fontStyle = PdfSharp.Drawing.XFontStyleEx.BoldItalic;
                else if (text.IsBold) fontStyle = PdfSharp.Drawing.XFontStyleEx.Bold;
                else if (text.IsItalic) fontStyle = PdfSharp.Drawing.XFontStyleEx.Italic;
                var font = new PdfSharp.Drawing.XFont("Helvetica", text.FontSize, fontStyle);
                var textBrush = new PdfSharp.Drawing.XSolidBrush(PdfSharp.Drawing.XColor.FromArgb(
                    ParseColor(text.Color)));
                gfx.DrawString(text.Text, font, textBrush, text.X, text.Y + text.FontSize);
                break;
        }
    }

    using var ms = new MemoryStream();
    document.Save(ms, false);
    return Results.File(ms.ToArray(), "application/pdf", $"{board.Title}.pdf");
});

static int ParseColor(string value)
{
    var color = value.Trim();

    if (color.StartsWith('#'))
    {
        var hex = color.TrimStart('#');

        if (hex.Length == 6)
        {
            hex = "FF" + hex;
            return (int)uint.Parse(hex, System.Globalization.NumberStyles.HexNumber);
        }

        if (hex.Length == 8)
        {
            var rrggbbaa = hex;
            var aarrggbb = rrggbbaa.Substring(6, 2) + rrggbbaa.Substring(0, 6);
            return (int)uint.Parse(aarrggbb, System.Globalization.NumberStyles.HexNumber);
        }
    }

    if (color.StartsWith("rgba(", StringComparison.OrdinalIgnoreCase))
    {
        var components = color[5..^1].Split(',', StringSplitOptions.TrimEntries);
        if (components.Length == 4)
        {
            var red = byte.Parse(components[0], System.Globalization.CultureInfo.InvariantCulture);
            var green = byte.Parse(components[1], System.Globalization.CultureInfo.InvariantCulture);
            var blue = byte.Parse(components[2], System.Globalization.CultureInfo.InvariantCulture);
            var alpha = (byte)Math.Round(
                double.Parse(components[3], System.Globalization.CultureInfo.InvariantCulture) * 255,
                MidpointRounding.AwayFromZero);

            return (alpha << 24) | (red << 16) | (green << 8) | blue;
        }
    }

    if (color.StartsWith("rgb(", StringComparison.OrdinalIgnoreCase))
    {
        var components = color[4..^1].Split(',', StringSplitOptions.TrimEntries);
        if (components.Length == 3)
        {
            var red = byte.Parse(components[0], System.Globalization.CultureInfo.InvariantCulture);
            var green = byte.Parse(components[1], System.Globalization.CultureInfo.InvariantCulture);
            var blue = byte.Parse(components[2], System.Globalization.CultureInfo.InvariantCulture);

            return (255 << 24) | (red << 16) | (green << 8) | blue;
        }
    }

    throw new FormatException($"Unsupported color format: {value}");
}

static double ResolveLabelFontSize(BoardElement element)
{
    if (element.LabelFontSize is double fontSize)
    {
        return Math.Max(1, fontSize);
    }

    var basis = Math.Min(Math.Max(element.Width, 1), Math.Max(element.Height, 1));
    return Math.Clamp(basis * 0.28, 10, 48);
}

app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.Run();
