using Microsoft.AspNetCore.Authorization;
using Orim.Api.Infrastructure;
using Orim.Core.Interfaces;
using Orim.Core.Models;
using Orim.Core.Services;

namespace Orim.Api.Endpoints;

internal static class BoardFileEndpoints
{
    internal static IEndpointRouteBuilder MapBoardFileEndpoints(this IEndpointRouteBuilder app)
    {
        // Upload a file to a board (Editor access required)
        app.MapPost("/api/boards/{boardId:guid}/files", [Authorize] async (
            Guid boardId,
            HttpRequest request,
            HttpContext context,
            IBoardFileService boardFileService,
            BoardService boardService,
            ILogger<Program> logger) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            var board = await boardService.GetBoardAsync(boardId);
            if (board is null) return Results.NotFound();
            if (!boardService.HasAccess(board, userId, BoardRole.Editor)) return Results.Forbid();

            if (!request.HasFormContentType) return Results.BadRequest("Expected multipart/form-data.");
            var form = await request.ReadFormAsync();
            var file = form.Files.GetFile("file");
            if (file is null) return Results.BadRequest("No file uploaded.");

            try
            {
                await using var stream = file.OpenReadStream();
                var info = await boardFileService.SaveFileAsync(boardId, file.FileName, file.ContentType, file.Length, stream);
                return Results.Ok(new
                {
                    info.Id,
                    Url = $"/api/boards/{boardId:N}/files/{info.Id}",
                    info.FileName,
                    info.ContentType,
                    info.Size,
                    info.UploadedAt,
                });
            }
            catch (InvalidOperationException ex)
            {
                logger.LogWarning(ex, "Uploading a file failed for board {BoardId}.", boardId);
                return EndpointHelpers.BadRequest(context, "The file could not be uploaded.");
            }
        });

        // List all files for a board (read access required)
        app.MapGet("/api/boards/{boardId:guid}/files", [Authorize] async (
            Guid boardId,
            HttpContext context,
            IBoardFileService boardFileService,
            BoardService boardService) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            var board = await boardService.GetBoardAsync(boardId);
            if (board is null) return Results.NotFound();
            if (!boardService.HasAccess(board, userId)) return Results.Forbid();

            var files = await boardFileService.GetBoardFilesAsync(boardId);
            return Results.Ok(files.Select(f => new
            {
                f.Id,
                Url = $"/api/boards/{boardId:N}/files/{f.Id}",
                f.FileName,
                f.ContentType,
                f.Size,
                f.UploadedAt,
            }));
        });

        // Retrieve file data — no [Authorize] so browsers can load images/files directly.
        // GUIDs are non-guessable; boardId+fileId together make accidental access negligible.
        app.MapGet("/api/boards/{boardIdStr}/files/{fileId}", async (
            string boardIdStr,
            string fileId,
            IBoardFileService boardFileService,
            HttpContext ctx) =>
        {
            if (!Guid.TryParse(boardIdStr, out var boardId)) return Results.NotFound();
            var result = await boardFileService.GetFileDataAsync(boardId, fileId);
            if (result is null) return Results.NotFound();
            ctx.Response.Headers.Append("Cache-Control", "no-store");
            return Results.Bytes(result.Data, result.ContentType);
        });

        // List files via share token (Viewer access)
        app.MapGet("/api/boards/shared/{token}/files", async (
            string token,
            [Microsoft.AspNetCore.Mvc.FromQuery] string? password,
            IBoardFileService boardFileService,
            BoardService boardService) =>
        {
            var board = await boardService.GetBoardByShareTokenAsync(token);
            if (board is null) return Results.NotFound();
            if (!boardService.HasSharedLinkAccess(board, password, BoardRole.Viewer)) return Results.Forbid();

            var files = await boardFileService.GetBoardFilesAsync(board.Id);
            return Results.Ok(files.Select(f => new
            {
                f.Id,
                Url = $"/api/boards/{board.Id:N}/files/{f.Id}",
                f.FileName,
                f.ContentType,
                f.Size,
                f.UploadedAt,
            }));
        }).AllowAnonymous();

        // Upload a file via share token (Editor access required)
        app.MapPost("/api/boards/shared/{token}/files", async (
            string token,
            HttpRequest request,
            HttpContext context,
            IBoardFileService boardFileService,
            BoardService boardService,
            ILogger<Program> logger) =>
        {
            var board = await boardService.GetBoardByShareTokenAsync(token);
            if (board is null) return Results.NotFound();

            if (!request.HasFormContentType) return Results.BadRequest("Expected multipart/form-data.");
            var form = await request.ReadFormAsync();

            var password = form["password"].FirstOrDefault();
            if (!boardService.HasSharedLinkAccess(board, password, BoardRole.Editor)) return Results.Forbid();

            var file = form.Files.GetFile("file");
            if (file is null) return Results.BadRequest("No file uploaded.");

            try
            {
                await using var stream = file.OpenReadStream();
                var info = await boardFileService.SaveFileAsync(board.Id, file.FileName, file.ContentType, file.Length, stream);
                return Results.Ok(new
                {
                    info.Id,
                    Url = $"/api/boards/{board.Id:N}/files/{info.Id}",
                    info.FileName,
                    info.ContentType,
                    info.Size,
                    info.UploadedAt,
                });
            }
            catch (InvalidOperationException ex)
            {
                logger.LogWarning(ex, "Uploading a file failed for board {BoardId} via share token.", board.Id);
                return EndpointHelpers.BadRequest(context, "The file could not be uploaded.");
            }
        }).AllowAnonymous();

        // Delete a file (Editor access required)
        app.MapDelete("/api/boards/{boardId:guid}/files/{fileId}", [Authorize] async (
            Guid boardId,
            string fileId,
            HttpContext context,
            IBoardFileService boardFileService,
            BoardService boardService) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            var board = await boardService.GetBoardAsync(boardId);
            if (board is null) return Results.NotFound();
            if (!boardService.HasAccess(board, userId, BoardRole.Editor)) return Results.Forbid();

            var deleted = await boardFileService.DeleteFileAsync(boardId, fileId);
            return deleted ? Results.NoContent() : Results.NotFound();
        });

        return app;
    }
}
