using System.Text.Json.Serialization;

namespace Orim.Core.Models;

[JsonDerivedType(typeof(ShapeElement), "shape")]
[JsonDerivedType(typeof(TextElement), "text")]
[JsonDerivedType(typeof(ArrowElement), "arrow")]
[JsonDerivedType(typeof(IconElement), "icon")]
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
    Triangle
}

public class TextElement : BoardElement
{
    public string Text { get; set; } = string.Empty;
    public double FontSize { get; set; } = 16;
    public bool AutoFontSize { get; set; }
    public string Color { get; set; } = "#000000";
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
    Orthogonal
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
