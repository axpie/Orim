using System.Text.Json;

namespace Orim.Api.Services;

public sealed class AssistantSettingsService
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly string _filePath;
    private readonly ILogger<AssistantSettingsService> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private AssistantSettingsSnapshot _current;

    public AssistantSettingsService(string filePath, IConfiguration configuration, ILogger<AssistantSettingsService> logger)
    {
        _filePath = filePath;
        _logger = logger;
        _current = CreateInitialSnapshot(configuration);

        var directory = Path.GetDirectoryName(_filePath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        LoadPersistedSettings();
    }

    public AssistantSettingsSnapshot GetSnapshot() => _current with { };

    public AssistantAdminSettings GetAdminSettings()
    {
        var snapshot = GetSnapshot();
        return new AssistantAdminSettings(
            snapshot.IsEnabled,
            snapshot.Endpoint,
            snapshot.DeploymentName,
            !string.IsNullOrWhiteSpace(snapshot.ApiKey),
            snapshot.IsConfigured,
            "Azure OpenAI");
    }

    public async Task<AssistantAdminSettings> UpdateAsync(AssistantSettingsUpdate update, CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            var current = _current;
            var apiKey = string.IsNullOrWhiteSpace(update.ApiKey)
                ? current.ApiKey
                : update.ApiKey.Trim();

            var next = new AssistantSettingsSnapshot(
                update.Enabled,
                update.Endpoint.Trim(),
                string.IsNullOrWhiteSpace(update.DeploymentName) ? "gpt-4.1" : update.DeploymentName.Trim(),
                apiKey);

            Validate(next);

            _current = next;
            await PersistAsync(next, cancellationToken);
            return GetAdminSettings();
        }
        finally
        {
            _gate.Release();
        }
    }

    private static AssistantSettingsSnapshot CreateInitialSnapshot(IConfiguration configuration)
    {
        var endpoint = configuration["AzureOpenAI:Endpoint"]?.Trim() ?? string.Empty;
        var apiKey = configuration["AzureOpenAI:ApiKey"]?.Trim() ?? string.Empty;
        var deploymentName = configuration["AzureOpenAI:DeploymentName"]?.Trim();
        var configuredEnabled = configuration.GetValue<bool?>("AzureOpenAI:Enabled");
        var isEnabled = configuredEnabled ?? (!string.IsNullOrWhiteSpace(endpoint) && !string.IsNullOrWhiteSpace(apiKey));

        return new AssistantSettingsSnapshot(
            isEnabled,
            endpoint,
            string.IsNullOrWhiteSpace(deploymentName) ? "gpt-4.1" : deploymentName,
            apiKey);
    }

    private void LoadPersistedSettings()
    {
        if (!File.Exists(_filePath))
        {
            return;
        }

        try
        {
            var json = File.ReadAllText(_filePath);
            var persisted = JsonSerializer.Deserialize<PersistedAssistantSettings>(json, SerializerOptions);
            if (persisted is null)
            {
                return;
            }

            var snapshot = new AssistantSettingsSnapshot(
                persisted.Enabled,
                persisted.Endpoint?.Trim() ?? string.Empty,
                string.IsNullOrWhiteSpace(persisted.DeploymentName) ? "gpt-4.1" : persisted.DeploymentName.Trim(),
                persisted.ApiKey?.Trim() ?? string.Empty);

            Validate(snapshot);
            _current = snapshot;
        }
        catch (Exception ex) when (ex is IOException or JsonException or InvalidOperationException)
        {
            _logger.LogWarning(ex, "Failed to load persisted assistant settings from {SettingsFilePath}. Using configuration defaults.", _filePath);
        }
    }

    private async Task PersistAsync(AssistantSettingsSnapshot snapshot, CancellationToken cancellationToken)
    {
        var payload = new PersistedAssistantSettings
        {
            Enabled = snapshot.IsEnabled,
            Endpoint = snapshot.Endpoint,
            DeploymentName = snapshot.DeploymentName,
            ApiKey = snapshot.ApiKey,
        };

        await using var stream = File.Create(_filePath);
        await JsonSerializer.SerializeAsync(stream, payload, SerializerOptions, cancellationToken);
    }

    private static void Validate(AssistantSettingsSnapshot snapshot)
    {
        if (!string.IsNullOrWhiteSpace(snapshot.Endpoint))
        {
            if (!Uri.TryCreate(snapshot.Endpoint, UriKind.Absolute, out var uri))
            {
                throw new InvalidOperationException("The Azure OpenAI endpoint must be a valid absolute URL.");
            }

            if (!string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("The Azure OpenAI endpoint must use HTTPS.");
            }
        }

        if (!snapshot.IsEnabled)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(snapshot.Endpoint))
        {
            throw new InvalidOperationException("Provide an Azure OpenAI endpoint before enabling the AI assistant.");
        }

        if (string.IsNullOrWhiteSpace(snapshot.DeploymentName))
        {
            throw new InvalidOperationException("Provide an Azure OpenAI deployment name before enabling the AI assistant.");
        }

        if (string.IsNullOrWhiteSpace(snapshot.ApiKey))
        {
            throw new InvalidOperationException("Provide an Azure OpenAI API key before enabling the AI assistant.");
        }
    }

    private sealed class PersistedAssistantSettings
    {
        public bool Enabled { get; set; }
        public string? Endpoint { get; set; }
        public string? DeploymentName { get; set; }
        public string? ApiKey { get; set; }
    }
}

public sealed record AssistantSettingsSnapshot(
    bool IsEnabled,
    string Endpoint,
    string DeploymentName,
    string ApiKey)
{
    public bool IsConfigured =>
        IsEnabled &&
        !string.IsNullOrWhiteSpace(Endpoint) &&
        !string.IsNullOrWhiteSpace(DeploymentName) &&
        !string.IsNullOrWhiteSpace(ApiKey);
}

public sealed record AssistantSettingsUpdate(
    bool Enabled,
    string Endpoint,
    string DeploymentName,
    string? ApiKey);

public sealed record AssistantAdminSettings(
    bool Enabled,
    string Endpoint,
    string DeploymentName,
    bool HasApiKey,
    bool IsConfigured,
    string Provider);

public sealed record AssistantAvailability(
    bool IsEnabled,
    bool IsConfigured);