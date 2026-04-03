using Microsoft.AspNetCore.SignalR;
using Orim.Api.Hubs;
using Orim.Core.Interfaces;
using Orim.Core.Services;

namespace Orim.Api.Services;

public sealed class SignalRBoardChangeNotifier : IBoardChangeNotifier
{
    private readonly IHubContext<BoardHub> _hubContext;
    private readonly BoardChangeNotifier _localNotifier;

    public SignalRBoardChangeNotifier(IHubContext<BoardHub> hubContext, BoardChangeNotifier localNotifier)
    {
        _hubContext = hubContext;
        _localNotifier = localNotifier;
    }

    public IDisposable Subscribe(Guid boardId, string subscriberId, Func<BoardChangeNotification, Task> handler)
    {
        return _localNotifier.Subscribe(boardId, subscriberId, handler);
    }

    public async Task NotifyBoardChangedAsync(Guid boardId, string? sourceClientId = null, BoardChangeKind kind = BoardChangeKind.Content)
    {
        var notification = new BoardChangeNotification(boardId, sourceClientId, DateTime.UtcNow, kind);
        await _localNotifier.NotifyBoardChangedAsync(boardId, sourceClientId, kind);

        var groupName = BoardHub.GetBoardGroupName(boardId);
        var clients = string.IsNullOrWhiteSpace(sourceClientId)
            ? _hubContext.Clients.Group(groupName)
            : _hubContext.Clients.GroupExcept(groupName, [sourceClientId]);

        await clients.SendAsync("BoardChanged", notification);
    }
}
