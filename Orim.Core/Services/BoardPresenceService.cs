using System.Collections.Concurrent;
using Orim.Core.Interfaces;

namespace Orim.Core.Services;

public sealed record BoardPointerPosition(double WorldX, double WorldY);

public sealed record BoardCursorPresence(
    string ClientId,
    Guid? UserId,
    string DisplayName,
    string ColorHex,
    double? WorldX,
    double? WorldY,
    DateTime UpdatedAtUtc,
    IReadOnlyList<string>? SelectedElementIds = null);

public sealed class BoardPresenceService : IBoardPresenceService
{
    private static readonly TimeSpan PresenceExpiration = TimeSpan.FromSeconds(15);
    private static readonly TimeSpan LeaveSuppressionDuration = TimeSpan.FromMinutes(2);
    private readonly ConcurrentDictionary<Guid, ConcurrentDictionary<string, BoardCursorPresence>> _presence = new();
    private readonly ConcurrentDictionary<Guid, ConcurrentDictionary<string, Func<IReadOnlyList<BoardCursorPresence>, Task>>> _subscriptions = new();
    private readonly ConcurrentDictionary<Guid, ConcurrentDictionary<string, DateTime>> _leaveSuppressions = new();

    public IDisposable Subscribe(Guid boardId, string subscriberId, Func<IReadOnlyList<BoardCursorPresence>, Task> handler)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(subscriberId);
        ArgumentNullException.ThrowIfNull(handler);

        var boardSubscriptions = _subscriptions.GetOrAdd(boardId, static _ => new());
        boardSubscriptions[subscriberId] = handler;
        _ = InvokeHandlerSafelyAsync(handler, GetSnapshot(boardId));
        return new Subscription(this, boardId, subscriberId);
    }

    public Task UpsertCursorAsync(Guid boardId, BoardCursorPresence presence)
    {
        if (IsSuppressed(boardId, presence.ClientId))
        {
            return Task.CompletedTask;
        }

        var boardPresence = _presence.GetOrAdd(boardId, static _ => new());
        boardPresence[presence.ClientId] = presence;
        return NotifySubscribersAsync(boardId);
    }

    public Task RemoveCursorsForUserAsync(Guid boardId, Guid userId, string keepClientId)
    {
        if (!_presence.TryGetValue(boardId, out var boardPresence))
        {
            return Task.CompletedTask;
        }

        var staleClientIds = boardPresence.Values
            .Where(p => p.UserId == userId && p.ClientId != keepClientId)
            .Select(p => p.ClientId)
            .ToList();

        if (staleClientIds.Count == 0)
        {
            return Task.CompletedTask;
        }

        foreach (var staleClientId in staleClientIds)
        {
            boardPresence.TryRemove(staleClientId, out _);
        }

        if (boardPresence.IsEmpty)
        {
            _presence.TryRemove(boardId, out _);
        }

        return NotifySubscribersAsync(boardId);
    }

    public Task RemoveCursorAsync(Guid boardId, string clientId)
    {
        var suppressedClients = _leaveSuppressions.GetOrAdd(boardId, static _ => new());
        suppressedClients[clientId] = DateTime.UtcNow + LeaveSuppressionDuration;

        if (_presence.TryGetValue(boardId, out var boardPresence))
        {
            boardPresence.TryRemove(clientId, out _);
            if (boardPresence.IsEmpty)
            {
                _presence.TryRemove(boardId, out _);
            }
        }

        return NotifySubscribersAsync(boardId);
    }

    public BoardCursorPresence? GetCursor(Guid boardId, string clientId)
    {
        if (_presence.TryGetValue(boardId, out var boardPresence)
            && boardPresence.TryGetValue(clientId, out var presence))
        {
            return presence;
        }

        return null;
    }

    private IReadOnlyList<BoardCursorPresence> GetSnapshot(Guid boardId)
    {
        PruneExpiredSuppressions(boardId);

        if (!_presence.TryGetValue(boardId, out var boardPresence) || boardPresence.IsEmpty)
        {
            return [];
        }

        PruneExpiredEntries(boardId, boardPresence);

        if (boardPresence.IsEmpty)
        {
            return [];
        }

        return boardPresence.Values
            .OrderBy(cursor => cursor.DisplayName, StringComparer.CurrentCultureIgnoreCase)
            .ToList();
    }

    private Task NotifySubscribersAsync(Guid boardId)
    {
        if (!_subscriptions.TryGetValue(boardId, out var boardSubscriptions) || boardSubscriptions.IsEmpty)
        {
            return Task.CompletedTask;
        }

        var snapshot = GetSnapshot(boardId);
        var handlers = boardSubscriptions.Values.ToArray();
        return Task.WhenAll(handlers.Select(handler => InvokeHandlerSafelyAsync(handler, snapshot)));
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

    private bool IsSuppressed(Guid boardId, string clientId)
    {
        if (!_leaveSuppressions.TryGetValue(boardId, out var suppressedClients))
        {
            return false;
        }

        if (!suppressedClients.TryGetValue(clientId, out var suppressedUntil))
        {
            return false;
        }

        if (suppressedUntil < DateTime.UtcNow)
        {
            suppressedClients.TryRemove(clientId, out _);
            if (suppressedClients.IsEmpty)
            {
                _leaveSuppressions.TryRemove(boardId, out _);
            }

            return false;
        }

        return true;
    }

    private void PruneExpiredSuppressions(Guid boardId)
    {
        if (!_leaveSuppressions.TryGetValue(boardId, out var suppressedClients))
        {
            return;
        }

        var now = DateTime.UtcNow;
        foreach (var entry in suppressedClients)
        {
            if (entry.Value < now)
            {
                suppressedClients.TryRemove(entry.Key, out _);
            }
        }

        if (suppressedClients.IsEmpty)
        {
            _leaveSuppressions.TryRemove(boardId, out _);
        }
    }

    private void PruneExpiredEntries(Guid boardId, ConcurrentDictionary<string, BoardCursorPresence> boardPresence)
    {
        var threshold = DateTime.UtcNow - PresenceExpiration;
        foreach (var entry in boardPresence)
        {
            if (entry.Value.UpdatedAtUtc < threshold)
            {
                boardPresence.TryRemove(entry.Key, out _);
            }
        }

        if (boardPresence.IsEmpty)
        {
            _presence.TryRemove(boardId, out _);
        }
    }

    private static async Task InvokeHandlerSafelyAsync(Func<IReadOnlyList<BoardCursorPresence>, Task> handler, IReadOnlyList<BoardCursorPresence> snapshot)
    {
        try
        {
            await handler(snapshot);
        }
        catch
        {
            // Ignore subscriber failures so one broken circuit does not affect other users.
        }
    }

    private sealed class Subscription(BoardPresenceService service, Guid boardId, string subscriberId) : IDisposable
    {
        private int _disposed;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposed, 1) != 0)
            {
                return;
            }

            service.Unsubscribe(boardId, subscriberId);
        }
    }
}