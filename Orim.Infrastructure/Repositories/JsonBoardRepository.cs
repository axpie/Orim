using System.Text.Json;
using System.Text.RegularExpressions;
using Orim.Core;
using Orim.Core.Interfaces;
using Orim.Core.Models;

namespace Orim.Infrastructure.Repositories;

public partial class JsonBoardRepository : IBoardRepository
{
    private readonly string _boardsPath;
    private readonly SemaphoreSlim _lock = new(1, 1);

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

    public async Task<List<Board>> GetAllAsync()
    {
        await _lock.WaitAsync();
        try
        {
            var boards = new List<Board>();
            foreach (var file in Directory.GetFiles(_boardsPath, "*.json"))
            {
                var json = await File.ReadAllTextAsync(file);
                var board = JsonSerializer.Deserialize<Board>(json, OrimJsonOptions.Indented);
                if (board is not null)
                    boards.Add(board);
            }
            return boards;
        }
        finally { _lock.Release(); }
    }

    public async Task<Board?> GetByIdAsync(Guid id)
    {
        await _lock.WaitAsync();
        try
        {
            var path = GetBoardFilePath(id);
            if (!File.Exists(path)) return null;
            var json = await File.ReadAllTextAsync(path);
            return JsonSerializer.Deserialize<Board>(json, OrimJsonOptions.Indented);
        }
        finally { _lock.Release(); }
    }

    public async Task SaveAsync(Board entity)
    {
        await _lock.WaitAsync();
        try
        {
            var path = GetBoardFilePath(entity.Id);
            var json = JsonSerializer.Serialize(entity, OrimJsonOptions.Indented);
            await File.WriteAllTextAsync(path, json);
        }
        finally { _lock.Release(); }
    }

    public async Task DeleteAsync(Guid id)
    {
        await _lock.WaitAsync();
        try
        {
            var path = GetBoardFilePath(id);
            if (File.Exists(path))
                File.Delete(path);
        }
        finally { _lock.Release(); }
    }

    public async Task<Board?> GetByShareTokenAsync(string token)
    {
        var boards = await GetAllAsync();
        return boards.FirstOrDefault(b => b.ShareLinkToken == token);
    }
}
