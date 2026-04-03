using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Orim.Api.Contracts;
using Orim.Api.Hubs;
using Orim.Api.Infrastructure;
using Orim.Api.Services;
using Orim.Core;
using Orim.Core.Interfaces;
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

        app.MapPost("/api/boards", [Authorize] async (CreateBoardRequest request, HttpContext context, BoardService boardService, AuditLogger audit) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            var username = EndpointHelpers.GetUsername(context.User);
            var board = await boardService.CreateBoardAsync(request.Title, userId, username, request.TemplateId, request.ThemeKey);
            audit.LogBoardCreated(board.Id, userId, board.Title);
            return Results.Created($"/api/boards/{board.Id}", board);
        });

        app.MapPut("/api/boards/{id:guid}", [Authorize] async (Guid id, SaveBoardStateRequest request, HttpContext context, BoardService boardService) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId, BoardRole.Editor))
                return Results.Forbid();

            var updatedBoard = new Board
            {
                LabelOutlineEnabled = request.LabelOutlineEnabled,
                ArrowOutlineEnabled = request.ArrowOutlineEnabled,
                SurfaceColor = request.SurfaceColor,
                ThemeKey = request.ThemeKey,
                CustomColors = request.CustomColors?.ToList() ?? [],
                RecentColors = request.RecentColors?.ToList() ?? [],
                StickyNotePresets = request.StickyNotePresets?.ToList() ?? [],
                Elements = request.Elements?.ToList() ?? []
            };

            boardService.SetBoardTitle(board, request.Title);
            boardService.ReplaceBoardContent(board, updatedBoard);
            await boardService.SaveEditorStateAsync(board, request.SourceClientId, request.ChangeKind, notifyChange: false);
            return Results.Ok(board);
        });

        app.MapPut("/api/boards/{id:guid}/title", [Authorize] async (Guid id, RenameBoardRequest request, HttpContext context, BoardService boardService) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId, BoardRole.Editor))
                return Results.Forbid();

            boardService.SetBoardTitle(board, request.Title);
            await boardService.SaveEditorStateAsync(board, request.SourceClientId, BoardChangeKind.Metadata, notifyChange: true);
            return Results.Ok(board);
        });

        app.MapDelete("/api/boards/{id:guid}", [Authorize] async (Guid id, HttpContext context, BoardService boardService, AuditLogger audit) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId, BoardRole.Owner))
                return Results.Forbid();

            await boardService.DeleteBoardAsync(id);
            audit.LogBoardDeleted(id, userId);
            return Results.NoContent();
        });

        // --- Sharing & Members ---

        app.MapPut("/api/boards/{id:guid}/visibility", [Authorize] async (Guid id, SetVisibilityRequest request, HttpContext context, BoardService boardService, AuditLogger audit) =>
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
            audit.LogBoardShared(board.Id, userId, $"{board.Visibility};AnonymousEditing={board.SharedAllowAnonymousEditing}");
            return Results.Ok(board);
        });

        app.MapPost("/api/boards/{id:guid}/share-token", [Authorize] async (Guid id, HttpContext context, BoardService boardService, AuditLogger audit) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId, BoardRole.Owner))
                return Results.Forbid();

            board.ShareLinkToken = boardService.GenerateShareLinkToken();
            await boardService.UpdateBoardAsync(board, kind: BoardChangeKind.Metadata);
            audit.LogBoardShareConfigurationChanged(board.Id, userId, "ShareTokenGenerated");
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
            await boardService.SaveEditorStateAsync(board, request.SourceClientId, BoardChangeKind.Content, notifyChange: false);
            return Results.Ok(board);
        }).AllowAnonymous();

        app.MapPost("/api/boards/shared/{token}/history", async (
            string token,
            SharedBoardHistoryRequest request,
            BoardService boardService,
            IBoardOperationRepository operationRepository) =>
        {
            var board = await boardService.GetBoardByShareTokenAsync(token);
            if (board is null) return Results.NotFound();
            if (!string.Equals(board.ShareLinkToken, token, StringComparison.Ordinal)) return Results.NotFound();
            if (!boardService.HasSharedLinkAccess(board, request.Password, BoardRole.Viewer)) return Results.Forbid();

            var limit = request.Limit;
            if (limit is < 0 or > 1000) limit = 100;

            var latestSequenceNumber = await operationRepository.GetLatestSequenceNumberAsync(board.Id);
            var operations = limit == 0
                ? []
                : await operationRepository.GetOperationsSinceAsync(board.Id, request.Since, limit);

            return Results.Ok(CreateHistoryResponse(request.Since, limit, latestSequenceNumber, operations));
        }).AllowAnonymous();

        app.MapPost("/api/boards/{id:guid}/share-password", [Authorize] async (Guid id, SetSharePasswordRequest request, HttpContext context, BoardService boardService, AuditLogger audit) =>
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
            audit.LogBoardShareConfigurationChanged(board.Id, userId, string.IsNullOrWhiteSpace(request.Password)
                ? "SharePasswordCleared"
                : "SharePasswordSet");
            return Results.NoContent();
        });

        app.MapPost("/api/boards/{id:guid}/members", [Authorize] async (Guid id, AddMemberRequest request, HttpContext context, BoardService boardService, UserService userService, AuditLogger audit) =>
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
            audit.LogMemberAdded(board.Id, user.Id, request.Role.ToString(), userId);
            return Results.Ok(board.Members);
        });

        app.MapDelete("/api/boards/{id:guid}/members/{userId:guid}", [Authorize] async (Guid id, Guid userId, HttpContext context, BoardService boardService, AuditLogger audit) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } requestingUserId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, requestingUserId, BoardRole.Owner))
                return Results.Forbid();

            boardService.RemoveMember(board, userId);
            await boardService.UpdateBoardAsync(board, kind: BoardChangeKind.Metadata);
            audit.LogMemberRemoved(board.Id, userId, requestingUserId);
            return Results.NoContent();
        });

        app.MapPut("/api/boards/{id:guid}/members/{userId:guid}/role", [Authorize] async (Guid id, Guid userId, UpdateMemberRoleRequest request, HttpContext context, BoardService boardService, AuditLogger audit) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } requestingUserId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, requestingUserId, BoardRole.Owner))
                return Results.Forbid();

            boardService.UpdateMemberRole(board, userId, request.Role);
            await boardService.UpdateBoardAsync(board, kind: BoardChangeKind.Metadata);
            audit.LogMemberRoleChanged(board.Id, userId, request.Role.ToString(), requestingUserId);
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
            await boardService.SaveEditorStateAsync(board, kind: BoardChangeKind.Content, notifyChange: true);
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
            await boardService.SaveEditorStateAsync(board, kind: BoardChangeKind.Content, notifyChange: true);
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
            BoardCommentNotifier boardCommentNotifier,
            ILogger<Program> logger) =>
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
                logger.LogWarning(exception, "Creating a comment failed for board {BoardId}.", id);
                return EndpointHelpers.BadRequest(context, "The comment could not be created.");
            }
        });

        app.MapPost("/api/boards/{id:guid}/comments/{commentId:guid}/replies", [Authorize] async (
            Guid id,
            Guid commentId,
            CreateBoardCommentReplyRequest request,
            HttpContext context,
            BoardService boardService,
            BoardCommentService boardCommentService,
            BoardCommentNotifier boardCommentNotifier,
            ILogger<Program> logger) =>
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
                logger.LogWarning(exception, "Creating a comment reply failed for board {BoardId}.", id);
                return EndpointHelpers.BadRequest(context, "The reply could not be created.");
            }
            catch (InvalidOperationException exception)
            {
                logger.LogWarning(exception, "Creating a comment reply failed because the comment was missing for board {BoardId}.", id);
                return EndpointHelpers.NotFound(context, "The comment could not be found.");
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

        // --- Operation History ---

        app.MapGet("/api/boards/{id:guid}/history", [Authorize] async (Guid id, HttpContext context, BoardService boardService, IBoardOperationRepository operationRepository, long since = 0, int limit = 100) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId))
                return Results.Forbid();

            if (limit is < 0 or > 1000) limit = 100;

            var latestSequenceNumber = await operationRepository.GetLatestSequenceNumberAsync(id);
            var operations = limit == 0
                ? []
                : await operationRepository.GetOperationsSinceAsync(id, since, limit);

            return Results.Ok(CreateHistoryResponse(since, limit, latestSequenceNumber, operations));
        });

        // --- Presence (real) ---

        app.MapPost("/api/presence/leave", async (PresenceLeaveRequest request, IBoardPresenceService presenceService) =>
        {
            if (request.BoardId == Guid.Empty || string.IsNullOrWhiteSpace(request.ClientId))
                return Results.BadRequest();

            await presenceService.RemoveCursorAsync(request.BoardId, request.ClientId);
            return Results.Ok();
        }).AllowAnonymous();

        // --- Folders ---

        app.MapGet("/api/boards/folders", [Authorize] async (HttpContext context, IBoardRepository boardRepository) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            var folders = await boardRepository.GetFoldersAsync(userId);
            return Results.Ok(folders);
        });

        app.MapPost("/api/boards/folders", [Authorize] async (CreateFolderRequest request, HttpContext context, IBoardRepository boardRepository) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            var folder = new BoardFolder
            {
                Name = request.Name,
                OwnerId = userId,
                ParentFolderId = request.ParentFolderId,
            };
            await boardRepository.SaveFolderAsync(folder);
            return Results.Created($"/api/boards/folders/{folder.Id}", folder);
        });

        app.MapPut("/api/boards/folders/{id}", [Authorize] async (string id, UpdateFolderRequest request, HttpContext context, IBoardRepository boardRepository) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            var folders = await boardRepository.GetFoldersAsync(userId);
            var folder = folders.FirstOrDefault(f => f.Id == id);
            if (folder is null) return Results.NotFound();

            folder.Name = request.Name;
            await boardRepository.SaveFolderAsync(folder);
            return Results.Ok(folder);
        });

        app.MapDelete("/api/boards/folders/{id}", [Authorize] async (string id, HttpContext context, IBoardRepository boardRepository) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            var folders = await boardRepository.GetFoldersAsync(userId);
            if (folders.All(f => f.Id != id)) return Results.NotFound();

            await boardRepository.DeleteFolderAsync(id);
            return Results.NoContent();
        });

        app.MapPut("/api/boards/{id:guid}/folder", [Authorize] async (Guid id, SetBoardFolderRequest request, HttpContext context, BoardService boardService) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (!boardService.HasAccess(board, userId, BoardRole.Editor))
                return Results.Forbid();

            board.FolderId = request.FolderId;
            board.UpdatedAt = DateTime.UtcNow;
            await boardService.UpdateBoardAsync(board, kind: BoardChangeKind.Metadata);
            return Results.Ok(board);
        });

        app.MapPut("/api/boards/{id:guid}/tags", [Authorize] async (Guid id, SetBoardTagsRequest request, HttpContext context, BoardService boardService) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (!boardService.HasAccess(board, userId, BoardRole.Editor))
                return Results.Forbid();

            board.Tags = request.Tags.ToList();
            board.UpdatedAt = DateTime.UtcNow;
            await boardService.UpdateBoardAsync(board, kind: BoardChangeKind.Metadata);
            return Results.Ok(board);
        });

        return app;
    }

    private static BoardOperationHistoryResponse CreateHistoryResponse(
        long sinceSequenceNumber,
        int limit,
        long latestSequenceNumber,
        IReadOnlyList<BoardOperationEntry> operations)
    {
        var mappedOperations = operations.Select(MapHistoryEntry).ToList();
        var hasMore = limit == 0
            ? latestSequenceNumber > sinceSequenceNumber
            : mappedOperations.Count > 0 && mappedOperations[^1].SequenceNumber < latestSequenceNumber;

        return new BoardOperationHistoryResponse(latestSequenceNumber, hasMore, mappedOperations);
    }

    private static BoardOperationHistoryEntryDto MapHistoryEntry(BoardOperationEntry entry)
    {
        var operation = JsonSerializer.Deserialize<BoardOperationDto>(entry.OperationPayload, OrimJsonOptions.Default)
            ?? throw new InvalidOperationException($"Board operation '{entry.Id}' could not be deserialized.");

        return new BoardOperationHistoryEntryDto(
            entry.SequenceNumber,
            entry.CreatedAtUtc,
            entry.ClientId,
            entry.UserId,
            operation);
    }
}
