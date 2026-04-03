using Microsoft.AspNetCore.SignalR;
using Orim.Api.Contracts;
using Orim.Api.Hubs;
using Orim.Core.Models;

namespace Orim.Api.Services;

public sealed class BoardCommentNotifier
{
    private readonly IHubContext<BoardHub> _hubContext;

    public BoardCommentNotifier(IHubContext<BoardHub> hubContext)
    {
        _hubContext = hubContext;
    }

    public Task NotifyCommentUpsertedAsync(Guid boardId, BoardComment comment)
    {
        ArgumentNullException.ThrowIfNull(comment);

        return _hubContext.Clients
            .Group(BoardHub.GetBoardGroupName(boardId))
            .SendAsync("CommentUpserted", new BoardCommentNotification(boardId, DateTime.UtcNow, comment));
    }

    public Task NotifyCommentDeletedAsync(Guid boardId, Guid commentId) =>
        _hubContext.Clients
            .Group(BoardHub.GetBoardGroupName(boardId))
            .SendAsync("CommentDeleted", new BoardCommentDeletedNotification(boardId, DateTime.UtcNow, commentId));
}
