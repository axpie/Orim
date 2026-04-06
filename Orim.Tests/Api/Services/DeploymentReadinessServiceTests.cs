using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;
using Orim.Api.Services;
using Orim.Core.Interfaces;
using Orim.Tests.Infrastructure;

namespace Orim.Tests.Api.Services;

public sealed class DeploymentReadinessServiceTests
{
    [Fact]
    public async Task GetSnapshotAsync_ProductionWithConfiguredIntegrations_ReturnsConfiguredSignals()
    {
        using var dbContext = TestDbContextFactory.Create();
        var sut = CreateSut(
            environmentName: "Production",
            microsoftOptions: new MicrosoftEntraOptions
            {
                Enabled = true,
                TenantId = "tenant-id",
                ClientId = "microsoft-client"
            },
            googleOptions: new GoogleOAuthOptions
            {
                Enabled = true,
                ClientId = "google-client"
            },
            configurationValues: new Dictionary<string, string?>(),
            assistantSettings: new AssistantSettingsRecord
            {
                IsEnabled = true,
                Endpoint = "https://example.openai.azure.com/",
                ApiKey = "secret-key",
                DeploymentName = "gpt-4.1"
            });

        var snapshot = await sut.GetSnapshotAsync(dbContext);

        Assert.Equal("Production", snapshot.EnvironmentName);
        Assert.True(snapshot.DatabaseConnected);
        Assert.False(snapshot.IsRelationalDatabase);
        Assert.Equal(0, snapshot.PendingMigrationCount);
        Assert.True(snapshot.HstsEnabled);
        Assert.True(snapshot.RequestIdHeaderEnabled);
        Assert.True(snapshot.RateLimitingEnabled);
        Assert.True(snapshot.CookieAuthEnabled);
        Assert.True(snapshot.MicrosoftSsoConfigured);
        Assert.True(snapshot.GoogleSsoConfigured);
        Assert.True(snapshot.AssistantEnabled);
        Assert.True(snapshot.AssistantConfigured);
        Assert.True(snapshot.EnabledThemeCount >= 3);
        Assert.True(snapshot.TotalThemeCount >= snapshot.EnabledThemeCount);
        Assert.Equal(["/health/live", "/health/ready"], snapshot.HealthEndpoints);
    }

    [Fact]
    public async Task GetSnapshotAsync_LegacyAssistantConfigWithoutDatabaseRecord_DoesNotEnableAssistant()
    {
        using var dbContext = TestDbContextFactory.Create();
        var sut = CreateSut(
            environmentName: "Development",
            microsoftOptions: new MicrosoftEntraOptions(),
            googleOptions: new GoogleOAuthOptions(),
            configurationValues: new Dictionary<string, string?>
            {
                ["AzureOpenAI:Enabled"] = "true",
                ["AzureOpenAI:Endpoint"] = "https://example.openai.azure.com/",
                ["AzureOpenAI:ApiKey"] = "secret-key",
                ["AzureOpenAI:DeploymentName"] = "gpt-4.1"
            });

        var snapshot = await sut.GetSnapshotAsync(dbContext);

        Assert.False(snapshot.AssistantEnabled);
        Assert.False(snapshot.AssistantConfigured);
    }

    [Fact]
    public async Task GetSnapshotAsync_DevelopmentWithoutOptionalIntegrations_ReturnsExpectedGaps()
    {
        using var dbContext = TestDbContextFactory.Create();
        var sut = CreateSut(
            environmentName: "Development",
            microsoftOptions: new MicrosoftEntraOptions(),
            googleOptions: new GoogleOAuthOptions(),
            configurationValues: new Dictionary<string, string?>());

        var snapshot = await sut.GetSnapshotAsync(dbContext);

        Assert.Equal("Development", snapshot.EnvironmentName);
        Assert.False(snapshot.HstsEnabled);
        Assert.False(snapshot.MicrosoftSsoConfigured);
        Assert.False(snapshot.GoogleSsoConfigured);
        Assert.False(snapshot.AssistantEnabled);
        Assert.False(snapshot.AssistantConfigured);
        Assert.True(snapshot.CookieAuthEnabled);
        Assert.True(snapshot.EnabledThemeCount >= 3);
    }

    private static DeploymentReadinessService CreateSut(
        string environmentName,
        MicrosoftEntraOptions microsoftOptions,
        GoogleOAuthOptions googleOptions,
        IDictionary<string, string?> configurationValues,
        AssistantSettingsRecord? assistantSettings = null)
    {
        var services = new ServiceCollection();
        services.AddSingleton<IThemeRepository, InMemoryThemeRepository>();
        services.AddSingleton<IAssistantSettingsRepository>(new InMemoryAssistantSettingsRepository(assistantSettings));

        var provider = services.BuildServiceProvider();
        var scopeFactory = provider.GetRequiredService<IServiceScopeFactory>();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(configurationValues)
            .Build();

        var assistantSettingsService = new AssistantSettingsService(
            scopeFactory,
            NullLogger<AssistantSettingsService>.Instance);
        var themeCatalogService = new ThemeCatalogApiService(
            scopeFactory,
            NullLogger<ThemeCatalogApiService>.Instance);

        var environment = Substitute.For<IHostEnvironment>();
        environment.EnvironmentName.Returns(environmentName);

        return new DeploymentReadinessService(
            environment,
            configuration,
            Options.Create(microsoftOptions),
            Options.Create(googleOptions),
            assistantSettingsService,
            themeCatalogService);
    }

    private sealed class InMemoryThemeRepository : IThemeRepository
    {
        private readonly Dictionary<string, ThemeRecord> _themes = new(StringComparer.Ordinal);

        public Task<List<ThemeRecord>> GetAllAsync() =>
            Task.FromResult(_themes.Values.ToList());

        public Task<ThemeRecord?> GetByKeyAsync(string key) =>
            Task.FromResult(_themes.TryGetValue(key, out var record) ? record : null);

        public Task SaveAsync(ThemeRecord record)
        {
            _themes[record.Key] = record;
            return Task.CompletedTask;
        }

        public Task DeleteAsync(string key)
        {
            _themes.Remove(key);
            return Task.CompletedTask;
        }
    }

    private sealed class InMemoryAssistantSettingsRepository : IAssistantSettingsRepository
    {
        private AssistantSettingsRecord? _current;

        public InMemoryAssistantSettingsRepository(AssistantSettingsRecord? current = null)
        {
            _current = current;
        }

        public Task<AssistantSettingsRecord?> GetAsync() =>
            Task.FromResult(_current);

        public Task SaveAsync(AssistantSettingsRecord record)
        {
            _current = record;
            return Task.CompletedTask;
        }
    }
}
