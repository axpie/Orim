using Orim.Core.Models;

namespace Orim.Core.Interfaces;

public interface IBoardRepository : IRepository<Board>
{
    Task<Board?> GetByShareTokenAsync(string token);
}
