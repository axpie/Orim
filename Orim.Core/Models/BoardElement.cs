using System.Text.Json.Serialization;

namespace Orim.Core.Models;

[JsonDerivedType(typeof(ShapeElement), "shape")]
[JsonDerivedType(typeof(TextElement), "text")]
[JsonDerivedType(typeof(ArrowElement), "arrow")]
[JsonDerivedType(typeof(StickyNoteElement), "stickyNote")]
public abstract class BoardElement
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public double X { get; set; }
    public double Y { get; set; }
    public double Width { get; set; }
    public double Height { get; set; }
    public int ZIndex { get; set; }
    public double Rotation { get; set; }
}

public class ShapeElement : BoardElement
{
    public ShapeType ShapeType { get; set; } = ShapeType.Rectangle;
    public string FillColor { get; set; } = "#FFFFFF";
    public string StrokeColor { get; set; } = "#000000";
    public double StrokeWidth { get; set; } = 2;
}

public enum ShapeType
{
    Rectangle,
    Ellipse,
    Triangle
}

public class TextElement : BoardElement
{
    public string Text { get; set; } = string.Empty;
    public double FontSize { get; set; } = 16;
    public string Color { get; set; } = "#000000";
    public bool IsBold { get; set; }
    public bool IsItalic { get; set; }
}

public class ArrowElement : BoardElement
{
    public Guid? SourceElementId { get; set; }
    public Guid? TargetElementId { get; set; }
    public DockPoint SourceDock { get; set; } = DockPoint.Right;
    public DockPoint TargetDock { get; set; } = DockPoint.Left;
    public string StrokeColor { get; set; } = "#000000";
    public double StrokeWidth { get; set; } = 2;
}

public enum DockPoint
{
    Top,
    Bottom,
    Left,
    Right,
    Center
}

public class StickyNoteElement : BoardElement
{
    public string Text { get; set; } = string.Empty;
    public string BackgroundColor { get; set; } = "#FFEB3B";
    public double FontSize { get; set; } = 14;
}
