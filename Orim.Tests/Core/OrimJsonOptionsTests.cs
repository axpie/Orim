using System.Text.Json;
using Orim.Core;
using Orim.Core.Models;

namespace Orim.Tests.Core;

public class OrimJsonOptionsTests
{
    [Fact]
    public void Default_UsesCamelCase()
    {
        var board = new Board { Title = "Test" };
        var json = JsonSerializer.Serialize(board, OrimJsonOptions.Default);

        Assert.Contains("\"title\"", json);
        Assert.DoesNotContain("\"Title\"", json);
    }

    [Fact]
    public void Default_SerializesEnumsAsStrings()
    {
        var board = new Board { Visibility = BoardVisibility.Public };
        var json = JsonSerializer.Serialize(board, OrimJsonOptions.Default);

        Assert.Contains("\"public\"", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Default_IsNotIndented()
    {
        var board = new Board { Title = "Test" };
        var json = JsonSerializer.Serialize(board, OrimJsonOptions.Default);

        Assert.DoesNotContain('\n', json);
    }

    [Fact]
    public void Indented_IsIndented()
    {
        var board = new Board { Title = "Test" };
        var json = JsonSerializer.Serialize(board, OrimJsonOptions.Indented);

        Assert.Contains('\n', json);
    }

    [Fact]
    public void Default_RoundTrips_Board()
    {
        var board = new Board
        {
            Title = "Test Board",
            Visibility = BoardVisibility.Shared,
            Elements =
            [
                new ShapeElement { Label = "S1", ShapeType = ShapeType.Ellipse },
                new ArrowElement { LineStyle = ArrowLineStyle.Dashed }
            ]
        };

        var json = JsonSerializer.Serialize(board, OrimJsonOptions.Default);
        var deserialized = JsonSerializer.Deserialize<Board>(json, OrimJsonOptions.Default);

        Assert.NotNull(deserialized);
        Assert.Equal("Test Board", deserialized.Title);
        Assert.Equal(BoardVisibility.Shared, deserialized.Visibility);
        Assert.Equal(2, deserialized.Elements.Count);
        Assert.IsType<ShapeElement>(deserialized.Elements[0]);
        Assert.IsType<ArrowElement>(deserialized.Elements[1]);
    }

    [Fact]
    public void Indented_RoundTrips_Board()
    {
        var board = new Board { Title = "Test" };

        var json = JsonSerializer.Serialize(board, OrimJsonOptions.Indented);
        var deserialized = JsonSerializer.Deserialize<Board>(json, OrimJsonOptions.Indented);

        Assert.NotNull(deserialized);
        Assert.Equal("Test", deserialized.Title);
    }

    [Fact]
    public void Default_DeserializesEnumStrings()
    {
        var json = """{"visibility":"shared","title":"Test","customColors":[],"recentColors":[],"members":[],"elements":[],"snapshots":[]}""";
        var board = JsonSerializer.Deserialize<Board>(json, OrimJsonOptions.Default);

        Assert.NotNull(board);
        Assert.Equal(BoardVisibility.Shared, board.Visibility);
    }
}
