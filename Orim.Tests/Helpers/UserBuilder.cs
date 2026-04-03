using Orim.Core.Models;

namespace Orim.Tests.Helpers;

/// <summary>Fluent builder for creating User instances in tests.</summary>
public sealed class UserBuilder
{
    private Guid _id = Guid.NewGuid();
    private string _username = "testuser";
    private string _displayName = "Test User";
    private string _email = "test@example.com";
    private string _passwordHash = string.Empty;

    public UserBuilder WithId(Guid id) { _id = id; return this; }
    public UserBuilder WithUsername(string username) { _username = username; return this; }
    public UserBuilder WithDisplayName(string displayName) { _displayName = displayName; return this; }
    public UserBuilder WithEmail(string email) { _email = email; return this; }
    public UserBuilder WithPasswordHash(string hash) { _passwordHash = hash; return this; }

    public User Build() => new()
    {
        Id = _id,
        Username = _username,
        DisplayName = _displayName,
        Email = _email,
        PasswordHash = _passwordHash,
        CreatedAt = DateTime.UtcNow
    };
}
