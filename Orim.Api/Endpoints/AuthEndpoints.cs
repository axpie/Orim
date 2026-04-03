using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Orim.Api.Contracts;
using Orim.Api.Infrastructure;
using Orim.Api.Services;
using Orim.Core.Models;
using Orim.Core.Services;

namespace Orim.Api.Endpoints;

internal static class AuthEndpoints
{
    internal static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/auth/login", async (LoginRequest request, HttpContext context, UserService userService, JwtConfiguration jwt, AuditLogger audit) =>
        {
            var user = await userService.AuthenticateAsync(request.Username, request.Password);
            if (user is null)
            {
                audit.LogUserLoginFailed(request.Username, "Local", "Invalid credentials");
                return Results.Unauthorized();
            }

            audit.LogUserLogin(user.Id, user.Username, "Local");
            return Results.Ok(EndpointHelpers.CreateLoginResponse(context, user, jwt));
        }).RequireRateLimiting("auth");

        app.MapGet("/api/auth/providers", (IOptions<MicrosoftEntraOptions> msOptions, IOptions<GoogleOAuthOptions> googleOptions) =>
        {
            var microsoft = msOptions.Value.IsConfigured
                ? new MicrosoftAuthProviderDto(
                    msOptions.Value.ClientId,
                    msOptions.Value.ResolveAuthority(),
                    msOptions.Value.Scopes)
                : null;

            var google = googleOptions.Value.IsConfigured
                ? new GoogleAuthProviderDto(googleOptions.Value.ClientId)
                : null;

            return Results.Ok(new AuthProvidersResponse(microsoft, google));
        }).AllowAnonymous();

        app.MapPost(
            "/api/auth/microsoft/exchange",
            async (MicrosoftTokenExchangeRequest request,
                UserService userService,
                MicrosoftIdentityTokenValidator validator,
                IOptions<MicrosoftEntraOptions> options,
                JwtConfiguration jwt,
                ILogger<Program> logger,
                HttpContext context,
                CancellationToken cancellationToken) =>
            {
                if (!options.Value.IsConfigured)
                    return Results.NotFound();

                if (string.IsNullOrWhiteSpace(request.IdToken))
                    return Results.BadRequest("An ID token is required.");

                MicrosoftIdentityPrincipal identity;
                try
                {
                    identity = await validator.ValidateIdTokenAsync(request.IdToken, cancellationToken);
                }
                catch (SecurityTokenException ex)
                {
                    logger.LogWarning(ex, "Microsoft sign-in token validation failed.");
                    return Results.Unauthorized();
                }

                try
                {
                    var user = await userService.AuthenticateExternalAsync(new ExternalLoginProfile(
                        AuthenticationProvider.MicrosoftEntraId,
                        identity.Subject,
                        identity.Email,
                        identity.Username,
                        identity.TenantId));

                    var audit = context.RequestServices.GetRequiredService<AuditLogger>();
                    audit.LogUserLogin(user.Id, user.Username, "Microsoft");
                    return Results.Ok(EndpointHelpers.CreateLoginResponse(context, user, jwt));
                }
                catch (InvalidOperationException ex)
                {
                    logger.LogWarning(ex, "Microsoft sign-in could not be linked to an ORIM user.");
                    var audit = context.RequestServices.GetRequiredService<AuditLogger>();
                    audit.LogUserLoginFailed(identity.Username ?? identity.Email ?? "unknown", "Microsoft", ex.Message);
                    return EndpointHelpers.BadRequest(context, "The sign-in could not be completed.");
                }
            }).AllowAnonymous().RequireRateLimiting("auth");

        app.MapPost(
            "/api/auth/google/exchange",
            async (GoogleTokenExchangeRequest request,
                UserService userService,
                GoogleIdentityTokenValidator validator,
                IOptions<GoogleOAuthOptions> options,
                JwtConfiguration jwt,
                ILogger<Program> logger,
                HttpContext context,
                CancellationToken cancellationToken) =>
            {
                if (!options.Value.IsConfigured)
                    return Results.NotFound();

                if (string.IsNullOrWhiteSpace(request.IdToken))
                    return Results.BadRequest("An ID token is required.");

                GoogleIdentityPrincipal identity;
                try
                {
                    identity = await validator.ValidateIdTokenAsync(request.IdToken, cancellationToken);
                }
                catch (SecurityTokenException ex)
                {
                    logger.LogWarning(ex, "Google sign-in token validation failed.");
                    return Results.Unauthorized();
                }

                try
                {
                    var user = await userService.AuthenticateExternalAsync(new ExternalLoginProfile(
                        AuthenticationProvider.Google,
                        identity.Subject,
                        identity.Email,
                        identity.Username,
                        string.IsNullOrWhiteSpace(identity.HostedDomain) ? null : identity.HostedDomain));

                    var audit = context.RequestServices.GetRequiredService<AuditLogger>();
                    audit.LogUserLogin(user.Id, user.Username, "Google");
                    return Results.Ok(EndpointHelpers.CreateLoginResponse(context, user, jwt));
                }
                catch (InvalidOperationException ex)
                {
                    logger.LogWarning(ex, "Google sign-in could not be linked to an ORIM user.");
                    var audit = context.RequestServices.GetRequiredService<AuditLogger>();
                    audit.LogUserLoginFailed(identity.Username ?? identity.Email ?? "unknown", "Google", ex.Message);
                    return EndpointHelpers.BadRequest(context, "The sign-in could not be completed.");
                }
            }).AllowAnonymous().RequireRateLimiting("auth");

        app.MapPost("/api/auth/refresh", [Authorize] async (HttpContext context, UserService userService, JwtConfiguration jwt) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            var user = await userService.GetByIdAsync(userId);
            if (user is null || !user.IsActive)
                return Results.Unauthorized();

            return Results.Ok(EndpointHelpers.CreateLoginResponse(context, user, jwt));
        });

        app.MapPost("/api/auth/logout", (HttpContext context, AuditLogger audit) =>
        {
            var userId = EndpointHelpers.GetUserId(context.User);
            var username = EndpointHelpers.GetUsername(context.User);
            if (userId.HasValue)
                audit.LogUserLogout(userId.Value, username ?? "unknown");

            EndpointHelpers.ClearAuthCookie(context);
            return Results.NoContent();
        }).AllowAnonymous();

        return app;
    }
}
