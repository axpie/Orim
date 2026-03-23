namespace Orim.Core.Models;

public class BoardSummary
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public Guid OwnerId { get; set; }
    public BoardVisibility Visibility { get; set; }
    public string? ShareLinkToken { get; set; }
    public List<BoardMember> Members { get; set; } = [];
    public int ElementCount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public static BoardSummary FromBoard(Board board) => new()
    {
        Id = board.Id,
        Title = board.Title,
        OwnerId = board.OwnerId,
        Visibility = board.Visibility,
        ShareLinkToken = board.ShareLinkToken,
        Members = board.Members,
        ElementCount = board.Elements.Count,
        CreatedAt = board.CreatedAt,
        UpdatedAt = board.UpdatedAt
    };
}
