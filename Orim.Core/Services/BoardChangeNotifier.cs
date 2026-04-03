using System.Collections.Concurrent;
using Orim.Core.Interfaces;

namespace Orim.Core.Services;

public enum BoardChangeKind
{
    Content,
    Presentation,
    Metadata
}

public sealed record BoardChangeNotification(Guid BoardId, string? SourceClientId, DateTime ChangedAtUtc, BoardChangeKind Kind);

public sealed class BoardChangeNotifier : IBoardChangeNotifier
{
    private readonly ConcurrentDictionary<Guid, ConcurrentDictionary<string, Func<BoardChangeNotification, Task>>> _subscriptions = new();

    public IDisposable Subscribe(Guid boardId, string subscriberId, Func<BoardChangeNotification, Task> handler)
    {
        if (boardId == Guid.Empty) throw new ArgumentException("boardId must not be empty.", nameof(boardId));
        ArgumentException.ThrowIfNullOrWhiteSpace(subscriberId);
        ArgumentNullException.ThrowIfNull(handler);

        var boardSubscriptions = _subscriptions.GetOrAdd(boardId, static _ => new());
        boardSubscriptions[subscriberId] = handler;
        return new Subscription(this, boardId, subscriberId);
    }

    public Task NotifyBoardChangedAsync(Guid boardId, string? sourceClientId = null, BoardChangeKind kind = BoardChangeKind.Content)
    {
        if (boardId == Guid.Empty) throw new ArgumentException("boardId must not be empty.", nameof(boardId));

        if (!_subscriptions.TryGetValue(boardId, out var boardSubscriptions) || boardSubscriptions.Count == 0)
        {
            return Task.CompletedTask;
        }

        var notification = new BoardChangeNotification(boardId, sourceClientId, DateTime.UtcNow, kind);
        var handlers = boardSubscriptions.Values.ToArray();
        return Task.WhenAll(handlers.Select(handler => InvokeHandlerSafelyAsync(handler, notification)));
    }

    private void Unsubscribe(Guid boardId, string subscriberId)
    {
        if (!_subscriptions.TryGetValue(boardId, out var boardSubscriptions))
        {
            return;
        }

        boardSubscriptions.TryRemove(subscriberId, out _);
        if (boardSubscriptions.IsEmpty)
        {
            _subscriptions.TryRemove(boardId, out _);
        }
    }

    private static async Task InvokeHandlerSafelyAsync(Func<BoardChangeNotification, Task> handler, BoardChangeNotification notification)
    {
        try
        {
            await handler(notification);
        }
        catch
        {
            // Ignore subscriber failures so one broken circuit does not block other viewers.
        }
    }

    private sealed class Subscription(BoardChangeNotifier notifier, Guid boardId, string subscriberId) : IDisposable
    {
        private int _disposed;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposed, 1) != 0)
            {
                return;
            }

            notifier.Unsubscribe(boardId, subscriberId);
        }
    }
}