namespace Orim.Core.Interfaces;

public interface IBoardFileService
{
    Task<BoardFileInfo> SaveFileAsync(Guid boardId, string fileName, string contentType, long size, Stream data);
    Task<IReadOnlyList<BoardFileInfo>> GetBoardFilesAsync(Guid boardId);
    Task<BoardFileData?> GetFileDataAsync(Guid boardId, string fileId);
    Task<bool> DeleteFileAsync(Guid boardId, string fileId);
}

public record BoardFileInfo(string Id, string FileName, string ContentType, long Size, DateTime UploadedAt);
public record BoardFileData(byte[] Data, string ContentType);
