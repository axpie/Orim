using Orim.Core.Services;

namespace Orim.Tests.Core.Services;

public class BoardChangeNotifierTests
{
    [Fact]
    public async Task NotifyBoardChangedAsync_NoSubscribers_DoesNotThrow()
    {
        var notifier = new BoardChangeNotifier();

        await notifier.NotifyBoardChangedAsync(Guid.NewGuid());
    }

    [Fact]
    public async Task Subscribe_ReceivesNotification()
    {
        var notifier = new BoardChangeNotifier();
        var boardId = Guid.NewGuid();
        BoardChangeNotification? received = null;

        notifier.Subscribe(boardId, "sub1", notification =>
        {
            received = notification;
            return Task.CompletedTask;
        });

        await notifier.NotifyBoardChangedAsync(boardId);

        Assert.NotNull(received);
        Assert.Equal(boardId, received.BoardId);
    }

    [Fact]
    public async Task Subscribe_MultipleSubscribers_AllReceive()
    {
        var notifier = new BoardChangeNotifier();
        var boardId = Guid.NewGuid();
        var count = 0;

        notifier.Subscribe(boardId, "sub1", _ => { Interlocked.Increment(ref count); return Task.CompletedTask; });
        notifier.Subscribe(boardId, "sub2", _ => { Interlocked.Increment(ref count); return Task.CompletedTask; });

        await notifier.NotifyBoardChangedAsync(boardId);

        Assert.Equal(2, count);
    }

    [Fact]
    public async Task Dispose_UnsubscribesHandler()
    {
        var notifier = new BoardChangeNotifier();
        var boardId = Guid.NewGuid();
        var called = false;

        var subscription = notifier.Subscribe(boardId, "sub1", _ => { called = true; return Task.CompletedTask; });
        subscription.Dispose();

        await notifier.NotifyBoardChangedAsync(boardId);

        Assert.False(called);
    }

    [Fact]
    public async Task Dispose_Idempotent()
    {
        var notifier = new BoardChangeNotifier();
        var boardId = Guid.NewGuid();

        var subscription = notifier.Subscribe(boardId, "sub1", _ => Task.CompletedTask);

        subscription.Dispose();
        subscription.Dispose(); // Should not throw
    }

    [Fact]
    public async Task Notify_DifferentBoard_DoesNotTriggerHandler()
    {
        var notifier = new BoardChangeNotifier();
        var boardId = Guid.NewGuid();
        var otherBoardId = Guid.NewGuid();
        var called = false;

        notifier.Subscribe(boardId, "sub1", _ => { called = true; return Task.CompletedTask; });

        await notifier.NotifyBoardChangedAsync(otherBoardId);

        Assert.False(called);
    }

    [Fact]
    public async Task Notify_FailingHandler_DoesNotAffectOthers()
    {
        var notifier = new BoardChangeNotifier();
        var boardId = Guid.NewGuid();
        var secondCalled = false;

        notifier.Subscribe(boardId, "sub1", _ => throw new InvalidOperationException("boom"));
        notifier.Subscribe(boardId, "sub2", _ => { secondCalled = true; return Task.CompletedTask; });

        await notifier.NotifyBoardChangedAsync(boardId);

        Assert.True(secondCalled);
    }

    [Fact]
    public async Task Notify_IncludesSourceClientId()
    {
        var notifier = new BoardChangeNotifier();
        var boardId = Guid.NewGuid();
        string? receivedSourceClientId = null;

        notifier.Subscribe(boardId, "sub1", n => { receivedSourceClientId = n.SourceClientId; return Task.CompletedTask; });

        await notifier.NotifyBoardChangedAsync(boardId, "client-42");

        Assert.Equal("client-42", receivedSourceClientId);
    }

    [Fact]
    public void Subscribe_NullSubscriberId_Throws()
    {
        var notifier = new BoardChangeNotifier();

        Assert.ThrowsAny<ArgumentException>(() => notifier.Subscribe(Guid.NewGuid(), null!, _ => Task.CompletedTask));
    }

    [Fact]
    public void Subscribe_NullHandler_Throws()
    {
        var notifier = new BoardChangeNotifier();

        Assert.Throws<ArgumentNullException>(() => notifier.Subscribe(Guid.NewGuid(), "sub1", null!));
    }
}
