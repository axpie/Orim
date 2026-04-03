using Orim.Core.Models;
using Orim.Infrastructure.Data;
using Orim.Infrastructure.Repositories;

namespace Orim.Tests.Infrastructure;

public class EfBoardRepositoryTests : IDisposable
{
    private readonly OrimDbContext _context;
    private readonly EfBoardRepository _sut;

    public EfBoardRepositoryTests()
    {
        _context = TestDbContextFactory.Create();
        _sut = new EfBoardRepository(_context);
    }

    public void Dispose() => _context.Dispose();

    [Fact]
    public async Task GetAllAsync_Empty_ReturnsEmptyList()
    {
        var boards = await _sut.GetAllAsync();

        Assert.Empty(boards);
    }

    [Fact]
    public async Task SaveAsync_NewBoard_CanBeRetrieved()
    {
        var board = new Board { Title = "Test Board" };

        await _sut.SaveAsync(board);
        var retrieved = await _sut.GetByIdAsync(board.Id);

        Assert.NotNull(retrieved);
        Assert.Equal("Test Board", retrieved.Title);
    }

    [Fact]
    public async Task SaveAsync_UpdatesExistingBoard()
    {
        var board = new Board { Title = "Original" };
        await _sut.SaveAsync(board);

        board.Title = "Updated";
        await _sut.SaveAsync(board);

        var retrieved = await _sut.GetByIdAsync(board.Id);
        Assert.NotNull(retrieved);
        Assert.Equal("Updated", retrieved.Title);
    }

    [Fact]
    public async Task GetByIdAsync_NonExistent_ReturnsNull()
    {
        var result = await _sut.GetByIdAsync(Guid.NewGuid());

        Assert.Null(result);
    }

    [Fact]
    public async Task DeleteAsync_RemovesBoard()
    {
        var board = new Board { Title = "To Delete" };
        await _sut.SaveAsync(board);

        await _sut.DeleteAsync(board.Id);

        var result = await _sut.GetByIdAsync(board.Id);
        Assert.Null(result);
    }

    [Fact]
    public async Task DeleteAsync_NonExistent_DoesNotThrow()
    {
        await _sut.DeleteAsync(Guid.NewGuid());
    }

    [Fact]
    public async Task GetAllAsync_MultipleBoards_ReturnsAll()
    {
        await _sut.SaveAsync(new Board { Title = "Board 1" });
        await _sut.SaveAsync(new Board { Title = "Board 2" });
        await _sut.SaveAsync(new Board { Title = "Board 3" });

        var boards = await _sut.GetAllAsync();

        Assert.Equal(3, boards.Count);
    }

    [Fact]
    public async Task GetBoardSummariesAsync_ReturnsSummaries()
    {
        var board = new Board
        {
            Title = "Test",
            Elements = [new ShapeElement { Label = "s1" }, new TextElement { Text = "t1" }]
        };
        await _sut.SaveAsync(board);

        var summaries = await _sut.GetBoardSummariesAsync();

        Assert.Single(summaries);
        Assert.Equal("Test", summaries[0].Title);
        Assert.Equal(2, summaries[0].ElementCount);
    }

    [Fact]
    public async Task GetByShareTokenAsync_ExistingToken_ReturnsBoard()
    {
        var board = new Board { Title = "Shared", ShareLinkToken = "abc123" };
        await _sut.SaveAsync(board);

        var result = await _sut.GetByShareTokenAsync("abc123");

        Assert.NotNull(result);
        Assert.Equal("Shared", result.Title);
    }

    [Fact]
    public async Task GetByShareTokenAsync_NonExistentToken_ReturnsNull()
    {
        var result = await _sut.GetByShareTokenAsync("nonexistent");

        Assert.Null(result);
    }

    [Fact]
    public async Task SaveAsync_UpdatesTokenIndex()
    {
        var board = new Board { Title = "Test", ShareLinkToken = "token1" };
        await _sut.SaveAsync(board);

        board.ShareLinkToken = "token2";
        await _sut.SaveAsync(board);

        var byOldToken = await _sut.GetByShareTokenAsync("token1");
        var byNewToken = await _sut.GetByShareTokenAsync("token2");

        Assert.Null(byOldToken);
        Assert.NotNull(byNewToken);
    }

    [Fact]
    public async Task DeleteAsync_CleansTokenIndex()
    {
        var board = new Board { Title = "Test", ShareLinkToken = "token123" };
        await _sut.SaveAsync(board);

        await _sut.DeleteAsync(board.Id);

        var result = await _sut.GetByShareTokenAsync("token123");
        Assert.Null(result);
    }

    [Fact]
    public async Task SaveAsync_PersistsElements()
    {
        var board = new Board
        {
            Title = "With Elements",
            Elements =
            [
                new ShapeElement { Label = "Shape", ShapeType = ShapeType.Ellipse },
                new ArrowElement { StrokeColor = "#FF0000" },
                new TextElement { Text = "Hello" },
                new StickyNoteElement { Text = "Remember this" },
                new FrameElement { Label = "Area" },
                new IconElement { IconName = "mdi-star" }
            ]
        };

        await _sut.SaveAsync(board);
        var retrieved = await _sut.GetByIdAsync(board.Id);

        Assert.NotNull(retrieved);
        Assert.Equal(6, retrieved.Elements.Count);
        Assert.IsType<ShapeElement>(retrieved.Elements[0]);
        Assert.IsType<ArrowElement>(retrieved.Elements[1]);
        Assert.IsType<TextElement>(retrieved.Elements[2]);
        Assert.IsType<StickyNoteElement>(retrieved.Elements[3]);
        Assert.IsType<FrameElement>(retrieved.Elements[4]);
        Assert.IsType<IconElement>(retrieved.Elements[5]);
    }

    [Fact]
    public async Task SaveAsync_PersistsComments()
    {
        var board = new Board
        {
            Title = "With Comments",
            Comments =
            [
                new BoardComment
                {
                    AuthorUserId = Guid.NewGuid(),
                    AuthorUsername = "alice",
                    X = 100.12,
                    Y = 250.34,
                    Text = "Review this area",
                    Replies =
                    [
                        new BoardCommentReply
                        {
                            AuthorUserId = Guid.NewGuid(),
                            AuthorUsername = "bob",
                            Text = "Done"
                        }
                    ]
                }
            ]
        };

        await _sut.SaveAsync(board);
        var retrieved = await _sut.GetByIdAsync(board.Id);

        Assert.NotNull(retrieved);
        Assert.Single(retrieved.Comments);
        Assert.Equal("Review this area", retrieved.Comments[0].Text);
        Assert.Single(retrieved.Comments[0].Replies);
        Assert.Equal("Done", retrieved.Comments[0].Replies[0].Text);
    }
}
