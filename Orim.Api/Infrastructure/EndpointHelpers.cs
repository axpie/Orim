using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Orim.Api.Contracts;
using Orim.Core.Models;

namespace Orim.Api.Infrastructure;

internal static class EndpointHelpers
{
    internal const string AuthCookieName = "orim_auth";

    internal static string ResolveDisplayName(User user) =>
        string.IsNullOrWhiteSpace(user.DisplayName) ? user.Username : user.DisplayName.Trim();

    internal static LoginResponse CreateLoginResponse(HttpContext context, User user, JwtConfiguration jwt)
    {
        var token = GenerateJwtToken(user, jwt);
        context.Response.Cookies.Append(AuthCookieName, token, CreateAuthCookieOptions(context, jwt.ExpiryMinutes));
        return new(user.Id, user.Username, ResolveDisplayName(user), user.Role);
    }

    internal static void ClearAuthCookie(HttpContext context) =>
        context.Response.Cookies.Delete(AuthCookieName, CreateAuthCookieOptions(context, 0));

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

    internal static object CreateErrorPayload(HttpContext context, string message) => new
    {
        error = message,
        message,
        requestId = context.TraceIdentifier
    };

    internal static IResult BadRequest(HttpContext context, string message) =>
        Results.Json(CreateErrorPayload(context, message), statusCode: StatusCodes.Status400BadRequest);

    internal static IResult NotFound(HttpContext context, string message) =>
        Results.Json(CreateErrorPayload(context, message), statusCode: StatusCodes.Status404NotFound);

    internal static IResult ServiceUnavailable(HttpContext context, string message) =>
        Results.Json(CreateErrorPayload(context, message), statusCode: StatusCodes.Status503ServiceUnavailable);

    private static CookieOptions CreateAuthCookieOptions(HttpContext context, int expiryMinutes)
    {
        var environment = context.RequestServices.GetRequiredService<IHostEnvironment>();
        return new CookieOptions
        {
            HttpOnly = true,
            IsEssential = true,
            Path = "/",
            SameSite = SameSiteMode.Lax,
            Secure = !environment.IsDevelopment(),
            Expires = expiryMinutes > 0
                ? DateTimeOffset.UtcNow.AddMinutes(expiryMinutes)
                : DateTimeOffset.UnixEpoch
        };
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
