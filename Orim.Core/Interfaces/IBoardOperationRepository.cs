using Orim.Core.Models;

namespace Orim.Core.Interfaces;

public interface IBoardOperationRepository
{
    Task<long> AppendAsync(BoardOperationEntry entry);
    Task<IReadOnlyList<BoardOperationEntry>> GetOperationsSinceAsync(Guid boardId, long sinceSequenceNumber, int limit = 100);
    Task<long> GetLatestSequenceNumberAsync(Guid boardId);
    Task DeleteBoardOperationsAsync(Guid boardId);
}
