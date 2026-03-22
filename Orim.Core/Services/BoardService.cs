using Orim.Core.Interfaces;
using Orim.Core.Models;

namespace Orim.Core.Services;

public class BoardService
{
    private readonly IBoardRepository _boardRepository;

    public BoardService(IBoardRepository boardRepository)
    {
        _boardRepository = boardRepository;
    }

    public async Task<Board> CreateBoardAsync(string title, Guid ownerId, string ownerUsername)
    {
        var board = new Board
        {
            Title = title,
            OwnerId = ownerId,
            Members =
            [
                new BoardMember { UserId = ownerId, Username = ownerUsername, Role = BoardRole.Owner }
            ]
        };
        await _boardRepository.SaveAsync(board);
        return board;
    }

    public Task<Board?> GetBoardAsync(Guid boardId) => _boardRepository.GetByIdAsync(boardId);

    public Task<Board?> GetBoardByShareTokenAsync(string token) => _boardRepository.GetByShareTokenAsync(token);

    public async Task<List<Board>> GetAccessibleBoardsAsync(Guid userId)
    {
        var all = await _boardRepository.GetAllAsync();
        return all.Where(b =>
            b.OwnerId == userId ||
            b.Visibility == BoardVisibility.Public ||
            b.Members.Any(m => m.UserId == userId)
        ).ToList();
    }

    public async Task UpdateBoardAsync(Board board)
    {
        board.UpdatedAt = DateTime.UtcNow;
        await _boardRepository.SaveAsync(board);
    }

    public async Task DeleteBoardAsync(Guid boardId)
    {
        await _boardRepository.DeleteAsync(boardId);
    }

    public bool HasAccess(Board board, Guid? userId, BoardRole minimumRole = BoardRole.Viewer)
    {
        if (board.Visibility == BoardVisibility.Shared)
            return true;

        if (userId is null)
            return false;

        if (board.Visibility == BoardVisibility.Public && minimumRole == BoardRole.Viewer)
            return true;

        var member = board.Members.FirstOrDefault(m => m.UserId == userId.Value);
        if (member is null)
            return false;

        return member.Role <= minimumRole; // Owner=0 < Editor=1 < Viewer=2
    }

}
