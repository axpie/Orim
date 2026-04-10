using System.IO.Compression;
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
                GridStyle = request.GridStyle is "lines" or "dots" or "none" ? request.GridStyle : null,
                SurfaceColor = request.SurfaceColor,
                ThemeKey = request.ThemeKey,
                EnabledIconGroups = request.EnabledIconGroups?.ToList() ?? board.EnabledIconGroups.ToList(),
                CustomColors = request.CustomColors?.ToList() ?? [],
                RecentColors = request.RecentColors?.ToList() ?? [],
                StickyNotePresets = request.StickyNotePresets?.ToList() ?? [],
                StylePresetState = BoardStylePresetState.Clone(request.StylePresetState ?? board.StylePresetState),
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

        app.MapPost("/api/boards/shared/{token}/export/json", async (string token, SharedBoardExportRequest request, BoardService boardService) =>
        {
            var board = await boardService.GetBoardByShareTokenAsync(token);
            if (board is null) return Results.NotFound();
            if (!string.Equals(board.ShareLinkToken, token, StringComparison.Ordinal)) return Results.NotFound();
            if (!boardService.HasSharedLinkAccess(board, request.Password, BoardRole.Viewer)) return Results.Forbid();

            var json = JsonSerializer.Serialize(board, OrimJsonOptions.Indented);
            return Results.Text(json, "application/json");
        }).AllowAnonymous();

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

        app.MapDelete("/api/boards/folders/{id}", [Authorize] async (string id, bool deleteBoards, HttpContext context, IBoardRepository boardRepository) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            var folders = await boardRepository.GetFoldersAsync(userId);
            if (folders.All(f => f.Id != id)) return Results.NotFound();

            await boardRepository.DeleteFolderAsync(id, deleteBoards);
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

        // --- ZIP Export ---

        app.MapGet("/api/boards/{id:guid}/export/zip", [Authorize] async (
            Guid id, HttpContext context, BoardService boardService, IBoardFileService boardFileService) =>
        {
            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!boardService.HasAccess(board, userId))
                return Results.Forbid();

            var zipBytes = await CreateBoardZipAsync(board, boardFileService);
            var fileName = $"{SanitizeName(board.Title)}.zip";
            return Results.File(zipBytes, "application/zip", fileName);
        });

        // --- ZIP Import ---

        app.MapPost("/api/boards/import/zip", [Authorize] async (
            HttpRequest request, HttpContext context, BoardService boardService, IBoardFileService boardFileService,
            ILogger<Program> logger) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!request.HasFormContentType) return Results.BadRequest("Expected multipart/form-data.");
            var form = await request.ReadFormAsync();
            var uploadedFile = form.Files.GetFile("file");
            if (uploadedFile is null) return Results.BadRequest("No file uploaded.");

            var title = form["title"].FirstOrDefault();

            try
            {
                await using var stream = uploadedFile.OpenReadStream();
                var username = EndpointHelpers.GetUsername(context.User);
                var board = await ImportBoardZipAsync(stream, title, userId, username, boardService, boardFileService);
                if (board is null) return Results.BadRequest("Invalid board ZIP.");
                return Results.Created($"/api/boards/{board.Id}", board);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Board ZIP import failed for user {UserId}.", userId);
                return EndpointHelpers.BadRequest(context, "The board ZIP could not be imported.");
            }
        });

        return app;
    }

    // ---- ZIP helpers ----

    internal record BoardFileManifestEntry(string Id, string FileName, string ContentType);

    internal static async Task<byte[]> CreateBoardZipAsync(Board board, IBoardFileService boardFileService)
    {
        var files = await boardFileService.GetBoardFilesAsync(board.Id);
        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
        {
            // board.json
            var boardJson = JsonSerializer.Serialize(board, OrimJsonOptions.Indented);
            var boardEntry = zip.CreateEntry("board.json", CompressionLevel.Optimal);
            await using (var writer = new StreamWriter(boardEntry.Open()))
                await writer.WriteAsync(boardJson);

            // files.json — manifest
            var manifest = files.Select(f => new BoardFileManifestEntry(f.Id, f.FileName, f.ContentType)).ToList();
            var manifestJson = JsonSerializer.Serialize(manifest, OrimJsonOptions.Default);
            var manifestEntry = zip.CreateEntry("files.json", CompressionLevel.Optimal);
            await using (var writer = new StreamWriter(manifestEntry.Open()))
                await writer.WriteAsync(manifestJson);

            // files/{id} — raw bytes
            foreach (var fileInfo in files)
            {
                var fileData = await boardFileService.GetFileDataAsync(board.Id, fileInfo.Id);
                if (fileData is null) continue;

                var fileEntry = zip.CreateEntry($"files/{fileInfo.Id}", CompressionLevel.Optimal);
                await using var entryStream = fileEntry.Open();
                await entryStream.WriteAsync(fileData.Data);
            }
        }
        return ms.ToArray();
    }

    internal static async Task<Board?> ImportBoardZipAsync(
        Stream zipStream, string? title, Guid userId, string username,
        BoardService boardService, IBoardFileService boardFileService)
    {
        using var zip = new ZipArchive(zipStream, ZipArchiveMode.Read);

        // Read board.json
        var boardEntry = zip.GetEntry("board.json");
        if (boardEntry is null) return null;

        Board? importedBoard;
        using (var reader = new StreamReader(boardEntry.Open()))
        {
            var json = await reader.ReadToEndAsync();
            importedBoard = JsonSerializer.Deserialize<Board>(json, OrimJsonOptions.Default);
        }
        if (importedBoard is null) return null;

        // Read files.json
        List<BoardFileManifestEntry> manifest = [];
        var manifestEntry = zip.GetEntry("files.json");
        if (manifestEntry is not null)
        {
            using var reader = new StreamReader(manifestEntry.Open());
            var json = await reader.ReadToEndAsync();
            manifest = JsonSerializer.Deserialize<List<BoardFileManifestEntry>>(json, OrimJsonOptions.Default) ?? [];
        }

        // Create the board first to get the new board ID
        var board = await boardService.CreateBoardFromImportAsync(
            importedBoard, title ?? importedBoard.Title, userId, username);

        if (manifest.Count == 0)
            return board;

        // Upload files and build oldId → newUrl mapping
        var urlMapping = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in manifest)
        {
            var fileEntry = zip.GetEntry($"files/{entry.Id}");
            if (fileEntry is null) continue;

            await using var fileStream = fileEntry.Open();
            using var ms = new MemoryStream();
            await fileStream.CopyToAsync(ms);
            ms.Position = 0;

            try
            {
                var saved = await boardFileService.SaveFileAsync(
                    board.Id, entry.FileName, entry.ContentType, ms.Length, ms);
                urlMapping[entry.Id] = $"/api/boards/{board.Id:N}/files/{saved.Id}";
            }
            catch (InvalidOperationException) { /* skip files that fail validation */ }
        }

        if (urlMapping.Count == 0)
            return board;

        // Rewrite FileElement URLs in the board
        var updated = false;
        foreach (var element in board.Elements)
        {
            if (element is not FileElement fileEl) continue;

            var oldId = fileEl.FileUrl.Split('/').LastOrDefault();
            if (oldId is not null && urlMapping.TryGetValue(oldId, out var newUrl))
            {
                fileEl.FileUrl = newUrl;
                updated = true;
            }
        }

        if (updated)
            await boardService.SaveEditorStateAsync(board, kind: BoardChangeKind.Content);

        return board;
    }

    internal static string SanitizeName(string name)
    {
        var invalid = Path.GetInvalidFileNameChars().ToHashSet();
        var sanitized = string.Concat(name.Select(c => invalid.Contains(c) ? '_' : c)).Trim();
        return string.IsNullOrWhiteSpace(sanitized) ? "board" : sanitized;
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
        using var operationDocument = JsonDocument.Parse(entry.OperationPayload);
        var operation = BoardOperationPayloadParser.ParseSingle(operationDocument.RootElement.Clone());

        return new BoardOperationHistoryEntryDto(
            entry.SequenceNumber,
            entry.CreatedAtUtc,
            entry.ClientId,
            entry.UserId,
            operation);
    }
}
