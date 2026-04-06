namespace Orim.Core.Interfaces;

public interface IThemeRepository
{
    Task<List<ThemeRecord>> GetAllAsync();
    Task<ThemeRecord?> GetByKeyAsync(string key);
    Task SaveAsync(ThemeRecord record);
    Task DeleteAsync(string key);
}

public class ThemeRecord
{
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsDarkMode { get; set; }
    public bool IsEnabled { get; set; } = true;
    public bool IsProtected { get; set; }
    public string DefinitionJson { get; set; } = "{}";
}
