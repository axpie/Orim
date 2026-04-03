using Google.Apis.Auth;
using Microsoft.IdentityModel.Tokens;

namespace Orim.Api.Services;

/// <summary>
/// Production implementation that verifies Google ID tokens using
/// <see cref="GoogleJsonWebSignature"/> from Google.Apis.Auth.
/// </summary>
public sealed class GoogleTokenVerifier : IGoogleTokenVerifier
{
    public async Task<GoogleTokenPayload> VerifyAsync(
        string idToken,
        string expectedAudience,
        CancellationToken cancellationToken = default)
    {
        var settings = new GoogleJsonWebSignature.ValidationSettings
        {
            Audience = [expectedAudience]
        };

        GoogleJsonWebSignature.Payload payload;
        try
        {
            payload = await GoogleJsonWebSignature.ValidateAsync(idToken, settings);
        }
        catch (InvalidJwtException ex)
        {
            throw new SecurityTokenValidationException("The Google ID token is invalid.", ex);
        }

        return new GoogleTokenPayload(
            payload.Subject,
            payload.Email,
            payload.EmailVerified,
            payload.Name,
            payload.HostedDomain);
    }
}
