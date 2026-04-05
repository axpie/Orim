using System.Text.Json;
using Orim.Core;
using Orim.Core.Models;

namespace Orim.Tests.Core.Models;

public class BoardElementSerializationTests
{
    [Fact]
    public void ShapeElement_RoundTrips_ViaPolymorphicSerialization()
    {
        BoardElement element = new ShapeElement
        {
            Label = "Test",
            LabelColor = "#112233",
            FontFamily = "Georgia, serif",
            IsBold = true,
            IsUnderline = true,
            ShapeType = ShapeType.Ellipse,
            FillColor = "#FF0000",
            StrokeColor = "#00FF00",
            StrokeWidth = 3
        };

        var json = JsonSerializer.Serialize(element, OrimJsonOptions.Default);
        var deserialized = JsonSerializer.Deserialize<BoardElement>(json, OrimJsonOptions.Default);

        var shape = Assert.IsType<ShapeElement>(deserialized);
        Assert.Equal("Test", shape.Label);
        Assert.Equal("#112233", shape.LabelColor);
        Assert.Equal("Georgia, serif", shape.FontFamily);
        Assert.True(shape.IsBold);
        Assert.True(shape.IsUnderline);
        Assert.Equal(ShapeType.Ellipse, shape.ShapeType);
        Assert.Equal("#FF0000", shape.FillColor);
    }

    [Fact]
    public void TextElement_RoundTrips_ViaPolymorphicSerialization()
    {
        BoardElement element = new TextElement
        {
            Text = "Hello World",
            FontSize = 24,
            AutoFontSize = true,
            FontFamily = "Courier New, monospace",
            LabelHorizontalAlignment = HorizontalLabelAlignment.Center,
            LabelVerticalAlignment = VerticalLabelAlignment.Middle,
            Color = "#333333",
            IsBold = true,
            IsItalic = true,
            IsUnderline = true,
            IsStrikethrough = true
        };

        var json = JsonSerializer.Serialize(element, OrimJsonOptions.Default);
        var deserialized = JsonSerializer.Deserialize<BoardElement>(json, OrimJsonOptions.Default);

        var text = Assert.IsType<TextElement>(deserialized);
        Assert.Equal("Hello World", text.Text);
        Assert.Equal(24, text.FontSize);
        Assert.True(text.AutoFontSize);
        Assert.Equal("Courier New, monospace", text.FontFamily);
        Assert.Equal(HorizontalLabelAlignment.Center, text.LabelHorizontalAlignment);
        Assert.Equal(VerticalLabelAlignment.Middle, text.LabelVerticalAlignment);
        Assert.True(text.IsBold);
        Assert.True(text.IsItalic);
        Assert.True(text.IsUnderline);
        Assert.True(text.IsStrikethrough);
    }

    [Fact]
    public void ArrowElement_RoundTrips_ViaPolymorphicSerialization()
    {
        var sourceId = Guid.NewGuid();
        var targetId = Guid.NewGuid();
        BoardElement element = new ArrowElement
        {
            SourceElementId = sourceId,
            TargetElementId = targetId,
            SourceDock = DockPoint.Bottom,
            TargetDock = DockPoint.Top,
            StrokeColor = "#000000",
            LineStyle = ArrowLineStyle.Dashed,
            TargetHeadStyle = ArrowHeadStyle.OpenTriangle,
            RouteStyle = ArrowRouteStyle.Straight
        };

        var json = JsonSerializer.Serialize(element, OrimJsonOptions.Default);
        var deserialized = JsonSerializer.Deserialize<BoardElement>(json, OrimJsonOptions.Default);

        var arrow = Assert.IsType<ArrowElement>(deserialized);
        Assert.Equal(sourceId, arrow.SourceElementId);
        Assert.Equal(targetId, arrow.TargetElementId);
        Assert.Equal(DockPoint.Bottom, arrow.SourceDock);
        Assert.Equal(ArrowLineStyle.Dashed, arrow.LineStyle);
        Assert.Equal(ArrowRouteStyle.Straight, arrow.RouteStyle);
    }

    [Fact]
    public void StickyNoteElement_RoundTrips_ViaPolymorphicSerialization()
    {
        BoardElement element = new StickyNoteElement
        {
            Text = "Capture follow-up tasks",
            FontSize = 20,
            AutoFontSize = true,
            FontFamily = "Verdana, sans-serif",
            FillColor = "#FDE68A",
            Color = "#111827",
            IsBold = true,
            IsItalic = true,
            IsUnderline = true,
            IsStrikethrough = true
        };

        var json = JsonSerializer.Serialize(element, OrimJsonOptions.Default);
        var deserialized = JsonSerializer.Deserialize<BoardElement>(json, OrimJsonOptions.Default);

        var sticky = Assert.IsType<StickyNoteElement>(deserialized);
        Assert.Equal("Capture follow-up tasks", sticky.Text);
        Assert.Equal(20, sticky.FontSize);
        Assert.True(sticky.AutoFontSize);
        Assert.Equal("Verdana, sans-serif", sticky.FontFamily);
        Assert.Equal("#FDE68A", sticky.FillColor);
        Assert.Equal("#111827", sticky.Color);
        Assert.True(sticky.IsBold);
        Assert.True(sticky.IsItalic);
        Assert.True(sticky.IsUnderline);
        Assert.True(sticky.IsStrikethrough);
    }

    [Fact]
    public void FrameElement_RoundTrips_ViaPolymorphicSerialization()
    {
        BoardElement element = new FrameElement
        {
            Label = "Planning",
            FontFamily = "Arial, sans-serif",
            FillColor = "rgba(37, 99, 235, 0.08)",
            StrokeColor = "rgba(37, 99, 235, 0.48)",
            StrokeWidth = 3,
            IsBold = true
        };

        var json = JsonSerializer.Serialize(element, OrimJsonOptions.Default);
        var deserialized = JsonSerializer.Deserialize<BoardElement>(json, OrimJsonOptions.Default);

        var frame = Assert.IsType<FrameElement>(deserialized);
        Assert.Equal("Planning", frame.Label);
        Assert.Equal("Arial, sans-serif", frame.FontFamily);
        Assert.Equal("rgba(37, 99, 235, 0.08)", frame.FillColor);
        Assert.Equal("rgba(37, 99, 235, 0.48)", frame.StrokeColor);
        Assert.Equal(3, frame.StrokeWidth);
        Assert.True(frame.IsBold);
    }

    [Fact]
    public void IconElement_RoundTrips_ViaPolymorphicSerialization()
    {
        BoardElement element = new IconElement
        {
            IconName = "mdi-check",
            Color = "#00FF00"
        };

        var json = JsonSerializer.Serialize(element, OrimJsonOptions.Default);
        var deserialized = JsonSerializer.Deserialize<BoardElement>(json, OrimJsonOptions.Default);

        var icon = Assert.IsType<IconElement>(deserialized);
        Assert.Equal("mdi-check", icon.IconName);
        Assert.Equal("#00FF00", icon.Color);
    }

    [Fact]
    public void DrawingElement_RoundTrips_ViaPolymorphicSerialization()
    {
        BoardElement element = new DrawingElement
        {
            IsLocked = true,
            StrokeColor = "#2563EB",
            StrokeWidth = 4,
            Points = [10, 20, 25, 35, 42, 58]
        };

        var json = JsonSerializer.Serialize(element, OrimJsonOptions.Default);
        var deserialized = JsonSerializer.Deserialize<BoardElement>(json, OrimJsonOptions.Default);

        var drawing = Assert.IsType<DrawingElement>(deserialized);
        Assert.True(drawing.IsLocked);
        Assert.Equal("#2563EB", drawing.StrokeColor);
        Assert.Equal(4, drawing.StrokeWidth);
        Assert.Equal([10, 20, 25, 35, 42, 58], drawing.Points);
    }

    [Fact]
    public void MixedElementList_RoundTrips_Correctly()
    {
        var elements = new List<BoardElement>
        {
            new ShapeElement { Label = "Shape" },
            new TextElement { Text = "Text" },
            new StickyNoteElement { Text = "Sticky" },
            new FrameElement { Label = "Frame" },
            new ArrowElement { StrokeColor = "#111" },
            new IconElement { IconName = "mdi-star" },
            new DrawingElement { Points = [0, 0, 12, 18] }
        };

        var json = JsonSerializer.Serialize(elements, OrimJsonOptions.Default);
        var deserialized = JsonSerializer.Deserialize<List<BoardElement>>(json, OrimJsonOptions.Default)!;

        Assert.Equal(7, deserialized.Count);
        Assert.IsType<ShapeElement>(deserialized[0]);
        Assert.IsType<TextElement>(deserialized[1]);
        Assert.IsType<StickyNoteElement>(deserialized[2]);
        Assert.IsType<FrameElement>(deserialized[3]);
        Assert.IsType<ArrowElement>(deserialized[4]);
        Assert.IsType<IconElement>(deserialized[5]);
        Assert.IsType<DrawingElement>(deserialized[6]);
    }

    [Fact]
    public void EnumValues_SerializeAsStrings()
    {
        var element = new ShapeElement { ShapeType = ShapeType.Triangle };
        var json = JsonSerializer.Serialize<BoardElement>(element, OrimJsonOptions.Default);

        Assert.Contains("\"triangle\"", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void CamelCase_PropertyNaming_Applied()
    {
        var element = new ShapeElement { FillColor = "#FFF" };
        var json = JsonSerializer.Serialize<BoardElement>(element, OrimJsonOptions.Default);

        Assert.Contains("\"fillColor\"", json);
        Assert.DoesNotContain("\"FillColor\"", json);
    }
}
