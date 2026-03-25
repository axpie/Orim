namespace Orim.Web;

public sealed class PresenceLeaveRequest
{
    public Guid BoardId { get; set; }
    public string ClientId { get; set; } = string.Empty;
}