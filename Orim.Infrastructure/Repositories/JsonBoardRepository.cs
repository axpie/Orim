using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.RegularExpressions;
using Orim.Core;
using Orim.Core.Interfaces;
using Orim.Core.Models;

namespace Orim.Infrastructure.Repositories;

public partial class JsonBoardRepository : IBoardRepository
{
    private readonly string _boardsPath;
    private readonly ConcurrentDictionary<Guid, SemaphoreSlim> _boardLocks = new();
    private readonly ConcurrentDictionary<Guid, BoardSummary> _summaryIndex = new();
    private readonly ConcurrentDictionary<string, Guid> _tokenIndex = new();
    private readonly SemaphoreSlim _indexLock = new(1, 1);
    private bool _indexBuilt;

    [GeneratedRegex(@"^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$")]
    private static partial Regex GuidRegex();

    public JsonBoardRepository(string dataPath, string directoryName = "boards")
    {
        _boardsPath = Path.Combine(dataPath, directoryName);
        Directory.CreateDirectory(_boardsPath);
    }

    private static void ValidateBoardId(Guid id)
    {
        if (!GuidRegex().IsMatch(id.ToString()))
            throw new ArgumentException("Invalid board ID format.");
    }

    private string GetBoardFilePath(Guid id)
    {
        ValidateBoardId(id);
        return Path.Combine(_boardsPath, $"{id}.json");
    }

    private SemaphoreSlim GetBoardLock(Guid boardId) =>
        _boardLocks.GetOrAdd(boardId, _ => new SemaphoreSlim(1, 1));

    private async Task EnsureIndexBuiltAsync()
    {
        if (_indexBuilt) return;

        await _indexLock.WaitAsync();
        try
        {
            if (_indexBuilt) return;

            foreach (var file in Directory.GetFiles(_boardsPath, "*.json"))
            {
                try
                {
                    var json = await File.ReadAllTextAsync(file);
                    var board = JsonSerializer.Deserialize<Board>(json, OrimJsonOptions.Indented);
                    if (board is null) continue;

                    var summary = BoardSummary.FromBoard(board);
                    _summaryIndex[board.Id] = summary;
                    if (!string.IsNullOrEmpty(board.ShareLinkToken))
                        _tokenIndex[board.ShareLinkToken] = board.Id;
                }
                catch
                {
                    // Skip corrupted files during index build
                }
            }

            _indexBuilt = true;
        }
        finally { _indexLock.Release(); }
    }

    public async Task<List<Board>> GetAllAsync()
    {
        var boards = new List<Board>();
        foreach (var file in Directory.GetFiles(_boardsPath, "*.json"))
        {
            try
            {
                var json = await File.ReadAllTextAsync(file);
                var board = JsonSerializer.Deserialize<Board>(json, OrimJsonOptions.Indented);
                if (board is not null)
                    boards.Add(board);
            }
            catch
            {
                // Skip corrupted files
            }
        }
        return boards;
    }

    public async Task<List<BoardSummary>> GetBoardSummariesAsync()
    {
        await EnsureIndexBuiltAsync();
        return _summaryIndex.Values.ToList();
    }

    public async Task<Board?> GetByIdAsync(Guid id)
    {
        var boardLock = GetBoardLock(id);
        await boardLock.WaitAsync();
        try
        {
            var path = GetBoardFilePath(id);
            if (!File.Exists(path)) return null;
            var json = await File.ReadAllTextAsync(path);
            return JsonSerializer.Deserialize<Board>(json, OrimJsonOptions.Indented);
        }
        finally { boardLock.Release(); }
    }

    public async Task SaveAsync(Board entity)
    {
        var boardLock = GetBoardLock(entity.Id);
        await boardLock.WaitAsync();
        try
        {
            var path = GetBoardFilePath(entity.Id);
            var json = JsonSerializer.Serialize(entity, OrimJsonOptions.Indented);
            await File.WriteAllTextAsync(path, json);
        }
        finally { boardLock.Release(); }

        // Update indexes outside the board lock
        var summary = BoardSummary.FromBoard(entity);
        var oldSummary = _summaryIndex.GetValueOrDefault(entity.Id);
        _summaryIndex[entity.Id] = summary;

        // Update token index
        if (oldSummary?.ShareLinkToken is not null && oldSummary.ShareLinkToken != entity.ShareLinkToken)
            _tokenIndex.TryRemove(oldSummary.ShareLinkToken, out _);
        if (!string.IsNullOrEmpty(entity.ShareLinkToken))
            _tokenIndex[entity.ShareLinkToken] = entity.Id;
    }

    public async Task DeleteAsync(Guid id)
    {
        var boardLock = GetBoardLock(id);
        await boardLock.WaitAsync();
        try
        {
            var path = GetBoardFilePath(id);
            if (File.Exists(path))
                File.Delete(path);
        }
        finally { boardLock.Release(); }

        // Update indexes
        if (_summaryIndex.TryRemove(id, out var removed) && removed.ShareLinkToken is not null)
            _tokenIndex.TryRemove(removed.ShareLinkToken, out _);

        _boardLocks.TryRemove(id, out _);
    }

    public async Task<Board?> GetByShareTokenAsync(string token)
    {
        await EnsureIndexBuiltAsync();

        if (_tokenIndex.TryGetValue(token, out var boardId))
            return await GetByIdAsync(boardId);

        return null;
    }
}
