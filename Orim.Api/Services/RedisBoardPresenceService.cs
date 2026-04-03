using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Orim.Core;
using Orim.Core.Interfaces;
using Orim.Core.Services;
using StackExchange.Redis;

namespace Orim.Api.Services;

public sealed class RedisBoardPresenceService : IBoardPresenceService
{
    private static readonly TimeSpan PresenceExpiration = TimeSpan.FromSeconds(15);
    private static readonly TimeSpan LeaveSuppressionDuration = TimeSpan.FromMinutes(2);

    private readonly IDatabase _database;
    private readonly ILogger<RedisBoardPresenceService> _logger;
    private readonly ConcurrentDictionary<Guid, ConcurrentDictionary<string, Func<IReadOnlyList<BoardCursorPresence>, Task>>> _subscriptions = new();

    public RedisBoardPresenceService(IConnectionMultiplexer redis, ILogger<RedisBoardPresenceService> logger)
    {
        _database = redis.GetDatabase();
        _logger = logger;
    }

    public IDisposable Subscribe(Guid boardId, string subscriberId, Func<IReadOnlyList<BoardCursorPresence>, Task> handler)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(subscriberId);
        ArgumentNullException.ThrowIfNull(handler);

        var boardSubscriptions = _subscriptions.GetOrAdd(boardId, static _ => new());
        boardSubscriptions[subscriberId] = handler;
        _ = PublishSnapshotToHandlerAsync(boardId, handler);
        return new Subscription(this, boardId, subscriberId);
    }

    public async Task UpsertCursorAsync(Guid boardId, BoardCursorPresence presence)
    {
        ArgumentNullException.ThrowIfNull(presence);

        if (await _database.KeyExistsAsync(SuppressionKey(boardId, presence.ClientId)))
        {
            return;
        }

        var batch = _database.CreateBatch();
        var addTask = batch.SetAddAsync(ClientSetKey(boardId), presence.ClientId);
        var saveTask = batch.StringSetAsync(
            CursorKey(boardId, presence.ClientId),
            JsonSerializer.Serialize(presence, OrimJsonOptions.Default),
            PresenceExpiration);
        batch.Execute();

        await Task.WhenAll(addTask, saveTask);
        await NotifySubscribersAsync(boardId);
    }

    public async Task RemoveCursorsForUserAsync(Guid boardId, Guid userId, string keepClientId)
    {
        var snapshot = await GetSnapshotAsync(boardId);
        var staleClientIds = snapshot
            .Where(presence => presence.UserId == userId && !string.Equals(presence.ClientId, keepClientId, StringComparison.Ordinal))
            .Select(presence => presence.ClientId)
            .ToList();

        if (staleClientIds.Count == 0)
        {
            return;
        }

        await RemoveCursorEntriesAsync(boardId, staleClientIds, suppressReconnect: false);
        await NotifySubscribersAsync(boardId);
    }

    public async Task RemoveCursorAsync(Guid boardId, string clientId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(clientId);

        var batch = _database.CreateBatch();
        var suppressTask = batch.StringSetAsync(SuppressionKey(boardId, clientId), "1", LeaveSuppressionDuration);
        var removeTask = batch.SetRemoveAsync(ClientSetKey(boardId), clientId);
        var deleteTask = batch.KeyDeleteAsync(CursorKey(boardId, clientId));
        batch.Execute();

        await Task.WhenAll(suppressTask, removeTask, deleteTask);
        await NotifySubscribersAsync(boardId);
    }

    public async Task<BoardCursorPresence?> GetCursorAsync(Guid boardId, string clientId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(clientId);

        var value = await _database.StringGetAsync(CursorKey(boardId, clientId));
        return DeserializePresence(value);
    }

    public async Task<IReadOnlyList<BoardCursorPresence>> GetSnapshotAsync(Guid boardId)
    {
        var clientIds = await _database.SetMembersAsync(ClientSetKey(boardId));
        if (clientIds.Length == 0)
        {
            return [];
        }

        var keys = clientIds
            .Select(clientId => (RedisKey)CursorKey(boardId, clientId!))
            .ToArray();
        var values = await _database.StringGetAsync(keys);
        var threshold = DateTime.UtcNow - PresenceExpiration;
        var snapshot = new List<BoardCursorPresence>(values.Length);
        var staleClientIds = new List<string>();

        for (var index = 0; index < values.Length; index++)
        {
            var presence = DeserializePresence(values[index]);
            if (presence is null || presence.UpdatedAtUtc < threshold)
            {
                staleClientIds.Add(clientIds[index]!);
                continue;
            }

            snapshot.Add(presence);
        }

        if (staleClientIds.Count > 0)
        {
            await RemoveCursorEntriesAsync(boardId, staleClientIds, suppressReconnect: false);
        }

        return snapshot
            .OrderBy(cursor => cursor.DisplayName, StringComparer.CurrentCultureIgnoreCase)
            .ToList();
    }

    private async Task NotifySubscribersAsync(Guid boardId)
    {
        if (!_subscriptions.TryGetValue(boardId, out var boardSubscriptions) || boardSubscriptions.IsEmpty)
        {
            return;
        }

        var snapshot = await GetSnapshotAsync(boardId);
        var handlers = boardSubscriptions.Values.ToArray();
        await Task.WhenAll(handlers.Select(handler => InvokeHandlerSafelyAsync(handler, snapshot)));
    }

    private async Task PublishSnapshotToHandlerAsync(Guid boardId, Func<IReadOnlyList<BoardCursorPresence>, Task> handler)
    {
        var snapshot = await GetSnapshotAsync(boardId);
        await InvokeHandlerSafelyAsync(handler, snapshot);
    }

    private async Task RemoveCursorEntriesAsync(Guid boardId, IReadOnlyCollection<string> clientIds, bool suppressReconnect)
    {
        if (clientIds.Count == 0)
        {
            return;
        }

        var batch = _database.CreateBatch();
        var tasks = new List<Task>(clientIds.Count * (suppressReconnect ? 3 : 2));
        foreach (var clientId in clientIds)
        {
            tasks.Add(batch.SetRemoveAsync(ClientSetKey(boardId), clientId));
            tasks.Add(batch.KeyDeleteAsync(CursorKey(boardId, clientId)));

            if (suppressReconnect)
            {
                tasks.Add(batch.StringSetAsync(SuppressionKey(boardId, clientId), "1", LeaveSuppressionDuration));
            }
        }

        batch.Execute();
        await Task.WhenAll(tasks);
    }

    private BoardCursorPresence? DeserializePresence(RedisValue value)
    {
        if (value.IsNullOrEmpty)
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<BoardCursorPresence>(value.ToString()!, OrimJsonOptions.Default);
        }
        catch (JsonException exception)
        {
            _logger.LogWarning(exception, "Failed to deserialize board cursor presence from Redis.");
            return null;
        }
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

    private static string ClientSetKey(Guid boardId) => $"orim:board:{boardId:D}:presence:clients";

    private static string CursorKey(Guid boardId, string clientId) => $"orim:board:{boardId:D}:presence:cursor:{clientId}";

    private static string SuppressionKey(Guid boardId, string clientId) => $"orim:board:{boardId:D}:presence:suppressed:{clientId}";

    private sealed class Subscription(RedisBoardPresenceService service, Guid boardId, string subscriberId) : IDisposable
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
