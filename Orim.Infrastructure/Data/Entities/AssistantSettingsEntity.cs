namespace Orim.Infrastructure.Data.Entities;

public class AssistantSettingsEntity
{
    public int Id { get; set; } = 1;
    public bool IsEnabled { get; set; }
    public string Endpoint { get; set; } = string.Empty;
    public string DeploymentName { get; set; } = "gpt-4.1";
    public string ApiKey { get; set; } = string.Empty;
}
