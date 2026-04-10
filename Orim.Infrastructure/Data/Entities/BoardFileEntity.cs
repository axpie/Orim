namespace Orim.Infrastructure.Data.Entities;

public class BoardFileEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid BoardId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long Size { get; set; }
    public byte[] Data { get; set; } = [];
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
}
