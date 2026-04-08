using System.Security.Claims;
using System.Threading.RateLimiting;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpLogging;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;
using Orim.Api.Services;
using Orim.Core.Interfaces;
using Orim.Core.Services;
using Orim.Infrastructure;
using StackExchange.Redis;

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
                        var cookieToken = context.Request.Cookies[EndpointHelpers.AuthCookieName];
                        if (!string.IsNullOrWhiteSpace(cookieToken))
                        {
                            context.Token = cookieToken;
                            return Task.CompletedTask;
                        }

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
            ?? [];

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
        services.AddHttpLogging(options =>
        {
            options.LoggingFields =
                HttpLoggingFields.RequestMethod
                | HttpLoggingFields.RequestPath
                | HttpLoggingFields.ResponseStatusCode
                | HttpLoggingFields.Duration;
        });
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = static async (context, cancellationToken) =>
            {
                if (!context.HttpContext.Response.HasStarted)
                {
                    await context.HttpContext.Response.WriteAsJsonAsync(
                        EndpointHelpers.CreateErrorPayload(context.HttpContext, "Too many requests. Please try again later."),
                        cancellationToken: cancellationToken);
                }
            };

            options.AddPolicy("auth", httpContext =>
            {
                var partitionKey = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey,
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 5,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0,
                        QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                        AutoReplenishment = true
                    });
            });

        });

        services.AddSingleton(sp => new AssistantSettingsService(
            sp.GetRequiredService<IServiceScopeFactory>(),
            sp.GetRequiredService<ILogger<AssistantSettingsService>>()));
        services.AddSingleton<DiagramAssistantService>();
        services.AddSingleton<ThemeCatalogApiService>();
        services.AddSingleton<AuditLogger>();
        services.AddSingleton<DeploymentReadinessService>();
services.AddSingleton<BoardChangeNotifier>();
        services.AddSingleton<BoardPresenceService>();

        services.Configure<MicrosoftEntraOptions>(configuration.GetSection("Authentication:Microsoft"));
        services.AddSingleton<MicrosoftIdentityTokenValidator>();
        services.Configure<GoogleOAuthOptions>(configuration.GetSection("Authentication:Google"));
        services.AddSingleton<IGoogleTokenVerifier, GoogleTokenVerifier>();
        services.AddSingleton<GoogleIdentityTokenValidator>();

        var signalRBuilder = services.AddSignalR().AddJsonProtocol(options =>
        {
            options.PayloadSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
            options.PayloadSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
        });

        var redisConnection = configuration.GetConnectionString("Redis");
        if (!string.IsNullOrEmpty(redisConnection))
        {
            signalRBuilder.AddStackExchangeRedis(redisConnection, options =>
            {
                options.Configuration.ChannelPrefix = StackExchange.Redis.RedisChannel.Literal("orim");
            });

            services.AddSingleton<IConnectionMultiplexer>(_ =>
            {
                var redisOptions = ConfigurationOptions.Parse(redisConnection);
                redisOptions.AbortOnConnectFail = false;
                redisOptions.ClientName = "orim";
                return ConnectionMultiplexer.Connect(redisOptions);
            });
            services.AddSingleton<IBoardPresenceService, RedisBoardPresenceService>();
        }
        else
        {
            services.AddSingleton<IBoardPresenceService>(sp => sp.GetRequiredService<BoardPresenceService>());
        }

        services.AddSingleton<IBoardChangeNotifier, SignalRBoardChangeNotifier>();

        services.ConfigureHttpJsonOptions(options =>
        {
            options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
            options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
        });

        return services;
    }

    internal static IServiceCollection AddOrimTelemetry(this IServiceCollection services, IConfiguration configuration)
    {
        var telemetryEnabled = configuration.GetValue<bool>("Telemetry:Enabled", false);
        if (!telemetryEnabled)
            return services;

        services.AddOpenTelemetry()
            .WithTracing(builder => builder
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation()
                .AddConsoleExporter())
            .WithMetrics(builder => builder
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation()
                .AddConsoleExporter());

        return services;
    }
}
