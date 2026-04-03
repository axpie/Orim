using Microsoft.AspNetCore.Authorization;
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
        app.MapPost("/api/auth/login", async (LoginRequest request, UserService userService, JwtConfiguration jwt) =>
        {
            var user = await userService.AuthenticateAsync(request.Username, request.Password);
            if (user is null)
                return Results.Unauthorized();

            return Results.Ok(EndpointHelpers.CreateLoginResponse(user, jwt));
        });

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

                    return Results.Ok(EndpointHelpers.CreateLoginResponse(user, jwt));
                }
                catch (InvalidOperationException ex)
                {
                    logger.LogWarning(ex, "Microsoft sign-in could not be linked to an ORIM user.");
                    return Results.BadRequest(ex.Message);
                }
            }).AllowAnonymous();

        app.MapPost(
            "/api/auth/google/exchange",
            async (GoogleTokenExchangeRequest request,
                UserService userService,
                GoogleIdentityTokenValidator validator,
                IOptions<GoogleOAuthOptions> options,
                JwtConfiguration jwt,
                ILogger<Program> logger,
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

                    return Results.Ok(EndpointHelpers.CreateLoginResponse(user, jwt));
                }
                catch (InvalidOperationException ex)
                {
                    logger.LogWarning(ex, "Google sign-in could not be linked to an ORIM user.");
                    return Results.BadRequest(ex.Message);
                }
            }).AllowAnonymous();

        app.MapPost("/api/auth/refresh", [Authorize] async (HttpContext context, UserService userService, JwtConfiguration jwt) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            var user = await userService.GetByIdAsync(userId);
            if (user is null || !user.IsActive)
                return Results.Unauthorized();

            return Results.Ok(EndpointHelpers.CreateLoginResponse(user, jwt));
        });

        return app;
    }
}
