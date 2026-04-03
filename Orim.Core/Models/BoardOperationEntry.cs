namespace Orim.Core.Models;

public class BoardOperationEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid BoardId { get; set; }
    public long SequenceNumber { get; set; }
    public string OperationType { get; set; } = string.Empty;
    public string OperationPayload { get; set; } = string.Empty;
    public string? ClientId { get; set; }
    public Guid? UserId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
