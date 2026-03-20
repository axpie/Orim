using Microsoft.JSInterop;
using MudBlazor;

namespace Orim.Web.Services;

public enum ThemePreset
{
    Light,
    Dark,
    Synthwave
}

public sealed class ThemeManager
{
    private static readonly LayoutProperties SharedLayoutProperties = new()
    {
        DefaultBorderRadius = "10px"
    };

    private static readonly MudTheme LightTheme = new()
    {
        PaletteLight = new PaletteLight
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
        Typography = new Typography
        {
            Default = new DefaultTypography
            {
                FontFamily = ["Inter", "system-ui", "-apple-system", "sans-serif"]
            }
        },
        LayoutProperties = SharedLayoutProperties
    };

    private static readonly MudTheme DarkTheme = new()
    {
        PaletteDark = new PaletteDark
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
        Typography = new Typography
        {
            Default = new DefaultTypography
            {
                FontFamily = ["Inter", "system-ui", "-apple-system", "sans-serif"]
            }
        },
        LayoutProperties = SharedLayoutProperties
    };

    private static readonly MudTheme SynthwaveTheme = new()
    {
        PaletteDark = new PaletteDark
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
        Typography = new Typography
        {
            Default = new DefaultTypography
            {
                FontFamily = ["Space Grotesk", "Inter", "system-ui", "sans-serif"]
            }
        },
        LayoutProperties = SharedLayoutProperties
    };

    private bool _isInitialized;

    public ThemePreset CurrentPreset { get; private set; } = ThemePreset.Light;

    public MudTheme CurrentTheme => CurrentPreset switch
    {
        ThemePreset.Dark => DarkTheme,
        ThemePreset.Synthwave => SynthwaveTheme,
        _ => LightTheme
    };

    public bool IsDarkMode => CurrentPreset is ThemePreset.Dark or ThemePreset.Synthwave;

    public string CurrentThemeKey => CurrentPreset switch
    {
        ThemePreset.Dark => "dark",
        ThemePreset.Synthwave => "synthwave",
        _ => "light"
    };

    public event Action? Changed;

    public async Task InitializeAsync(IJSRuntime jsRuntime)
    {
        if (_isInitialized)
        {
            await jsRuntime.InvokeVoidAsync("orimTheme.apply", CurrentThemeKey);
            return;
        }

        var storedTheme = await jsRuntime.InvokeAsync<string?>("orimTheme.get");
        CurrentPreset = ParseTheme(storedTheme);
        _isInitialized = true;

        await jsRuntime.InvokeVoidAsync("orimTheme.apply", CurrentThemeKey);
        Changed?.Invoke();
    }

    public async Task SetThemeAsync(ThemePreset preset, IJSRuntime jsRuntime)
    {
        var hasChanged = CurrentPreset != preset;
        CurrentPreset = preset;
        _isInitialized = true;

        await jsRuntime.InvokeVoidAsync("orimTheme.set", CurrentThemeKey);

        if (hasChanged)
        {
            Changed?.Invoke();
        }
    }

    private static ThemePreset ParseTheme(string? themeKey) => themeKey?.Trim().ToLowerInvariant() switch
    {
        "dark" => ThemePreset.Dark,
        "synthwave" => ThemePreset.Synthwave,
        _ => ThemePreset.Light
    };
}