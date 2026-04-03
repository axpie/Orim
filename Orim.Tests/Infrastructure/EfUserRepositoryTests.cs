using Orim.Core.Models;
using Orim.Infrastructure.Data;
using Orim.Infrastructure.Repositories;

namespace Orim.Tests.Infrastructure;

public class EfUserRepositoryTests : IDisposable
{
    private const string TestUsername = "alice";

    private readonly OrimDbContext _context;
    private readonly EfUserRepository _sut;

    public EfUserRepositoryTests()
    {
        _context = TestDbContextFactory.Create();
        _sut = new EfUserRepository(_context);
    }

    public void Dispose() => _context.Dispose();

    [Fact]
    public async Task GetAllAsync_Empty_ReturnsEmptyList()
    {
        var users = await _sut.GetAllAsync();

        Assert.Empty(users);
    }

    [Fact]
    public async Task SaveAsync_NewUser_CanBeRetrieved()
    {
        var user = new User { Username = TestUsername, DisplayName = "Alice Example", PasswordHash = "hash123" };

        await _sut.SaveAsync(user);
        var retrieved = await _sut.GetByIdAsync(user.Id);

        Assert.NotNull(retrieved);
        Assert.Equal(TestUsername, retrieved.Username);
        Assert.Equal("Alice Example", retrieved.DisplayName);
    }

    [Fact]
    public async Task SaveAsync_ExistingUser_Updates()
    {
        var user = new User { Username = TestUsername };
        await _sut.SaveAsync(user);

        user.Username = TestUsername + "-updated";
        await _sut.SaveAsync(user);

        var all = await _sut.GetAllAsync();
        Assert.Single(all);
        Assert.Equal(TestUsername + "-updated", all[0].Username);
    }

    [Fact]
    public async Task GetByUsernameAsync_CaseInsensitive()
    {
        // EfUserRepository uses .ToLower() for case-insensitive matching
        var user = new User { Username = "Alice" };
        await _sut.SaveAsync(user);

        var result = await _sut.GetByUsernameAsync(TestUsername);

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
    public async Task GetByEmailAsync_CaseInsensitive()
    {
        // EfUserRepository uses .ToLower() for case-insensitive matching
        var user = new User { Username = "Alice", Email = "Alice@Contoso.com" };
        await _sut.SaveAsync(user);

        var result = await _sut.GetByEmailAsync("alice@contoso.com");

        Assert.NotNull(result);
        Assert.Equal("Alice@Contoso.com", result.Email);
    }

    [Fact]
    public async Task GetByExternalIdentityAsync_ReturnsMatchingUser()
    {
        var user = new User
        {
            Username = TestUsername,
            AuthenticationProvider = AuthenticationProvider.MicrosoftEntraId,
            ExternalSubject = "OID-123"
        };
        await _sut.SaveAsync(user);

        var result = await _sut.GetByExternalIdentityAsync(AuthenticationProvider.MicrosoftEntraId, "oid-123");

        Assert.NotNull(result);
        Assert.Equal("OID-123", result.ExternalSubject);
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
        var user = new User { Username = TestUsername };
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
        await _sut.SaveAsync(new User { Username = TestUsername });
        await _sut.SaveAsync(new User { Username = "bob" });
        await _sut.SaveAsync(new User { Username = "charlie" });

        var users = await _sut.GetAllAsync();

        Assert.Equal(3, users.Count);
    }

    [Fact]
    public async Task GetByEmailAsync_NonExistentEmail_ReturnsNull()
    {
        var result = await _sut.GetByEmailAsync("nobody@example.com");

        Assert.Null(result);
    }

    [Fact]
    public async Task GetByIdAsync_EmptyGuid_ReturnsNull()
    {
        var result = await _sut.GetByIdAsync(Guid.Empty);

        Assert.Null(result);
    }
}
