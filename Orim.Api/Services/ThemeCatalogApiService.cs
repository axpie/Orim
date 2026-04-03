using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Orim.Core;
using Orim.Core.Interfaces;

namespace Orim.Api.Services;

public sealed class ThemeCatalogApiService
{
    private static readonly HashSet<string> BuiltInThemeKeys = new(StringComparer.Ordinal)
    {
        "light",
        "dark",
        "synthwave",
    };

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private List<ApiThemeDefinition>? _cache;

    public ThemeCatalogApiService(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    public async Task<IReadOnlyList<ApiThemeDefinition>> GetThemesAsync()
    {
        var themes = await EnsureCacheAsync();
        return themes.Select(theme => theme.Clone()).ToList();
    }

    public async Task<IReadOnlyList<ApiThemeDefinition>> GetEnabledThemesAsync()
    {
        var themes = await EnsureCacheAsync();
        return themes.Where(theme => theme.IsEnabled).Select(theme => theme.Clone()).ToList();
    }

    public async Task<ApiThemeDefinition?> GetThemeAsync(string key)
    {
        var themes = await EnsureCacheAsync();
        var normalizedKey = NormalizeKey(key);
        return themes.FirstOrDefault(theme => theme.Key == normalizedKey)?.Clone();
    }

    public async Task<ApiThemeDefinition> ImportThemeAsync(Stream stream, string? expectedKey = null)
    {
        var importedTheme = await JsonSerializer.DeserializeAsync<ApiThemeDefinition>(stream, OrimJsonOptions.Default);
        if (importedTheme is null)
        {
            throw new InvalidOperationException("The uploaded theme JSON could not be read.");
        }

        if (!string.IsNullOrWhiteSpace(expectedKey)
            && !string.Equals(NormalizeKey(importedTheme.Key), NormalizeKey(expectedKey), StringComparison.Ordinal))
        {
            throw new InvalidOperationException("The uploaded theme key does not match the selected theme.");
        }

        // Imported themes should never be marked as protected so users can edit/delete them later.
        return await SaveThemeAsync(importedTheme, forceUnprotected: true);
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

            theme.IsEnabled = enabled;
            await SaveThemeToRepositoryAsync(theme);
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
                throw new InvalidOperationException("Built-in themes cannot be deleted.");
            }

            themes.RemoveAll(candidate => candidate.Key == normalizedKey);
            await DeleteThemeFromRepositoryAsync(normalizedKey);

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

    private async Task<ApiThemeDefinition> SaveThemeAsync(ApiThemeDefinition theme, bool forceUnprotected = false)
    {
        await _gate.WaitAsync();
        try
        {
            var themes = await EnsureCacheCoreAsync();
            var normalizedTheme = NormalizeAndValidate(theme);

            // Imported themes or explicit callers can request that the theme not be protected.
            if (forceUnprotected)
            {
                normalizedTheme.IsProtected = false;
            }

            var existingTheme = themes.FirstOrDefault(candidate => candidate.Key == normalizedTheme.Key);

            if (existingTheme?.IsProtected == true)
            {
                throw new InvalidOperationException("Built-in themes cannot be changed.");
            }

            themes.RemoveAll(candidate => candidate.Key == normalizedTheme.Key);
            themes.Add(normalizedTheme);
            SortThemes(themes);
            await SaveThemeToRepositoryAsync(normalizedTheme);
            _cache = themes;
            return normalizedTheme.Clone();
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<List<ApiThemeDefinition>> EnsureCacheAsync()
    {
        if (_cache is not null)
        {
            return _cache;
        }

        await _gate.WaitAsync();
        try
        {
            if (_cache is not null)
            {
                return _cache;
            }

            return await EnsureCacheCoreAsync();
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<List<ApiThemeDefinition>> EnsureCacheCoreAsync()
    {
        if (_cache is not null)
        {
            return _cache;
        }

        var themesByKey = CreateBuiltInThemes()
            .ToDictionary(theme => theme.Key, theme => theme, StringComparer.Ordinal);

        using var scope = _scopeFactory.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IThemeRepository>();
        var records = await repository.GetAllAsync();

        foreach (var record in records)
        {
            try
            {
                var theme = JsonSerializer.Deserialize<ApiThemeDefinition>(record.DefinitionJson, OrimJsonOptions.Default);
                if (theme is null)
                {
                    continue;
                }

                theme.Key = record.Key;
                theme.IsEnabled = record.IsEnabled;
                theme.IsProtected = record.IsProtected;

                var normalizedTheme = NormalizeAndValidate(theme);
                if (normalizedTheme.IsProtected && themesByKey.TryGetValue(normalizedTheme.Key, out var builtInTheme))
                {
                    builtInTheme.IsEnabled = normalizedTheme.IsEnabled;
                    continue;
                }

                themesByKey[normalizedTheme.Key] = normalizedTheme;
            }
            catch
            {
                continue;
            }
        }

        _cache = SortThemes(themesByKey.Values.ToList());
        return _cache;
    }

    public async Task EnsureBuiltInThemesAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IThemeRepository>();

        foreach (var theme in CreateBuiltInThemes())
        {
            var existing = await repository.GetByKeyAsync(theme.Key);
            if (existing is null)
            {
                await repository.SaveAsync(ToThemeRecord(theme));
            }
        }
    }

    private async Task SaveThemeToRepositoryAsync(ApiThemeDefinition theme)
    {
        using var scope = _scopeFactory.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IThemeRepository>();
        await repository.SaveAsync(ToThemeRecord(theme));
    }

    private async Task DeleteThemeFromRepositoryAsync(string key)
    {
        using var scope = _scopeFactory.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IThemeRepository>();
        await repository.DeleteAsync(key);
    }

    private static ThemeRecord ToThemeRecord(ApiThemeDefinition theme) => new()
    {
        Key = theme.Key,
        Name = theme.Name,
        IsDarkMode = theme.IsDarkMode,
        IsEnabled = theme.IsEnabled,
        IsProtected = theme.IsProtected,
        DefinitionJson = JsonSerializer.Serialize(theme, OrimJsonOptions.Default)
    };

    private static List<ApiThemeDefinition> CreateBuiltInThemes() =>
    [
        CreateBuiltInLightTheme(),
        CreateBuiltInDarkTheme(),
        CreateBuiltInSynthwaveTheme(),
    ];

    private static ApiThemeDefinition CreateBuiltInLightTheme() => new()
    {
        Key = "light",
        Name = "Light",
        IsDarkMode = false,
        IsEnabled = true,
        IsProtected = true,
        FontFamily = ["Inter", "system-ui", "-apple-system", "sans-serif"],
        Palette = new ApiThemePaletteDefinition
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
            LinesDefault = "#D0D7DE",
            Success = "#1F8A5B",
            Warning = "#EA580C",
            Info = "#6E40C9"
        },
        CssVariables = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase),
        BoardDefaults = new ApiThemeBoardDefaultsDefinition
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

    private static ApiThemeDefinition CreateBuiltInDarkTheme() => new()
    {
        Key = "dark",
        Name = "Dark",
        IsDarkMode = true,
        IsEnabled = true,
        IsProtected = true,
        FontFamily = ["Inter", "system-ui", "-apple-system", "sans-serif"],
        Palette = new ApiThemePaletteDefinition
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
            LinesDefault = "#24324A",
            Success = "#22C55E",
            Warning = "#F59E0B",
            Info = "#38BDF8"
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
        BoardDefaults = new ApiThemeBoardDefaultsDefinition
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

    private static ApiThemeDefinition CreateBuiltInSynthwaveTheme() => new()
    {
        Key = "synthwave",
        Name = "Synthwave",
        IsDarkMode = true,
        IsEnabled = true,
        IsProtected = true,
        FontFamily = ["Space Grotesk", "Inter", "system-ui", "sans-serif"],
        Palette = new ApiThemePaletteDefinition
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
        BoardDefaults = new ApiThemeBoardDefaultsDefinition
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

    private static List<ApiThemeDefinition> SortThemes(List<ApiThemeDefinition> themes)
    {
        themes.Sort((left, right) =>
        {
            var leftRank = GetThemeSortRank(left.Key);
            var rightRank = GetThemeSortRank(right.Key);

            if (leftRank != rightRank)
            {
                return leftRank.CompareTo(rightRank);
            }

            return string.Compare(left.Name, right.Name, StringComparison.OrdinalIgnoreCase);
        });

        return themes;
    }

    private static int GetThemeSortRank(string key) => key switch
    {
        "light" => 0,
        "dark" => 1,
        "synthwave" => 2,
        _ => 100,
    };

    private static ApiThemeDefinition NormalizeAndValidate(ApiThemeDefinition source)
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

        var normalized = source.Clone();
        normalized.Key = normalizedKey;
        normalized.Name = source.Name.Trim();
        normalized.IsProtected = IsBuiltInThemeKey(normalizedKey) || source.IsProtected;

        if (normalized.IsProtected)
        {
            normalized.IsProtected = true;
        }

        return normalized;
    }

    private static bool IsBuiltInThemeKey(string key) => BuiltInThemeKeys.Contains(key);

    private static void ValidatePalette(ApiThemePaletteDefinition palette)
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
            [nameof(palette.LinesDefault)] = palette.LinesDefault,
        };

        foreach (var entry in values)
        {
            if (string.IsNullOrWhiteSpace(entry.Value))
            {
                throw new InvalidOperationException($"Palette value '{entry.Key}' is required.");
            }
        }
    }

    private static void ValidateBoardDefaults(ApiThemeBoardDefaultsDefinition defaults)
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
            [nameof(defaults.DockTargetColor)] = defaults.DockTargetColor,
        };

        foreach (var entry in values)
        {
            if (string.IsNullOrWhiteSpace(entry.Value))
            {
                throw new InvalidOperationException($"Board default '{entry.Key}' is required.");
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

public sealed class ApiThemeDefinition
{
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsDarkMode { get; set; }
    public bool IsEnabled { get; set; } = true;
    public bool IsProtected { get; set; }
    public List<string> FontFamily { get; set; } = [];
    public ApiThemePaletteDefinition Palette { get; set; } = new();
    public Dictionary<string, string> CssVariables { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public ApiThemeBoardDefaultsDefinition BoardDefaults { get; set; } = new();

    public ApiThemeDefinition Clone() => new()
    {
        Key = Key,
        Name = Name,
        IsDarkMode = IsDarkMode,
        IsEnabled = IsEnabled,
        IsProtected = IsProtected,
        FontFamily = [.. FontFamily],
        Palette = Palette.Clone(),
        CssVariables = CssVariables.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.OrdinalIgnoreCase),
        BoardDefaults = BoardDefaults.Clone(),
    };
}

public sealed class ApiThemePaletteDefinition
{
    public string Primary { get; set; } = "#6E40C9";
    public string Secondary { get; set; } = "#1F8A5B";
    public string Tertiary { get; set; } = "#EA580C";
    public string AppbarBackground { get; set; } = "#0D1117";
    public string AppbarText { get; set; } = "#FFFFFF";
    public string Background { get; set; } = "#F6F8FA";
    public string Surface { get; set; } = "#FFFFFF";
    public string DrawerBackground { get; set; } = "#161B22";
    public string DrawerText { get; set; } = "#C9D1D9";
    public string DrawerIcon { get; set; } = "#C9D1D9";
    public string TextPrimary { get; set; } = "#24292F";
    public string TextSecondary { get; set; } = "#57606A";
    public string LinesDefault { get; set; } = "#D0D7DE";
    public string? Success { get; set; }
    public string? Warning { get; set; }
    public string? Info { get; set; }

    public ApiThemePaletteDefinition Clone() => new()
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
        Info = Info,
    };
}

public sealed class ApiThemeBoardDefaultsDefinition
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

    public ApiThemeBoardDefaultsDefinition Clone() => new()
    {
        SurfaceColor = SurfaceColor,
        GridColor = GridColor,
        ShapeFillColor = ShapeFillColor,
        StrokeColor = StrokeColor,
        IconColor = IconColor,
        SelectionColor = SelectionColor,
        SelectionTintRgb = SelectionTintRgb,
        HandleSurfaceColor = HandleSurfaceColor,
        DockTargetColor = DockTargetColor,
    };
}