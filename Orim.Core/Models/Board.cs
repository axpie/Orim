using System.Text.Json;
using Orim.Core;

namespace Orim.Core.Models;

public class Board
{
    private static readonly string[] DefaultCustomColors =
    [
        "#0F172A",
        "#334155",
        "#64748B",
        "#E2E8F0",
        "#FFFFFF",
        "#DC2626",
        "#EA580C",
        "#CA8A04",
        "#16A34A",
        "#0891B2",
        "#2563EB",
        "#7C3AED"
    ];

    private static readonly string[] DefaultEnabledIconGroupsStorage =
    [
        "actions",
        "activities",
        "android",
        "audio-video",
        "business",
        "communicate",
        "hardware",
        "home",
        "household",
        "images",
        "maps",
        "privacy",
        "social",
        "text",
        "transit",
        "travel",
        "ui-actions"
    ];
    private static readonly HashSet<string> DefaultEnabledIconGroupSet = DefaultEnabledIconGroupsStorage.ToHashSet(StringComparer.OrdinalIgnoreCase);
    private static readonly HashSet<string> LegacyEnabledIconGroupSet = new(StringComparer.OrdinalIgnoreCase)
    {
        "infrastructure",
        "software",
        "consulting",
        "security",
        "analytics",
        "navigation"
    };

    public static IReadOnlyList<string> DefaultEnabledIconGroups => DefaultEnabledIconGroupsStorage;

    public Guid Id { get; set; } = Guid.NewGuid();
    public string Title { get; set; } = string.Empty;
    public bool LabelOutlineEnabled { get; set; } = true;
    public bool ArrowOutlineEnabled { get; set; } = true;
    public List<string> CustomColors { get; set; } = DefaultCustomColors.ToList();
    public List<string> RecentColors { get; set; } = [];
    public List<StickyNotePreset> StickyNotePresets { get; set; } = [];
    public BoardStylePresetState StylePresetState { get; set; } = BoardStylePresetState.CreateDefault();
    public Guid OwnerId { get; set; }
    public string? SurfaceColor { get; set; }
    public string? ThemeKey { get; set; }
    public List<string> EnabledIconGroups { get; set; } = DefaultEnabledIconGroupsStorage.ToList();
    public BoardVisibility Visibility { get; set; } = BoardVisibility.Private;
    public string? ShareLinkToken { get; set; }
    public bool SharedAllowAnonymousEditing { get; set; }
    public string? SharePasswordHash { get; set; }
    public List<BoardMember> Members { get; set; } = [];
    public List<BoardElement> Elements { get; set; } = [];
    public List<BoardComment> Comments { get; set; } = [];
    public List<BoardSnapshot> Snapshots { get; set; } = [];
    public string? FolderId { get; set; }
    public List<string> Tags { get; set; } = [];
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public static List<string> NormalizeEnabledIconGroups(IEnumerable<string>? enabledIconGroups)
    {
        if (enabledIconGroups is null)
        {
            return DefaultEnabledIconGroupsStorage.ToList();
        }

        var normalized = enabledIconGroups
            .Select(group => group?.Trim())
            .Where(group => !string.IsNullOrWhiteSpace(group))
            .Select(group => group!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (normalized.Count == 0)
        {
            return [];
        }

        var validGroups = normalized
            .Where(group => DefaultEnabledIconGroupSet.Contains(group))
            .ToList();

        if (validGroups.Count > 0)
        {
            return validGroups;
        }

        return normalized.Any(group => LegacyEnabledIconGroupSet.Contains(group))
            ? DefaultEnabledIconGroupsStorage.ToList()
            : [];
    }
}

public class StickyNotePreset
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Label { get; set; } = string.Empty;
    public string FillColor { get; set; } = "#FDE68A";
}

public class BoardStylePresetState
{
    private static readonly string[] SupportedPresetTypes =
    [
        "shape",
        "text",
        "sticky",
        "frame",
        "icon",
        "arrow",
        "drawing"
    ];

    private static readonly HashSet<string> SupportedPresetTypeSet = SupportedPresetTypes.ToHashSet(StringComparer.Ordinal);

    public List<NamedStylePreset> Presets { get; set; } = [];
    public Dictionary<string, StylePresetPlacementPreference> PlacementPreferences { get; set; } = CreateDefaultPlacementPreferences();
    public Dictionary<string, Dictionary<string, JsonElement>> LastUsedStyles { get; set; } = [];

    public static BoardStylePresetState CreateDefault() => new();

    public static BoardStylePresetState Normalize(BoardStylePresetState? state)
    {
        if (state is null)
        {
            return CreateDefault();
        }

        return new BoardStylePresetState
        {
            Presets = state.Presets
                .Where(static preset => !string.IsNullOrWhiteSpace(preset.Type) && SupportedPresetTypeSet.Contains(preset.Type))
                .Select(ClonePreset)
                .ToList(),
            PlacementPreferences = NormalizePlacementPreferences(state.PlacementPreferences),
            LastUsedStyles = NormalizeLastUsedStyles(state.LastUsedStyles)
        };
    }

    public static BoardStylePresetState Clone(BoardStylePresetState? state) => Normalize(state);

    public static void RememberStyle(Board board, BoardElement element)
    {
        ArgumentNullException.ThrowIfNull(board);
        ArgumentNullException.ThrowIfNull(element);

        var extracted = ExtractStyle(element);
        if (extracted is null)
        {
            board.StylePresetState = Normalize(board.StylePresetState);
            return;
        }

        var (type, style) = extracted.Value;
        var nextState = Normalize(board.StylePresetState);
        if (nextState.LastUsedStyles.TryGetValue(type, out var currentStyle) && StyleMapsEqual(currentStyle, style))
        {
            board.StylePresetState = nextState;
            return;
        }

        nextState.LastUsedStyles[type] = CloneStyleMap(style);
        board.StylePresetState = nextState;
    }

    private static Dictionary<string, StylePresetPlacementPreference> CreateDefaultPlacementPreferences() =>
        SupportedPresetTypes.ToDictionary(
            static type => type,
            static _ => new StylePresetPlacementPreference(),
            StringComparer.Ordinal);

    private static Dictionary<string, StylePresetPlacementPreference> NormalizePlacementPreferences(
        IDictionary<string, StylePresetPlacementPreference>? placementPreferences)
    {
        var defaults = CreateDefaultPlacementPreferences();
        if (placementPreferences is null)
        {
            return defaults;
        }

        foreach (var type in SupportedPresetTypes)
        {
            if (placementPreferences.TryGetValue(type, out var preference) && preference is not null)
            {
                defaults[type] = new StylePresetPlacementPreference
                {
                    Mode = preference.Mode is "theme-default" or "preset"
                        ? preference.Mode
                        : "theme-default",
                    PresetId = preference.Mode == "preset" ? preference.PresetId?.Trim() : null
                };
            }
        }

        return defaults;
    }

    private static Dictionary<string, Dictionary<string, JsonElement>> NormalizeLastUsedStyles(
        IDictionary<string, Dictionary<string, JsonElement>>? lastUsedStyles)
    {
        if (lastUsedStyles is null)
        {
            return [];
        }

        return lastUsedStyles
            .Where(entry => SupportedPresetTypeSet.Contains(entry.Key))
            .ToDictionary(
                entry => entry.Key,
                entry => CloneStyleMap(entry.Value),
                StringComparer.Ordinal);
    }

    private static NamedStylePreset ClonePreset(NamedStylePreset preset) => new()
    {
        Id = string.IsNullOrWhiteSpace(preset.Id) ? Guid.NewGuid().ToString("N") : preset.Id.Trim(),
        Type = preset.Type.Trim(),
        Name = preset.Name?.Trim() ?? string.Empty,
        Style = CloneStyleMap(preset.Style),
        CreatedAt = preset.CreatedAt?.Trim() ?? string.Empty,
        UpdatedAt = preset.UpdatedAt?.Trim() ?? string.Empty
    };

    private static Dictionary<string, JsonElement> CloneStyleMap(IDictionary<string, JsonElement>? style)
    {
        if (style is null)
        {
            return [];
        }

        return style.ToDictionary(
            entry => entry.Key,
            entry => CloneJsonElement(entry.Value),
            StringComparer.Ordinal);
    }

    private static bool StyleMapsEqual(
        IReadOnlyDictionary<string, JsonElement>? left,
        IReadOnlyDictionary<string, JsonElement>? right)
    {
        if (left is null || right is null)
        {
            return left == right;
        }

        if (left.Count != right.Count)
        {
            return false;
        }

        foreach (var (key, value) in left)
        {
            if (!right.TryGetValue(key, out var rightValue) || value.GetRawText() != rightValue.GetRawText())
            {
                return false;
            }
        }

        return true;
    }

    private static JsonElement CloneJsonElement(JsonElement element) =>
        JsonDocument.Parse(element.GetRawText()).RootElement.Clone();

    private static JsonElement SerializeStyleValue<T>(T value) =>
        JsonSerializer.SerializeToElement(value, OrimJsonOptions.Default);

    private static (string Type, Dictionary<string, JsonElement> Style)? ExtractStyle(BoardElement element) => element switch
    {
        ShapeElement shape => ("shape", new Dictionary<string, JsonElement>(StringComparer.Ordinal)
        {
            ["fillColor"] = SerializeStyleValue(shape.FillColor),
            ["strokeColor"] = SerializeStyleValue(shape.StrokeColor),
            ["strokeWidth"] = SerializeStyleValue(shape.StrokeWidth),
            ["borderLineStyle"] = SerializeStyleValue(shape.BorderLineStyle),
            ["labelFontSize"] = SerializeStyleValue(shape.LabelFontSize),
            ["labelColor"] = SerializeStyleValue(shape.LabelColor),
            ["fontFamily"] = SerializeStyleValue(shape.FontFamily),
            ["isBold"] = SerializeStyleValue(shape.IsBold),
            ["isItalic"] = SerializeStyleValue(shape.IsItalic),
            ["isUnderline"] = SerializeStyleValue(shape.IsUnderline),
            ["isStrikethrough"] = SerializeStyleValue(shape.IsStrikethrough),
            ["labelHorizontalAlignment"] = SerializeStyleValue(shape.LabelHorizontalAlignment),
            ["labelVerticalAlignment"] = SerializeStyleValue(shape.LabelVerticalAlignment)
        }),
        TextElement text => ("text", new Dictionary<string, JsonElement>(StringComparer.Ordinal)
        {
            ["fontSize"] = SerializeStyleValue(text.FontSize),
            ["autoFontSize"] = SerializeStyleValue(text.AutoFontSize),
            ["fontFamily"] = SerializeStyleValue(text.FontFamily),
            ["color"] = SerializeStyleValue(text.Color),
            ["isBold"] = SerializeStyleValue(text.IsBold),
            ["isItalic"] = SerializeStyleValue(text.IsItalic),
            ["isUnderline"] = SerializeStyleValue(text.IsUnderline),
            ["isStrikethrough"] = SerializeStyleValue(text.IsStrikethrough),
            ["labelHorizontalAlignment"] = SerializeStyleValue(text.LabelHorizontalAlignment),
            ["labelVerticalAlignment"] = SerializeStyleValue(text.LabelVerticalAlignment)
        }),
        StickyNoteElement sticky => ("sticky", new Dictionary<string, JsonElement>(StringComparer.Ordinal)
        {
            ["fontSize"] = SerializeStyleValue(sticky.FontSize),
            ["autoFontSize"] = SerializeStyleValue(sticky.AutoFontSize),
            ["fontFamily"] = SerializeStyleValue(sticky.FontFamily),
            ["fillColor"] = SerializeStyleValue(sticky.FillColor),
            ["color"] = SerializeStyleValue(sticky.Color),
            ["isBold"] = SerializeStyleValue(sticky.IsBold),
            ["isItalic"] = SerializeStyleValue(sticky.IsItalic),
            ["isUnderline"] = SerializeStyleValue(sticky.IsUnderline),
            ["isStrikethrough"] = SerializeStyleValue(sticky.IsStrikethrough),
            ["labelHorizontalAlignment"] = SerializeStyleValue(sticky.LabelHorizontalAlignment),
            ["labelVerticalAlignment"] = SerializeStyleValue(sticky.LabelVerticalAlignment)
        }),
        FrameElement frame => ("frame", new Dictionary<string, JsonElement>(StringComparer.Ordinal)
        {
            ["fillColor"] = SerializeStyleValue(frame.FillColor),
            ["strokeColor"] = SerializeStyleValue(frame.StrokeColor),
            ["strokeWidth"] = SerializeStyleValue(frame.StrokeWidth),
            ["labelFontSize"] = SerializeStyleValue(frame.LabelFontSize),
            ["labelColor"] = SerializeStyleValue(frame.LabelColor),
            ["fontFamily"] = SerializeStyleValue(frame.FontFamily),
            ["isBold"] = SerializeStyleValue(frame.IsBold),
            ["isItalic"] = SerializeStyleValue(frame.IsItalic),
            ["isUnderline"] = SerializeStyleValue(frame.IsUnderline),
            ["isStrikethrough"] = SerializeStyleValue(frame.IsStrikethrough),
            ["labelHorizontalAlignment"] = SerializeStyleValue(frame.LabelHorizontalAlignment),
            ["labelVerticalAlignment"] = SerializeStyleValue(frame.LabelVerticalAlignment)
        }),
        IconElement icon => ("icon", new Dictionary<string, JsonElement>(StringComparer.Ordinal)
        {
            ["color"] = SerializeStyleValue(icon.Color)
        }),
        ArrowElement arrow => ("arrow", new Dictionary<string, JsonElement>(StringComparer.Ordinal)
        {
            ["strokeColor"] = SerializeStyleValue(arrow.StrokeColor),
            ["strokeWidth"] = SerializeStyleValue(arrow.StrokeWidth),
            ["labelFontSize"] = SerializeStyleValue(arrow.LabelFontSize),
            ["labelColor"] = SerializeStyleValue(arrow.LabelColor),
            ["fontFamily"] = SerializeStyleValue(arrow.FontFamily)
        }),
        DrawingElement drawing => ("drawing", new Dictionary<string, JsonElement>(StringComparer.Ordinal)
        {
            ["strokeColor"] = SerializeStyleValue(drawing.StrokeColor),
            ["strokeWidth"] = SerializeStyleValue(drawing.StrokeWidth)
        }),
        _ => null
    };
}

public class NamedStylePreset
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Type { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public Dictionary<string, JsonElement> Style { get; set; } = [];
    public string CreatedAt { get; set; } = string.Empty;
    public string UpdatedAt { get; set; } = string.Empty;
}

public class StylePresetPlacementPreference
{
    public string Mode { get; set; } = "theme-default";
    public string? PresetId { get; set; }
}

public enum BoardVisibility
{
    Private,
    Public,
    Shared
}

public class BoardMember
{
    public Guid UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public BoardRole Role { get; set; }
}

public enum BoardRole
{
    Owner,
    Editor,
    Viewer
}
