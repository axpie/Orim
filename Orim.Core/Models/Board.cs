namespace Orim.Core.Models;

public class Board
{
    private static readonly string[] DefaultCustomColors =
    [
        "#0F172A",
        "#334155",
        "#64748B",
        "#E2E8F0",
        "#FFFFFF",
        "#DC2626",
        "#EA580C",
        "#CA8A04",
        "#16A34A",
        "#0891B2",
        "#2563EB",
        "#7C3AED"
    ];

    public Guid Id { get; set; } = Guid.NewGuid();
    public string Title { get; set; } = string.Empty;
    public bool LabelOutlineEnabled { get; set; } = true;
    public List<string> CustomColors { get; set; } = DefaultCustomColors.ToList();
    public List<string> RecentColors { get; set; } = [];
    public Guid OwnerId { get; set; }
    public BoardVisibility Visibility { get; set; } = BoardVisibility.Private;
    public string? ShareLinkToken { get; set; }
    public List<BoardMember> Members { get; set; } = [];
    public List<BoardElement> Elements { get; set; } = [];
    public List<BoardSnapshot> Snapshots { get; set; } = [];
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
