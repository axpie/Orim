using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Orim.Api.Services;

public sealed record MicrosoftIdentityPrincipal(
    string Subject,
    string TenantId,
    string Username,
    string? Email);

public class MicrosoftIdentityTokenValidator
{
    private readonly MicrosoftEntraOptions _options;
    private readonly ConfigurationManager<OpenIdConnectConfiguration>? _configurationManager;

    public MicrosoftIdentityTokenValidator(IOptions<MicrosoftEntraOptions> options)
    {
        _options = options.Value;
        if (_options.IsConfigured)
        {
            var metadataAddress = $"{_options.ResolveAuthority()}/.well-known/openid-configuration";
            _configurationManager = new ConfigurationManager<OpenIdConnectConfiguration>(
                metadataAddress,
                new OpenIdConnectConfigurationRetriever(),
                new HttpDocumentRetriever { RequireHttps = metadataAddress.StartsWith("https://", StringComparison.OrdinalIgnoreCase) });
        }
    }

    public async Task<MicrosoftIdentityPrincipal> ValidateIdTokenAsync(string idToken, CancellationToken cancellationToken = default)
    {
        if (!_options.IsConfigured)
        {
            throw new InvalidOperationException("Microsoft SSO is not configured.");
        }

        var configurationManager = _configurationManager
            ?? throw new InvalidOperationException("Microsoft SSO metadata is not available.");
        var configuration = await configurationManager.GetConfigurationAsync(cancellationToken);

        var tokenHandler = new JwtSecurityTokenHandler();
        tokenHandler.InboundClaimTypeMap.Clear();
        tokenHandler.OutboundClaimTypeMap.Clear();

        var principal = tokenHandler.ValidateToken(idToken, new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuers = ResolveValidIssuers(configuration),
            ValidateAudience = true,
            ValidAudience = _options.ClientId,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKeys = configuration.SigningKeys,
            ClockSkew = TimeSpan.FromMinutes(2),
            NameClaimType = "name"
        }, out _);

        var tenantId = principal.FindFirstValue("tid")
            ?? throw new SecurityTokenValidationException("The Microsoft token did not contain a tenant id.");
        if (!string.Equals(tenantId, _options.TenantId, StringComparison.OrdinalIgnoreCase))
        {
            throw new SecurityTokenValidationException("The Microsoft token was issued for a different tenant.");
        }

        var subject = principal.FindFirstValue("oid") ?? principal.FindFirstValue("sub")
            ?? throw new SecurityTokenValidationException("The Microsoft token did not contain a subject.");
        var email = principal.FindFirstValue("email");
        var username = principal.FindFirstValue("preferred_username")
            ?? email
            ?? principal.FindFirstValue("name")
            ?? throw new SecurityTokenValidationException("The Microsoft token did not contain a username.");

        return new MicrosoftIdentityPrincipal(subject, tenantId, username, email);
    }

    private IEnumerable<string> ResolveValidIssuers(OpenIdConnectConfiguration configuration)
    {
        var issuers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (!string.IsNullOrWhiteSpace(configuration.Issuer))
        {
            issuers.Add(configuration.Issuer);
        }

        var normalizedTenantId = _options.TenantId.Trim();
        issuers.Add($"https://login.microsoftonline.com/{normalizedTenantId}/v2.0");
        issuers.Add($"https://sts.windows.net/{normalizedTenantId}/");

        return issuers;
    }
}
