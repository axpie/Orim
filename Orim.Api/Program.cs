using Orim.Api.Endpoints;
using Orim.Api.Hubs;
using Orim.Api.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOrimServices(builder.Configuration);
builder.Services.AddOrimAuthentication(builder.Configuration);
builder.Services.AddOrimCors(builder.Configuration);
builder.Services.AddOrimTelemetry(builder.Configuration);

if (builder.Environment.IsDevelopment())
{
    builder.Services.AddSignalR().AddHubOptions<BoardHub>(options =>
    {
        options.EnableDetailedErrors = true;
    });
}

var app = builder.Build();

await app.InitializeDatabaseAsync();

app.UseOrimMiddleware();

app.MapAuthEndpoints();
app.MapUserEndpoints();
app.MapAdminEndpoints();
app.MapBoardEndpoints();
app.MapThemeEndpoints();
app.MapAssistantEndpoints();
app.MapImageEndpoints();
app.MapUserExportEndpoints();
app.MapHealthEndpoints();

app.MapHub<BoardHub>("/hubs/board");
app.MapFallbackToFile("/index.html");

app.Run();
