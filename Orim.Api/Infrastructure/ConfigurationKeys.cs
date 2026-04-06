namespace Orim.Api.Infrastructure;

internal static class ConfigurationKeys
{
    public const string JwtKey = "Jwt:Key";
    public const string JwtIssuer = "Jwt:Issuer";
    public const string JwtAudience = "Jwt:Audience";
    public const string JwtExpiryMinutes = "Jwt:ExpiryMinutes";
    public const string CorsAllowedOrigins = "Cors:AllowedOrigins";
    public const string SeedAdminUsername = "SeedAdmin:Username";
    public const string SeedAdminPassword = "SeedAdmin:Password";
    public const string SeedAdminResetPasswordOnStartup = "SeedAdmin:ResetPasswordOnStartup";
    public const string ConnectionStrings = "ConnectionStrings:DefaultConnection";
    public const string RedisConnection = "ConnectionStrings:Redis";
}
