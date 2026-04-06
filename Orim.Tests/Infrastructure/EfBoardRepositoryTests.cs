using Orim.Core.Models;
using Orim.Infrastructure.Data;
using Orim.Infrastructure.Repositories;

namespace Orim.Tests.Infrastructure;

public class EfBoardRepositoryTests : IDisposable
{
    private const string DefaultTitle = "Test";

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
            Title = DefaultTitle,
            Elements = [new Orim.Core.Models.TextElement { Text = "A" }, new Orim.Core.Models.TextElement { Text = "B" }]
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
        var board = new Board { Title = DefaultTitle, ShareLinkToken = "token1" };
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
        var board = new Board { Title = DefaultTitle, ShareLinkToken = "token123" };
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
    }

    [Fact]
    public async Task GetBoardSummariesAsync_Empty_ReturnsEmpty()
    {
        var result = await _sut.GetBoardSummariesAsync();

        Assert.Empty(result);
    }

    [Fact]
    public async Task SaveAsync_NewSnapshot_PersistsAndRetrievesSnapshot()
    {
        var board = new Board { Title = "Board With Snapshot", Elements = [new ShapeElement { Label = "A" }] };
        await _sut.SaveAsync(board);

        // Reload the board (as the endpoint does via GetBoardAsync → AsNoTracking)
        var reloaded = await _sut.GetByIdAsync(board.Id);
        Assert.NotNull(reloaded);

        var snapshot = new BoardSnapshot
        {
            Name = "v1",
            CreatedByUserId = Guid.NewGuid(),
            CreatedByUsername = "alice",
            ContentJson = "{\"elements\":[]}",
        };
        reloaded.Snapshots.Add(snapshot);
        await _sut.SaveAsync(reloaded);

        var retrieved = await _sut.GetByIdAsync(board.Id);
        Assert.NotNull(retrieved);
        Assert.Single(retrieved.Snapshots);
        Assert.Equal("v1", retrieved.Snapshots[0].Name);
        Assert.Equal("alice", retrieved.Snapshots[0].CreatedByUsername);
        Assert.Equal(board.Id, retrieved.Snapshots[0].BoardId);
    }

    [Fact]
    public async Task SaveAsync_MultipleSnapshots_PersistsAll()
    {
        var board = new Board { Title = "Snap Board" };
        await _sut.SaveAsync(board);

        var reloaded1 = await _sut.GetByIdAsync(board.Id);
        Assert.NotNull(reloaded1);
        reloaded1.Snapshots.Add(new BoardSnapshot { Name = "snap-1", CreatedByUserId = Guid.NewGuid(), CreatedByUsername = "alice", ContentJson = "{}" });
        await _sut.SaveAsync(reloaded1);

        var reloaded2 = await _sut.GetByIdAsync(board.Id);
        Assert.NotNull(reloaded2);
        reloaded2.Snapshots.Add(new BoardSnapshot { Name = "snap-2", CreatedByUserId = Guid.NewGuid(), CreatedByUsername = "alice", ContentJson = "{}" });
        await _sut.SaveAsync(reloaded2);

        var retrieved = await _sut.GetByIdAsync(board.Id);
        Assert.NotNull(retrieved);
        Assert.Equal(2, retrieved.Snapshots.Count);
    }

    [Fact]
    public async Task SaveAsync_SnapshotExceedsMax_OldestAreDropped()
    {
        var board = new Board { Title = "Max Snap Board" };
        await _sut.SaveAsync(board);

        // Add 30 snapshots one at a time (simulating endpoint flow each time)
        for (var i = 0; i < 30; i++)
        {
            var b = await _sut.GetByIdAsync(board.Id);
            Assert.NotNull(b);
            b.Snapshots.Insert(0, new BoardSnapshot
            {
                Name = $"snap-{i}",
                CreatedByUserId = Guid.NewGuid(),
                CreatedByUsername = "alice",
                ContentJson = "{}",
            });
            await _sut.SaveAsync(b);
        }

        var retrieved = await _sut.GetByIdAsync(board.Id);
        Assert.NotNull(retrieved);
        Assert.Equal(30, retrieved.Snapshots.Count);

        // Add a 31st snapshot — oldest should be trimmed (done at service layer before SaveAsync)
        var reloaded = await _sut.GetByIdAsync(board.Id);
        Assert.NotNull(reloaded);
        var newSnap = new BoardSnapshot { Name = "snap-30", CreatedByUserId = Guid.NewGuid(), CreatedByUsername = "alice", ContentJson = "{}" };
        reloaded.Snapshots.Insert(0, newSnap);
        reloaded.Snapshots = reloaded.Snapshots.Take(30).ToList();
        await _sut.SaveAsync(reloaded);

        var final = await _sut.GetByIdAsync(board.Id);
        Assert.NotNull(final);
        Assert.Equal(30, final.Snapshots.Count);
        Assert.Contains(final.Snapshots, s => s.Name == "snap-30");
        Assert.DoesNotContain(final.Snapshots, s => s.Name == "snap-29"); // oldest was trimmed
    }
}
