using System.Security.Cryptography;
using System.Text.Json;
using Orim.Core.Interfaces;
using Orim.Core.Models;

namespace Orim.Core.Services;

public class BoardService
{
    private const int MaxBoardTitleLength = 200;
    private const int MaxSnapshots = 30;
    private const int SharePasswordIterations = 100_000;
    private const int SharePasswordSaltSize = 16;
    private const int SharePasswordKeySize = 32;
    private readonly IBoardRepository _boardRepository;
    private readonly IBoardOperationRepository _boardOperationRepository;
    private readonly IBoardChangeNotifier _boardChangeNotifier;

    public BoardService(IBoardRepository boardRepository, IBoardOperationRepository boardOperationRepository, IBoardChangeNotifier boardChangeNotifier)
    {
        _boardRepository = boardRepository;
        _boardOperationRepository = boardOperationRepository;
        _boardChangeNotifier = boardChangeNotifier;
    }

    public IReadOnlyList<BoardTemplateDefinition> GetTemplates() => BoardTemplateCatalog.Definitions;

    public async Task<Board> CreateBoardAsync(string title, Guid ownerId, string ownerUsername, string? templateId = null, string? themeKey = null)
    {
        if (!BoardTemplateCatalog.IsKnownTemplate(templateId))
            throw new InvalidOperationException($"Unknown board template '{templateId}'.");

        var board = new Board
        {
            Title = NormalizeBoardTitle(title),
            OwnerId = ownerId,
            ThemeKey = themeKey,
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

        var board = new Board
        {
            Title = NormalizeBoardTitle(title),
            OwnerId = ownerId,
            LabelOutlineEnabled = importedBoard.LabelOutlineEnabled,
            ArrowOutlineEnabled = importedBoard.ArrowOutlineEnabled,
            EnabledIconGroups = Board.NormalizeEnabledIconGroups(importedBoard.EnabledIconGroups),
            CustomColors = importedBoard.CustomColors.Distinct(StringComparer.OrdinalIgnoreCase).ToList(),
            RecentColors = importedBoard.RecentColors.Distinct(StringComparer.OrdinalIgnoreCase).ToList(),
            StickyNotePresets = CloneStickyNotePresets(importedBoard.StickyNotePresets),
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

    public bool IsSharePasswordProtected(Board board)
    {
        ArgumentNullException.ThrowIfNull(board);
        return !string.IsNullOrWhiteSpace(board.SharePasswordHash);
    }

    public void SetSharePassword(Board board, string password)
    {
        ArgumentNullException.ThrowIfNull(board);
        ArgumentException.ThrowIfNullOrWhiteSpace(password);

        var salt = RandomNumberGenerator.GetBytes(SharePasswordSaltSize);
        var derivedKey = Rfc2898DeriveBytes.Pbkdf2(
            password.Trim(),
            salt,
            SharePasswordIterations,
            HashAlgorithmName.SHA256,
            SharePasswordKeySize);

        board.SharePasswordHash = string.Join('.',
            SharePasswordIterations.ToString(),
            Convert.ToBase64String(salt),
            Convert.ToBase64String(derivedKey));
    }

    public void ClearSharePassword(Board board)
    {
        ArgumentNullException.ThrowIfNull(board);
        board.SharePasswordHash = null;
    }

    public bool ValidateSharePassword(Board board, string? password)
    {
        ArgumentNullException.ThrowIfNull(board);

        if (!IsSharePasswordProtected(board))
            return true;

        if (string.IsNullOrWhiteSpace(password))
            return false;

        var parts = board.SharePasswordHash!.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length != 3 || !int.TryParse(parts[0], out var iterations))
            return false;

        try
        {
            var salt = Convert.FromBase64String(parts[1]);
            var expectedKey = Convert.FromBase64String(parts[2]);
            var actualKey = Rfc2898DeriveBytes.Pbkdf2(
                password.Trim(),
                salt,
                iterations,
                HashAlgorithmName.SHA256,
                expectedKey.Length);

            return CryptographicOperations.FixedTimeEquals(actualKey, expectedKey);
        }
        catch (FormatException)
        {
            return false;
        }
    }

    public bool HasSharedLinkAccess(Board board, string? password, BoardRole minimumRole = BoardRole.Viewer)
    {
        ArgumentNullException.ThrowIfNull(board);

        if (board.Visibility != BoardVisibility.Public)
            return false;

        if (!ValidateSharePassword(board, password))
            return false;

        return minimumRole switch
        {
            BoardRole.Viewer => true,
            BoardRole.Editor => board.SharedAllowAnonymousEditing,
            _ => false
        };
    }

    public async Task<List<BoardSummary>> GetAccessibleBoardSummariesAsync(Guid userId)
    {
        var summaries = await _boardRepository.GetBoardSummariesAsync();
        return summaries.Where(b =>
            b.OwnerId == userId ||
            b.Visibility == BoardVisibility.Public ||
            b.Members.Any(m => m.UserId == userId)
        ).ToList();
    }

    public async Task UpdateBoardAsync(Board board, string? sourceClientId = null, BoardChangeKind kind = BoardChangeKind.Content)
    {
        PrepareBoardForPersistence(board);
        await _boardRepository.SaveAsync(board);
        await _boardChangeNotifier.NotifyBoardChangedAsync(board.Id, sourceClientId, kind);
    }

    public async Task SaveEditorStateAsync(Board board, string? sourceClientId = null, BoardChangeKind kind = BoardChangeKind.Content, bool notifyChange = false)
    {
        PrepareBoardForPersistence(board);
        await _boardRepository.SaveEditorStateAsync(board);
        if (notifyChange)
        {
            await _boardChangeNotifier.NotifyBoardChangedAsync(board.Id, sourceClientId, kind);
        }
    }

    public void SetBoardTitle(Board board, string title)
    {
        ArgumentNullException.ThrowIfNull(board);
        board.Title = NormalizeBoardTitle(title);
    }

    public async Task DeleteBoardAsync(Guid boardId)
    {
        await _boardOperationRepository.DeleteBoardOperationsAsync(boardId);
        await _boardRepository.DeleteAsync(boardId);
        await _boardChangeNotifier.NotifyBoardChangedAsync(boardId);
    }

    public string GenerateShareLinkToken() =>
        Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();

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
        board.ArrowOutlineEnabled = content.ArrowOutlineEnabled;
        board.EnabledIconGroups = Board.NormalizeEnabledIconGroups(content.EnabledIconGroups);
        board.CustomColors = content.CustomColors.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        board.RecentColors = content.RecentColors.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        board.StickyNotePresets = CloneStickyNotePresets(content.StickyNotePresets);
        board.Elements = CloneElements(content.Elements);
        NormalizeZIndexes(board.Elements);
    }

    public void ReplaceBoardContent(Board targetBoard, Board importedBoard)
    {
        ArgumentNullException.ThrowIfNull(targetBoard);
        ArgumentNullException.ThrowIfNull(importedBoard);

        targetBoard.LabelOutlineEnabled = importedBoard.LabelOutlineEnabled;
        targetBoard.ArrowOutlineEnabled = importedBoard.ArrowOutlineEnabled;
        targetBoard.SurfaceColor = importedBoard.SurfaceColor;
        targetBoard.ThemeKey = importedBoard.ThemeKey;
        targetBoard.EnabledIconGroups = Board.NormalizeEnabledIconGroups(importedBoard.EnabledIconGroups);
        targetBoard.CustomColors = importedBoard.CustomColors.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        targetBoard.RecentColors = importedBoard.RecentColors.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        targetBoard.StickyNotePresets = CloneStickyNotePresets(importedBoard.StickyNotePresets);
        targetBoard.Elements = CloneElements(importedBoard.Elements);
        NormalizeZIndexes(targetBoard.Elements);
    }

    public bool HasAccess(Board board, Guid? userId, BoardRole minimumRole = BoardRole.Viewer)
    {
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
        ArrowOutlineEnabled = board.ArrowOutlineEnabled,
        EnabledIconGroups = Board.NormalizeEnabledIconGroups(board.EnabledIconGroups),
        CustomColors = board.CustomColors.ToList(),
        RecentColors = board.RecentColors.ToList(),
        StickyNotePresets = CloneStickyNotePresets(board.StickyNotePresets),
        Elements = CloneElements(board.Elements)
    };

    private static List<StickyNotePreset> CloneStickyNotePresets(IEnumerable<StickyNotePreset>? presets)
    {
        if (presets is null)
        {
            return [];
        }

        return presets
            .Select((preset, index) => new StickyNotePreset
            {
                Id = string.IsNullOrWhiteSpace(preset.Id)
                    ? $"sticky-preset-{index + 1}"
                    : preset.Id.Trim(),
                Label = preset.Label?.Trim() ?? string.Empty,
                FillColor = string.IsNullOrWhiteSpace(preset.FillColor)
                    ? "#FDE68A"
                    : preset.FillColor.Trim()
            })
            .DistinctBy(preset => preset.Id, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string NormalizeBoardTitle(string title, string paramName = "title")
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(title, paramName);

        var normalizedTitle = title.Trim();
        if (normalizedTitle.Length > MaxBoardTitleLength)
            throw new ArgumentException($"Board title must not exceed {MaxBoardTitleLength} characters.", paramName);

        return normalizedTitle;
    }

    private static List<BoardElement> CloneElements(IEnumerable<BoardElement> elements)
    {
        var json = JsonSerializer.Serialize(elements, OrimJsonOptions.Default);
        return JsonSerializer.Deserialize<List<BoardElement>>(json, OrimJsonOptions.Default) ?? [];
    }

    private static void NormalizeZIndexes(List<BoardElement> elements)
    {
        elements.Sort((a, b) => a.ZIndex.CompareTo(b.ZIndex));
        for (var index = 0; index < elements.Count; index++)
        {
            elements[index].ZIndex = index;
        }
    }

    private static void PrepareBoardForPersistence(Board board)
    {
        EnsureOwnerMembership(board);
        board.EnabledIconGroups = Board.NormalizeEnabledIconGroups(board.EnabledIconGroups);
        board.UpdatedAt = DateTime.UtcNow;
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
