using Orim.Core.Models;

namespace Orim.Tests.Core.Models;

public class BoardTests
{
    [Fact]
    public void NewBoard_HasDefaultValues()
    {
        var board = new Board();

        Assert.NotEqual(Guid.Empty, board.Id);
        Assert.Equal(string.Empty, board.Title);
        Assert.True(board.LabelOutlineEnabled);
        Assert.True(board.ArrowOutlineEnabled);
        Assert.Equal(BoardVisibility.Private, board.Visibility);
        Assert.Null(board.ShareLinkToken);
        Assert.False(board.SharedAllowAnonymousEditing);
        Assert.Null(board.SharePasswordHash);
        Assert.Empty(board.Members);
        Assert.Empty(board.Elements);
        Assert.Empty(board.Comments);
        Assert.Empty(board.Snapshots);
        Assert.Empty(board.RecentColors);
    }

    [Fact]
    public void NewBoard_HasDefaultCustomColors()
    {
        var board = new Board();

        Assert.Equal(12, board.CustomColors.Count);
        Assert.Contains("#0F172A", board.CustomColors);
        Assert.Contains("#FFFFFF", board.CustomColors);
        Assert.Contains("#DC2626", board.CustomColors);
    }

    [Fact]
    public void NewBoard_CreatedAtAndUpdatedAt_AreRecentUtc()
    {
        var before = DateTime.UtcNow.AddSeconds(-1);
        var board = new Board();
        var after = DateTime.UtcNow.AddSeconds(1);

        Assert.InRange(board.CreatedAt, before, after);
        Assert.InRange(board.UpdatedAt, before, after);
    }

    [Fact]
    public void TwoNewBoards_HaveDifferentIds()
    {
        var board1 = new Board();
        var board2 = new Board();

        Assert.NotEqual(board1.Id, board2.Id);
    }
}
