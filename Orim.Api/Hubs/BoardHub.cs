using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Orim.Api.Contracts;
using Orim.Api.Services;
using Orim.Core;
using Orim.Core.Interfaces;
using Orim.Core.Models;
using Orim.Core.Services;

namespace Orim.Api.Hubs;

public sealed class BoardHub : Hub
{
    private const string JoinedBoardIdKey = "joined-board-id";
    private const string JoinedCanEditKey = "joined-can-edit";
    private const string DisplayNameKey = "display-name";
    private readonly IBoardPresenceService _presenceService;
    private readonly BoardService _boardService;
    private readonly UserService _userService;
    private readonly IBoardOperationRepository _operationRepository;
    private readonly ILogger<BoardHub> _logger;

    public BoardHub(IBoardPresenceService presenceService, BoardService boardService, UserService userService, IBoardOperationRepository operationRepository, ILogger<BoardHub> logger)
    {
        _presenceService = presenceService;
        _boardService = boardService;
        _userService = userService;
        _operationRepository = operationRepository;
        _logger = logger;
    }

    public static string GetUserGroupName(Guid userId) => $"user:{userId:D}";

    public async Task JoinBoard(Guid boardId, string? shareToken = null, string? sharePassword = null, string? requestedDisplayName = null)
    {
        var board = await AuthorizeBoardAccessAsync(boardId, shareToken, sharePassword, BoardRole.Viewer);
        if (board is null)
        {
            throw new HubException("Board access denied.");
        }

        try
        {
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
        catch (HubException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception in JoinBoard for board {BoardId}.", boardId);
            throw new HubException("An error occurred while joining the board.");
        }
    }

    public async Task UpdateDisplayName(Guid boardId, string? requestedDisplayName)
    {
        if (!IsJoinedBoard(boardId))
        {
            return;
        }

        var displayName = await ResolveDisplayNameAsync(requestedDisplayName);
        Context.Items[DisplayNameKey] = displayName;

        var existingPresence = await _presenceService.GetCursorAsync(boardId, Context.ConnectionId);
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

        try
        {
            var sequenceNumber = await PersistOperationAsync(boardId, operation);
            await PersistBoardStateAsync(boardId, [operation]);
            await BroadcastBoardOperationAsync(boardId, sequenceNumber, operation);
        }
        catch (HubException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception in ApplyBoardOperation for board {BoardId}.", boardId);
            throw new HubException("An error occurred while applying the board operation.");
        }
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

        try
        {
            var sequenceNumbers = new List<long>(operations.Count);

            foreach (var operation in operations)
            {
                ArgumentNullException.ThrowIfNull(operation);
                var sequenceNumber = await PersistOperationAsync(boardId, operation);
                sequenceNumbers.Add(sequenceNumber);
            }

            await PersistBoardStateAsync(boardId, operations);

            for (var index = 0; index < operations.Count; index++)
            {
                await BroadcastBoardOperationAsync(boardId, sequenceNumbers[index], operations[index]);
            }
        }
        catch (HubException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception in ApplyBoardOperations for board {BoardId}.", boardId);
            throw new HubException("An error occurred while applying board operations.");
        }
    }

    public async Task UpdateCursor(Guid boardId, double? worldX, double? worldY, IReadOnlyList<string>? selectedElementIds = null)
    {
        if (!IsJoinedBoard(boardId))
        {
            return;
        }

        var displayName = await ResolveDisplayNameAsync(null, preferCachedDisplayName: true);
        Context.Items[DisplayNameKey] = displayName;
        var clientId = Context.ConnectionId;
        var color = BoardPresenceIdentity.ResolveColor(clientId);

        var presence = new BoardCursorPresence(clientId, ResolveUserId(), displayName, color, worldX, worldY, DateTime.UtcNow, selectedElementIds);
        await _presenceService.UpsertCursorAsync(boardId, presence);

        var groupName = BoardGroup(boardId);
        await Clients.OthersInGroup(groupName).SendAsync("CursorUpdated", new
        {
            clientId,
            displayName,
            colorHex = color,
            worldX,
            worldY,
            selectedElementIds,
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

    private async Task<long> PersistOperationAsync(Guid boardId, BoardOperationDto operation)
    {
        var operationType = operation switch
        {
            BoardElementAddedOperationDto => "element.added",
            BoardElementUpdatedOperationDto => "element.updated",
            BoardElementDeletedOperationDto => "element.deleted",
            BoardElementsDeletedOperationDto => "elements.deleted",
            BoardMetadataUpdatedOperationDto => "board.metadata.updated",
            _ => operation.GetType().Name
        };

        var entry = new BoardOperationEntry
        {
            BoardId = boardId,
            OperationType = operationType,
            OperationPayload = JsonSerializer.Serialize(operation, OrimJsonOptions.Default),
            ClientId = Context.ConnectionId,
            UserId = ResolveUserId(),
        };
        return await _operationRepository.AppendAsync(entry);
    }

    private Task BroadcastBoardOperationAsync(Guid boardId, long sequenceNumber, BoardOperationDto operation) =>
        Clients.OthersInGroup(BoardGroup(boardId)).SendAsync("BoardOperationApplied", new BoardOperationNotification(
            boardId,
            Context.ConnectionId,
            DateTime.UtcNow,
            sequenceNumber,
            operation));

    private Task<IReadOnlyList<BoardCursorPresence>> GetPresenceSnapshot(Guid boardId)
    {
        return _presenceService.GetSnapshotAsync(boardId);
    }

    private async Task PersistBoardStateAsync(Guid boardId, IReadOnlyList<BoardOperationDto> operations)
    {
        var board = await _boardService.GetBoardAsync(boardId);
        if (board is null)
        {
            return;
        }

        BoardOperationApplicator.Apply(board, operations);
        var changeKind = operations.Any(static operation => operation is BoardMetadataUpdatedOperationDto)
            ? BoardChangeKind.Metadata
            : BoardChangeKind.Content;
        await _boardService.SaveEditorStateAsync(board, Context.ConnectionId, changeKind, notifyChange: false);
    }

    public static string GetBoardGroupName(Guid boardId) => $"board-{boardId}";

    private static string BoardGroup(Guid boardId) => GetBoardGroupName(boardId);
}
