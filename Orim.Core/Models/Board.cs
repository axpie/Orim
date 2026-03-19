namespace Orim.Core.Models;

public class Board
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Title { get; set; } = string.Empty;
    public Guid OwnerId { get; set; }
    public BoardVisibility Visibility { get; set; } = BoardVisibility.Private;
    public string? ShareLinkToken { get; set; }
    public List<BoardMember> Members { get; set; } = [];
    public List<BoardElement> Elements { get; set; } = [];
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public enum BoardVisibility
{
    Private,
    Public,
    Shared
}

public class BoardMember
{
    public Guid UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public BoardRole Role { get; set; }
}

public enum BoardRole
{
    Owner,
    Editor,
    Viewer
}
