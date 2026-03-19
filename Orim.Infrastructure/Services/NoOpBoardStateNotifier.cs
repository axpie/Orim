using Orim.Core.Interfaces;
using Orim.Core.Models;

namespace Orim.Infrastructure.Services;

public class NoOpBoardStateNotifier : IBoardStateNotifier
{
    public Task NotifyElementAdded(Guid boardId, BoardElement element) => Task.CompletedTask;
    public Task NotifyElementUpdated(Guid boardId, BoardElement element) => Task.CompletedTask;
    public Task NotifyElementRemoved(Guid boardId, Guid elementId) => Task.CompletedTask;
    public Task NotifyBoardUpdated(Guid boardId) => Task.CompletedTask;
}
