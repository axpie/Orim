using Orim.Core.Interfaces;
using Orim.Core.Models;

namespace Orim.Core.Services;

public class BoardService
{
    private readonly IBoardRepository _boardRepository;
    private readonly IBoardStateNotifier _notifier;

    public BoardService(IBoardRepository boardRepository, IBoardStateNotifier notifier)
    {
        _boardRepository = boardRepository;
        _notifier = notifier;
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

    public Task<List<Board>> GetBoardsForUserAsync(Guid userId) => _boardRepository.GetBoardsForUserAsync(userId);

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
        await _notifier.NotifyBoardUpdated(board.Id);
    }

    public async Task DeleteBoardAsync(Guid boardId)
    {
        await _boardRepository.DeleteAsync(boardId);
    }

    public async Task<string> GenerateShareLinkAsync(Guid boardId)
    {
        var board = await _boardRepository.GetByIdAsync(boardId)
                    ?? throw new InvalidOperationException("Board not found.");
        board.ShareLinkToken = Guid.NewGuid().ToString();
        board.Visibility = BoardVisibility.Shared;
        board.UpdatedAt = DateTime.UtcNow;
        await _boardRepository.SaveAsync(board);
        return board.ShareLinkToken;
    }

    public async Task AddMemberAsync(Guid boardId, Guid userId, string username, BoardRole role)
    {
        var board = await _boardRepository.GetByIdAsync(boardId)
                    ?? throw new InvalidOperationException("Board not found.");

        if (board.Members.Any(m => m.UserId == userId))
            throw new InvalidOperationException("User is already a member.");

        board.Members.Add(new BoardMember { UserId = userId, Username = username, Role = role });
        board.UpdatedAt = DateTime.UtcNow;
        await _boardRepository.SaveAsync(board);
    }

    public async Task RemoveMemberAsync(Guid boardId, Guid userId)
    {
        var board = await _boardRepository.GetByIdAsync(boardId)
                    ?? throw new InvalidOperationException("Board not found.");
        board.Members.RemoveAll(m => m.UserId == userId && m.Role != BoardRole.Owner);
        board.UpdatedAt = DateTime.UtcNow;
        await _boardRepository.SaveAsync(board);
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

    // Element operations
    public async Task AddElementAsync(Guid boardId, BoardElement element)
    {
        var board = await _boardRepository.GetByIdAsync(boardId)
                    ?? throw new InvalidOperationException("Board not found.");
        board.Elements.Add(element);
        board.UpdatedAt = DateTime.UtcNow;
        await _boardRepository.SaveAsync(board);
        await _notifier.NotifyElementAdded(boardId, element);
    }

    public async Task UpdateElementAsync(Guid boardId, BoardElement element)
    {
        var board = await _boardRepository.GetByIdAsync(boardId)
                    ?? throw new InvalidOperationException("Board not found.");
        var idx = board.Elements.FindIndex(e => e.Id == element.Id);
        if (idx >= 0)
        {
            board.Elements[idx] = element;
            board.UpdatedAt = DateTime.UtcNow;
            await _boardRepository.SaveAsync(board);
            await _notifier.NotifyElementUpdated(boardId, element);
        }
    }

    public async Task RemoveElementAsync(Guid boardId, Guid elementId)
    {
        var board = await _boardRepository.GetByIdAsync(boardId)
                    ?? throw new InvalidOperationException("Board not found.");
        board.Elements.RemoveAll(e => e.Id == elementId);
        // Also remove arrows connected to deleted element
        board.Elements.RemoveAll(e => e is ArrowElement arrow &&
            (arrow.SourceElementId == elementId || arrow.TargetElementId == elementId));
        board.UpdatedAt = DateTime.UtcNow;
        await _boardRepository.SaveAsync(board);
        await _notifier.NotifyElementRemoved(boardId, elementId);
    }

    public async Task UpdateElementsAsync(Guid boardId, List<BoardElement> elements)
    {
        var board = await _boardRepository.GetByIdAsync(boardId)
                    ?? throw new InvalidOperationException("Board not found.");
        board.Elements = elements;
        board.UpdatedAt = DateTime.UtcNow;
        await _boardRepository.SaveAsync(board);
        await _notifier.NotifyBoardUpdated(boardId);
    }
}
