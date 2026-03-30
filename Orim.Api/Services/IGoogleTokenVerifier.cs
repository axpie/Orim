namespace Orim.Api.Services;

/// <summary>Payload extracted from a validated Google ID token.</summary>
public sealed record GoogleTokenPayload(
    string Subject,
    string? Email,
    bool EmailVerified,
    string? Name,
    string? HostedDomain);

/// <summary>
/// Abstraction over Google ID-token verification, enabling unit testing
/// without hitting Google's servers.
/// </summary>
public interface IGoogleTokenVerifier
{
    Task<GoogleTokenPayload> VerifyAsync(
        string idToken,
        string expectedAudience,
        CancellationToken cancellationToken = default);
}
