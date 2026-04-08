using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.HttpLogging;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Orim.Api.Services;
using Orim.Core.Models;
using Orim.Core.Services;
using Orim.Infrastructure.Data;

namespace Orim.Api.Infrastructure;

internal static class WebApplicationExtensions
{
    internal static async Task InitializeDatabaseAsync(this WebApplication app)
    {
#if DEBUG
        await DockerDevEnvironment.EnsurePostgresRunningAsync(app.Logger);
#endif

        using (var scope = app.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<OrimDbContext>();
            await dbContext.Database.MigrateAsync();
        }

        var themeCatalogService = app.Services.GetRequiredService<ThemeCatalogApiService>();
        await themeCatalogService.EnsureBuiltInThemesAsync();

        using (var scope = app.Services.CreateScope())
        {
            var userService = scope.ServiceProvider.GetRequiredService<UserService>();
            var seedUsername = app.Configuration.GetValue<string>(ConfigurationKeys.SeedAdminUsername) ?? "admin";
            var seedPassword = app.Configuration.GetValue<string>(ConfigurationKeys.SeedAdminPassword);
            var resetPasswordOnStartup = app.Configuration.GetValue<bool>(ConfigurationKeys.SeedAdminResetPasswordOnStartup);
            var existingAdmin = await userService.GetByUsernameAsync(seedUsername);

            if (existingAdmin is null && !string.IsNullOrWhiteSpace(seedPassword))
            {
                await userService.CreateUserAsync(seedUsername, seedPassword, UserRole.Admin);
                app.Logger.LogInformation("Seeded initial admin user '{Username}'.", seedUsername);
            }
            else if (existingAdmin is not null && resetPasswordOnStartup && !string.IsNullOrWhiteSpace(seedPassword))
            {
                await userService.SetPasswordAsync(existingAdmin.Id, seedPassword);
                app.Logger.LogWarning("Admin password for '{Username}' was reset.", seedUsername);
            }
        }
    }

    internal static WebApplication UseOrimMiddleware(this WebApplication app)
    {
        app.UseExceptionHandler(exceptionHandlerApp =>
        {
            exceptionHandlerApp.Run(async context =>
            {
                var logger = context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("Orim.Api.ExceptionHandler");
                var exceptionHandlerFeature = context.Features.Get<IExceptionHandlerFeature>();
                var exception = exceptionHandlerFeature?.Error;
                var (statusCode, publicMessage, logLevel) = exception switch
                {
                    UnauthorizedAccessException => (StatusCodes.Status403Forbidden, "Access denied.", LogLevel.Warning),
                    KeyNotFoundException => (StatusCodes.Status404NotFound, "The requested resource was not found.", LogLevel.Warning),
                    ArgumentException => (StatusCodes.Status400BadRequest, "The request was invalid.", LogLevel.Warning),
                    _ => (StatusCodes.Status500InternalServerError, "An unexpected error occurred.", LogLevel.Error)
                };

                if (exception is not null)
                {
                    logger.Log(logLevel, exception, "Unhandled exception for request {RequestId}.", context.TraceIdentifier);
                }

                context.Response.StatusCode = statusCode;
                await context.Response.WriteAsJsonAsync(EndpointHelpers.CreateErrorPayload(context, publicMessage));
            });
        });

        app.UseHttpsRedirection();

        if (!app.Environment.IsDevelopment())
        {
            app.UseHsts();
        }

        app.Use(async (context, next) =>
        {
            context.Response.OnStarting(() =>
            {
                var headers = context.Response.Headers;
                headers.TryAdd("X-Request-Id", context.TraceIdentifier);
                headers.TryAdd("X-Content-Type-Options", "nosniff");
                headers.TryAdd("X-Frame-Options", "DENY");
                headers.TryAdd("Referrer-Policy", "strict-origin-when-cross-origin");
                headers.TryAdd("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
                headers.TryAdd("Content-Security-Policy",
                    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' wss:; font-src 'self' data:; frame-ancestors 'none'");
                return Task.CompletedTask;
            });

            await next();
        });

        app.UseHttpLogging();
        app.UseCors();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseRateLimiter();
        app.UseDefaultFiles();
        app.UseStaticFiles();

        return app;
    }
}
