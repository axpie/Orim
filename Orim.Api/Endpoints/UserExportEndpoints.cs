using System.IO.Compression;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Orim.Api.Infrastructure;
using Orim.Core;
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
            IImageStorageService imageService) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            var summaries = await boardRepository.GetBoardSummariesAsync();
            var ownedSummaries = summaries.Where(s => s.OwnerId == userId).ToList();
            var folders = await boardRepository.GetFoldersAsync(userId);
            var folderLookup = folders.ToDictionary(f => f.Id);
            var images = await imageService.GetUserImagesAsync(userId);

            using var ms = new MemoryStream();
            using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
            {
                var usedPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                foreach (var summary in ownedSummaries)
                {
                    var board = await boardService.GetBoardAsync(summary.Id);
                    if (board is null) continue;

                    var basePath = BuildBoardPath(board.Title, board.FolderId, folderLookup);
                    var path = BuildUniquePath(basePath, usedPaths, ".json");
                    var entry = zip.CreateEntry(path, CompressionLevel.Optimal);
                    await using var writer = new StreamWriter(entry.Open());
                    await writer.WriteAsync(JsonSerializer.Serialize(board, OrimJsonOptions.Indented));
                }

                foreach (var imageInfo in images)
                {
                    var imageData = await imageService.GetImageDataAsync(userId, imageInfo.Id);
                    if (imageData is null) continue;

                    var basePath = $"images/{SanitizeFileName(imageInfo.FileName)}";
                    var path = BuildUniquePath(basePath, usedPaths, null);
                    var entry = zip.CreateEntry(path, CompressionLevel.Optimal);
                    await using var stream = entry.Open();
                    await stream.WriteAsync(imageData.Data);
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
                folderParts.Insert(0, SanitizeFileName(folder.Name));
                currentId = folder.ParentFolderId;
            }
            parts.AddRange(folderParts);
        }

        parts.Add(SanitizeFileName(title));
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

    private static string SanitizeFileName(string name)
    {
        var invalid = Path.GetInvalidFileNameChars().ToHashSet();
        var sanitized = string.Concat(name.Select(c => invalid.Contains(c) ? '_' : c)).Trim();
        return string.IsNullOrWhiteSpace(sanitized) ? "unnamed" : sanitized;
    }
}
