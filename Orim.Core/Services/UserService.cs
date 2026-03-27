using Orim.Core.Interfaces;
using Orim.Core.Models;

namespace Orim.Core.Services;

public class UserService
{
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
        if (user is null || !user.IsActive)
            return null;

        return BCrypt.Net.BCrypt.Verify(password, user.PasswordHash) ? user : null;
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
}
