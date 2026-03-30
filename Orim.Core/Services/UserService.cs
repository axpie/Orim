using Orim.Core.Interfaces;
using Orim.Core.Models;

namespace Orim.Core.Services;

public class UserService
{
    private static readonly SemaphoreSlim ExternalAuthenticationLock = new(1, 1);
    private readonly IUserRepository _userRepository;
    private readonly IBoardRepository _boardRepository;

    public UserService(IUserRepository userRepository, IBoardRepository boardRepository)
    {
        _userRepository = userRepository;
        _boardRepository = boardRepository;
    }

    public Task<List<User>> GetAllUsersAsync() => _userRepository.GetAllAsync();

    public Task<User?> GetByIdAsync(Guid id) => _userRepository.GetByIdAsync(id);

    public Task<User?> GetByUsernameAsync(string username) => _userRepository.GetByUsernameAsync(username);

    public Task<User?> GetByEmailAsync(string email) => _userRepository.GetByEmailAsync(email);

    public Task<User?> GetByExternalIdentityAsync(AuthenticationProvider provider, string externalSubject) =>
        _userRepository.GetByExternalIdentityAsync(provider, externalSubject);

    public async Task<User> CreateUserAsync(string username, string password, UserRole role)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(username);
        ArgumentException.ThrowIfNullOrWhiteSpace(password);

        if (username.Length > 100)
            throw new ArgumentException("Username must not exceed 100 characters.", nameof(username));

        var existing = await _userRepository.GetByUsernameAsync(username);
        if (existing is not null)
            throw new InvalidOperationException($"User '{username}' already exists.");

        var user = new User
        {
            Username = username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password, workFactor: 12),
            AuthenticationProvider = AuthenticationProvider.Local,
            Role = role
        };

        await _userRepository.SaveAsync(user);
        return user;
    }

    public async Task UpdateUserAsync(User user)
    {
        await _userRepository.SaveAsync(user);
    }

    public async Task SetPasswordAsync(Guid userId, string newPassword)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(newPassword);

        var user = await _userRepository.GetByIdAsync(userId)
                   ?? throw new InvalidOperationException("User not found.");
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword, workFactor: 12);
        await _userRepository.SaveAsync(user);
    }

    public async Task<User?> AuthenticateAsync(string username, string password)
    {
        var user = await _userRepository.GetByUsernameAsync(username);
        if (user is null || !user.IsActive || string.IsNullOrWhiteSpace(user.PasswordHash))
            return null;

        return BCrypt.Net.BCrypt.Verify(password, user.PasswordHash) ? user : null;
    }

    public async Task<User> AuthenticateExternalAsync(ExternalLoginProfile profile)
    {
        ArgumentNullException.ThrowIfNull(profile);
        ArgumentException.ThrowIfNullOrWhiteSpace(profile.Subject);
        ArgumentException.ThrowIfNullOrWhiteSpace(profile.Username);

        await ExternalAuthenticationLock.WaitAsync();
        try
        {
            var existingByExternalIdentity = await _userRepository.GetByExternalIdentityAsync(profile.Provider, profile.Subject);
            if (existingByExternalIdentity is not null)
            {
                EnsureActive(existingByExternalIdentity);
                UpdateExternalIdentity(existingByExternalIdentity, profile);
                await _userRepository.SaveAsync(existingByExternalIdentity);
                return existingByExternalIdentity;
            }

            var existingByEmail = !string.IsNullOrWhiteSpace(profile.Email)
                ? await _userRepository.GetByEmailAsync(profile.Email)
                : null;
            if (existingByEmail is not null)
            {
                EnsureActive(existingByEmail);
                EnsureCanLinkExternalIdentity(existingByEmail, profile);
                UpdateExternalIdentity(existingByEmail, profile);
                await _userRepository.SaveAsync(existingByEmail);
                return existingByEmail;
            }

            var existingByUsername = await _userRepository.GetByUsernameAsync(profile.Username);
            if (existingByUsername is not null)
            {
                EnsureActive(existingByUsername);
                EnsureCanLinkExternalIdentity(existingByUsername, profile);
                UpdateExternalIdentity(existingByUsername, profile);
                await _userRepository.SaveAsync(existingByUsername);
                return existingByUsername;
            }

            var user = new User
            {
                Username = await GenerateAvailableUsernameAsync(profile),
                Email = profile.Email,
                PasswordHash = string.Empty,
                AuthenticationProvider = profile.Provider,
                ExternalSubject = profile.Subject,
                ExternalTenantId = profile.TenantId,
                Role = UserRole.User
            };

            await _userRepository.SaveAsync(user);
            return user;
        }
        finally
        {
            ExternalAuthenticationLock.Release();
        }
    }

    public async Task DeactivateUserAsync(Guid userId)
    {
        var user = await _userRepository.GetByIdAsync(userId)
                   ?? throw new InvalidOperationException("User not found.");
        user.IsActive = false;
        await _userRepository.SaveAsync(user);
    }

    public async Task DeleteUserAsync(Guid userId)
    {
        var user = await _userRepository.GetByIdAsync(userId)
                   ?? throw new InvalidOperationException("User not found.");

        var boards = await _boardRepository.GetAllAsync();

        foreach (var ownedBoard in boards.Where(board => board.OwnerId == user.Id))
        {
            await _boardRepository.DeleteAsync(ownedBoard.Id);
        }

        foreach (var board in boards.Where(board => board.OwnerId != user.Id && board.Members.Any(member => member.UserId == user.Id)))
        {
            board.Members.RemoveAll(member => member.UserId == user.Id);
            await _boardRepository.SaveAsync(board);
        }

        await _userRepository.DeleteAsync(user.Id);
    }

    private static void EnsureActive(User user)
    {
        if (!user.IsActive)
        {
            throw new InvalidOperationException("User is deactivated.");
        }
    }

    private static void UpdateExternalIdentity(User user, ExternalLoginProfile profile)
    {
        user.AuthenticationProvider = profile.Provider;
        user.ExternalSubject = profile.Subject;
        user.ExternalTenantId = profile.TenantId;
        user.Email = string.IsNullOrWhiteSpace(profile.Email) ? user.Email : profile.Email;
    }

    private static void EnsureCanLinkExternalIdentity(User user, ExternalLoginProfile profile)
    {
        if (user.AuthenticationProvider == AuthenticationProvider.Local
            || string.IsNullOrWhiteSpace(user.ExternalSubject))
        {
            return;
        }

        if (user.AuthenticationProvider == profile.Provider
            && string.Equals(user.ExternalSubject, profile.Subject, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        throw new InvalidOperationException("User is already linked to a different external identity.");
    }

    private async Task<string> GenerateAvailableUsernameAsync(ExternalLoginProfile profile)
    {
        var baseUsername = (profile.Email ?? profile.Username).Trim();
        if (string.IsNullOrWhiteSpace(baseUsername))
        {
            baseUsername = $"{profile.Provider}-{profile.Subject}";
        }

        baseUsername = baseUsername.Length > 100
            ? baseUsername[..100]
            : baseUsername;

        var candidate = baseUsername;
        var suffix = 1;

        while (await _userRepository.GetByUsernameAsync(candidate) is not null)
        {
            var suffixText = $"-{suffix}";
            var maxBaseLength = Math.Max(1, 100 - suffixText.Length);
            candidate = $"{baseUsername[..Math.Min(baseUsername.Length, maxBaseLength)]}{suffixText}";
            suffix++;
        }

        return candidate;
    }
}
