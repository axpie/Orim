using Orim.Core.Services;

namespace Orim.Tests.Core.Services;

public class BoardPresenceServiceTests
{
    [Fact]
    public async Task Subscribe_ReceivesInitialSnapshot()
    {
        var service = new BoardPresenceService();
        var boardId = Guid.NewGuid();
        IReadOnlyList<BoardCursorPresence>? received = null;

        service.Subscribe(boardId, "sub1", snapshot =>
        {
            received = snapshot;
            return Task.CompletedTask;
        });

        // Give async handler time to complete
        await Task.Delay(50);

        Assert.NotNull(received);
        Assert.Empty(received);
    }

    [Fact]
    public async Task UpsertCursor_NotifiesSubscribers()
    {
        var service = new BoardPresenceService();
        var boardId = Guid.NewGuid();
        IReadOnlyList<BoardCursorPresence>? lastSnapshot = null;

        service.Subscribe(boardId, "sub1", snapshot =>
        {
            lastSnapshot = snapshot;
            return Task.CompletedTask;
        });

        var presence = new BoardCursorPresence("client1", null, "Alice", "#FF0000", 100, 200, DateTime.UtcNow);
        await service.UpsertCursorAsync(boardId, presence);

        Assert.NotNull(lastSnapshot);
        Assert.Single(lastSnapshot);
        Assert.Equal("Alice", lastSnapshot[0].DisplayName);
    }

    [Fact]
    public async Task RemoveCursor_RemovesFromSnapshot()
    {
        var service = new BoardPresenceService();
        var boardId = Guid.NewGuid();
        IReadOnlyList<BoardCursorPresence>? lastSnapshot = null;

        service.Subscribe(boardId, "sub1", snapshot =>
        {
            lastSnapshot = snapshot;
            return Task.CompletedTask;
        });

        var presence = new BoardCursorPresence("client1", null, "Alice", "#FF0000", 100, 200, DateTime.UtcNow);
        await service.UpsertCursorAsync(boardId, presence);
        await service.RemoveCursorAsync(boardId, "client1");

        Assert.NotNull(lastSnapshot);
        Assert.Empty(lastSnapshot);
    }

    [Fact]
    public async Task RemoveCursor_SuppressesRejoining()
    {
        var service = new BoardPresenceService();
        var boardId = Guid.NewGuid();

        var presence = new BoardCursorPresence("client1", null, "Alice", "#FF0000", 100, 200, DateTime.UtcNow);
        await service.UpsertCursorAsync(boardId, presence);

        await service.RemoveCursorAsync(boardId, "client1");

        // Re-upsert should be suppressed
        var presence2 = new BoardCursorPresence("client1", null, "Alice", "#FF0000", 150, 250, DateTime.UtcNow);
        await service.UpsertCursorAsync(boardId, presence2);

        IReadOnlyList<BoardCursorPresence>? lastSnapshot = null;
        service.Subscribe(boardId, "sub1", snapshot =>
        {
            lastSnapshot = snapshot;
            return Task.CompletedTask;
        });

        await Task.Delay(50);

        Assert.NotNull(lastSnapshot);
        Assert.Empty(lastSnapshot);
    }

    [Fact]
    public async Task Dispose_UnsubscribesHandler()
    {
        var service = new BoardPresenceService();
        var boardId = Guid.NewGuid();
        var callCount = 0;

        var sub = service.Subscribe(boardId, "sub1", _ =>
        {
            Interlocked.Increment(ref callCount);
            return Task.CompletedTask;
        });

        await Task.Delay(50); // initial snapshot callback
        var countAfterSubscribe = callCount;

        sub.Dispose();

        var presence = new BoardCursorPresence("client1", null, "Alice", "#FF0000", 100, 200, DateTime.UtcNow);
        await service.UpsertCursorAsync(boardId, presence);

        Assert.Equal(countAfterSubscribe, callCount);
    }

    [Fact]
    public async Task MultipleCursors_SortedByDisplayName()
    {
        var service = new BoardPresenceService();
        var boardId = Guid.NewGuid();
        IReadOnlyList<BoardCursorPresence>? lastSnapshot = null;

        service.Subscribe(boardId, "sub1", snapshot =>
        {
            lastSnapshot = snapshot;
            return Task.CompletedTask;
        });

        await service.UpsertCursorAsync(boardId, new BoardCursorPresence("c2", null, "Zara", "#0F0", 0, 0, DateTime.UtcNow));
        await service.UpsertCursorAsync(boardId, new BoardCursorPresence("c1", null, "Alice", "#F00", 0, 0, DateTime.UtcNow));
        await service.UpsertCursorAsync(boardId, new BoardCursorPresence("c3", null, "Max", "#00F", 0, 0, DateTime.UtcNow));

        Assert.NotNull(lastSnapshot);
        Assert.Equal(3, lastSnapshot.Count);
        Assert.Equal("Alice", lastSnapshot[0].DisplayName);
        Assert.Equal("Max", lastSnapshot[1].DisplayName);
        Assert.Equal("Zara", lastSnapshot[2].DisplayName);
    }

    [Fact]
    public void Subscribe_NullSubscriberId_Throws()
    {
        var service = new BoardPresenceService();

        Assert.ThrowsAny<ArgumentException>(
            () => service.Subscribe(Guid.NewGuid(), null!, _ => Task.CompletedTask));
    }

    [Fact]
    public void Subscribe_NullHandler_Throws()
    {
        var service = new BoardPresenceService();

        Assert.Throws<ArgumentNullException>(
            () => service.Subscribe(Guid.NewGuid(), "sub1", null!));
    }

    [Fact]
    public async Task RemoveCursorsForUser_RemovesStaleConnectionsKeepsNew()
    {
        var service = new BoardPresenceService();
        var boardId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        await service.UpsertCursorAsync(boardId, new BoardCursorPresence("old-conn", userId, "Alice", "#F00", 10, 20, DateTime.UtcNow));
        await service.UpsertCursorAsync(boardId, new BoardCursorPresence("new-conn", userId, "Alice", "#F00", 30, 40, DateTime.UtcNow));

        await service.RemoveCursorsForUserAsync(boardId, userId, "new-conn");

        IReadOnlyList<BoardCursorPresence>? snapshot = null;
        service.Subscribe(boardId, "sub1", s => { snapshot = s; return Task.CompletedTask; });
        await Task.Delay(50);

        Assert.NotNull(snapshot);
        Assert.Single(snapshot);
        Assert.Equal("new-conn", snapshot[0].ClientId);
    }

    [Fact]
    public async Task RemoveCursorsForUser_DoesNotAffectOtherUsers()
    {
        var service = new BoardPresenceService();
        var boardId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();

        await service.UpsertCursorAsync(boardId, new BoardCursorPresence("old-conn", userId, "Alice", "#F00", 0, 0, DateTime.UtcNow));
        await service.UpsertCursorAsync(boardId, new BoardCursorPresence("new-conn", userId, "Alice", "#F00", 0, 0, DateTime.UtcNow));
        await service.UpsertCursorAsync(boardId, new BoardCursorPresence("bob-conn", otherUserId, "Bob", "#00F", 0, 0, DateTime.UtcNow));

        await service.RemoveCursorsForUserAsync(boardId, userId, "new-conn");

        IReadOnlyList<BoardCursorPresence>? snapshot = null;
        service.Subscribe(boardId, "sub1", s => { snapshot = s; return Task.CompletedTask; });
        await Task.Delay(50);

        Assert.NotNull(snapshot);
        Assert.Equal(2, snapshot.Count);
        Assert.Contains(snapshot, p => p.ClientId == "new-conn");
        Assert.Contains(snapshot, p => p.ClientId == "bob-conn");
    }

    [Fact]
    public async Task RemoveCursorsForUser_NoOp_WhenUserHasNoStaleConnections()
    {
        var service = new BoardPresenceService();
        var boardId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        await service.UpsertCursorAsync(boardId, new BoardCursorPresence("only-conn", userId, "Alice", "#F00", 0, 0, DateTime.UtcNow));

        await service.RemoveCursorsForUserAsync(boardId, userId, "only-conn");

        IReadOnlyList<BoardCursorPresence>? snapshot = null;
        service.Subscribe(boardId, "sub1", s => { snapshot = s; return Task.CompletedTask; });
        await Task.Delay(50);

        Assert.NotNull(snapshot);
        Assert.Single(snapshot);
        Assert.Equal("only-conn", snapshot[0].ClientId);
    }
}
