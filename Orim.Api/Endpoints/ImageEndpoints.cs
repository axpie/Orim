using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Orim.Api.Infrastructure;
using Orim.Core.Interfaces;

namespace Orim.Api.Endpoints;

internal static class ImageEndpoints
{
    internal static IEndpointRouteBuilder MapImageEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/user-images", [Authorize] async (HttpRequest request, HttpContext context, IImageStorageService imageService, ILogger<Program> logger) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!request.HasFormContentType) return Results.BadRequest("Expected multipart/form-data.");
            var form = await request.ReadFormAsync();
            var file = form.Files.GetFile("file");
            if (file is null) return Results.BadRequest("No file uploaded.");

            try
            {
                await using var stream = file.OpenReadStream();
                var info = await imageService.SaveImageAsync(userId, file.FileName, file.ContentType, file.Length, stream);
                return Results.Ok(new { info.Id, Url = $"/api/user-images/{userId:N}/{info.Id}", info.FileName, info.Size, info.UploadedAt });
            }
            catch (InvalidOperationException ex)
            {
                logger.LogWarning(ex, "Uploading an image failed for user {UserId}.", userId);
                return EndpointHelpers.BadRequest(context, "The image could not be uploaded.");
            }
        });

        app.MapGet("/api/user-images", [Authorize] async (HttpContext context, IImageStorageService imageService) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            var images = await imageService.GetUserImagesAsync(userId);
            return Results.Ok(images.Select(i => new { i.Id, Url = $"/api/user-images/{userId:N}/{i.Id}", i.FileName, i.Size, i.UploadedAt }));
        });

        // No [Authorize] — browser <img> and Konva Image cannot send JWT headers.
        // GUIDs are non-guessable, so public access is safe.
        app.MapGet("/api/user-images/{userIdStr}/{imageId}", async (string userIdStr, string imageId, IImageStorageService imageService, HttpContext ctx) =>
        {
            if (!Guid.TryParse(userIdStr, out var userId)) return Results.NotFound();
            var result = await imageService.GetImageDataAsync(userId, imageId);
            if (result is null) return Results.NotFound();
            ctx.Response.Headers.Append("Cache-Control", "no-store");
            return Results.Bytes(result.Data, result.MimeType);
        });

        app.MapDelete("/api/user-images/{imageId}", [Authorize] async (string imageId, HttpContext context, IImageStorageService imageService) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            var deleted = await imageService.DeleteImageAsync(userId, imageId);
            return deleted ? Results.NoContent() : Results.NotFound();
        });

        return app;
    }
}
