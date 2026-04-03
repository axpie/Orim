using Microsoft.AspNetCore.Diagnostics;
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
                var exceptionHandlerFeature = context.Features.Get<IExceptionHandlerFeature>();
                var exception = exceptionHandlerFeature?.Error;
                context.Response.StatusCode = exception switch
                {
                    UnauthorizedAccessException => StatusCodes.Status403Forbidden,
                    KeyNotFoundException => StatusCodes.Status404NotFound,
                    ArgumentException => StatusCodes.Status400BadRequest,
                    _ => StatusCodes.Status500InternalServerError
                };
                await context.Response.WriteAsJsonAsync(new { error = exception?.Message ?? "An unexpected error occurred." });
            });
        });

        app.UseCors();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseDefaultFiles();
        app.UseStaticFiles();

        return app;
    }
}
