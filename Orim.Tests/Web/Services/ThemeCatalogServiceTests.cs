using Microsoft.Extensions.Logging;
using NSubstitute;
using Orim.Web.Services;

namespace Orim.Tests.Web.Services;

public class ThemeCatalogServiceTests : IDisposable
{
    private readonly string _tempDir;
    private readonly ILogger<ThemeCatalogService> _logger = Substitute.For<ILogger<ThemeCatalogService>>();
    private readonly ThemeCatalogService _sut;

    public ThemeCatalogServiceTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), $"orim-themes-{Guid.NewGuid()}");
        Directory.CreateDirectory(_tempDir);
        _sut = new ThemeCatalogService(_tempDir, _logger);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
            Directory.Delete(_tempDir, recursive: true);
    }

    [Fact]
    public void CreateDefaultLightTheme_ReturnsProtectedTheme()
    {
        var theme = ThemeCatalogService.CreateDefaultLightTheme();

        Assert.Equal("light", theme.Key);
        Assert.Equal("Light", theme.Name);
        Assert.True(theme.IsProtected);
        Assert.True(theme.IsEnabled);
        Assert.False(theme.IsDarkMode);
    }

    [Fact]
    public void CreateDefaultLightTheme_HasAllRequiredCssVariables()
    {
        var theme = ThemeCatalogService.CreateDefaultLightTheme();

        Assert.NotEmpty(theme.CssVariables);
        Assert.True(theme.CssVariables.Count >= 30);
    }

    [Fact]
    public void CreateDefaultLightTheme_HasPalette()
    {
        var theme = ThemeCatalogService.CreateDefaultLightTheme();

        Assert.NotEmpty(theme.Palette.Primary);
        Assert.NotEmpty(theme.Palette.Background);
        Assert.NotEmpty(theme.Palette.Surface);
        Assert.NotEmpty(theme.Palette.TextPrimary);
    }

    [Fact]
    public void CreateDefaultLightTheme_HasBoardDefaults()
    {
        var theme = ThemeCatalogService.CreateDefaultLightTheme();

        Assert.NotEmpty(theme.BoardDefaults.SurfaceColor);
        Assert.NotEmpty(theme.BoardDefaults.GridColor);
        Assert.NotEmpty(theme.BoardDefaults.SelectionColor);
    }

    [Fact]
    public async Task GetThemesAsync_Empty_ReturnsBuiltInThemes()
    {
        var themes = await _sut.GetThemesAsync();

        Assert.NotNull(themes);
        Assert.Contains(themes, theme => theme.Key == "light");
        Assert.Contains(themes, theme => theme.Key == "dark");
        Assert.Contains(themes, theme => theme.Key == "synthwave");
    }

    [Fact]
    public async Task SaveThemeAsync_NewTheme_CanBeRetrieved()
    {
        var theme = CreateCustomTheme("custom-blue", "Custom Blue");

        var saved = await _sut.SaveThemeAsync(theme);
        var retrieved = await _sut.GetThemeAsync("custom-blue");

        Assert.NotNull(retrieved);
        Assert.Equal("custom-blue", retrieved.Key);
        Assert.Equal("Custom Blue", retrieved.Name);
    }

    [Fact]
    public async Task SaveThemeAsync_ProtectedTheme_Throws()
    {
        var lightTheme = ThemeCatalogService.CreateDefaultLightTheme();
        try { await _sut.SaveThemeAsync(lightTheme); } catch { }

        var modifiedLight = ThemeCatalogService.CreateDefaultLightTheme();
        modifiedLight.Name = "Modified Light";

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _sut.SaveThemeAsync(modifiedLight));
    }

    [Fact]
    public async Task SaveThemeAsync_BuiltInDarkTheme_Throws()
    {
        var modifiedDark = ThemeCatalogService.CreateDefaultDarkTheme();
        modifiedDark.Name = "Modified Dark";

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _sut.SaveThemeAsync(modifiedDark));
    }

    [Fact]
    public async Task DeleteThemeAsync_CustomTheme_Removes()
    {
        var theme = CreateCustomTheme("to-delete", "Delete Me");
        await _sut.SaveThemeAsync(theme);

        await _sut.DeleteThemeAsync("to-delete");

        var result = await _sut.GetThemeAsync("to-delete");
        Assert.Null(result);
    }

    [Fact]
    public async Task DeleteThemeAsync_NonExistent_Throws()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _sut.DeleteThemeAsync("nonexistent"));
    }

    [Fact]
    public async Task GetEnabledThemesAsync_FiltersDisabled()
    {
        var enabledTheme = CreateCustomTheme("enabled", "Enabled");
        enabledTheme.IsEnabled = true;
        await _sut.SaveThemeAsync(enabledTheme);

        var disabledTheme = CreateCustomTheme("disabled", "Disabled");
        disabledTheme.IsEnabled = false;
        await _sut.SaveThemeAsync(disabledTheme);

        var enabled = await _sut.GetEnabledThemesAsync();

        Assert.DoesNotContain(enabled, t => t.Key == "disabled");
    }

    [Fact]
    public async Task SetEnabledAsync_TogglesEnabled()
    {
        var theme = CreateCustomTheme("toggle-me", "Toggle");
        await _sut.SaveThemeAsync(theme);

        await _sut.SetEnabledAsync("toggle-me", false);
        var disabled = await _sut.GetThemeAsync("toggle-me");
        Assert.NotNull(disabled);
        Assert.False(disabled.IsEnabled);

        await _sut.SetEnabledAsync("toggle-me", true);
        var enabled = await _sut.GetThemeAsync("toggle-me");
        Assert.NotNull(enabled);
        Assert.True(enabled.IsEnabled);
    }

    [Fact]
    public async Task SetEnabledAsync_BuiltInTheme_CanBeDisabledAndEnabled()
    {
        await _sut.SetEnabledAsync("synthwave", false);
        var disabled = await _sut.GetThemeAsync("synthwave");

        Assert.NotNull(disabled);
        Assert.False(disabled.IsEnabled);

        await _sut.SetEnabledAsync("synthwave", true);
        var enabled = await _sut.GetThemeAsync("synthwave");

        Assert.NotNull(enabled);
        Assert.True(enabled.IsEnabled);
    }

    [Fact]
    public async Task DeleteThemeAsync_BuiltInTheme_Throws()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _sut.DeleteThemeAsync("dark"));
    }

    [Fact]
    public async Task ExportThemeJsonAsync_ReturnsValidJson()
    {
        var theme = CreateCustomTheme("export-me", "Export");
        await _sut.SaveThemeAsync(theme);

        var json = await _sut.ExportThemeJsonAsync("export-me");

        Assert.NotEmpty(json);
        Assert.Contains("export-me", json);
    }

    [Fact]
    public async Task ExportThemeJsonAsync_NonExistent_Throws()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _sut.ExportThemeJsonAsync("nonexistent"));
    }

    [Fact]
    public async Task ImportThemeAsync_ValidStream_ImportsTheme()
    {
        var theme = CreateCustomTheme("imported", "Imported");
        var json = System.Text.Json.JsonSerializer.Serialize(theme, Orim.Core.OrimJsonOptions.Default);
        using var stream = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(json));

        var imported = await _sut.ImportThemeAsync(stream);

        Assert.Equal("imported", imported.Key);
    }

    [Fact]
    public async Task ImportThemeAsync_MismatchedKey_Throws()
    {
        var theme = CreateCustomTheme("actual-key", "Theme");
        var json = System.Text.Json.JsonSerializer.Serialize(theme, Orim.Core.OrimJsonOptions.Default);
        using var stream = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(json));

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _sut.ImportThemeAsync(stream, "expected-key"));
    }

    [Fact]
    public void ThemeDefinition_Clone_CreatesDeepCopy()
    {
        var original = ThemeCatalogService.CreateDefaultLightTheme();

        var clone = original.Clone();
        clone.Name = "Modified";
        clone.Palette.Primary = "#000000";
        clone.CssVariables["--orim-page-background"] = "changed";

        Assert.Equal("Light", original.Name);
        Assert.NotEqual("#000000", original.Palette.Primary);
        Assert.NotEqual("changed", original.CssVariables["--orim-page-background"]);
    }

    [Fact]
    public async Task GetThemeAsync_ReturnsClone()
    {
        var theme = CreateCustomTheme("clone-test", "Clone Test");
        await _sut.SaveThemeAsync(theme);

        var first = await _sut.GetThemeAsync("clone-test");
        var second = await _sut.GetThemeAsync("clone-test");

        Assert.NotNull(first);
        Assert.NotNull(second);
        Assert.NotSame(first, second);
    }

    private static ThemeDefinition CreateCustomTheme(string key, string name) => new()
    {
        Key = key,
        Name = name,
        IsDarkMode = false,
        IsEnabled = true,
        IsProtected = false,
        Palette = new ThemePaletteDefinition
        {
            Primary = "#6E40C9",
            Secondary = "#1F8A5B",
            Tertiary = "#EA580C",
            AppbarBackground = "#0D1117",
            AppbarText = "#FFFFFF",
            Background = "#F6F8FA",
            Surface = "#FFFFFF",
            DrawerBackground = "#161B22",
            DrawerText = "#C9D1D9",
            DrawerIcon = "#C9D1D9",
            TextPrimary = "#24292F",
            TextSecondary = "#57606A",
            LinesDefault = "#D0D7DE"
        },
        CssVariables = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["--orim-page-background"] = "#f6f8fa",
            ["--orim-body-text"] = "#24292f",
            ["--orim-shell-appbar"] = "#0d1117",
            ["--orim-shell-appbar-text"] = "#ffffff",
            ["--orim-shell-drawer"] = "#161b22",
            ["--orim-shell-drawer-text"] = "#c9d1d9",
            ["--orim-shell-main"] = "#f6f8fa",
            ["--orim-brand"] = "#6e40c9",
            ["--orim-brand-muted"] = "#238636",
            ["--orim-nav-hover"] = "rgba(110, 64, 201, 0.1)",
            ["--orim-card-hover-shadow"] = "0 4px 20px rgba(0,0,0,0.1)",
            ["--orim-login-background"] = "#eef2ff",
            ["--orim-login-card-background"] = "#ffffff",
            ["--orim-login-card-shadow"] = "0 30px 80px rgba(0,0,0,0.1)",
            ["--orim-login-subtitle"] = "#4b5563",
            ["--orim-board-toolbar-bg"] = "#ffffff",
            ["--orim-board-toolbar-border"] = "#e1e4e8",
            ["--orim-board-toolbar-text"] = "#0f172a",
            ["--orim-board-input-bg"] = "#ffffff",
            ["--orim-board-input-border"] = "#d0d7de",
            ["--orim-board-input-text"] = "#0f172a",
            ["--orim-board-muted-text"] = "#667085",
            ["--orim-icon-card-bg"] = "#ffffff",
            ["--orim-icon-card-border"] = "#d0d7de",
            ["--orim-icon-card-text"] = "#475467",
            ["--orim-icon-card-icon"] = "#0f172a",
            ["--orim-properties-panel-bg"] = "#fbfcfe",
            ["--orim-properties-panel-border"] = "#d8dee9",
            ["--orim-properties-muted"] = "#667085",
            ["--orim-properties-input-bg"] = "#ffffff",
            ["--orim-properties-input-border"] = "#b0bec5",
            ["--orim-properties-input-text"] = "#0f172a",
            ["--orim-properties-preview-stroke"] = "#0f172a"
        },
        BoardDefaults = new ThemeBoardDefaults()
    };
}
