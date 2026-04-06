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
