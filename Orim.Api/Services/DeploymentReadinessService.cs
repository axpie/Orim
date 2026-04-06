using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Orim.Api.Contracts;
using Orim.Infrastructure.Data;

namespace Orim.Api.Services;

public sealed class DeploymentReadinessService
{
    private static readonly string[] HealthEndpoints = ["/health/live", "/health/ready"];

    private readonly IHostEnvironment _environment;
    private readonly IConfiguration _configuration;
    private readonly IOptions<MicrosoftEntraOptions> _microsoftOptions;
    private readonly IOptions<GoogleOAuthOptions> _googleOptions;
    private readonly AssistantSettingsService _assistantSettingsService;
    private readonly ThemeCatalogApiService _themeCatalogService;

    public DeploymentReadinessService(
        IHostEnvironment environment,
        IConfiguration configuration,
        IOptions<MicrosoftEntraOptions> microsoftOptions,
        IOptions<GoogleOAuthOptions> googleOptions,
        AssistantSettingsService assistantSettingsService,
        ThemeCatalogApiService themeCatalogService)
    {
        _environment = environment;
        _configuration = configuration;
        _microsoftOptions = microsoftOptions;
        _googleOptions = googleOptions;
        _assistantSettingsService = assistantSettingsService;
        _themeCatalogService = themeCatalogService;
    }

    public async Task<DeploymentReadinessResponse> GetSnapshotAsync(
        OrimDbContext dbContext,
        CancellationToken cancellationToken = default)
    {
        var databaseConnected = await dbContext.Database.CanConnectAsync(cancellationToken);
        var isRelationalDatabase = dbContext.Database.IsRelational();
        var pendingMigrationCount = 0;
        if (isRelationalDatabase)
        {
            pendingMigrationCount = (await dbContext.Database.GetPendingMigrationsAsync(cancellationToken)).Count();
        }

        var themes = await _themeCatalogService.GetThemesAsync();
        var assistantSettings = _assistantSettingsService.GetAdminSettings();

        var redisConnection = _configuration.GetConnectionString("Redis");
        var redisConfigured = !string.IsNullOrEmpty(redisConnection);

        return new DeploymentReadinessResponse(
            EnvironmentName: _environment.EnvironmentName,
            ApplicationVersion: ResolveApplicationVersion(),
            DatabaseProvider: dbContext.Database.ProviderName ?? "unknown",
            IsRelationalDatabase: isRelationalDatabase,
            DatabaseConnected: databaseConnected,
            PendingMigrationCount: pendingMigrationCount,
            HttpsRedirectionEnabled: true,
            HstsEnabled: !_environment.IsDevelopment(),
            RequestIdHeaderEnabled: true,
            RateLimitingEnabled: true,
            CookieAuthEnabled: true,
            MicrosoftSsoConfigured: _microsoftOptions.Value.IsConfigured,
            GoogleSsoConfigured: _googleOptions.Value.IsConfigured,
            AssistantEnabled: assistantSettings.Enabled,
            AssistantConfigured: assistantSettings.IsConfigured,
            EnabledThemeCount: themes.Count(theme => theme.IsEnabled),
            TotalThemeCount: themes.Count,
            RedisConfigured: redisConfigured,
            HealthEndpoints: HealthEndpoints);
    }

    private static string ResolveApplicationVersion()
    {
        var assembly = Assembly.GetEntryAssembly() ?? typeof(DeploymentReadinessService).Assembly;
        var informationalVersion = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
        if (!string.IsNullOrWhiteSpace(informationalVersion))
        {
            return informationalVersion.Split('+', 2)[0];
        }

        return assembly.GetName().Version?.ToString() ?? "unknown";
    }
}
