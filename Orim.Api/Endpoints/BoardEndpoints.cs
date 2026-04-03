using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Orim.Api.Contracts;
using Orim.Api.Hubs;
using Orim.Api.Infrastructure;
using Orim.Api.Services;
using Orim.Core;
using Orim.Core.Models;
using Orim.Core.Services;

namespace Orim.Api.Endpoints;

internal static class BoardEndpoints
{
    internal static IEndpointRouteBuilder MapBoardEndpoints(this IEndpointRouteBuilder app)
    {
        // --- Board CRUD ---

        app.MapGet("/api/boards", [Authorize] async (HttpContext context, BoardService boardService) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

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

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId))
                return Results.Forbid();

            return Results.Ok(board);
        });

        app.MapPost("/api/boards", [Authorize] async (CreateBoardRequest request, HttpContext context, BoardService boardService) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            var username = EndpointHelpers.GetUsername(context.User);
            var board = await boardService.CreateBoardAsync(request.Title, userId, username, request.TemplateId);
            return Results.Created($"/api/boards/{board.Id}", board);
        });

        app.MapPut("/api/boards/{id:guid}", [Authorize] async (Guid id, Board updatedBoard, HttpContext context, BoardService boardService) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId, BoardRole.Editor))
                return Results.Forbid();

            board.Title = updatedBoard.Title;
            boardService.ReplaceBoardContent(board, updatedBoard);
            await boardService.UpdateBoardAsync(board);
            return Results.Ok(board);
        });

        app.MapDelete("/api/boards/{id:guid}", [Authorize] async (Guid id, HttpContext context, BoardService boardService) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId, BoardRole.Owner))
                return Results.Forbid();

            await boardService.DeleteBoardAsync(id);
            return Results.NoContent();
        });

        // --- Sharing & Members ---

        app.MapPut("/api/boards/{id:guid}/visibility", [Authorize] async (Guid id, SetVisibilityRequest request, HttpContext context, BoardService boardService) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId, BoardRole.Owner))
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

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId, BoardRole.Owner))
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

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId, BoardRole.Owner))
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

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId, BoardRole.Owner))
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

            if (EndpointHelpers.GetUserId(context.User) is not { } requestingUserId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, requestingUserId, BoardRole.Owner))
                return Results.Forbid();

            boardService.RemoveMember(board, userId);
            await boardService.UpdateBoardAsync(board, kind: BoardChangeKind.Metadata);
            return Results.NoContent();
        });

        app.MapPut("/api/boards/{id:guid}/members/{userId:guid}/role", [Authorize] async (Guid id, Guid userId, UpdateMemberRoleRequest request, HttpContext context, BoardService boardService) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } requestingUserId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, requestingUserId, BoardRole.Owner))
                return Results.Forbid();

            boardService.UpdateMemberRole(board, userId, request.Role);
            await boardService.UpdateBoardAsync(board, kind: BoardChangeKind.Metadata);
            return Results.NoContent();
        });

        // --- Snapshots & Content ---

        app.MapPost("/api/boards/{id:guid}/snapshots", [Authorize] async (Guid id, CreateSnapshotRequest request, HttpContext context, BoardService boardService) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId, BoardRole.Editor))
                return Results.Forbid();

            var username = EndpointHelpers.GetUsername(context.User);
            var snapshot = boardService.CreateSnapshot(board, request.Name, userId, username);
            await boardService.UpdateBoardAsync(board, kind: BoardChangeKind.Metadata);
            return Results.Created($"/api/boards/{id}/snapshots/{snapshot.Id}", snapshot);
        });

        app.MapPost("/api/boards/{id:guid}/snapshots/{snapshotId:guid}/restore", [Authorize] async (Guid id, Guid snapshotId, HttpContext context, BoardService boardService) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId, BoardRole.Editor))
                return Results.Forbid();

            boardService.RestoreSnapshot(board, snapshotId);
            await boardService.UpdateBoardAsync(board);
            return Results.Ok(board);
        });

        app.MapPut("/api/boards/{id:guid}/content", [Authorize] async (Guid id, Board importedBoard, HttpContext context, BoardService boardService) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId, BoardRole.Editor))
                return Results.Forbid();

            boardService.ReplaceBoardContent(board, importedBoard);
            await boardService.UpdateBoardAsync(board);
            return Results.Ok(board);
        });

        // --- Comments ---

        app.MapGet("/api/boards/{id:guid}/comments", [Authorize] async (Guid id, HttpContext context, BoardService boardService) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId))
                return Results.Forbid();

            return Results.Ok(board.Comments.OrderByDescending(comment => comment.UpdatedAt).ToList());
        });

        app.MapPost("/api/boards/{id:guid}/comments", [Authorize] async (
            Guid id,
            CreateBoardCommentRequest request,
            HttpContext context,
            BoardService boardService,
            BoardCommentService boardCommentService,
            BoardCommentNotifier boardCommentNotifier) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId, BoardRole.Editor))
                return Results.Forbid();

            try
            {
                var comment = await boardCommentService.CreateCommentAsync(board, userId, EndpointHelpers.GetUsername(context.User), request.X, request.Y, request.Text);
                await boardCommentNotifier.NotifyCommentUpsertedAsync(id, comment);
                return Results.Created($"/api/boards/{id}/comments/{comment.Id}", comment);
            }
            catch (ArgumentException exception)
            {
                return Results.BadRequest(exception.Message);
            }
        });

        app.MapPost("/api/boards/{id:guid}/comments/{commentId:guid}/replies", [Authorize] async (
            Guid id,
            Guid commentId,
            CreateBoardCommentReplyRequest request,
            HttpContext context,
            BoardService boardService,
            BoardCommentService boardCommentService,
            BoardCommentNotifier boardCommentNotifier) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId, BoardRole.Editor))
                return Results.Forbid();

            try
            {
                var comment = await boardCommentService.AddReplyAsync(board, commentId, userId, EndpointHelpers.GetUsername(context.User), request.Text);
                await boardCommentNotifier.NotifyCommentUpsertedAsync(id, comment);
                return Results.Ok(comment);
            }
            catch (ArgumentException exception)
            {
                return Results.BadRequest(exception.Message);
            }
            catch (InvalidOperationException exception)
            {
                return Results.NotFound(exception.Message);
            }
        });

        app.MapDelete("/api/boards/{id:guid}/comments/{commentId:guid}", [Authorize] async (
            Guid id,
            Guid commentId,
            HttpContext context,
            BoardService boardService,
            BoardCommentService boardCommentService,
            BoardCommentNotifier boardCommentNotifier) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId))
                return Results.Forbid();

            var comment = board.Comments.FirstOrDefault(candidate => candidate.Id == commentId);
            if (comment is null)
                return Results.NotFound();

            if (!BoardCommentService.CanDeleteComment(board, comment, userId))
                return Results.Forbid();

            await boardCommentService.DeleteCommentAsync(board, commentId);
            await boardCommentNotifier.NotifyCommentDeletedAsync(id, commentId);
            return Results.NoContent();
        });

        app.MapDelete("/api/boards/{id:guid}/comments/{commentId:guid}/replies/{replyId:guid}", [Authorize] async (
            Guid id,
            Guid commentId,
            Guid replyId,
            HttpContext context,
            BoardService boardService,
            BoardCommentService boardCommentService,
            BoardCommentNotifier boardCommentNotifier) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId))
                return Results.Forbid();

            var comment = board.Comments.FirstOrDefault(candidate => candidate.Id == commentId);
            if (comment is null)
                return Results.NotFound();

            var reply = comment.Replies.FirstOrDefault(candidate => candidate.Id == replyId);
            if (reply is null)
                return Results.NotFound();

            if (!BoardCommentService.CanDeleteReply(board, reply, userId))
                return Results.Forbid();

            var updatedComment = await boardCommentService.DeleteReplyAsync(board, commentId, replyId);
            await boardCommentNotifier.NotifyCommentUpsertedAsync(id, updatedComment);
            return Results.Ok(updatedComment);
        });

        // --- Import / Export ---

        app.MapPost("/api/boards/import", [Authorize] async (ImportBoardRequest request, HttpContext context, BoardService boardService) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            var username = EndpointHelpers.GetUsername(context.User);
            var importedBoard = JsonSerializer.Deserialize<Board>(request.BoardJson, OrimJsonOptions.Default);
            if (importedBoard is null) return Results.BadRequest("Invalid board JSON.");

            var board = await boardService.CreateBoardFromImportAsync(importedBoard, request.Title ?? importedBoard.Title, userId, username);
            return Results.Created($"/api/boards/{board.Id}", board);
        });

        app.MapGet("/api/boards/{id:guid}/export/json", [Authorize] async (Guid id, HttpContext context, BoardService boardService) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId))
                return Results.Forbid();

            var json = JsonSerializer.Serialize(board, OrimJsonOptions.Indented);
            return Results.Text(json, "application/json");
        });

        app.MapGet("/api/boards/{id:guid}/export/pdf", [Authorize] async (Guid id, HttpContext context, BoardService boardService, BoardPdfExportService pdfExportService) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId))
                return Results.Forbid();

            var pdfBytes = pdfExportService.Export(board);
            return Results.File(pdfBytes, "application/pdf", $"{board.Title}.pdf");
        });

        // --- Presence (anonymous fallback for page unload) ---

        app.MapPost("/api/presence/leave", async (PresenceLeaveRequest request, BoardPresenceService presenceService) =>
        {
            if (request.BoardId == Guid.Empty || string.IsNullOrWhiteSpace(request.ClientId))
                return Results.BadRequest();

            await presenceService.RemoveCursorAsync(request.BoardId, request.ClientId);
            return Results.Ok();
        }).AllowAnonymous();

        return app;
    }
}
