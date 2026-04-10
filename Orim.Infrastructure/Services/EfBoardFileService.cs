using Microsoft.EntityFrameworkCore;
using Orim.Core.Interfaces;
using Orim.Infrastructure.Data;
using Orim.Infrastructure.Data.Entities;

namespace Orim.Infrastructure.Services;

public class EfBoardFileService : IBoardFileService
{
    private readonly OrimDbContext _context;

    private const long MaxFileSizeBytes = 50 * 1024 * 1024; // 50 MB

    public EfBoardFileService(OrimDbContext context)
    {
        _context = context;
    }

    public async Task<BoardFileInfo> SaveFileAsync(Guid boardId, string fileName, string contentType, long size, Stream data)
    {
        if (size > MaxFileSizeBytes)
            throw new InvalidOperationException($"File size exceeds the maximum allowed size of {MaxFileSizeBytes / (1024 * 1024)} MB.");

        if (string.IsNullOrWhiteSpace(contentType))
            throw new InvalidOperationException("Content type is required.");

        using var ms = new MemoryStream();
        await data.CopyToAsync(ms);
        var bytes = ms.ToArray();

        var entity = new BoardFileEntity
        {
            Id = Guid.NewGuid(),
            BoardId = boardId,
            FileName = fileName,
            ContentType = contentType,
            Size = bytes.Length,
            Data = bytes,
            UploadedAt = DateTime.UtcNow
        };

        _context.BoardFiles.Add(entity);
        await _context.SaveChangesAsync();
        _context.ChangeTracker.Clear();

        return new BoardFileInfo(entity.Id.ToString(), entity.FileName, entity.ContentType, entity.Size, entity.UploadedAt);
    }

    public async Task<IReadOnlyList<BoardFileInfo>> GetBoardFilesAsync(Guid boardId)
    {
        return await _context.BoardFiles
            .AsNoTracking()
            .Where(f => f.BoardId == boardId)
            .OrderByDescending(f => f.UploadedAt)
            .Select(f => new BoardFileInfo(f.Id.ToString(), f.FileName, f.ContentType, f.Size, f.UploadedAt))
            .ToListAsync();
    }

    public async Task<BoardFileData?> GetFileDataAsync(Guid boardId, string fileId)
    {
        if (!Guid.TryParse(fileId, out var id))
            return null;

        var entity = await _context.BoardFiles
            .AsNoTracking()
            .FirstOrDefaultAsync(f => f.Id == id && f.BoardId == boardId);

        if (entity is null)
            return null;

        return new BoardFileData(entity.Data, entity.ContentType);
    }

    public async Task<bool> DeleteFileAsync(Guid boardId, string fileId)
    {
        if (!Guid.TryParse(fileId, out var id))
            return false;

        var entity = await _context.BoardFiles.FirstOrDefaultAsync(f => f.Id == id && f.BoardId == boardId);
        if (entity is null)
            return false;

        _context.BoardFiles.Remove(entity);
        await _context.SaveChangesAsync();
        _context.ChangeTracker.Clear();
        return true;
    }
}
