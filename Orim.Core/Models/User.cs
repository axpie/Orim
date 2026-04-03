namespace Orim.Core.Models;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Username { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string? Email { get; set; }
    public AuthenticationProvider AuthenticationProvider { get; set; } = AuthenticationProvider.Local;
    public string? ExternalSubject { get; set; }
    public string? ExternalTenantId { get; set; }
    public UserRole Role { get; set; } = UserRole.User;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public enum AuthenticationProvider
{
    Local,
    MicrosoftEntraId,
    Google
}

public enum UserRole
{
    User,
    Admin
}
