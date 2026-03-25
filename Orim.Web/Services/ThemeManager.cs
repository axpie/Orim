using Microsoft.JSInterop;
using MudBlazor;

namespace Orim.Web.Services;

public sealed class ThemeManager
{
    private static readonly LayoutProperties SharedLayoutProperties = new()
    {
        DefaultBorderRadius = "10px"
    };

    private readonly ThemeCatalogService _themeCatalogService;
    private bool _isInitialized;
    private IReadOnlyList<ThemeDefinition> _availableThemes = [ThemeCatalogService.CreateDefaultLightTheme()];

    public ThemeManager(ThemeCatalogService themeCatalogService)
    {
        _themeCatalogService = themeCatalogService;
        CurrentDefinition = ThemeCatalogService.CreateDefaultLightTheme();
        CurrentTheme = BuildMudTheme(CurrentDefinition);
    }

    public ThemeDefinition CurrentDefinition { get; private set; }

    public MudTheme CurrentTheme { get; private set; }

    public IReadOnlyList<ThemeDefinition> AvailableThemes => _availableThemes;

    public bool IsDarkMode => CurrentDefinition.IsDarkMode;

    public string CurrentThemeKey => CurrentDefinition.Key;

    public event Action? Changed;

    public async Task InitializeAsync(IJSRuntime jsRuntime)
    {
        if (_isInitialized)
        {
            await ApplyThemeAsync(jsRuntime, persist: false);
            return;
        }

        var storedThemeKey = await jsRuntime.InvokeAsync<string?>("orimTheme.get");
        await LoadThemesAsync();
        SetCurrentThemeDefinition(ResolveTheme(storedThemeKey));
        _isInitialized = true;

        await ApplyThemeAsync(jsRuntime, persist: false);
        Changed?.Invoke();
    }

    public async Task SetThemeAsync(string themeKey, IJSRuntime jsRuntime)
    {
        await LoadThemesAsync();
        var nextTheme = ResolveTheme(themeKey);
        var hasChanged = !string.Equals(CurrentThemeKey, nextTheme.Key, StringComparison.Ordinal);
        SetCurrentThemeDefinition(nextTheme);
        _isInitialized = true;

        await ApplyThemeAsync(jsRuntime, persist: true);
        if (hasChanged)
        {
            Changed?.Invoke();
        }
    }

    public async Task ReloadThemesAsync(IJSRuntime jsRuntime)
    {
        await LoadThemesAsync();
        SetCurrentThemeDefinition(ResolveTheme(CurrentThemeKey));
        _isInitialized = true;
        await ApplyThemeAsync(jsRuntime, persist: true);
        Changed?.Invoke();
    }

    private async Task LoadThemesAsync()
    {
        var enabledThemes = await _themeCatalogService.GetEnabledThemesAsync();
        _availableThemes = enabledThemes.Count > 0
            ? enabledThemes
            : [ThemeCatalogService.CreateDefaultLightTheme()];
    }

    private ThemeDefinition ResolveTheme(string? requestedKey)
    {
        if (!string.IsNullOrWhiteSpace(requestedKey))
        {
            var matchingTheme = _availableThemes.FirstOrDefault(theme => string.Equals(theme.Key, requestedKey, StringComparison.OrdinalIgnoreCase));
            if (matchingTheme is not null)
            {
                return matchingTheme.Clone();
            }
        }

        var lightTheme = _availableThemes.FirstOrDefault(theme => string.Equals(theme.Key, "light", StringComparison.Ordinal));
        return (lightTheme ?? _availableThemes.First()).Clone();
    }

    private void SetCurrentThemeDefinition(ThemeDefinition definition)
    {
        CurrentDefinition = definition.Clone();
        CurrentTheme = BuildMudTheme(CurrentDefinition);
    }

    private async Task ApplyThemeAsync(IJSRuntime jsRuntime, bool persist)
    {
        if (persist)
        {
            await jsRuntime.InvokeVoidAsync("orimTheme.set", CurrentThemeKey, CurrentDefinition.CssVariables, IsDarkMode);
            return;
        }

        await jsRuntime.InvokeVoidAsync("orimTheme.apply", CurrentThemeKey, CurrentDefinition.CssVariables, IsDarkMode);
    }

    private static MudTheme BuildMudTheme(ThemeDefinition definition)
    {
        var theme = new MudTheme
        {
            Typography = new Typography
            {
                Default = new DefaultTypography
                {
                    FontFamily = [.. definition.FontFamily]
                }
            },
            LayoutProperties = SharedLayoutProperties
        };

        if (definition.IsDarkMode)
        {
            theme.PaletteDark = new PaletteDark
            {
                Primary = definition.Palette.Primary,
                Secondary = definition.Palette.Secondary,
                Tertiary = definition.Palette.Tertiary,
                AppbarBackground = definition.Palette.AppbarBackground,
                AppbarText = definition.Palette.AppbarText,
                Background = definition.Palette.Background,
                Surface = definition.Palette.Surface,
                DrawerBackground = definition.Palette.DrawerBackground,
                DrawerText = definition.Palette.DrawerText,
                DrawerIcon = definition.Palette.DrawerIcon,
                TextPrimary = definition.Palette.TextPrimary,
                TextSecondary = definition.Palette.TextSecondary,
                LinesDefault = definition.Palette.LinesDefault,
                Success = definition.Palette.Success ?? definition.Palette.Secondary,
                Warning = definition.Palette.Warning ?? definition.Palette.Tertiary,
                Info = definition.Palette.Info ?? definition.Palette.Primary
            };
        }
        else
        {
            theme.PaletteLight = new PaletteLight
            {
                Primary = definition.Palette.Primary,
                Secondary = definition.Palette.Secondary,
                Tertiary = definition.Palette.Tertiary,
                AppbarBackground = definition.Palette.AppbarBackground,
                AppbarText = definition.Palette.AppbarText,
                Background = definition.Palette.Background,
                Surface = definition.Palette.Surface,
                DrawerBackground = definition.Palette.DrawerBackground,
                DrawerText = definition.Palette.DrawerText,
                DrawerIcon = definition.Palette.DrawerIcon,
                TextPrimary = definition.Palette.TextPrimary,
                TextSecondary = definition.Palette.TextSecondary,
                LinesDefault = definition.Palette.LinesDefault
            };
        }

        return theme;
    }
}