namespace Orim.Core.Interfaces;

public interface IAssistantSettingsRepository
{
    Task<AssistantSettingsRecord?> GetAsync();
    Task SaveAsync(AssistantSettingsRecord record);
}

public class AssistantSettingsRecord
{
    public bool IsEnabled { get; set; }
    public string Endpoint { get; set; } = string.Empty;
    public string DeploymentName { get; set; } = "gpt-4.1";
    public string ApiKey { get; set; } = string.Empty;
}
