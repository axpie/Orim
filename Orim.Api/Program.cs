using PdfSharp.Fonts;
using Orim.Api.Endpoints;
using Orim.Api.Hubs;
using Orim.Api.Infrastructure;

if (OperatingSystem.IsWindows())
{
    GlobalFontSettings.UseWindowsFontsUnderWindows = true;
}

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOrimServices(builder.Configuration);
builder.Services.AddOrimAuthentication(builder.Configuration);
builder.Services.AddOrimCors(builder.Configuration);

var app = builder.Build();

await app.InitializeDatabaseAsync();

app.UseOrimMiddleware();

app.MapAuthEndpoints();
app.MapUserEndpoints();
app.MapBoardEndpoints();
app.MapThemeEndpoints();
app.MapAssistantEndpoints();
app.MapImageEndpoints();

app.MapHub<BoardHub>("/hubs/board");
app.MapFallbackToFile("/index.html");

app.Run();
