namespace Orim.Api.Infrastructure;

internal sealed record JwtConfiguration(string Key, string Issuer, string Audience, int ExpiryMinutes);
