using Orim.Core.Models;

namespace Orim.Core.Interfaces;

public interface IBoardRepository : IRepository<Board>
{
    Task<Board?> GetByShareTokenAsync(string token);
    Task<List<Board>> GetBoardsForUserAsync(Guid userId);
}
