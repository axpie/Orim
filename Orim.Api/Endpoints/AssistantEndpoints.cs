using Microsoft.AspNetCore.Authorization;
using Orim.Api.Contracts;
using Orim.Api.Infrastructure;
using Orim.Api.Services;
using Orim.Core.Models;
using Orim.Core.Services;

namespace Orim.Api.Endpoints;

internal static class AssistantEndpoints
{
    internal static IEndpointRouteBuilder MapAssistantEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/admin/assistant-settings", [Authorize(Roles = "Admin")] (AssistantSettingsService assistantSettingsService) =>
        {
            return Results.Ok(assistantSettingsService.GetAdminSettings());
        });

        app.MapGet("/api/assistant/status", [Authorize] (AssistantSettingsService assistantSettingsService) =>
        {
            var snapshot = assistantSettingsService.GetSnapshot();
            return Results.Ok(new AssistantAvailability(snapshot.IsEnabled, snapshot.IsConfigured));
        });

        app.MapPut("/api/admin/assistant-settings", [Authorize(Roles = "Admin")] async (AssistantSettingsRequest request, AssistantSettingsService assistantSettingsService, HttpContext context, ILogger<Program> logger) =>
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
                logger.LogWarning(ex, "Saving assistant settings failed.");
                return EndpointHelpers.BadRequest(context, "The assistant settings could not be saved.");
            }
        });

        app.MapPost("/api/boards/{id:guid}/assistant", [Authorize] async (Guid id, AssistantRequest request, HttpContext context, BoardService boardService, DiagramAssistantService assistantService) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId, BoardRole.Editor))
                return Results.Forbid();

            var unavailableReason = assistantService.GetUnavailableReason();
            if (unavailableReason is not null)
                return Results.Json(new { error = unavailableReason }, statusCode: 503);

            var events = new List<DiagramAssistantEvent>();
            await foreach (var evt in assistantService.StreamDiagramAsync(board, request.Messages, context.RequestAborted))
            {
                events.Add(evt);
            }

            if (events.Any(e => e.Type is EventType.ElementAdded or EventType.ElementUpdated or EventType.ElementRemoved or EventType.BoardCleared))
            {
                await boardService.UpdateBoardAsync(board);
            }

            return Results.Ok(new { events, board });
        });

        return app;
    }
}
