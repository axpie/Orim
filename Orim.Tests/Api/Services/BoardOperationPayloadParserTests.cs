using System.Text.Json;
using Orim.Api.Contracts;
using Orim.Api.Services;
using Orim.Core;
using Orim.Core.Models;

namespace Orim.Tests.Api.Services;

public sealed class BoardOperationPayloadParserTests
{
    [Fact]
    public void ParseSingle_ParsesValidBoardOperationPayload()
    {
        var payload = ToOperationJsonElement(new BoardElementAddedOperationDto(CreateShapeElement()));

        var operation = BoardOperationPayloadParser.ParseSingle(payload);

        var added = Assert.IsType<BoardElementAddedOperationDto>(operation);
        var shape = Assert.IsType<ShapeElement>(added.Element);
        Assert.Equal("Reconnect-safe", shape.Label);
    }

    [Fact]
    public void ParseSingle_ThrowsClientSafeException_ForInvalidPayload()
    {
        var payload = ParseJson("""{"elementId":"missing-type"}""");

        var exception = Assert.Throws<BoardOperationPayloadParseException>(() => BoardOperationPayloadParser.ParseSingle(payload));

        Assert.Equal(BoardOperationPayloadParser.InvalidPayloadMessage, exception.ClientMessage);
        Assert.Null(exception.Index);
        Assert.NotNull(exception.InnerException);
    }

    [Fact]
    public void ParseSingle_InfersFormattedTextElementType_WhenElementDiscriminatorIsMissing()
    {
        var payload = ParseJson("""
            {
              "type": "element.updated",
              "element": {
                "id": "11111111-1111-1111-1111-111111111111",
                "x": 10,
                "y": 20,
                "width": 220,
                "height": 120,
                "zIndex": 0,
                "rotation": 0,
                "label": "",
                "labelHorizontalAlignment": "Left",
                "labelVerticalAlignment": "Top",
                "fontSize": 18,
                "autoFontSize": false,
                "color": "#111827",
                "html": "<p>Hello</p>",
                "scrollLeft": 4,
                "scrollTop": 12
              }
            }
            """);

        var operation = BoardOperationPayloadParser.ParseSingle(payload);

        var updated = Assert.IsType<BoardElementUpdatedOperationDto>(operation);
        var richText = Assert.IsType<RichTextElement>(updated.Element);
        Assert.Equal("<p>Hello</p>", richText.Html);
        Assert.Equal(4, richText.ScrollLeft);
        Assert.Equal(12, richText.ScrollTop);
    }

    [Fact]
    public void ParseMany_ParsesValidPayloads()
    {
        var payloads = new[]
        {
            ToOperationJsonElement(new BoardElementDeletedOperationDto("shape-1")),
            ToOperationJsonElement(new BoardMetadataUpdatedOperationDto(Title: "Recovered")),
        };

        var operations = BoardOperationPayloadParser.ParseMany(payloads);

        Assert.Collection(
            operations,
            operation => Assert.IsType<BoardElementDeletedOperationDto>(operation),
            operation =>
            {
                var metadata = Assert.IsType<BoardMetadataUpdatedOperationDto>(operation);
                Assert.Equal("Recovered", metadata.Title);
            });
    }

    [Fact]
    public void ParseMany_ReportsTheInvalidPayloadIndex()
    {
        var validPayload = JsonSerializer.Serialize<BoardOperationDto>(new BoardElementDeletedOperationDto("shape-1"), OrimJsonOptions.Default);
        var payloads = ParseJsonArray($$"""
            [
              {{validPayload}},
              { "elementId": "missing-type" }
            ]
            """);

        var exception = Assert.Throws<BoardOperationPayloadParseException>(() => BoardOperationPayloadParser.ParseMany(payloads));

        Assert.Equal(1, exception.Index);
        Assert.Equal(BoardOperationPayloadParser.GetInvalidPayloadMessage(1), exception.ClientMessage);
        Assert.NotNull(exception.InnerException);
    }

    private static ShapeElement CreateShapeElement() => new()
    {
        Id = Guid.Parse("11111111-1111-1111-1111-111111111111"),
        X = 12,
        Y = 24,
        Width = 180,
        Height = 96,
        ZIndex = 3,
        Rotation = 0,
        Label = "Reconnect-safe",
        LabelHorizontalAlignment = HorizontalLabelAlignment.Center,
        LabelVerticalAlignment = VerticalLabelAlignment.Middle,
        ShapeType = ShapeType.Rectangle,
        FillColor = "#ffffff",
        StrokeColor = "#0f172a",
        StrokeWidth = 2,
        BorderLineStyle = BorderLineStyle.Solid
    };

    private static JsonElement ToOperationJsonElement(BoardOperationDto value)
    {
        var json = JsonSerializer.Serialize<BoardOperationDto>(value, OrimJsonOptions.Default);
        return ParseJson(json);
    }

    private static JsonElement ParseJson(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    private static JsonElement[] ParseJsonArray(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement
            .EnumerateArray()
            .Select(static item => item.Clone())
            .ToArray();
    }
}
