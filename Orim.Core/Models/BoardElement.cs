using System.Text.Json.Serialization;

namespace Orim.Core.Models;

[JsonPolymorphic(TypeDiscriminatorPropertyName = "$type")]
[JsonDerivedType(typeof(ShapeElement), "shape")]
[JsonDerivedType(typeof(TextElement), "text")]
[JsonDerivedType(typeof(StickyNoteElement), "sticky")]
[JsonDerivedType(typeof(FrameElement), "frame")]
[JsonDerivedType(typeof(ArrowElement), "arrow")]
[JsonDerivedType(typeof(IconElement), "icon")]
[JsonDerivedType(typeof(FileElement), "file")]
[JsonDerivedType(typeof(DrawingElement), "drawing")]
public abstract class BoardElement
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? GroupId { get; set; }
    public double X { get; set; }
    public double Y { get; set; }
    public double Width { get; set; }
    public double Height { get; set; }
    public int ZIndex { get; set; }
    public double Rotation { get; set; }
    public string Label { get; set; } = string.Empty;
    public double? LabelFontSize { get; set; }
    public string? LabelColor { get; set; }
    public string? FontFamily { get; set; }
    public bool IsBold { get; set; }
    public bool IsItalic { get; set; }
    public bool IsUnderline { get; set; }
    public bool IsStrikethrough { get; set; }
    public bool IsLocked { get; set; }
    public HorizontalLabelAlignment LabelHorizontalAlignment { get; set; } = HorizontalLabelAlignment.Center;
    public VerticalLabelAlignment LabelVerticalAlignment { get; set; } = VerticalLabelAlignment.Middle;
}

public enum HorizontalLabelAlignment
{
    Left,
    Center,
    Right
}

public enum VerticalLabelAlignment
{
    Top,
    Middle,
    Bottom
}

public class ShapeElement : BoardElement
{
    public ShapeType ShapeType { get; set; } = ShapeType.Rectangle;
    public string FillColor { get; set; } = "#FFFFFF";
    public string StrokeColor { get; set; } = "#000000";
    public double StrokeWidth { get; set; } = 2;
    public BorderLineStyle BorderLineStyle { get; set; } = BorderLineStyle.Solid;
}

public enum BorderLineStyle
{
    Solid,
    Dashed,
    Dotted,
    DashDot,
    LongDash,
    Double
}

public enum ShapeType
{
    Rectangle,
    Ellipse,
    Triangle,
    Rhombus
}

public class TextElement : BoardElement
{
    public string Text { get; set; } = string.Empty;
    public double FontSize { get; set; } = 16;
    public bool AutoFontSize { get; set; }
    public string Color { get; set; } = "#000000";
}

public class StickyNoteElement : BoardElement
{
    public StickyNoteElement()
    {
        LabelHorizontalAlignment = HorizontalLabelAlignment.Left;
        LabelVerticalAlignment = VerticalLabelAlignment.Top;
    }

    public string Text { get; set; } = string.Empty;
    public double FontSize { get; set; } = 16;
    public bool AutoFontSize { get; set; }
    public string FillColor { get; set; } = "#FDE68A";
    public string Color { get; set; } = "#111827";
}

public class FrameElement : BoardElement
{
    public FrameElement()
    {
        LabelHorizontalAlignment = HorizontalLabelAlignment.Left;
        LabelVerticalAlignment = VerticalLabelAlignment.Top;
    }

    public string FillColor { get; set; } = "rgba(37, 99, 235, 0.08)";
    public string StrokeColor { get; set; } = "rgba(37, 99, 235, 0.48)";
    public double StrokeWidth { get; set; } = 2;
}

public class ArrowElement : BoardElement
{
    public Guid? SourceElementId { get; set; }
    public Guid? TargetElementId { get; set; }
    public double? SourceX { get; set; }
    public double? SourceY { get; set; }
    public double? TargetX { get; set; }
    public double? TargetY { get; set; }
    public DockPoint SourceDock { get; set; } = DockPoint.Right;
    public DockPoint TargetDock { get; set; } = DockPoint.Left;
    public string StrokeColor { get; set; } = "#000000";
    public double StrokeWidth { get; set; } = 2;
    public ArrowLineStyle LineStyle { get; set; } = ArrowLineStyle.Solid;
    public ArrowHeadStyle SourceHeadStyle { get; set; } = ArrowHeadStyle.None;
    public ArrowHeadStyle TargetHeadStyle { get; set; } = ArrowHeadStyle.FilledTriangle;
    public ArrowRouteStyle RouteStyle { get; set; } = ArrowRouteStyle.Orthogonal;
    public double? OrthogonalMiddleCoordinate { get; set; }
    public double? ArcMidX { get; set; }
    public double? ArcMidY { get; set; }
}

public enum ArrowLineStyle
{
    Solid,
    Dashed,
    Dotted,
    DashDot,
    LongDash
}

public enum ArrowHeadStyle
{
    None,
    FilledTriangle,
    OpenTriangle,
    FilledCircle,
    OpenCircle
}

public enum ArrowRouteStyle
{
    Straight,
    Orthogonal,
    Arc
}

public enum DockPoint
{
    Top,
    Bottom,
    Left,
    Right,
    Center
}

public class IconElement : BoardElement
{
    public string IconName { get; set; } = "mdi-star";
    public string Color { get; set; } = "#0f172a";
}

public enum ImageFit
{
    Uniform,
    UniformToFill,
    Fill,
}

public class FileElement : BoardElement
{
    public string FileUrl { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long FileSize { get; set; }
    /// <summary>Only relevant when ContentType is an image type.</summary>
    public double Opacity { get; set; } = 1.0;
    /// <summary>Only relevant when ContentType is an image type.</summary>
    public ImageFit ImageFit { get; set; } = ImageFit.Uniform;
}

public class DrawingElement : BoardElement
{
    /// <summary>
    /// Flat [x1,y1,x2,y2,...] coordinate list. Null entries act as pen-lift separators
    /// between strokes (JSON encodes NaN as null).
    /// </summary>
    public List<double?> Points { get; set; } = [];
    public string StrokeColor { get; set; } = "#000000";
    public double StrokeWidth { get; set; } = 2;
}
