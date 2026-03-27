using Orim.Core.Models;

namespace Orim.Tests.Core.Models;

public class BoardSummaryTests
{
    [Fact]
    public void FromBoard_MapsAllProperties()
    {
        var ownerId = Guid.NewGuid();
        var board = new Board
        {
            Title = "Test Board",
            OwnerId = ownerId,
            Visibility = BoardVisibility.Public,
            ShareLinkToken = "abc123",
            Members = [new BoardMember { UserId = ownerId, Username = "owner", Role = BoardRole.Owner }],
            Elements =
            [
                new ShapeElement { Label = "Shape1" },
                new TextElement { Text = "Hello" },
                new ArrowElement()
            ]
        };

        var summary = BoardSummary.FromBoard(board);

        Assert.Equal(board.Id, summary.Id);
        Assert.Equal("Test Board", summary.Title);
        Assert.Equal(ownerId, summary.OwnerId);
        Assert.Equal(BoardVisibility.Public, summary.Visibility);
        Assert.Equal("abc123", summary.ShareLinkToken);
        Assert.Single(summary.Members);
        Assert.Equal(3, summary.ElementCount);
        Assert.Equal(board.CreatedAt, summary.CreatedAt);
        Assert.Equal(board.UpdatedAt, summary.UpdatedAt);
    }

    [Fact]
    public void FromBoard_EmptyElements_ReturnsZeroCount()
    {
        var board = new Board { Title = "Empty" };

        var summary = BoardSummary.FromBoard(board);

        Assert.Equal(0, summary.ElementCount);
    }

    [Fact]
    public void FromBoard_SharesMembers_ByReference()
    {
        var member = new BoardMember { UserId = Guid.NewGuid(), Username = "user1", Role = BoardRole.Editor };
        var board = new Board { Members = [member] };

        var summary = BoardSummary.FromBoard(board);

        Assert.Same(board.Members, summary.Members);
    }
}
