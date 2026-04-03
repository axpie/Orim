using NSubstitute;
using Orim.Core.Interfaces;
using Orim.Core.Models;
using Orim.Core.Services;

namespace Orim.Tests.Core.Services;

public class BoardCommentServiceTests
{
    private readonly IBoardRepository _boardRepository = Substitute.For<IBoardRepository>();
    private readonly BoardCommentService _sut;

    public BoardCommentServiceTests()
    {
        _sut = new BoardCommentService(_boardRepository);
    }

    [Fact]
    public async Task CreateCommentAsync_AddsCommentAndSavesBoard()
    {
        var board = new Board { Title = "Board" };
        var authorId = Guid.NewGuid();

        var comment = await _sut.CreateCommentAsync(board, authorId, " alice ", 100.126, 200.994, " Needs review ");

        Assert.Single(board.Comments);
        Assert.Equal(comment.Id, board.Comments[0].Id);
        Assert.Equal(authorId, comment.AuthorUserId);
        Assert.Equal("alice", comment.AuthorUsername);
        Assert.Equal(100.13, comment.X);
        Assert.Equal(200.99, comment.Y);
        Assert.Equal("Needs review", comment.Text);
        await _boardRepository.Received(1).SaveAsync(board);
    }

    [Fact]
    public async Task AddReplyAsync_AppendsReplyAndUpdatesComment()
    {
        var board = new Board
        {
            Comments =
            [
                new BoardComment
                {
                    Text = "Parent",
                    AuthorUserId = Guid.NewGuid(),
                    AuthorUsername = "alice"
                }
            ]
        };

        var updated = await _sut.AddReplyAsync(board, board.Comments[0].Id, Guid.NewGuid(), " bob ", " Thanks ");

        Assert.Single(updated.Replies);
        Assert.Equal("bob", updated.Replies[0].AuthorUsername);
        Assert.Equal("Thanks", updated.Replies[0].Text);
        await _boardRepository.Received(1).SaveAsync(board);
    }

    [Fact]
    public async Task DeleteCommentAsync_RemovesComment()
    {
        var board = new Board
        {
            Comments =
            [
                new BoardComment
                {
                    Text = "Delete me",
                    AuthorUserId = Guid.NewGuid(),
                    AuthorUsername = "alice"
                }
            ]
        };

        await _sut.DeleteCommentAsync(board, board.Comments[0].Id);

        Assert.Empty(board.Comments);
        await _boardRepository.Received(1).SaveAsync(board);
    }

    [Fact]
    public async Task DeleteReplyAsync_RemovesReplyAndReturnsComment()
    {
        var board = new Board
        {
            Comments =
            [
                new BoardComment
                {
                    Text = "Parent",
                    AuthorUserId = Guid.NewGuid(),
                    AuthorUsername = "alice",
                    Replies =
                    [
                        new BoardCommentReply
                        {
                            Text = "Child",
                            AuthorUserId = Guid.NewGuid(),
                            AuthorUsername = "bob"
                        }
                    ]
                }
            ]
        };

        var updated = await _sut.DeleteReplyAsync(board, board.Comments[0].Id, board.Comments[0].Replies[0].Id);

        Assert.Same(board.Comments[0], updated);
        Assert.Empty(updated.Replies);
        await _boardRepository.Received(1).SaveAsync(board);
    }

    [Fact]
    public void CanDeleteComment_ReturnsTrueForAuthorOrOwner()
    {
        var ownerId = Guid.NewGuid();
        var authorId = Guid.NewGuid();
        var board = new Board { OwnerId = ownerId };
        var comment = new BoardComment { AuthorUserId = authorId, AuthorUsername = "alice", Text = "A" };

        Assert.True(BoardCommentService.CanDeleteComment(board, comment, ownerId));
        Assert.True(BoardCommentService.CanDeleteComment(board, comment, authorId));
        Assert.False(BoardCommentService.CanDeleteComment(board, comment, Guid.NewGuid()));
    }

    [Fact]
    public void CanDeleteReply_ReturnsTrueForAuthorOrOwner()
    {
        var ownerId = Guid.NewGuid();
        var authorId = Guid.NewGuid();
        var board = new Board { OwnerId = ownerId };
        var reply = new BoardCommentReply { AuthorUserId = authorId, AuthorUsername = "bob", Text = "R" };

        Assert.True(BoardCommentService.CanDeleteReply(board, reply, ownerId));
        Assert.True(BoardCommentService.CanDeleteReply(board, reply, authorId));
        Assert.False(BoardCommentService.CanDeleteReply(board, reply, Guid.NewGuid()));
    }
}
