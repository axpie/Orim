using Orim.Core.Services;

namespace Orim.Core.Interfaces;

public interface IBoardPresenceService
{
    IDisposable Subscribe(Guid boardId, string subscriberId, Func<IReadOnlyList<BoardCursorPresence>, Task> handler);
    Task UpsertCursorAsync(Guid boardId, BoardCursorPresence presence);
    Task RemoveCursorsForUserAsync(Guid boardId, Guid userId, string keepClientId);
    Task RemoveCursorAsync(Guid boardId, string clientId);
    Task<BoardCursorPresence?> GetCursorAsync(Guid boardId, string clientId);
    Task<IReadOnlyList<BoardCursorPresence>> GetSnapshotAsync(Guid boardId);
}
