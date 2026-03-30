using NSubstitute;
using Orim.Core.Interfaces;
using Orim.Core.Models;
using Orim.Core.Services;

namespace Orim.Tests.Core.Services;

public class UserServiceTests
{
    private readonly IUserRepository _userRepo = Substitute.For<IUserRepository>();
    private readonly IBoardRepository _boardRepo = Substitute.For<IBoardRepository>();
    private readonly UserService _sut;

    public UserServiceTests()
    {
        _sut = new UserService(_userRepo, _boardRepo);
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
    public async Task AuthenticateAsync_UserWithoutPasswordHash_ReturnsNull()
    {
        var user = new User
        {
            Username = "alice",
            PasswordHash = string.Empty,
            AuthenticationProvider = AuthenticationProvider.MicrosoftEntraId,
            IsActive = true
        };
        _userRepo.GetByUsernameAsync("alice").Returns(user);

        var result = await _sut.AuthenticateAsync("alice", "password");

        Assert.Null(result);
    }

    [Fact]
    public async Task AuthenticateExternalAsync_ExistingLinkedUser_ReturnsUser()
    {
        var user = new User
        {
            Username = "alice",
            AuthenticationProvider = AuthenticationProvider.MicrosoftEntraId,
            ExternalSubject = "oid-123",
            ExternalTenantId = "tenant-1",
            Email = "alice@contoso.com",
            IsActive = true
        };
        _userRepo.GetByExternalIdentityAsync(AuthenticationProvider.MicrosoftEntraId, "oid-123").Returns(user);

        var result = await _sut.AuthenticateExternalAsync(new ExternalLoginProfile(
            AuthenticationProvider.MicrosoftEntraId,
            "oid-123",
            "alice@contoso.com",
            "alice@contoso.com",
            "tenant-1"));

        Assert.Same(user, result);
        await _userRepo.Received(1).SaveAsync(user);
    }

    [Fact]
    public async Task AuthenticateExternalAsync_LinksUserByEmail()
    {
        var user = new User
        {
            Username = "alice",
            AuthenticationProvider = AuthenticationProvider.Local,
            Email = "alice@contoso.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("secret", workFactor: 4),
            IsActive = true
        };
        _userRepo.GetByExternalIdentityAsync(AuthenticationProvider.MicrosoftEntraId, "oid-123").Returns((User?)null);
        _userRepo.GetByEmailAsync("alice@contoso.com").Returns(user);

        var result = await _sut.AuthenticateExternalAsync(new ExternalLoginProfile(
            AuthenticationProvider.MicrosoftEntraId,
            "oid-123",
            "alice@contoso.com",
            "alice@contoso.com",
            "tenant-1"));

        Assert.Same(user, result);
        Assert.Equal(AuthenticationProvider.MicrosoftEntraId, user.AuthenticationProvider);
        Assert.Equal("oid-123", user.ExternalSubject);
        Assert.Equal("tenant-1", user.ExternalTenantId);
        await _userRepo.Received(1).SaveAsync(user);
    }

    [Fact]
    public async Task AuthenticateExternalAsync_LinksUserByUsername_WhenNoEmailMatchExists()
    {
        var user = new User
        {
            Username = "alice@contoso.com",
            AuthenticationProvider = AuthenticationProvider.Local,
            IsActive = true
        };
        _userRepo.GetByExternalIdentityAsync(AuthenticationProvider.MicrosoftEntraId, "oid-123").Returns((User?)null);
        _userRepo.GetByEmailAsync("alice@contoso.com").Returns((User?)null);
        _userRepo.GetByUsernameAsync("alice@contoso.com").Returns(user);

        var result = await _sut.AuthenticateExternalAsync(new ExternalLoginProfile(
            AuthenticationProvider.MicrosoftEntraId,
            "oid-123",
            "alice@contoso.com",
            "alice@contoso.com",
            "tenant-1"));

        Assert.Same(user, result);
        Assert.Equal(AuthenticationProvider.MicrosoftEntraId, user.AuthenticationProvider);
        Assert.Equal("oid-123", user.ExternalSubject);
        await _userRepo.Received(1).SaveAsync(user);
    }

    [Fact]
    public async Task AuthenticateExternalAsync_CreatesUserWhenNoLinkExists()
    {
        _userRepo.GetByExternalIdentityAsync(AuthenticationProvider.MicrosoftEntraId, "oid-123").Returns((User?)null);
        _userRepo.GetByEmailAsync("alice@contoso.com").Returns((User?)null);
        _userRepo.GetByUsernameAsync("alice@contoso.com").Returns((User?)null);

        var result = await _sut.AuthenticateExternalAsync(new ExternalLoginProfile(
            AuthenticationProvider.MicrosoftEntraId,
            "oid-123",
            "alice@contoso.com",
            "alice@contoso.com",
            "tenant-1"));

        Assert.Equal("alice@contoso.com", result.Username);
        Assert.Equal("alice@contoso.com", result.Email);
        Assert.Equal(AuthenticationProvider.MicrosoftEntraId, result.AuthenticationProvider);
        Assert.Equal("oid-123", result.ExternalSubject);
        Assert.Equal("tenant-1", result.ExternalTenantId);
        Assert.Equal(UserRole.User, result.Role);
        Assert.Equal(string.Empty, result.PasswordHash);
        await _userRepo.Received(1).SaveAsync(Arg.Is<User>(user =>
            user.Username == "alice@contoso.com"
            && user.AuthenticationProvider == AuthenticationProvider.MicrosoftEntraId
            && user.ExternalSubject == "oid-123"));
    }

    [Fact]
    public async Task AuthenticateExternalAsync_DifferentExternalIdentityOnExistingUser_Throws()
    {
        var user = new User
        {
            Username = "alice@contoso.com",
            AuthenticationProvider = AuthenticationProvider.MicrosoftEntraId,
            ExternalSubject = "oid-existing",
            IsActive = true
        };
        _userRepo.GetByExternalIdentityAsync(AuthenticationProvider.MicrosoftEntraId, "oid-new").Returns((User?)null);
        _userRepo.GetByEmailAsync("alice@contoso.com").Returns((User?)null);
        _userRepo.GetByUsernameAsync("alice@contoso.com").Returns(user);

        await Assert.ThrowsAsync<InvalidOperationException>(() => _sut.AuthenticateExternalAsync(new ExternalLoginProfile(
            AuthenticationProvider.MicrosoftEntraId,
            "oid-new",
            "alice@contoso.com",
            "alice@contoso.com",
            "tenant-1")));
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

    [Fact]
    public async Task DeleteUserAsync_UserNotFound_Throws()
    {
        _userRepo.GetByIdAsync(Arg.Any<Guid>()).Returns((User?)null);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _sut.DeleteUserAsync(Guid.NewGuid()));
    }

    [Fact]
    public async Task DeleteUserAsync_DeletesOwnedBoardsAndUser()
    {
        var user = new User { Username = "alice" };
        var ownedBoard = new Board { OwnerId = user.Id, Title = "Owned" };
        var foreignBoard = new Board { OwnerId = Guid.NewGuid(), Title = "Foreign" };

        _userRepo.GetByIdAsync(user.Id).Returns(user);
        _boardRepo.GetAllAsync().Returns([ownedBoard, foreignBoard]);

        await _sut.DeleteUserAsync(user.Id);

        await _boardRepo.Received(1).DeleteAsync(ownedBoard.Id);
        await _boardRepo.DidNotReceive().DeleteAsync(foreignBoard.Id);
        await _userRepo.Received(1).DeleteAsync(user.Id);
    }

    [Fact]
    public async Task DeleteUserAsync_RemovesMembershipFromOtherBoards()
    {
        var user = new User { Username = "alice" };
        var board = new Board
        {
            OwnerId = Guid.NewGuid(),
            Title = "Shared",
            Members =
            [
                new BoardMember { UserId = user.Id, Username = user.Username, Role = BoardRole.Editor },
                new BoardMember { UserId = Guid.NewGuid(), Username = "bob", Role = BoardRole.Viewer }
            ]
        };

        _userRepo.GetByIdAsync(user.Id).Returns(user);
        _boardRepo.GetAllAsync().Returns([board]);

        await _sut.DeleteUserAsync(user.Id);

        Assert.DoesNotContain(board.Members, member => member.UserId == user.Id);
        await _boardRepo.Received(1).SaveAsync(board);
        await _userRepo.Received(1).DeleteAsync(user.Id);
    }

    // -------------------------------------------------------------------------
    // Google external-auth regression
    // -------------------------------------------------------------------------

    [Fact]
    public async Task AuthenticateExternalAsync_Google_CreatesNewUser()
    {
        _userRepo.GetByExternalIdentityAsync(AuthenticationProvider.Google, "google-sub-abc").Returns((User?)null);
        _userRepo.GetByEmailAsync("alice@gmail.com").Returns((User?)null);
        _userRepo.GetByUsernameAsync("alice@gmail.com").Returns((User?)null);

        var result = await _sut.AuthenticateExternalAsync(new ExternalLoginProfile(
            AuthenticationProvider.Google,
            "google-sub-abc",
            "alice@gmail.com",
            "alice@gmail.com",
            null));

        Assert.Equal("alice@gmail.com", result.Username);
        Assert.Equal("alice@gmail.com", result.Email);
        Assert.Equal(AuthenticationProvider.Google, result.AuthenticationProvider);
        Assert.Equal("google-sub-abc", result.ExternalSubject);
        Assert.Null(result.ExternalTenantId);
        await _userRepo.Received(1).SaveAsync(Arg.Is<User>(u =>
            u.Username == "alice@gmail.com"
            && u.AuthenticationProvider == AuthenticationProvider.Google
            && u.ExternalSubject == "google-sub-abc"));
    }

    [Fact]
    public async Task AuthenticateExternalAsync_Google_WithHostedDomain_StoresTenantId()
    {
        _userRepo.GetByExternalIdentityAsync(AuthenticationProvider.Google, "google-sub-corp").Returns((User?)null);
        _userRepo.GetByEmailAsync("alice@corp.com").Returns((User?)null);
        _userRepo.GetByUsernameAsync("alice@corp.com").Returns((User?)null);

        var result = await _sut.AuthenticateExternalAsync(new ExternalLoginProfile(
            AuthenticationProvider.Google,
            "google-sub-corp",
            "alice@corp.com",
            "alice@corp.com",
            "corp.com"));

        Assert.Equal(AuthenticationProvider.Google, result.AuthenticationProvider);
        Assert.Equal("corp.com", result.ExternalTenantId);
    }

    [Fact]
    public async Task AuthenticateExternalAsync_Google_ExistingLinkedUser_ReturnsUser()
    {
        var user = new User
        {
            Username = "alice@gmail.com",
            AuthenticationProvider = AuthenticationProvider.Google,
            ExternalSubject = "google-sub-abc",
            Email = "alice@gmail.com",
            IsActive = true
        };
        _userRepo.GetByExternalIdentityAsync(AuthenticationProvider.Google, "google-sub-abc").Returns(user);

        var result = await _sut.AuthenticateExternalAsync(new ExternalLoginProfile(
            AuthenticationProvider.Google,
            "google-sub-abc",
            "alice@gmail.com",
            "alice@gmail.com",
            null));

        Assert.Same(user, result);
        await _userRepo.Received(1).SaveAsync(user);
    }
}
