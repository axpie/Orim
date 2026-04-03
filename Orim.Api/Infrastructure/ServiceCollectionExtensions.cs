using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Orim.Api.Services;
using Orim.Core.Services;
using Orim.Infrastructure;

namespace Orim.Api.Infrastructure;

internal static class ServiceCollectionExtensions
{
    internal static IServiceCollection AddOrimAuthentication(this IServiceCollection services, IConfiguration configuration)
    {
        var jwtKey = configuration[ConfigurationKeys.JwtKey]?.Trim();
        if (string.IsNullOrWhiteSpace(jwtKey))
        {
            throw new InvalidOperationException(
                "Jwt:Key is not configured. Set Jwt__Key in Azure App Service application settings or provide it via an Azure Key Vault reference before startup.");
        }

        if (Encoding.UTF8.GetByteCount(jwtKey) < 32)
        {
            throw new InvalidOperationException(
                "Jwt:Key is too short. Configure Jwt__Key with at least 32 characters for HMAC-SHA256 signing.");
        }

        var jwtIssuer = configuration[ConfigurationKeys.JwtIssuer] ?? "OrimApi";
        var jwtAudience = configuration[ConfigurationKeys.JwtAudience] ?? "OrimSpa";
        var jwtExpiryMinutes = configuration.GetValue(ConfigurationKeys.JwtExpiryMinutes, 480);

        services.AddSingleton(new JwtConfiguration(jwtKey, jwtIssuer, jwtAudience, jwtExpiryMinutes));

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = jwtIssuer,
                    ValidAudience = jwtAudience,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
                };

                options.Events = new JwtBearerEvents
                {
                    OnMessageReceived = context =>
                    {
                        var accessToken = context.Request.Query["access_token"];
                        var path = context.HttpContext.Request.Path;
                        if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
                        {
                            context.Token = accessToken;
                        }

                        return Task.CompletedTask;
                    },
                    OnTokenValidated = async context =>
                    {
                        var principal = context.Principal;
                        var userIdClaim = principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                        if (!Guid.TryParse(userIdClaim, out var userId))
                        {
                            context.Fail("The token does not contain a valid user identifier.");
                            return;
                        }

                        var userService = context.HttpContext.RequestServices.GetRequiredService<UserService>();
                        var user = await userService.GetByIdAsync(userId);
                        if (user is null || !user.IsActive)
                        {
                            context.Fail("The user account is no longer active.");
                            return;
                        }

                        if (principal?.Identity is ClaimsIdentity identity)
                        {
                            EndpointHelpers.ReplaceClaim(identity, ClaimTypes.Name, user.Username);
                            EndpointHelpers.ReplaceClaim(identity, ClaimTypes.Role, user.Role.ToString());
                        }
                    }
                };
            });

        services.AddAuthorization();

        return services;
    }

    internal static IServiceCollection AddOrimCors(this IServiceCollection services, IConfiguration configuration)
    {
        var allowedOrigins = configuration.GetSection(ConfigurationKeys.CorsAllowedOrigins).Get<string[]>()
            ?? ["http://localhost:5173"];

        services.AddCors(options =>
        {
            options.AddDefaultPolicy(policy =>
            {
                policy.WithOrigins(allowedOrigins)
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials();
            });
        });

        return services;
    }

    internal static IServiceCollection AddOrimServices(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration[ConfigurationKeys.ConnectionStrings]
            ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection is not configured.");

        services.AddOrimInfrastructure(connectionString);

        services.AddSingleton(sp => new AssistantSettingsService(
            sp.GetRequiredService<IServiceScopeFactory>(),
            configuration,
            sp.GetRequiredService<ILogger<AssistantSettingsService>>()));
        services.AddSingleton<DiagramAssistantService>();
        services.AddSingleton<ThemeCatalogApiService>();
        services.AddSingleton<BoardPdfExportService>();
        services.AddSingleton<BoardCommentNotifier>();
        services.AddScoped<BoardCommentService>();

        services.Configure<MicrosoftEntraOptions>(configuration.GetSection("Authentication:Microsoft"));
        services.AddSingleton<MicrosoftIdentityTokenValidator>();
        services.Configure<GoogleOAuthOptions>(configuration.GetSection("Authentication:Google"));
        services.AddSingleton<IGoogleTokenVerifier, GoogleTokenVerifier>();
        services.AddSingleton<GoogleIdentityTokenValidator>();

        services.AddSignalR().AddJsonProtocol(options =>
        {
            options.PayloadSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
            options.PayloadSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
        });

        services.ConfigureHttpJsonOptions(options =>
        {
            options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
            options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
        });

        return services;
    }
}
