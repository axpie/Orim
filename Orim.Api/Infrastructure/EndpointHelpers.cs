using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Orim.Api.Contracts;
using Orim.Core.Models;

namespace Orim.Api.Infrastructure;

internal static class EndpointHelpers
{
    internal static string ResolveDisplayName(User user) =>
        string.IsNullOrWhiteSpace(user.DisplayName) ? user.Username : user.DisplayName.Trim();

    internal static LoginResponse CreateLoginResponse(User user, JwtConfiguration jwt) =>
        new(GenerateJwtToken(user, jwt), user.Id, user.Username, ResolveDisplayName(user), user.Role);

    internal static UserDto ToUserDto(User user) =>
        new(user.Id, user.Username, ResolveDisplayName(user), user.Role, user.IsActive, user.CreatedAt);

    internal static Guid? GetUserId(ClaimsPrincipal principal)
    {
        var claim = principal.FindFirst(ClaimTypes.NameIdentifier);
        return claim is not null && Guid.TryParse(claim.Value, out var id) ? id : null;
    }

    internal static string GetUsername(ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.Name) ?? string.Empty;

    internal static bool IsAdmin(ClaimsPrincipal principal) =>
        principal.IsInRole("Admin");

    internal static void ReplaceClaim(ClaimsIdentity identity, string claimType, string value)
    {
        foreach (var existingClaim in identity.FindAll(claimType).ToArray())
        {
            identity.RemoveClaim(existingClaim);
        }

        identity.AddClaim(new Claim(claimType, value));
    }

    private static string GenerateJwtToken(User user, JwtConfiguration jwt)
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(ClaimTypes.Role, user.Role.ToString())
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: jwt.Issuer,
            audience: jwt.Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(jwt.ExpiryMinutes),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
