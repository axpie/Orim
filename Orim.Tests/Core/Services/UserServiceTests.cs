using NSubstitute;
using Orim.Core.Interfaces;
using Orim.Core.Models;
using Orim.Core.Services;

namespace Orim.Tests.Core.Services;

public class UserServiceTests
{
    private readonly IUserRepository _userRepo = Substitute.For<IUserRepository>();
    private readonly UserService _sut;

    public UserServiceTests()
    {
        _sut = new UserService(_userRepo);
    }

    [Fact]
    public async Task GetAllUsersAsync_DelegatesToRepository()
    {
        var users = new List<User> { new() { Username = "alice" } };
        _userRepo.GetAllAsync().Returns(users);

        var result = await _sut.GetAllUsersAsync();

        Assert.Same(users, result);
    }

    [Fact]
    public async Task GetByIdAsync_DelegatesToRepository()
    {
        var id = Guid.NewGuid();
        var user = new User { Id = id, Username = "alice" };
        _userRepo.GetByIdAsync(id).Returns(user);

        var result = await _sut.GetByIdAsync(id);

        Assert.Same(user, result);
    }

    [Fact]
    public async Task GetByUsernameAsync_DelegatesToRepository()
    {
        _userRepo.GetByUsernameAsync("alice").Returns(new User { Username = "alice" });

        var result = await _sut.GetByUsernameAsync("alice");

        Assert.NotNull(result);
        Assert.Equal("alice", result.Username);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task CreateUserAsync_NullOrEmptyUsername_Throws(string? username)
    {
        await Assert.ThrowsAnyAsync<ArgumentException>(
            () => _sut.CreateUserAsync(username!, "password", UserRole.User));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task CreateUserAsync_NullOrEmptyPassword_Throws(string? password)
    {
        await Assert.ThrowsAnyAsync<ArgumentException>(
            () => _sut.CreateUserAsync("alice", password!, UserRole.User));
    }

    [Fact]
    public async Task CreateUserAsync_UsernameTooLong_Throws()
    {
        var longName = new string('a', 101);

        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => _sut.CreateUserAsync(longName, "password", UserRole.User));

        Assert.Contains("100 characters", ex.Message);
    }

    [Fact]
    public async Task CreateUserAsync_DuplicateUsername_Throws()
    {
        _userRepo.GetByUsernameAsync("alice").Returns(new User { Username = "alice" });

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => _sut.CreateUserAsync("alice", "password", UserRole.User));

        Assert.Contains("already exists", ex.Message);
    }

    [Fact]
    public async Task CreateUserAsync_ValidInput_CreatesUser()
    {
        _userRepo.GetByUsernameAsync("alice").Returns((User?)null);

        var user = await _sut.CreateUserAsync("alice", "password123", UserRole.Admin);

        Assert.Equal("alice", user.Username);
        Assert.Equal(UserRole.Admin, user.Role);
        Assert.NotEmpty(user.PasswordHash);
        Assert.True(BCrypt.Net.BCrypt.Verify("password123", user.PasswordHash));
        await _userRepo.Received(1).SaveAsync(Arg.Is<User>(u => u.Username == "alice"));
    }

    [Fact]
    public async Task CreateUserAsync_MaxLengthUsername_Succeeds()
    {
        var name = new string('a', 100);
        _userRepo.GetByUsernameAsync(name).Returns((User?)null);

        var user = await _sut.CreateUserAsync(name, "password", UserRole.User);

        Assert.Equal(name, user.Username);
    }

    [Fact]
    public async Task SetPasswordAsync_UserNotFound_Throws()
    {
        _userRepo.GetByIdAsync(Arg.Any<Guid>()).Returns((User?)null);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _sut.SetPasswordAsync(Guid.NewGuid(), "newpassword"));
    }

    [Fact]
    public async Task SetPasswordAsync_ValidUser_UpdatesPassword()
    {
        var user = new User { Username = "alice", PasswordHash = "old" };
        _userRepo.GetByIdAsync(user.Id).Returns(user);

        await _sut.SetPasswordAsync(user.Id, "newpassword");

        Assert.True(BCrypt.Net.BCrypt.Verify("newpassword", user.PasswordHash));
        await _userRepo.Received(1).SaveAsync(user);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  ")]
    public async Task SetPasswordAsync_EmptyPassword_Throws(string? password)
    {
        await Assert.ThrowsAnyAsync<ArgumentException>(
            () => _sut.SetPasswordAsync(Guid.NewGuid(), password!));
    }

    [Fact]
    public async Task AuthenticateAsync_ValidCredentials_ReturnsUser()
    {
        var hash = BCrypt.Net.BCrypt.HashPassword("secret", workFactor: 4);
        var user = new User { Username = "alice", PasswordHash = hash, IsActive = true };
        _userRepo.GetByUsernameAsync("alice").Returns(user);

        var result = await _sut.AuthenticateAsync("alice", "secret");

        Assert.NotNull(result);
        Assert.Equal("alice", result.Username);
    }

    [Fact]
    public async Task AuthenticateAsync_WrongPassword_ReturnsNull()
    {
        var hash = BCrypt.Net.BCrypt.HashPassword("secret", workFactor: 4);
        var user = new User { Username = "alice", PasswordHash = hash, IsActive = true };
        _userRepo.GetByUsernameAsync("alice").Returns(user);

        var result = await _sut.AuthenticateAsync("alice", "wrong");

        Assert.Null(result);
    }

    [Fact]
    public async Task AuthenticateAsync_InactiveUser_ReturnsNull()
    {
        var hash = BCrypt.Net.BCrypt.HashPassword("secret", workFactor: 4);
        var user = new User { Username = "alice", PasswordHash = hash, IsActive = false };
        _userRepo.GetByUsernameAsync("alice").Returns(user);

        var result = await _sut.AuthenticateAsync("alice", "secret");

        Assert.Null(result);
    }

    [Fact]
    public async Task AuthenticateAsync_UnknownUser_ReturnsNull()
    {
        _userRepo.GetByUsernameAsync("nobody").Returns((User?)null);

        var result = await _sut.AuthenticateAsync("nobody", "password");

        Assert.Null(result);
    }

    [Fact]
    public async Task DeactivateUserAsync_UserNotFound_Throws()
    {
        _userRepo.GetByIdAsync(Arg.Any<Guid>()).Returns((User?)null);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _sut.DeactivateUserAsync(Guid.NewGuid()));
    }

    [Fact]
    public async Task DeactivateUserAsync_ActiveUser_SetsInactive()
    {
        var user = new User { Username = "alice", IsActive = true };
        _userRepo.GetByIdAsync(user.Id).Returns(user);

        await _sut.DeactivateUserAsync(user.Id);

        Assert.False(user.IsActive);
        await _userRepo.Received(1).SaveAsync(user);
    }

    [Fact]
    public async Task UpdateUserAsync_DelegatesToRepository()
    {
        var user = new User { Username = "alice" };

        await _sut.UpdateUserAsync(user);

        await _userRepo.Received(1).SaveAsync(user);
    }
}
