namespace Orim.Api.Services;

public sealed class MicrosoftEntraOptions
{
    public bool Enabled { get; set; }
    public string TenantId { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string? Authority { get; set; }
    public string[] Scopes { get; set; } = ["openid", "profile", "email"];

    public bool IsConfigured =>
        Enabled
        && !string.IsNullOrWhiteSpace(TenantId)
        && !string.IsNullOrWhiteSpace(ClientId);

    public string ResolveAuthority() =>
        !string.IsNullOrWhiteSpace(Authority)
            ? Authority.Trim().TrimEnd('/')
            : $"https://login.microsoftonline.com/{TenantId.Trim()}/v2.0";
}
