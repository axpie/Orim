using System.Text;
using Microsoft.AspNetCore.Authorization;
using Orim.Api.Contracts;
using Orim.Api.Infrastructure;
using Orim.Api.Services;

namespace Orim.Api.Endpoints;

internal static class ThemeEndpoints
{
    internal static IEndpointRouteBuilder MapThemeEndpoints(this IEndpointRouteBuilder app)
    {
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

        app.MapPost("/api/admin/themes/import", [Authorize(Roles = "Admin")] async (HttpRequest request, HttpContext context, ThemeCatalogApiService themeCatalogService, ILogger<Program> logger) =>
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
            catch (Exception ex) when (ex is InvalidOperationException or System.Text.Json.JsonException)
            {
                logger.LogWarning(ex, "Importing a theme failed.");
                return EndpointHelpers.BadRequest(context, "The theme file could not be imported.");
            }
        });

        app.MapPut("/api/admin/themes/{key}/enabled", [Authorize(Roles = "Admin")] async (string key, ThemeAvailabilityRequest request, ThemeCatalogApiService themeCatalogService, HttpContext context, ILogger<Program> logger) =>
        {
            try
            {
                await themeCatalogService.SetEnabledAsync(key, request.Enabled);
                return Results.NoContent();
            }
            catch (InvalidOperationException ex)
            {
                logger.LogWarning(ex, "Updating enabled state failed for theme {ThemeKey}.", key);
                return EndpointHelpers.BadRequest(context, "The theme could not be updated.");
            }
        });

        app.MapGet("/api/admin/themes/{key}/export", [Authorize(Roles = "Admin")] async (string key, ThemeCatalogApiService themeCatalogService, HttpContext context, ILogger<Program> logger) =>
        {
            try
            {
                var json = await themeCatalogService.ExportThemeJsonAsync(key);
                return Results.File(Encoding.UTF8.GetBytes(json), "application/json", $"{key}.json");
            }
            catch (InvalidOperationException ex)
            {
                logger.LogWarning(ex, "Exporting theme {ThemeKey} failed.", key);
                return EndpointHelpers.BadRequest(context, "The theme could not be exported.");
            }
        });

        app.MapDelete("/api/admin/themes/{key}", [Authorize(Roles = "Admin")] async (string key, ThemeCatalogApiService themeCatalogService, HttpContext context, ILogger<Program> logger) =>
        {
            try
            {
                await themeCatalogService.DeleteThemeAsync(key);
                return Results.NoContent();
            }
            catch (InvalidOperationException ex)
            {
                logger.LogWarning(ex, "Deleting theme {ThemeKey} failed.", key);
                return EndpointHelpers.BadRequest(context, "The theme could not be deleted.");
            }
        });

        return app;
    }
}
