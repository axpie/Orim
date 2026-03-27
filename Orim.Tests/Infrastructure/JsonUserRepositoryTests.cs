using Orim.Core.Models;
using Orim.Infrastructure.Repositories;

namespace Orim.Tests.Infrastructure;

public class JsonUserRepositoryTests : IDisposable
{
    private readonly string _tempDir;
    private readonly JsonUserRepository _sut;

    public JsonUserRepositoryTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), $"orim-tests-{Guid.NewGuid()}");
        _sut = new JsonUserRepository(_tempDir);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
            Directory.Delete(_tempDir, recursive: true);
    }

    [Fact]
    public void Constructor_CreatesDirectoryAndFile()
    {
        Assert.True(Directory.Exists(_tempDir));
        Assert.True(File.Exists(Path.Combine(_tempDir, "users.json")));
    }

    [Fact]
    public async Task GetAllAsync_EmptyFile_ReturnsEmptyList()
    {
        var users = await _sut.GetAllAsync();

        Assert.Empty(users);
    }

    [Fact]
    public async Task SaveAsync_NewUser_CanBeRetrieved()
    {
        var user = new User { Username = "alice", PasswordHash = "hash123" };

        await _sut.SaveAsync(user);
        var retrieved = await _sut.GetByIdAsync(user.Id);

        Assert.NotNull(retrieved);
        Assert.Equal("alice", retrieved.Username);
    }

    [Fact]
    public async Task SaveAsync_ExistingUser_Updates()
    {
        var user = new User { Username = "alice" };
        await _sut.SaveAsync(user);

        user.Username = "alice-updated";
        await _sut.SaveAsync(user);

        var all = await _sut.GetAllAsync();
        Assert.Single(all);
        Assert.Equal("alice-updated", all[0].Username);
    }

    [Fact]
    public async Task GetByUsernameAsync_CaseInsensitive()
    {
        var user = new User { Username = "Alice" };
        await _sut.SaveAsync(user);

        var result = await _sut.GetByUsernameAsync("alice");

        Assert.NotNull(result);
        Assert.Equal("Alice", result.Username);
    }

    [Fact]
    public async Task GetByUsernameAsync_NotFound_ReturnsNull()
    {
        var result = await _sut.GetByUsernameAsync("nobody");

        Assert.Null(result);
    }

    [Fact]
    public async Task GetByIdAsync_NotFound_ReturnsNull()
    {
        var result = await _sut.GetByIdAsync(Guid.NewGuid());

        Assert.Null(result);
    }

    [Fact]
    public async Task DeleteAsync_RemovesUser()
    {
        var user = new User { Username = "alice" };
        await _sut.SaveAsync(user);

        await _sut.DeleteAsync(user.Id);

        var result = await _sut.GetByIdAsync(user.Id);
        Assert.Null(result);
    }

    [Fact]
    public async Task DeleteAsync_NonExistent_DoesNotThrow()
    {
        await _sut.DeleteAsync(Guid.NewGuid());
    }

    [Fact]
    public async Task MultipleUsers_AllPersisted()
    {
        await _sut.SaveAsync(new User { Username = "alice" });
        await _sut.SaveAsync(new User { Username = "bob" });
        await _sut.SaveAsync(new User { Username = "charlie" });

        var users = await _sut.GetAllAsync();

        Assert.Equal(3, users.Count);
    }

    [Fact]
    public async Task CustomFileName_Works()
    {
        var repo = new JsonUserRepository(_tempDir, "custom_users.json");

        await repo.SaveAsync(new User { Username = "test" });
        var all = await repo.GetAllAsync();

        Assert.Single(all);
        Assert.True(File.Exists(Path.Combine(_tempDir, "custom_users.json")));
    }

    [Fact]
    public async Task ConcurrentSaves_AllSucceed()
    {
        var tasks = Enumerable.Range(0, 10)
            .Select(i => _sut.SaveAsync(new User { Username = $"user-{i}" }));

        await Task.WhenAll(tasks);

        var users = await _sut.GetAllAsync();
        Assert.Equal(10, users.Count);
    }
}
