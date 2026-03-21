using System.Text.Json;
using System.Text.Json.Serialization;
using Orim.Core.Interfaces;
using Orim.Core.Models;

namespace Orim.Infrastructure.Repositories;

public class JsonUserRepository : IUserRepository
{
    private readonly string _filePath;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter() }
    };

    public JsonUserRepository(string dataPath, string fileName = "users.json")
    {
        _filePath = Path.Combine(dataPath, fileName);
        Directory.CreateDirectory(dataPath);
        if (!File.Exists(_filePath))
            File.WriteAllText(_filePath, "[]");
    }

    private async Task<List<User>> ReadAllAsync()
    {
        var json = await File.ReadAllTextAsync(_filePath);
        return JsonSerializer.Deserialize<List<User>>(json, JsonOptions) ?? [];
    }

    private async Task WriteAllAsync(List<User> users)
    {
        var json = JsonSerializer.Serialize(users, JsonOptions);
        await File.WriteAllTextAsync(_filePath, json);
    }

    public async Task<List<User>> GetAllAsync()
    {
        await _lock.WaitAsync();
        try { return await ReadAllAsync(); }
        finally { _lock.Release(); }
    }

    public async Task<User?> GetByIdAsync(Guid id)
    {
        var users = await GetAllAsync();
        return users.FirstOrDefault(u => u.Id == id);
    }

    public async Task<User?> GetByUsernameAsync(string username)
    {
        var users = await GetAllAsync();
        return users.FirstOrDefault(u =>
            string.Equals(u.Username, username, StringComparison.OrdinalIgnoreCase));
    }

    public async Task SaveAsync(User entity)
    {
        await _lock.WaitAsync();
        try
        {
            var users = await ReadAllAsync();
            var idx = users.FindIndex(u => u.Id == entity.Id);
            if (idx >= 0)
                users[idx] = entity;
            else
                users.Add(entity);
            await WriteAllAsync(users);
        }
        finally { _lock.Release(); }
    }

    public async Task DeleteAsync(Guid id)
    {
        await _lock.WaitAsync();
        try
        {
            var users = await ReadAllAsync();
            users.RemoveAll(u => u.Id == id);
            await WriteAllAsync(users);
        }
        finally { _lock.Release(); }
    }
}
