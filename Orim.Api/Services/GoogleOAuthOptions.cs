namespace Orim.Api.Services;

public sealed class GoogleOAuthOptions
{
    public bool Enabled { get; set; }
    public string ClientId { get; set; } = string.Empty;
    public string? HostedDomain { get; set; }

    public bool IsConfigured =>
        Enabled
        && !string.IsNullOrWhiteSpace(ClientId);
}
