namespace Orim.Core.Models;

public class BoardFolder
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = string.Empty;
    public Guid OwnerId { get; set; }
    public string? ParentFolderId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
