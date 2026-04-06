using Orim.Core.Services;

namespace Orim.Core.Interfaces;

public interface IBoardChangeNotifier
{
    IDisposable Subscribe(Guid boardId, string subscriberId, Func<BoardChangeNotification, Task> handler);
    Task NotifyBoardChangedAsync(Guid boardId, string? sourceClientId = null, BoardChangeKind kind = BoardChangeKind.Content);
}
