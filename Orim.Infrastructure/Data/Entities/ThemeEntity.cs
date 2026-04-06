namespace Orim.Infrastructure.Data.Entities;

public class ThemeEntity
{
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsDarkMode { get; set; }
    public bool IsEnabled { get; set; } = true;
    public bool IsProtected { get; set; }
    public string DefinitionJson { get; set; } = "{}";
}
