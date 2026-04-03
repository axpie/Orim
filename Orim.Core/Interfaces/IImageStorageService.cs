namespace Orim.Core.Interfaces;

public interface IImageStorageService
{
    Task<ImageInfo> SaveImageAsync(Guid userId, string fileName, string mimeType, long size, Stream data);
    Task<IReadOnlyList<ImageInfo>> GetUserImagesAsync(Guid userId);
    Task<bool> DeleteImageAsync(Guid userId, string imageId);
    Task<ImageData?> GetImageDataAsync(Guid userId, string imageId);
}

public record ImageInfo(string Id, string FileName, string MimeType, long Size, DateTime UploadedAt);
public record ImageData(byte[] Data, string MimeType);
