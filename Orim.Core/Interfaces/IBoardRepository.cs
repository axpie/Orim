using Orim.Core.Models;

namespace Orim.Core.Interfaces;

public interface IBoardRepository : IRepository<Board>
{
    Task<Board?> GetByShareTokenAsync(string token);
    Task<List<BoardSummary>> GetBoardSummariesAsync();
    Task<IReadOnlyList<BoardFolder>> GetFoldersAsync(Guid ownerId);
    Task SaveFolderAsync(BoardFolder folder);
    Task DeleteFolderAsync(string folderId);
}
