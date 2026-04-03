using System.Text.Json;

namespace Orim.Api.Services;

public record UserImageInfo(string Id, string FileName, string MimeType, long Size, DateTime UploadedAt);

public class ImageStorageService
{
    private readonly string _basePath;
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase) { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg" };
    private static readonly HashSet<string> AllowedMimeTypes = new(StringComparer.OrdinalIgnoreCase) { "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml" };
    private const long MaxFileSizeBytes = 10 * 1024 * 1024; // 10 MB

    public ImageStorageService(string dataPath)
    {
        _basePath = Path.Combine(dataPath, "images");
        Directory.CreateDirectory(_basePath);
    }

    public async Task<UserImageInfo> SaveImageAsync(Guid userId, IFormFile file)
    {
        if (file.Length > MaxFileSizeBytes)
            throw new InvalidOperationException("File too large.");

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedExtensions.Contains(ext))
            throw new InvalidOperationException("Unsupported file type.");

        if (!AllowedMimeTypes.Contains(file.ContentType))
            throw new InvalidOperationException("Unsupported MIME type.");

        var userDir = GetUserDir(userId);
        Directory.CreateDirectory(userDir);

        var imageId = Guid.NewGuid().ToString("N");
        var fileName = $"{imageId}{ext}";
        var filePath = Path.Combine(userDir, fileName);

        using var stream = File.Create(filePath);
        await file.CopyToAsync(stream);

        var info = new UserImageInfo(imageId, file.FileName, file.ContentType, file.Length, DateTime.UtcNow);
        await UpdateIndexAsync(userId, info);
        return info;
    }

    public async Task<IReadOnlyList<UserImageInfo>> GetUserImagesAsync(Guid userId)
    {
        var indexPath = GetIndexPath(userId);
        if (!File.Exists(indexPath)) return [];
        var json = await File.ReadAllTextAsync(indexPath);
        return JsonSerializer.Deserialize<List<UserImageInfo>>(json) ?? [];
    }

    public async Task<bool> DeleteImageAsync(Guid userId, string imageId)
    {
        var userDir = GetUserDir(userId);
        if (!Directory.Exists(userDir)) return false;
        var files = Directory.GetFiles(userDir, $"{imageId}.*");
        if (files.Length == 0) return false;

        foreach (var f in files) File.Delete(f);

        var images = (await GetUserImagesAsync(userId)).Where(i => i.Id != imageId).ToList();
        await WriteIndexAsync(userId, images);
        return true;
    }

    public (string FilePath, string MimeType)? GetImageFilePath(Guid userId, string imageId)
    {
        var userDir = GetUserDir(userId);
        if (!Directory.Exists(userDir)) return null;
        foreach (var ext in AllowedExtensions)
        {
            var path = Path.Combine(userDir, $"{imageId}{ext}");
            if (File.Exists(path))
            {
                var mime = ext switch
                {
                    ".jpg" or ".jpeg" => "image/jpeg",
                    ".png" => "image/png",
                    ".gif" => "image/gif",
                    ".webp" => "image/webp",
                    ".svg" => "image/svg+xml",
                    _ => "application/octet-stream"
                };
                return (path, mime);
            }
        }
        return null;
    }

    private string GetUserDir(Guid userId) => Path.Combine(_basePath, userId.ToString("N"));
    private string GetIndexPath(Guid userId) => Path.Combine(GetUserDir(userId), "_index.json");

    private async Task UpdateIndexAsync(Guid userId, UserImageInfo newImage)
    {
        var images = (await GetUserImagesAsync(userId)).ToList();
        images.Insert(0, newImage); // newest first
        await WriteIndexAsync(userId, images);
    }

    private async Task WriteIndexAsync(Guid userId, List<UserImageInfo> images)
    {
        Directory.CreateDirectory(GetUserDir(userId));
        var json = JsonSerializer.Serialize(images);
        await File.WriteAllTextAsync(GetIndexPath(userId), json);
    }
}
