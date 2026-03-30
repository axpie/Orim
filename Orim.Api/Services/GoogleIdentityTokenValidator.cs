using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Orim.Api.Services;

/// <summary>Validated, mapped identity claims from a Google ID token.</summary>
public sealed record GoogleIdentityPrincipal(
    string Subject,
    string? Email,
    string Username,
    string? HostedDomain);

/// <summary>
/// Validates a Google ID token using an injectable <see cref="IGoogleTokenVerifier"/>
/// and enforces application-level rules (email, hosted domain, subject).
/// </summary>
public sealed class GoogleIdentityTokenValidator
{
    private readonly GoogleOAuthOptions _options;
    private readonly IGoogleTokenVerifier _verifier;

    public GoogleIdentityTokenValidator(
        IOptions<GoogleOAuthOptions> options,
        IGoogleTokenVerifier verifier)
    {
        _options = options.Value;
        _verifier = verifier;
    }

    public async Task<GoogleIdentityPrincipal> ValidateIdTokenAsync(
        string idToken,
        CancellationToken cancellationToken = default)
    {
        if (!_options.IsConfigured)
            throw new InvalidOperationException("Google SSO is not configured.");

        var payload = await _verifier.VerifyAsync(idToken, _options.ClientId, cancellationToken);

        if (string.IsNullOrWhiteSpace(payload.Subject))
            throw new SecurityTokenValidationException("The Google token did not contain a subject.");

        if (string.IsNullOrWhiteSpace(payload.Email))
            throw new SecurityTokenValidationException("The Google token did not contain an email address.");

        if (!payload.EmailVerified)
            throw new SecurityTokenValidationException("The Google token email address is not verified.");

        if (!string.IsNullOrWhiteSpace(_options.HostedDomain))
        {
            if (!string.Equals(payload.HostedDomain, _options.HostedDomain, StringComparison.OrdinalIgnoreCase))
                throw new SecurityTokenValidationException(
                    "The Google token was not issued for the expected hosted domain.");
        }

        var username = payload.Email
            ?? payload.Name
            ?? throw new SecurityTokenValidationException("The Google token did not contain a usable username.");

        return new GoogleIdentityPrincipal(payload.Subject, payload.Email, username, payload.HostedDomain);
    }
}
