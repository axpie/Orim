using System.Security.Cryptography;
using System.Text.Json;
using Orim.Core.Interfaces;
using Orim.Core.Models;

namespace Orim.Core.Services;

public class BoardService
{
    private const int MaxSnapshots = 30;
    private readonly IBoardRepository _boardRepository;

    public BoardService(IBoardRepository boardRepository)
    {
        _boardRepository = boardRepository;
    }

    public IReadOnlyList<BoardTemplateDefinition> GetTemplates() => BoardTemplateCatalog.Definitions;

    public async Task<Board> CreateBoardAsync(string title, Guid ownerId, string ownerUsername, string? templateId = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(title);

        if (title.Length > 200)
            throw new ArgumentException("Board title must not exceed 200 characters.", nameof(title));

        if (!BoardTemplateCatalog.IsKnownTemplate(templateId))
            throw new InvalidOperationException($"Unknown board template '{templateId}'.");

        var board = new Board
        {
            Title = title.Trim(),
            OwnerId = ownerId,
            Elements = CloneElements(BoardTemplateCatalog.CreateElements(templateId)),
            Members =
            [
                new BoardMember { UserId = ownerId, Username = ownerUsername, Role = BoardRole.Owner }
            ]
        };
        await _boardRepository.SaveAsync(board);
        return board;
    }

    public async Task<Board> CreateBoardFromImportAsync(Board importedBoard, string title, Guid ownerId, string ownerUsername)
    {
        ArgumentNullException.ThrowIfNull(importedBoard);
        ArgumentException.ThrowIfNullOrWhiteSpace(title);

        var board = new Board
        {
            Title = title.Trim(),
            OwnerId = ownerId,
            LabelOutlineEnabled = importedBoard.LabelOutlineEnabled,
            CustomColors = importedBoard.CustomColors.Distinct(StringComparer.OrdinalIgnoreCase).ToList(),
            RecentColors = importedBoard.RecentColors.Distinct(StringComparer.OrdinalIgnoreCase).ToList(),
            Elements = CloneElements(importedBoard.Elements),
            Members =
            [
                new BoardMember { UserId = ownerId, Username = ownerUsername, Role = BoardRole.Owner }
            ]
        };

        NormalizeZIndexes(board.Elements);
        await _boardRepository.SaveAsync(board);
        return board;
    }

    public Task<Board?> GetBoardAsync(Guid boardId) => _boardRepository.GetByIdAsync(boardId);

    public Task<Board?> GetBoardByShareTokenAsync(string token) => _boardRepository.GetByShareTokenAsync(token);

    public async Task<List<BoardSummary>> GetAccessibleBoardSummariesAsync(Guid userId)
    {
        var summaries = await _boardRepository.GetBoardSummariesAsync();
        return summaries.Where(b =>
            b.OwnerId == userId ||
            b.Visibility == BoardVisibility.Public ||
            b.Members.Any(m => m.UserId == userId)
        ).ToList();
    }

    public async Task UpdateBoardAsync(Board board)
    {
        EnsureOwnerMembership(board);
        board.UpdatedAt = DateTime.UtcNow;
        await _boardRepository.SaveAsync(board);
    }

    public async Task DeleteBoardAsync(Guid boardId)
    {
        await _boardRepository.DeleteAsync(boardId);
    }

    public string GenerateShareLinkToken() =>
        Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant();

    public void AddMember(Board board, User user, BoardRole role)
    {
        ArgumentNullException.ThrowIfNull(board);
        ArgumentNullException.ThrowIfNull(user);

        if (!user.IsActive)
            throw new InvalidOperationException("Only active users can be added to boards.");

        if (user.Id == board.OwnerId)
            return;

        var existingMember = board.Members.FirstOrDefault(member => member.UserId == user.Id);
        if (existingMember is not null)
        {
            existingMember.Role = role;
            existingMember.Username = user.Username;
            return;
        }

        board.Members.Add(new BoardMember
        {
            UserId = user.Id,
            Username = user.Username,
            Role = role
        });
    }

    public void RemoveMember(Board board, Guid userId)
    {
        ArgumentNullException.ThrowIfNull(board);

        if (userId == board.OwnerId)
            throw new InvalidOperationException("The board owner cannot be removed.");

        board.Members.RemoveAll(member => member.UserId == userId);
    }

    public void UpdateMemberRole(Board board, Guid userId, BoardRole role)
    {
        ArgumentNullException.ThrowIfNull(board);

        if (userId == board.OwnerId)
            throw new InvalidOperationException("The board owner role cannot be changed.");

        var member = board.Members.FirstOrDefault(candidate => candidate.UserId == userId)
            ?? throw new InvalidOperationException("Board member not found.");

        member.Role = role;
    }

    public BoardSnapshot CreateSnapshot(Board board, string? name, Guid userId, string username)
    {
        ArgumentNullException.ThrowIfNull(board);
        ArgumentException.ThrowIfNullOrWhiteSpace(username);

        var snapshot = new BoardSnapshot
        {
            Name = string.IsNullOrWhiteSpace(name)
                ? $"Snapshot {DateTime.UtcNow:yyyy-MM-dd HH:mm}"
                : name.Trim(),
            CreatedByUserId = userId,
            CreatedByUsername = username.Trim(),
            ContentJson = JsonSerializer.Serialize(CaptureSnapshotContent(board), OrimJsonOptions.Default)
        };

        board.Snapshots.Insert(0, snapshot);
        if (board.Snapshots.Count > MaxSnapshots)
        {
            board.Snapshots = board.Snapshots.Take(MaxSnapshots).ToList();
        }

        return snapshot;
    }

    public void RestoreSnapshot(Board board, Guid snapshotId)
    {
        ArgumentNullException.ThrowIfNull(board);

        var snapshot = board.Snapshots.FirstOrDefault(candidate => candidate.Id == snapshotId)
            ?? throw new InvalidOperationException("Snapshot not found.");

        var content = JsonSerializer.Deserialize<BoardSnapshotContent>(snapshot.ContentJson, OrimJsonOptions.Default)
            ?? throw new InvalidOperationException("Snapshot content is invalid.");

        board.Title = content.Title;
        board.LabelOutlineEnabled = content.LabelOutlineEnabled;
        board.CustomColors = content.CustomColors.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        board.RecentColors = content.RecentColors.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        board.Elements = CloneElements(content.Elements);
        NormalizeZIndexes(board.Elements);
    }

    public void ReplaceBoardContent(Board targetBoard, Board importedBoard)
    {
        ArgumentNullException.ThrowIfNull(targetBoard);
        ArgumentNullException.ThrowIfNull(importedBoard);

        targetBoard.LabelOutlineEnabled = importedBoard.LabelOutlineEnabled;
        targetBoard.CustomColors = importedBoard.CustomColors.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        targetBoard.RecentColors = importedBoard.RecentColors.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        targetBoard.Elements = CloneElements(importedBoard.Elements);
        NormalizeZIndexes(targetBoard.Elements);
    }

    public bool HasAccess(Board board, Guid? userId, BoardRole minimumRole = BoardRole.Viewer)
    {
        // Shared visibility grants viewer-only access (share-link read mode)
        if (board.Visibility == BoardVisibility.Shared && minimumRole == BoardRole.Viewer)
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

    public bool HasAccess(BoardSummary summary, Guid? userId, BoardRole minimumRole = BoardRole.Viewer)
    {
        // Shared visibility grants viewer-only access (share-link read mode)
        if (summary.Visibility == BoardVisibility.Shared && minimumRole == BoardRole.Viewer)
            return true;

        if (userId is null)
            return false;

        if (summary.Visibility == BoardVisibility.Public && minimumRole == BoardRole.Viewer)
            return true;

        var member = summary.Members.FirstOrDefault(m => m.UserId == userId.Value);
        if (member is null)
            return false;

        return member.Role <= minimumRole;
    }

    private static BoardSnapshotContent CaptureSnapshotContent(Board board) => new()
    {
        Title = board.Title,
        LabelOutlineEnabled = board.LabelOutlineEnabled,
        CustomColors = board.CustomColors.ToList(),
        RecentColors = board.RecentColors.ToList(),
        Elements = CloneElements(board.Elements)
    };

    private static List<BoardElement> CloneElements(IEnumerable<BoardElement> elements)
    {
        var json = JsonSerializer.Serialize(elements, OrimJsonOptions.Default);
        return JsonSerializer.Deserialize<List<BoardElement>>(json, OrimJsonOptions.Default) ?? [];
    }

    private static void NormalizeZIndexes(List<BoardElement> elements)
    {
        for (var index = 0; index < elements.Count; index++)
        {
            elements[index].ZIndex = index;
        }
    }

    private static void EnsureOwnerMembership(Board board)
    {
        var ownerMembership = board.Members.FirstOrDefault(member => member.UserId == board.OwnerId);
        if (ownerMembership is null)
        {
            board.Members.Insert(0, new BoardMember
            {
                UserId = board.OwnerId,
                Username = board.Members.FirstOrDefault(member => member.Role == BoardRole.Owner)?.Username ?? "Owner",
                Role = BoardRole.Owner
            });
            return;
        }

        ownerMembership.Role = BoardRole.Owner;
    }
}
