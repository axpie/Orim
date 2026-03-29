using System.Text;
using System.Text.Json;
using Orim.Api.Services;
using Orim.Core;

namespace Orim.Tests.Api.Services;

public sealed class ThemeCatalogApiServiceTests : IDisposable
{
    private readonly string _tempDir;
    private readonly ThemeCatalogApiService _sut;

    public ThemeCatalogApiServiceTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), $"orim-api-themes-{Guid.NewGuid()}");
        Directory.CreateDirectory(_tempDir);
        _sut = new ThemeCatalogApiService(_tempDir);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
        {
            Directory.Delete(_tempDir, recursive: true);
        }
    }

    [Fact]
    public async Task GetThemesAsync_Empty_ReturnsBuiltInThemes()
    {
        var themes = await _sut.GetThemesAsync();

        Assert.Contains(themes, theme => theme.Key == "light");
        Assert.Contains(themes, theme => theme.Key == "dark");
        Assert.Contains(themes, theme => theme.Key == "synthwave");
    }

    [Fact]
    public async Task ImportThemeAsync_ValidStream_PersistsTheme()
    {
        var theme = CreateCustomTheme("custom-blue", "Custom Blue");
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(theme, OrimJsonOptions.Default)));

        var imported = await _sut.ImportThemeAsync(stream);
        var reloaded = await _sut.GetThemeAsync("custom-blue");

        Assert.Equal("custom-blue", imported.Key);
        Assert.NotNull(reloaded);
        Assert.Equal("Custom Blue", reloaded!.Name);
    }

    [Fact]
    public async Task SetEnabledAsync_BuiltInTheme_UpdatesState()
    {
        await _sut.SetEnabledAsync("dark", false);
        var disabled = await _sut.GetThemeAsync("dark");

        Assert.NotNull(disabled);
        Assert.False(disabled!.IsEnabled);
    }

    [Fact]
    public async Task DeleteThemeAsync_CustomTheme_RemovesStoredTheme()
    {
        var theme = CreateCustomTheme("to-delete", "Delete Me");
        using (var stream = new MemoryStream(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(theme, OrimJsonOptions.Default))))
        {
            await _sut.ImportThemeAsync(stream);
        }

        await _sut.DeleteThemeAsync("to-delete");
        var reloaded = await _sut.GetThemeAsync("to-delete");

        Assert.Null(reloaded);
    }

    [Fact]
    public void ResolveThemesPath_ReturnsThemesFolderBelowDataPath()
    {
        var path = ThemeCatalogApiService.ResolveThemesPath("d:/orim-data");

        Assert.Equal(Path.Combine("d:/orim-data", "themes"), path);
    }

    private static ApiThemeDefinition CreateCustomTheme(string key, string name) => new()
    {
        Key = key,
        Name = name,
        IsDarkMode = false,
        IsEnabled = true,
        FontFamily = ["Inter", "sans-serif"],
        Palette = new ApiThemePaletteDefinition
        {
            Primary = "#112233",
            Secondary = "#223344",
            Tertiary = "#334455",
            AppbarBackground = "#445566",
            AppbarText = "#ffffff",
            Background = "#f8fafc",
            Surface = "#ffffff",
            DrawerBackground = "#0f172a",
            DrawerText = "#f8fafc",
            DrawerIcon = "#f8fafc",
            TextPrimary = "#0f172a",
            TextSecondary = "#334155",
            LinesDefault = "#cbd5e1",
        },
        CssVariables = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["--orim-page-background"] = "#f8fafc",
        },
        BoardDefaults = new ApiThemeBoardDefaultsDefinition
        {
            SurfaceColor = "#ffffff",
            GridColor = "#e2e8f0",
            ShapeFillColor = "#ffffff",
            StrokeColor = "#0f172a",
            IconColor = "#0f172a",
            SelectionColor = "#2563eb",
            SelectionTintRgb = "37, 99, 235",
            HandleSurfaceColor = "#ffffff",
            DockTargetColor = "#0f766e",
        },
    };
}