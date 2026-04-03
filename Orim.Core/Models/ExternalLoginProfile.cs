namespace Orim.Core.Models;

public sealed record ExternalLoginProfile(
    AuthenticationProvider Provider,
    string Subject,
    string? Email,
    string Username,
    string? TenantId);
