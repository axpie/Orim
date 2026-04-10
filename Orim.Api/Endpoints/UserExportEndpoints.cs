using System.IO.Compression;
using Microsoft.AspNetCore.Authorization;
using Orim.Api.Infrastructure;
using Orim.Core.Interfaces;
using Orim.Core.Models;
using Orim.Core.Services;

namespace Orim.Api.Endpoints;

internal static class UserExportEndpoints
{
    internal static IEndpointRouteBuilder MapUserExportEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/user/export/zip", [Authorize] async (
            HttpContext context,
            BoardService boardService,
            IBoardRepository boardRepository,
            IBoardFileService boardFileService) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            var summaries = await boardRepository.GetBoardSummariesAsync();
            var ownedSummaries = summaries.Where(s => s.OwnerId == userId).ToList();
            var folders = await boardRepository.GetFoldersAsync(userId);
            var folderLookup = folders.ToDictionary(f => f.Id);

            using var ms = new MemoryStream();
            using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
            {
                var usedPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                foreach (var summary in ownedSummaries)
                {
                    var board = await boardService.GetBoardAsync(summary.Id);
                    if (board is null) continue;

                    // Create a per-board ZIP using the same format as the single-board export
                    var boardZipBytes = await BoardEndpoints.CreateBoardZipAsync(board, boardFileService);

                    var basePath = BuildBoardPath(board.Title, board.FolderId, folderLookup);
                    var path = BuildUniquePath(basePath, usedPaths, ".zip");

                    var entry = zip.CreateEntry(path, CompressionLevel.Optimal);
                    await using var entryStream = entry.Open();
                    await entryStream.WriteAsync(boardZipBytes);
                }
            }

            var fileName = $"orim-export-{DateTime.UtcNow:yyyy-MM-dd}.zip";
            return Results.File(ms.ToArray(), "application/zip", fileName);
        });

        return app;
    }

    private static string BuildBoardPath(string title, string? folderId, Dictionary<string, BoardFolder> folderLookup)
    {
        var parts = new List<string> { "boards" };

        if (folderId is not null)
        {
            var folderParts = new List<string>();
            var currentId = folderId;
            while (currentId is not null && folderLookup.TryGetValue(currentId, out var folder))
            {
                folderParts.Insert(0, BoardEndpoints.SanitizeName(folder.Name));
                currentId = folder.ParentFolderId;
            }
            parts.AddRange(folderParts);
        }

        parts.Add(BoardEndpoints.SanitizeName(title));
        return string.Join("/", parts);
    }

    private static string BuildUniquePath(string basePath, HashSet<string> used, string? extension)
    {
        var candidate = extension is not null ? basePath + extension : basePath;
        if (used.Add(candidate)) return candidate;

        for (var counter = 2; ; counter++)
        {
            candidate = extension is not null
                ? $"{basePath} ({counter}){extension}"
                : $"{basePath} ({counter})";
            if (used.Add(candidate)) return candidate;
        }
    }
}
