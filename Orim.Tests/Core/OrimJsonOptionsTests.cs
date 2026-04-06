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
            Comments =
            [
                new BoardComment
                {
                    AuthorUserId = Guid.NewGuid(),
                    AuthorUsername = "alice",
                    X = 120.5,
                    Y = 340.25,
                    Text = "Please review",
                    Replies =
                    [
                        new BoardCommentReply
                        {
                            AuthorUserId = Guid.NewGuid(),
                            AuthorUsername = "bob",
                            Text = "Looks good"
                        }
                    ]
                }
            ],
            Elements =
            [
                new ShapeElement { Label = "S1", ShapeType = ShapeType.Ellipse },
                new ArrowElement { LineStyle = ArrowLineStyle.Dashed },
                new StickyNoteElement { Text = "Sticky" },
                new FrameElement { Label = "Area" }
            ]
        };

        var json = JsonSerializer.Serialize(board, OrimJsonOptions.Default);
        var deserialized = JsonSerializer.Deserialize<Board>(json, OrimJsonOptions.Default);

        Assert.NotNull(deserialized);
        Assert.Equal("Test Board", deserialized.Title);
        Assert.Equal(BoardVisibility.Shared, deserialized.Visibility);
        Assert.Equal(4, deserialized.Elements.Count);
        Assert.Single(deserialized.Comments);
        Assert.Single(deserialized.Comments[0].Replies);
        Assert.IsType<ShapeElement>(deserialized.Elements[0]);
        Assert.IsType<ArrowElement>(deserialized.Elements[1]);
        Assert.IsType<StickyNoteElement>(deserialized.Elements[2]);
        Assert.IsType<FrameElement>(deserialized.Elements[3]);
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
