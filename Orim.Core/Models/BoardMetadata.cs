namespace Orim.Core.Models;

public sealed record BoardTemplateDefinition(
    string Id,
    string IconName,
    string TitleResourceKey,
    string DescriptionResourceKey);

public class BoardSnapshot
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid BoardId { get; set; }
    public string Name { get; set; } = string.Empty;
    public Guid CreatedByUserId { get; set; }
    public string CreatedByUsername { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string ContentJson { get; set; } = string.Empty;
}

public class BoardSnapshotContent
{
    public string Title { get; set; } = string.Empty;
    public bool LabelOutlineEnabled { get; set; } = true;
    public bool ArrowOutlineEnabled { get; set; } = true;
    public List<string> EnabledIconGroups { get; set; } = Board.DefaultEnabledIconGroups.ToList();
    public List<string> CustomColors { get; set; } = [];
    public List<string> RecentColors { get; set; } = [];
    public List<StickyNotePreset> StickyNotePresets { get; set; } = [];
    public List<BoardElement> Elements { get; set; } = [];
}
