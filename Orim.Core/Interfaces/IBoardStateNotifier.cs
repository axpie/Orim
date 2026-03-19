using Orim.Core.Models;

namespace Orim.Core.Interfaces;

/// <summary>
/// Abstraction for real-time board state change notifications.
/// Currently a no-op; will be replaced with SignalR later.
/// </summary>
public interface IBoardStateNotifier
{
    Task NotifyElementAdded(Guid boardId, BoardElement element);
    Task NotifyElementUpdated(Guid boardId, BoardElement element);
    Task NotifyElementRemoved(Guid boardId, Guid elementId);
    Task NotifyBoardUpdated(Guid boardId);
}
