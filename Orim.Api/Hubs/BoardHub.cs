using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;
using Orim.Api.Contracts;
using Orim.Core.Models;
using Orim.Core.Services;

namespace Orim.Api.Hubs;

public sealed class BoardHub : Hub
{
    private const string JoinedBoardIdKey = "joined-board-id";
    private const string JoinedCanEditKey = "joined-can-edit";
    private const string DisplayNameKey = "display-name";
    private readonly BoardPresenceService _presenceService;
    private readonly BoardService _boardService;
    private readonly UserService _userService;

    public BoardHub(BoardPresenceService presenceService, BoardService boardService, UserService userService)
    {
        _presenceService = presenceService;
        _boardService = boardService;
        _userService = userService;
    }

    public static string GetUserGroupName(Guid userId) => $"user:{userId:D}";

    public async Task JoinBoard(Guid boardId, string? shareToken = null, string? sharePassword = null, string? requestedDisplayName = null)
    {
        var board = await AuthorizeBoardAccessAsync(boardId, shareToken, sharePassword, BoardRole.Viewer);
        if (board is null)
        {
            throw new HubException("Board access denied.");
        }

        var groupName = BoardGroup(boardId);
        await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
        var userId = ResolveUserId();
        if (userId.HasValue)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, GetUserGroupName(userId.Value));
        }

        Context.Items[JoinedBoardIdKey] = boardId;
        Context.Items[JoinedCanEditKey] = CanEditBoard(board, shareToken, sharePassword);

        var displayName = await ResolveDisplayNameAsync(requestedDisplayName);
        Context.Items[DisplayNameKey] = displayName;
        var clientId = Context.ConnectionId;
        var color = BoardPresenceIdentity.ResolveColor(clientId);

        // Remove stale cursors left by a previous connection of the same authenticated user
        // (e.g., after a network reconnect that assigned a new connection ID).
        if (userId.HasValue)
        {
            await _presenceService.RemoveCursorsForUserAsync(boardId, userId.Value, clientId);
        }

        var presence = new BoardCursorPresence(clientId, userId, displayName, color, null, null, DateTime.UtcNow);
        await _presenceService.UpsertCursorAsync(boardId, presence);

        var snapshot = await GetPresenceSnapshot(boardId);
        await Clients.Group(groupName).SendAsync("PresenceUpdated", snapshot);
    }

    public async Task UpdateDisplayName(Guid boardId, string? requestedDisplayName)
    {
        if (!IsJoinedBoard(boardId))
        {
            return;
        }

        var displayName = await ResolveDisplayNameAsync(requestedDisplayName);
        Context.Items[DisplayNameKey] = displayName;

        var existingPresence = _presenceService.GetCursor(boardId, Context.ConnectionId);
        var color = existingPresence?.ColorHex ?? BoardPresenceIdentity.ResolveColor(Context.ConnectionId);

        var presence = new BoardCursorPresence(
            Context.ConnectionId,
            ResolveUserId(),
            displayName,
            color,
            existingPresence?.WorldX,
            existingPresence?.WorldY,
            DateTime.UtcNow);

        await _presenceService.UpsertCursorAsync(boardId, presence);

        var snapshot = await GetPresenceSnapshot(boardId);
        await Clients.Group(BoardGroup(boardId)).SendAsync("PresenceUpdated", snapshot);
    }

    public async Task LeaveBoard(Guid boardId)
    {
        if (!IsJoinedBoard(boardId))
        {
            return;
        }

        var groupName = BoardGroup(boardId);
        await _presenceService.RemoveCursorAsync(boardId, Context.ConnectionId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);
        Context.Items.Remove(JoinedBoardIdKey);
        Context.Items.Remove(JoinedCanEditKey);

        var snapshot = await GetPresenceSnapshot(boardId);
        await Clients.Group(groupName).SendAsync("PresenceUpdated", snapshot);
    }

    public async Task BoardUpdated(Guid boardId, string? sourceClientId, string changeKind)
    {
        if (!IsJoinedBoard(boardId))
        {
            return;
        }

        if (!CanEditJoinedBoard())
        {
            return;
        }

        var groupName = BoardGroup(boardId);
        await Clients.OthersInGroup(groupName).SendAsync("BoardChanged", new
        {
            boardId,
            sourceClientId,
            changedAtUtc = DateTime.UtcNow,
            kind = changeKind
        });
    }

    public async Task SyncBoardState(Guid boardId, Board board, string changeKind)
    {
        if (!IsJoinedBoard(boardId))
        {
            return;
        }

        if (!CanEditJoinedBoard())
        {
            return;
        }

        await Clients.OthersInGroup(BoardGroup(boardId)).SendAsync("BoardStateUpdated", new
        {
            boardId,
            sourceClientId = Context.ConnectionId,
            changedAtUtc = DateTime.UtcNow,
            kind = changeKind,
            board
        });
    }

    public async Task ApplyBoardOperation(Guid boardId, BoardOperationDto operation)
    {
        if (!IsJoinedBoard(boardId))
        {
            return;
        }

        if (!CanEditJoinedBoard())
        {
            return;
        }

        ArgumentNullException.ThrowIfNull(operation);

        await BroadcastBoardOperationAsync(boardId, operation);
    }

    public async Task ApplyBoardOperations(Guid boardId, IReadOnlyList<BoardOperationDto> operations)
    {
        if (!IsJoinedBoard(boardId))
        {
            return;
        }

        if (!CanEditJoinedBoard())
        {
            return;
        }

        ArgumentNullException.ThrowIfNull(operations);

        foreach (var operation in operations)
        {
            ArgumentNullException.ThrowIfNull(operation);
            await BroadcastBoardOperationAsync(boardId, operation);
        }
    }

    public async Task UpdateCursor(Guid boardId, double? worldX, double? worldY)
    {
        if (!IsJoinedBoard(boardId))
        {
            return;
        }

        var displayName = await ResolveDisplayNameAsync(null, preferCachedDisplayName: true);
        Context.Items[DisplayNameKey] = displayName;
        var clientId = Context.ConnectionId;
        var color = BoardPresenceIdentity.ResolveColor(clientId);

        var presence = new BoardCursorPresence(clientId, ResolveUserId(), displayName, color, worldX, worldY, DateTime.UtcNow);
        await _presenceService.UpsertCursorAsync(boardId, presence);

        var groupName = BoardGroup(boardId);
        await Clients.OthersInGroup(groupName).SendAsync("CursorUpdated", new
        {
            clientId,
            displayName,
            colorHex = color,
            worldX,
            worldY,
            updatedAtUtc = DateTime.UtcNow
        });
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (TryGetJoinedBoardId(out var boardId))
        {
            var groupName = BoardGroup(boardId);
            await _presenceService.RemoveCursorAsync(boardId, Context.ConnectionId);
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);

            var snapshot = await GetPresenceSnapshot(boardId);
            await Clients.Group(groupName).SendAsync("PresenceUpdated", snapshot);
        }

        await base.OnDisconnectedAsync(exception);
    }

    private async Task<Board?> AuthorizeBoardAccessAsync(Guid boardId, string? shareToken, string? sharePassword, BoardRole minimumRole)
    {
        var board = await _boardService.GetBoardAsync(boardId);
        if (board is null)
        {
            return null;
        }

        var userId = ResolveUserId();
        if (_boardService.HasAccess(board, userId, minimumRole))
        {
            return board;
        }

        var resolvedShareToken = shareToken ?? Context.GetHttpContext()?.Request.Query["shareToken"].ToString();
        var resolvedSharePassword = sharePassword ?? Context.GetHttpContext()?.Request.Query["sharePassword"].ToString();

        if (!string.IsNullOrWhiteSpace(resolvedShareToken)
            && string.Equals(board.ShareLinkToken, resolvedShareToken, StringComparison.Ordinal)
            && _boardService.HasSharedLinkAccess(board, resolvedSharePassword, minimumRole))
        {
            return board;
        }

        return null;
    }

    private Guid? ResolveUserId()
    {
        var raw = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(raw, out var userId) ? userId : null;
    }

    private async Task<string> ResolveDisplayNameAsync(string? requestedDisplayName, bool preferCachedDisplayName = false)
    {
        if (preferCachedDisplayName
            && Context.Items.TryGetValue(DisplayNameKey, out var cachedDisplayName)
            && cachedDisplayName is string cachedPersistedDisplayName
            && !string.IsNullOrWhiteSpace(cachedPersistedDisplayName))
        {
            return cachedPersistedDisplayName;
        }

        var userId = ResolveUserId();
        if (userId.HasValue)
        {
            var user = await _userService.GetByIdAsync(userId.Value);
            if (user is not null)
            {
                var resolved = string.IsNullOrWhiteSpace(user.DisplayName)
                    ? user.Username
                    : user.DisplayName.Trim();

                if (!string.IsNullOrWhiteSpace(resolved))
                {
                    return resolved;
                }
            }
        }

        if (!string.IsNullOrWhiteSpace(requestedDisplayName))
        {
            return requestedDisplayName.Trim();
        }

        if (Context.Items.TryGetValue(DisplayNameKey, out var storedDisplayName)
            && storedDisplayName is string persistedDisplayName
            && !string.IsNullOrWhiteSpace(persistedDisplayName))
        {
            return persistedDisplayName;
        }

        var authenticatedName = Context.User?.FindFirstValue(ClaimTypes.Name);
        if (!string.IsNullOrWhiteSpace(authenticatedName))
        {
            return authenticatedName;
        }

        return "Guest";
    }

    private bool TryGetJoinedBoardId(out Guid boardId)
    {
        if (Context.Items.TryGetValue(JoinedBoardIdKey, out var rawValue) && rawValue is Guid parsed)
        {
            boardId = parsed;
            return true;
        }

        boardId = Guid.Empty;
        return false;
    }

    private bool IsJoinedBoard(Guid boardId) => TryGetJoinedBoardId(out var joinedBoardId) && joinedBoardId == boardId;

    private bool CanEditJoinedBoard() => Context.Items.TryGetValue(JoinedCanEditKey, out var rawValue) && rawValue is true;

    private bool CanEditBoard(Board board, string? shareToken, string? sharePassword)
    {
        var userId = ResolveUserId();
        if (_boardService.HasAccess(board, userId, BoardRole.Editor))
        {
            return true;
        }

        return !string.IsNullOrWhiteSpace(shareToken)
            && string.Equals(board.ShareLinkToken, shareToken, StringComparison.Ordinal)
            && _boardService.HasSharedLinkAccess(board, sharePassword, BoardRole.Editor);
    }

    private Task BroadcastBoardOperationAsync(Guid boardId, BoardOperationDto operation) =>
        Clients.OthersInGroup(BoardGroup(boardId)).SendAsync("BoardOperationApplied", new BoardOperationNotification(
            boardId,
            Context.ConnectionId,
            DateTime.UtcNow,
            operation));

    private Task<IReadOnlyList<BoardCursorPresence>> GetPresenceSnapshot(Guid boardId)
    {
        var tcs = new TaskCompletionSource<IReadOnlyList<BoardCursorPresence>>();
        var sub = _presenceService.Subscribe(boardId, $"hub-snapshot-{Guid.NewGuid()}", snapshot =>
        {
            tcs.TrySetResult(snapshot);
            return Task.CompletedTask;
        });
        sub.Dispose();

        if (!tcs.Task.IsCompleted)
            tcs.TrySetResult([]);

        return tcs.Task;
    }

    public static string GetBoardGroupName(Guid boardId) => $"board-{boardId}";

    private static string BoardGroup(Guid boardId) => GetBoardGroupName(boardId);
}
