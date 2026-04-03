using Microsoft.EntityFrameworkCore;
using Orim.Core.Interfaces;
using Orim.Infrastructure.Data;
using Orim.Infrastructure.Data.Entities;

namespace Orim.Infrastructure.Services;

public class EfImageStorageService : IImageStorageService
{
    private readonly OrimDbContext _context;

    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg" };

    private static readonly HashSet<string> AllowedMimeTypes = new(StringComparer.OrdinalIgnoreCase)
        { "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml" };

    private const long MaxFileSizeBytes = 10 * 1024 * 1024; // 10 MB

    public EfImageStorageService(OrimDbContext context)
    {
        _context = context;
    }

    public async Task<ImageInfo> SaveImageAsync(Guid userId, string fileName, string mimeType, long size, Stream data)
    {
        var extension = Path.GetExtension(fileName);

        if (string.IsNullOrEmpty(extension) || !AllowedExtensions.Contains(extension))
            throw new InvalidOperationException($"File extension '{extension}' is not allowed.");

        if (!AllowedMimeTypes.Contains(mimeType))
            throw new InvalidOperationException($"MIME type '{mimeType}' is not allowed.");

        if (size > MaxFileSizeBytes)
            throw new InvalidOperationException($"File size exceeds the maximum allowed size of {MaxFileSizeBytes / (1024 * 1024)} MB.");

        using var ms = new MemoryStream();
        await data.CopyToAsync(ms);
        var bytes = ms.ToArray();

        var entity = new UserImageEntity
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            FileName = fileName,
            MimeType = mimeType,
            Size = bytes.Length,
            Data = bytes,
            UploadedAt = DateTime.UtcNow
        };

        _context.UserImages.Add(entity);
        await _context.SaveChangesAsync();
        _context.ChangeTracker.Clear();

        return new ImageInfo(entity.Id.ToString(), entity.FileName, entity.MimeType, entity.Size, entity.UploadedAt);
    }

    public async Task<IReadOnlyList<ImageInfo>> GetUserImagesAsync(Guid userId)
    {
        return await _context.UserImages
            .AsNoTracking()
            .Where(i => i.UserId == userId)
            .Select(i => new ImageInfo(i.Id.ToString(), i.FileName, i.MimeType, i.Size, i.UploadedAt))
            .ToListAsync();
    }

    public async Task<bool> DeleteImageAsync(Guid userId, string imageId)
    {
        if (!Guid.TryParse(imageId, out var id))
            return false;

        var entity = await _context.UserImages.FirstOrDefaultAsync(i => i.Id == id && i.UserId == userId);
        if (entity is null)
            return false;

        _context.UserImages.Remove(entity);
        await _context.SaveChangesAsync();
        _context.ChangeTracker.Clear();
        return true;
    }

    public async Task<ImageData?> GetImageDataAsync(Guid userId, string imageId)
    {
        if (!Guid.TryParse(imageId, out var id))
            return null;

        var entity = await _context.UserImages
            .AsNoTracking()
            .FirstOrDefaultAsync(i => i.Id == id && i.UserId == userId);

        if (entity is null)
            return null;

        return new ImageData(entity.Data, entity.MimeType);
    }
}
