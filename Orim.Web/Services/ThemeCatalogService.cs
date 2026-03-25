using System.Text.Json;
using Microsoft.Extensions.Logging;
using Orim.Core;

namespace Orim.Web.Services;

public sealed class ThemeDefinition
{
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsDarkMode { get; set; }
    public bool IsEnabled { get; set; } = true;
    public bool IsProtected { get; set; }
    public List<string> FontFamily { get; set; } = ["Inter", "system-ui", "-apple-system", "sans-serif"];
    public ThemePaletteDefinition Palette { get; set; } = new();
    public Dictionary<string, string> CssVariables { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public ThemeBoardDefaults BoardDefaults { get; set; } = new();

    public ThemeDefinition Clone() => new()
    {
        Key = Key,
        Name = Name,
        IsDarkMode = IsDarkMode,
        IsEnabled = IsEnabled,
        IsProtected = IsProtected,
        FontFamily = [.. FontFamily],
        Palette = Palette.Clone(),
        CssVariables = CssVariables.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.OrdinalIgnoreCase),
        BoardDefaults = BoardDefaults.Clone()
    };
}

public sealed class ThemePaletteDefinition
{
    public string Primary { get; set; } = string.Empty;
    public string Secondary { get; set; } = string.Empty;
    public string Tertiary { get; set; } = string.Empty;
    public string AppbarBackground { get; set; } = string.Empty;
    public string AppbarText { get; set; } = string.Empty;
    public string Background { get; set; } = string.Empty;
    public string Surface { get; set; } = string.Empty;
    public string DrawerBackground { get; set; } = string.Empty;
    public string DrawerText { get; set; } = string.Empty;
    public string DrawerIcon { get; set; } = string.Empty;
    public string TextPrimary { get; set; } = string.Empty;
    public string TextSecondary { get; set; } = string.Empty;
    public string LinesDefault { get; set; } = string.Empty;
    public string? Success { get; set; }
    public string? Warning { get; set; }
    public string? Info { get; set; }

    public ThemePaletteDefinition Clone() => new()
    {
        Primary = Primary,
        Secondary = Secondary,
        Tertiary = Tertiary,
        AppbarBackground = AppbarBackground,
        AppbarText = AppbarText,
        Background = Background,
        Surface = Surface,
        DrawerBackground = DrawerBackground,
        DrawerText = DrawerText,
        DrawerIcon = DrawerIcon,
        TextPrimary = TextPrimary,
        TextSecondary = TextSecondary,
        LinesDefault = LinesDefault,
        Success = Success,
        Warning = Warning,
        Info = Info
    };
}

public sealed class ThemeBoardDefaults
{
    public string SurfaceColor { get; set; } = "#FFFFFF";
    public string GridColor { get; set; } = "#EEF2F7";
    public string ShapeFillColor { get; set; } = "#FFFFFF";
    public string StrokeColor { get; set; } = "#0F172A";
    public string IconColor { get; set; } = "#0F172A";
    public string SelectionColor { get; set; } = "#2563EB";
    public string SelectionTintRgb { get; set; } = "37, 99, 235";
    public string HandleSurfaceColor { get; set; } = "#FFFFFF";
    public string DockTargetColor { get; set; } = "#0F766E";

    public ThemeBoardDefaults Clone() => new()
    {
        SurfaceColor = SurfaceColor,
        GridColor = GridColor,
        ShapeFillColor = ShapeFillColor,
        StrokeColor = StrokeColor,
        IconColor = IconColor,
        SelectionColor = SelectionColor,
        SelectionTintRgb = SelectionTintRgb,
        HandleSurfaceColor = HandleSurfaceColor,
        DockTargetColor = DockTargetColor
    };
}

public sealed class ThemeCatalogService
{
    private static readonly string[] RequiredCssVariables =
    [
        "--orim-page-background",
        "--orim-body-text",
        "--orim-shell-appbar",
        "--orim-shell-appbar-text",
        "--orim-shell-drawer",
        "--orim-shell-drawer-text",
        "--orim-shell-main",
        "--orim-brand",
        "--orim-brand-muted",
        "--orim-nav-hover",
        "--orim-card-hover-shadow",
        "--orim-login-background",
        "--orim-login-card-background",
        "--orim-login-card-shadow",
        "--orim-login-subtitle",
        "--orim-board-toolbar-bg",
        "--orim-board-toolbar-border",
        "--orim-board-toolbar-text",
        "--orim-board-input-bg",
        "--orim-board-input-border",
        "--orim-board-input-text",
        "--orim-board-muted-text",
        "--orim-icon-card-bg",
        "--orim-icon-card-border",
        "--orim-icon-card-text",
        "--orim-icon-card-icon",
        "--orim-properties-panel-bg",
        "--orim-properties-panel-border",
        "--orim-properties-muted",
        "--orim-properties-input-bg",
        "--orim-properties-input-border",
        "--orim-properties-input-text",
        "--orim-properties-preview-stroke"
    ];

    private readonly string _themesPath;
    private readonly ILogger<ThemeCatalogService> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private List<ThemeDefinition>? _cache;

    public ThemeCatalogService(string themesPath, ILogger<ThemeCatalogService> logger)
    {
        _themesPath = themesPath;
        _logger = logger;
    }

    public async Task<IReadOnlyList<ThemeDefinition>> GetThemesAsync()
    {
        var themes = await EnsureCacheAsync();
        return themes.Select(theme => theme.Clone()).ToList();
    }

    public async Task<IReadOnlyList<ThemeDefinition>> GetEnabledThemesAsync()
    {
        var themes = await EnsureCacheAsync();
        return themes
            .Where(theme => theme.IsEnabled)
            .Select(theme => theme.Clone())
            .ToList();
    }

    public async Task<ThemeDefinition?> GetThemeAsync(string key)
    {
        var themes = await EnsureCacheAsync();
        var normalizedKey = NormalizeKey(key);
        return themes.FirstOrDefault(theme => theme.Key == normalizedKey)?.Clone();
    }

    public async Task<ThemeDefinition> ImportThemeAsync(Stream stream, string? expectedKey = null)
    {
        var importedTheme = await JsonSerializer.DeserializeAsync<ThemeDefinition>(stream, OrimJsonOptions.Default);
        if (importedTheme is null)
        {
            throw new InvalidOperationException("The uploaded theme JSON could not be read.");
        }

        if (!string.IsNullOrWhiteSpace(expectedKey)
            && !string.Equals(NormalizeKey(importedTheme.Key), NormalizeKey(expectedKey), StringComparison.Ordinal))
        {
            throw new InvalidOperationException("The uploaded theme key does not match the selected theme.");
        }

        return await SaveThemeAsync(importedTheme);
    }

    public async Task<ThemeDefinition> SaveThemeAsync(ThemeDefinition theme)
    {
        await _gate.WaitAsync();
        try
        {
            var themes = await EnsureCacheCoreAsync();
            var normalizedTheme = NormalizeAndValidate(theme);
            var existingTheme = themes.FirstOrDefault(candidate => candidate.Key == normalizedTheme.Key);

            if (existingTheme?.IsProtected == true)
            {
                throw new InvalidOperationException("The default light theme is protected and cannot be changed.");
            }

            themes.RemoveAll(candidate => candidate.Key == normalizedTheme.Key);
            themes.Add(normalizedTheme);
            SortThemes(themes);
            await WriteThemeFileAsync(normalizedTheme);
            _cache = themes;
            return normalizedTheme.Clone();
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task SetEnabledAsync(string key, bool enabled)
    {
        await _gate.WaitAsync();
        try
        {
            var themes = await EnsureCacheCoreAsync();
            var normalizedKey = NormalizeKey(key);
            var theme = themes.FirstOrDefault(candidate => candidate.Key == normalizedKey)
                ?? throw new InvalidOperationException("The selected theme does not exist.");

            if (theme.IsProtected)
            {
                throw new InvalidOperationException("The default light theme is protected and cannot be changed.");
            }

            theme.IsEnabled = enabled;
            await WriteThemeFileAsync(theme);
            SortThemes(themes);
            _cache = themes;
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task DeleteThemeAsync(string key)
    {
        await _gate.WaitAsync();
        try
        {
            var themes = await EnsureCacheCoreAsync();
            var normalizedKey = NormalizeKey(key);
            var theme = themes.FirstOrDefault(candidate => candidate.Key == normalizedKey)
                ?? throw new InvalidOperationException("The selected theme does not exist.");

            if (theme.IsProtected)
            {
                throw new InvalidOperationException("The default light theme is protected and cannot be deleted.");
            }

            themes.RemoveAll(candidate => candidate.Key == normalizedKey);
            var filePath = GetThemeFilePath(normalizedKey);
            if (File.Exists(filePath))
            {
                File.Delete(filePath);
            }

            SortThemes(themes);
            _cache = themes;
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<string> ExportThemeJsonAsync(string key)
    {
        var theme = await GetThemeAsync(key)
            ?? throw new InvalidOperationException("The selected theme does not exist.");
        return JsonSerializer.Serialize(theme, OrimJsonOptions.Indented);
    }

    public static ThemeDefinition CreateDefaultLightTheme() => new()
    {
        Key = "light",
        Name = "Light",
        IsDarkMode = false,
        IsEnabled = true,
        IsProtected = true,
        FontFamily = ["Inter", "system-ui", "-apple-system", "sans-serif"],
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
            ["--orim-shell-appbar"] = "linear-gradient(135deg, #0d1117 0%, #151c29 100%)",
            ["--orim-shell-appbar-text"] = "#ffffff",
            ["--orim-shell-drawer"] = "#161b22",
            ["--orim-shell-drawer-text"] = "#c9d1d9",
            ["--orim-shell-main"] = "#f6f8fa",
            ["--orim-brand"] = "#6e40c9",
            ["--orim-brand-muted"] = "#238636",
            ["--orim-nav-hover"] = "rgba(110, 64, 201, 0.1)",
            ["--orim-card-hover-shadow"] = "0 4px 20px rgba(110, 64, 201, 0.15)",
            ["--orim-login-background"] = "linear-gradient(135deg, #eef2ff 0%, #f8fafc 45%, #e9d5ff 100%)",
            ["--orim-login-card-background"] = "rgba(255, 255, 255, 0.92)",
            ["--orim-login-card-shadow"] = "0 30px 80px rgba(79, 70, 229, 0.16)",
            ["--orim-login-subtitle"] = "#4b5563",
            ["--orim-board-toolbar-bg"] = "rgba(255, 255, 255, 0.92)",
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
        BoardDefaults = new ThemeBoardDefaults
        {
            SurfaceColor = "#FFFFFF",
            GridColor = "#EEF2F7",
            ShapeFillColor = "#FFFFFF",
            StrokeColor = "#0F172A",
            IconColor = "#0F172A",
            SelectionColor = "#2563EB",
            SelectionTintRgb = "37, 99, 235",
            HandleSurfaceColor = "#FFFFFF",
            DockTargetColor = "#0F766E"
        }
    };

    public static ThemeDefinition CreateDefaultDarkTheme() => new()
    {
        Key = "dark",
        Name = "Dark",
        IsDarkMode = true,
        IsEnabled = true,
        IsProtected = false,
        FontFamily = ["Inter", "system-ui", "-apple-system", "sans-serif"],
        Palette = new ThemePaletteDefinition
        {
            Primary = "#8B5CF6",
            Secondary = "#22C55E",
            Tertiary = "#38BDF8",
            AppbarBackground = "#0B1220",
            AppbarText = "#F8FAFC",
            Background = "#09111F",
            Surface = "#121A2B",
            DrawerBackground = "#0F172A",
            DrawerText = "#D7E0F2",
            DrawerIcon = "#D7E0F2",
            TextPrimary = "#E5EEF9",
            TextSecondary = "#94A3B8",
            LinesDefault = "#24324A"
        },
        CssVariables = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["--orim-page-background"] = "#09111f",
            ["--orim-body-text"] = "#e5eef9",
            ["--orim-shell-appbar"] = "linear-gradient(135deg, #0b1220 0%, #111b2e 100%)",
            ["--orim-shell-appbar-text"] = "#f8fafc",
            ["--orim-shell-drawer"] = "#0f172a",
            ["--orim-shell-drawer-text"] = "#d7e0f2",
            ["--orim-shell-main"] = "#09111f",
            ["--orim-brand"] = "#8b5cf6",
            ["--orim-brand-muted"] = "#22c55e",
            ["--orim-nav-hover"] = "rgba(139, 92, 246, 0.14)",
            ["--orim-card-hover-shadow"] = "0 10px 28px rgba(139, 92, 246, 0.18)",
            ["--orim-login-background"] = "linear-gradient(135deg, #07101d 0%, #0f172a 55%, #172554 100%)",
            ["--orim-login-card-background"] = "rgba(18, 26, 43, 0.88)",
            ["--orim-login-card-shadow"] = "0 34px 90px rgba(3, 7, 18, 0.45)",
            ["--orim-login-subtitle"] = "#a8b4c8",
            ["--orim-board-toolbar-bg"] = "rgba(18, 26, 43, 0.88)",
            ["--orim-board-toolbar-border"] = "#24324a",
            ["--orim-board-toolbar-text"] = "#e5eef9",
            ["--orim-board-input-bg"] = "#10192a",
            ["--orim-board-input-border"] = "#31415d",
            ["--orim-board-input-text"] = "#e5eef9",
            ["--orim-board-muted-text"] = "#94a3b8",
            ["--orim-icon-card-bg"] = "rgba(16, 25, 42, 0.94)",
            ["--orim-icon-card-border"] = "#31415d",
            ["--orim-icon-card-text"] = "#b4c2d8",
            ["--orim-icon-card-icon"] = "#e5eef9",
            ["--orim-properties-panel-bg"] = "#10192a",
            ["--orim-properties-panel-border"] = "#24324a",
            ["--orim-properties-muted"] = "#94a3b8",
            ["--orim-properties-input-bg"] = "#0c1423",
            ["--orim-properties-input-border"] = "#31415d",
            ["--orim-properties-input-text"] = "#e5eef9",
            ["--orim-properties-preview-stroke"] = "#e5eef9"
        },
        BoardDefaults = new ThemeBoardDefaults
        {
            SurfaceColor = "#10192A",
            GridColor = "rgba(148, 163, 184, 0.16)",
            ShapeFillColor = "#18253B",
            StrokeColor = "#E5EEF9",
            IconColor = "#E5EEF9",
            SelectionColor = "#8B5CF6",
            SelectionTintRgb = "139, 92, 246",
            HandleSurfaceColor = "#10192A",
            DockTargetColor = "#22C55E"
        }
    };

    public static ThemeDefinition CreateDefaultSynthwaveTheme() => new()
    {
        Key = "synthwave",
        Name = "Synthwave",
        IsDarkMode = true,
        IsEnabled = true,
        IsProtected = false,
        FontFamily = ["Space Grotesk", "Inter", "system-ui", "sans-serif"],
        Palette = new ThemePaletteDefinition
        {
            Primary = "#FF4FD8",
            Secondary = "#35F2FF",
            Tertiary = "#FFC857",
            AppbarBackground = "#160A29",
            AppbarText = "#FFF4FD",
            Background = "#12051F",
            Surface = "#1B0D33",
            DrawerBackground = "#130720",
            DrawerText = "#F6D6FF",
            DrawerIcon = "#F6D6FF",
            TextPrimary = "#FFF0FF",
            TextSecondary = "#C6A9FF",
            LinesDefault = "#39205E",
            Success = "#41FFD9",
            Warning = "#FFC857",
            Info = "#35F2FF"
        },
        CssVariables = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["--orim-page-background"] = "#12051f",
            ["--orim-body-text"] = "#fff0ff",
            ["--orim-shell-appbar"] = "linear-gradient(135deg, #14071f 0%, #24104a 55%, #3d145b 100%)",
            ["--orim-shell-appbar-text"] = "#fff4fd",
            ["--orim-shell-drawer"] = "#130720",
            ["--orim-shell-drawer-text"] = "#f6d6ff",
            ["--orim-shell-main"] = "radial-gradient(circle at top, rgba(53, 242, 255, 0.08), transparent 36%), #12051f",
            ["--orim-brand"] = "#ff4fd8",
            ["--orim-brand-muted"] = "#35f2ff",
            ["--orim-nav-hover"] = "rgba(53, 242, 255, 0.16)",
            ["--orim-card-hover-shadow"] = "0 12px 34px rgba(255, 79, 216, 0.28)",
            ["--orim-login-background"] = "radial-gradient(circle at top, rgba(53, 242, 255, 0.2), transparent 32%), linear-gradient(135deg, #14051f 0%, #2c1250 52%, #ff4fd8 140%)",
            ["--orim-login-card-background"] = "rgba(27, 13, 51, 0.86)",
            ["--orim-login-card-shadow"] = "0 36px 110px rgba(255, 79, 216, 0.24)",
            ["--orim-login-subtitle"] = "#d6c7ff",
            ["--orim-board-toolbar-bg"] = "rgba(27, 13, 51, 0.84)",
            ["--orim-board-toolbar-border"] = "rgba(53, 242, 255, 0.22)",
            ["--orim-board-toolbar-text"] = "#fff0ff",
            ["--orim-board-input-bg"] = "#160a29",
            ["--orim-board-input-border"] = "rgba(53, 242, 255, 0.34)",
            ["--orim-board-input-text"] = "#fff0ff",
            ["--orim-board-muted-text"] = "#c6a9ff",
            ["--orim-icon-card-bg"] = "rgba(22, 10, 41, 0.96)",
            ["--orim-icon-card-border"] = "rgba(53, 242, 255, 0.24)",
            ["--orim-icon-card-text"] = "#d6c7ff",
            ["--orim-icon-card-icon"] = "#35f2ff",
            ["--orim-properties-panel-bg"] = "#160a29",
            ["--orim-properties-panel-border"] = "rgba(53, 242, 255, 0.24)",
            ["--orim-properties-muted"] = "#c6a9ff",
            ["--orim-properties-input-bg"] = "#12051f",
            ["--orim-properties-input-border"] = "rgba(53, 242, 255, 0.34)",
            ["--orim-properties-input-text"] = "#fff0ff",
            ["--orim-properties-preview-stroke"] = "#35f2ff"
        },
        BoardDefaults = new ThemeBoardDefaults
        {
            SurfaceColor = "#160A29",
            GridColor = "rgba(53, 242, 255, 0.16)",
            ShapeFillColor = "#261145",
            StrokeColor = "#35F2FF",
            IconColor = "#FFF0FF",
            SelectionColor = "#FF4FD8",
            SelectionTintRgb = "255, 79, 216",
            HandleSurfaceColor = "#160A29",
            DockTargetColor = "#35F2FF"
        }
    };

    private async Task<List<ThemeDefinition>> EnsureCacheAsync()
    {
        if (_cache is not null)
        {
            return _cache;
        }

        await _gate.WaitAsync();
        try
        {
            return await EnsureCacheCoreAsync();
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<List<ThemeDefinition>> EnsureCacheCoreAsync()
    {
        if (_cache is not null)
        {
            return _cache;
        }

        Directory.CreateDirectory(_themesPath);
        await EnsureSeedThemeAsync(CreateDefaultLightTheme());
        await EnsureSeedThemeAsync(CreateDefaultDarkTheme());
        await EnsureSeedThemeAsync(CreateDefaultSynthwaveTheme());

        var themesByKey = new Dictionary<string, ThemeDefinition>(StringComparer.Ordinal);
        foreach (var filePath in Directory.GetFiles(_themesPath, "*.json", SearchOption.TopDirectoryOnly))
        {
            try
            {
                await using var stream = File.OpenRead(filePath);
                var theme = await JsonSerializer.DeserializeAsync<ThemeDefinition>(stream, OrimJsonOptions.Default);
                if (theme is null)
                {
                    continue;
                }

                var normalizedTheme = NormalizeAndValidate(theme);
                themesByKey[normalizedTheme.Key] = normalizedTheme;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to load theme file {ThemeFilePath}", filePath);
            }
        }

        if (!themesByKey.ContainsKey("light"))
        {
            var lightTheme = CreateDefaultLightTheme();
            themesByKey[lightTheme.Key] = lightTheme;
            await WriteThemeFileAsync(lightTheme);
        }

        var themes = themesByKey.Values.ToList();
        SortThemes(themes);
        _cache = themes;
        return themes;
    }

    private async Task EnsureSeedThemeAsync(ThemeDefinition theme)
    {
        var filePath = GetThemeFilePath(theme.Key);
        if (File.Exists(filePath))
        {
            return;
        }

        await WriteThemeFileAsync(theme);
    }

    private async Task WriteThemeFileAsync(ThemeDefinition theme)
    {
        Directory.CreateDirectory(_themesPath);
        var filePath = GetThemeFilePath(theme.Key);
        await File.WriteAllTextAsync(filePath, JsonSerializer.Serialize(theme, OrimJsonOptions.Indented));
    }

    private string GetThemeFilePath(string key) => Path.Combine(_themesPath, $"{NormalizeKey(key)}.json");

    private static void SortThemes(List<ThemeDefinition> themes)
    {
        themes.Sort((left, right) =>
        {
            if (left.Key == "light" && right.Key != "light")
            {
                return -1;
            }

            if (left.Key != "light" && right.Key == "light")
            {
                return 1;
            }

            return string.Compare(left.Name, right.Name, StringComparison.OrdinalIgnoreCase);
        });
    }

    private static ThemeDefinition NormalizeAndValidate(ThemeDefinition source)
    {
        var normalizedKey = NormalizeKey(source.Key);
        if (string.IsNullOrWhiteSpace(normalizedKey))
        {
            throw new InvalidOperationException("A theme key is required.");
        }

        if (string.IsNullOrWhiteSpace(source.Name))
        {
            throw new InvalidOperationException("A theme name is required.");
        }

        if (source.FontFamily.Count == 0)
        {
            source.FontFamily = ["Inter", "system-ui", "-apple-system", "sans-serif"];
        }

        ValidatePalette(source.Palette);
        ValidateBoardDefaults(source.BoardDefaults);
        ValidateCssVariables(source.CssVariables);

        var normalized = source.Clone();
        normalized.Key = normalizedKey;
        normalized.Name = source.Name.Trim();
        normalized.IsProtected = normalizedKey == "light" || source.IsProtected;
        normalized.IsEnabled = normalized.IsProtected || source.IsEnabled;

        if (normalizedKey == "light")
        {
            normalized.IsProtected = true;
            normalized.IsEnabled = true;
        }

        return normalized;
    }

    private static void ValidatePalette(ThemePaletteDefinition palette)
    {
        var values = new Dictionary<string, string?>
        {
            [nameof(palette.Primary)] = palette.Primary,
            [nameof(palette.Secondary)] = palette.Secondary,
            [nameof(palette.Tertiary)] = palette.Tertiary,
            [nameof(palette.AppbarBackground)] = palette.AppbarBackground,
            [nameof(palette.AppbarText)] = palette.AppbarText,
            [nameof(palette.Background)] = palette.Background,
            [nameof(palette.Surface)] = palette.Surface,
            [nameof(palette.DrawerBackground)] = palette.DrawerBackground,
            [nameof(palette.DrawerText)] = palette.DrawerText,
            [nameof(palette.DrawerIcon)] = palette.DrawerIcon,
            [nameof(palette.TextPrimary)] = palette.TextPrimary,
            [nameof(palette.TextSecondary)] = palette.TextSecondary,
            [nameof(palette.LinesDefault)] = palette.LinesDefault
        };

        foreach (var entry in values)
        {
            if (string.IsNullOrWhiteSpace(entry.Value))
            {
                throw new InvalidOperationException($"Palette value '{entry.Key}' is required.");
            }
        }
    }

    private static void ValidateBoardDefaults(ThemeBoardDefaults defaults)
    {
        var values = new Dictionary<string, string?>
        {
            [nameof(defaults.SurfaceColor)] = defaults.SurfaceColor,
            [nameof(defaults.GridColor)] = defaults.GridColor,
            [nameof(defaults.ShapeFillColor)] = defaults.ShapeFillColor,
            [nameof(defaults.StrokeColor)] = defaults.StrokeColor,
            [nameof(defaults.IconColor)] = defaults.IconColor,
            [nameof(defaults.SelectionColor)] = defaults.SelectionColor,
            [nameof(defaults.SelectionTintRgb)] = defaults.SelectionTintRgb,
            [nameof(defaults.HandleSurfaceColor)] = defaults.HandleSurfaceColor,
            [nameof(defaults.DockTargetColor)] = defaults.DockTargetColor
        };

        foreach (var entry in values)
        {
            if (string.IsNullOrWhiteSpace(entry.Value))
            {
                throw new InvalidOperationException($"Board default '{entry.Key}' is required.");
            }
        }
    }

    private static void ValidateCssVariables(Dictionary<string, string> variables)
    {
        foreach (var variableName in RequiredCssVariables)
        {
            if (!variables.TryGetValue(variableName, out var value) || string.IsNullOrWhiteSpace(value))
            {
                throw new InvalidOperationException($"CSS variable '{variableName}' is required.");
            }
        }
    }

    private static string NormalizeKey(string? key)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return string.Empty;
        }

        Span<char> buffer = stackalloc char[key.Length];
        var length = 0;
        var previousWasDash = false;

        foreach (var character in key.Trim().ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(character))
            {
                buffer[length++] = character;
                previousWasDash = false;
                continue;
            }

            if ((character == '-' || character == '_' || char.IsWhiteSpace(character)) && !previousWasDash && length > 0)
            {
                buffer[length++] = '-';
                previousWasDash = true;
            }
        }

        if (length > 0 && buffer[length - 1] == '-')
        {
            length--;
        }

        return new string(buffer[..length]);
    }
}