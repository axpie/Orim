using Orim.Core.Interfaces;
using Orim.Core.Models;

namespace Orim.Core.Services;

public class UserService
{
    private const int MaxUsernameLength = 100;
    private const int MaxDisplayNameLength = 100;
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
        var normalizedUsername = NormalizeUsername(username);
        ArgumentException.ThrowIfNullOrWhiteSpace(password);

        var existing = await _userRepository.GetByUsernameAsync(normalizedUsername);
        if (existing is not null)
            throw new InvalidOperationException($"User '{normalizedUsername}' already exists.");

        var user = new User
        {
            Username = normalizedUsername,
            DisplayName = normalizedUsername,
            PasswordHash = HashPassword(password),
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

    public async Task<User> UpdateDisplayNameAsync(Guid userId, string displayName)
    {
        var normalizedDisplayName = NormalizeDisplayName(displayName);
        var user = await _userRepository.GetByIdAsync(userId)
                   ?? throw new InvalidOperationException("User not found.");

        EnsureActive(user);

        user.DisplayName = normalizedDisplayName;
        await _userRepository.SaveAsync(user);
        return user;
    }

    public async Task SetPasswordAsync(Guid userId, string newPassword)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(newPassword);

        var user = await _userRepository.GetByIdAsync(userId)
                   ?? throw new InvalidOperationException("User not found.");
        user.PasswordHash = HashPassword(newPassword);
        await _userRepository.SaveAsync(user);
    }

    public async Task ChangePasswordAsync(Guid userId, string currentPassword, string newPassword)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(currentPassword);
        ArgumentException.ThrowIfNullOrWhiteSpace(newPassword);

        var user = await _userRepository.GetByIdAsync(userId)
                   ?? throw new InvalidOperationException("User not found.");

        EnsureActive(user);

        if (user.AuthenticationProvider != AuthenticationProvider.Local || string.IsNullOrWhiteSpace(user.PasswordHash))
        {
            throw new InvalidOperationException("This account does not have a local password.");
        }

        if (!BCrypt.Net.BCrypt.Verify(currentPassword, user.PasswordHash))
        {
            throw new InvalidOperationException("The current password is incorrect.");
        }

        user.PasswordHash = HashPassword(newPassword);
        await _userRepository.SaveAsync(user);
    }

    public async Task<User> UpdateAdminUserAsync(Guid userId, string username, UserRole role)
    {
        var normalizedUsername = NormalizeUsername(username);
        var user = await _userRepository.GetByIdAsync(userId)
                   ?? throw new InvalidOperationException("User not found.");

        var existing = await _userRepository.GetByUsernameAsync(normalizedUsername);
        if (existing is not null && existing.Id != userId)
        {
            throw new InvalidOperationException($"User '{normalizedUsername}' already exists.");
        }

        await EnsureAdminRoleChangeAllowedAsync(user, role);

        var previousUsername = user.Username;
        var usernameChanged = !string.Equals(previousUsername, normalizedUsername, StringComparison.OrdinalIgnoreCase);
        var shouldSyncDisplayName = string.IsNullOrWhiteSpace(user.DisplayName)
            || string.Equals(user.DisplayName, previousUsername, StringComparison.OrdinalIgnoreCase);

        user.Username = normalizedUsername;
        if (usernameChanged && shouldSyncDisplayName)
        {
            user.DisplayName = normalizedUsername;
        }

        user.Role = role;

        await _userRepository.SaveAsync(user);

        if (usernameChanged)
        {
            await UpdateBoardMembershipUsernamesAsync(user.Id, normalizedUsername);
        }

        return user;
    }

    public async Task<User?> AuthenticateAsync(string username, string password)
    {
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
        {
            return null;
        }

        var user = await _userRepository.GetByUsernameAsync(username.Trim());
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
                DisplayName = profile.Username.Trim(),
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

        await EnsureAdminCanBeDeactivatedAsync(user);

        user.IsActive = false;
        await _userRepository.SaveAsync(user);
    }

    public async Task DeleteUserAsync(Guid userId)
    {
        var user = await _userRepository.GetByIdAsync(userId)
                   ?? throw new InvalidOperationException("User not found.");

        await EnsureAdminCanBeRemovedAsync(user);

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

    private static string NormalizeUsername(string username)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(username);

        var normalized = username.Trim();
        if (normalized.Length > MaxUsernameLength)
        {
            throw new ArgumentException($"Username must not exceed {MaxUsernameLength} characters.", nameof(username));
        }

        return normalized;
    }

    private static string NormalizeDisplayName(string displayName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(displayName);

        var normalized = displayName.Trim();
        if (normalized.Length > MaxDisplayNameLength)
        {
            throw new ArgumentException($"Display name must not exceed {MaxDisplayNameLength} characters.", nameof(displayName));
        }

        return normalized;
    }

    private static string HashPassword(string password) =>
        BCrypt.Net.BCrypt.HashPassword(password, workFactor: 12);

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

        baseUsername = baseUsername.Length > MaxUsernameLength
            ? baseUsername[..MaxUsernameLength]
            : baseUsername;

        var candidate = baseUsername;
        var suffix = 1;

        while (await _userRepository.GetByUsernameAsync(candidate) is not null)
        {
            var suffixText = $"-{suffix}";
            var maxBaseLength = Math.Max(1, MaxUsernameLength - suffixText.Length);
            candidate = $"{baseUsername[..Math.Min(baseUsername.Length, maxBaseLength)]}{suffixText}";
            suffix++;
        }

        return candidate;
    }

    private async Task EnsureAdminRoleChangeAllowedAsync(User user, UserRole newRole)
    {
        if (user.Role != UserRole.Admin || newRole == UserRole.Admin)
        {
            return;
        }

        var users = await _userRepository.GetAllAsync();
        EnsureAdminGuardrails(users, user);
    }

    private async Task EnsureAdminCanBeDeactivatedAsync(User user)
    {
        if (!user.IsActive || user.Role != UserRole.Admin)
        {
            return;
        }

        var activeAdminCount = await CountActiveAdminsAsync();
        if (activeAdminCount <= 1)
        {
            throw new InvalidOperationException("At least one active admin account must remain.");
        }
    }

    private async Task EnsureAdminCanBeRemovedAsync(User user)
    {
        if (user.Role != UserRole.Admin)
        {
            return;
        }

        var users = await _userRepository.GetAllAsync();
        EnsureAdminGuardrails(users, user);
    }

    private static void EnsureAdminGuardrails(IReadOnlyCollection<User> users, User targetUser)
    {
        var adminCount = users.Count(candidate => candidate.Role == UserRole.Admin);
        if (adminCount <= 1)
        {
            throw new InvalidOperationException("At least one admin account must remain.");
        }

        if (targetUser.IsActive)
        {
            var activeAdminCount = users.Count(candidate => candidate.Role == UserRole.Admin && candidate.IsActive);
            if (activeAdminCount <= 1)
            {
                throw new InvalidOperationException("At least one active admin account must remain.");
            }
        }
    }

    private async Task<int> CountActiveAdminsAsync()
    {
        var users = await _userRepository.GetAllAsync();
        return users.Count(candidate => candidate.Role == UserRole.Admin && candidate.IsActive);
    }

    private async Task UpdateBoardMembershipUsernamesAsync(Guid userId, string username)
    {
        var boards = await _boardRepository.GetAllAsync();

        foreach (var board in boards)
        {
            var changed = false;

            foreach (var member in board.Members.Where(candidate => candidate.UserId == userId))
            {
                if (string.Equals(member.Username, username, StringComparison.Ordinal))
                {
                    continue;
                }

                member.Username = username;
                changed = true;
            }

            if (changed)
            {
                await _boardRepository.SaveAsync(board);
            }
        }
    }
}
