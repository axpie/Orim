using System.Text.Json;
using Orim.Api.Contracts;
using Orim.Core;
using Orim.Core.Models;

namespace Orim.Tests.Api.Contracts;

public class BoardRequestSerializationTests
{
    [Fact]
    public void SaveBoardStateRequest_Deserializes_FormattedTextElements()
    {
        var json = """
        {
          "title": "Board",
          "labelOutlineEnabled": true,
          "arrowOutlineEnabled": true,
          "gridStyle": null,
          "surfaceColor": null,
          "themeKey": null,
          "enabledIconGroups": [],
          "customColors": [],
          "recentColors": [],
          "stickyNotePresets": [],
          "stylePresetState": null,
          "elements": [
            {
              "$type": "richtext",
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
            },
            {
              "$type": "markdown",
              "id": "22222222-2222-2222-2222-222222222222",
              "x": 40,
              "y": 60,
              "width": 220,
              "height": 120,
              "zIndex": 1,
              "rotation": 0,
              "label": "",
              "labelHorizontalAlignment": "Left",
              "labelVerticalAlignment": "Top",
              "fontSize": 18,
              "autoFontSize": false,
              "color": "#111827",
              "markdown": "# Hello",
              "scrollLeft": 0,
              "scrollTop": 24
            }
          ]
        }
        """;

        var request = JsonSerializer.Deserialize<SaveBoardStateRequest>(json, OrimJsonOptions.Default);

        Assert.NotNull(request);
        Assert.Collection(request.Elements!,
            element =>
            {
                var richText = Assert.IsType<RichTextElement>(element);
                Assert.Equal("<p>Hello</p>", richText.Html);
                Assert.Equal(4, richText.ScrollLeft);
                Assert.Equal(12, richText.ScrollTop);
            },
            element =>
            {
                var markdown = Assert.IsType<MarkdownElement>(element);
                Assert.Equal("# Hello", markdown.Markdown);
                Assert.Equal(0, markdown.ScrollLeft);
                Assert.Equal(24, markdown.ScrollTop);
            });
    }

    [Fact]
    public void SaveBoardStateRequest_InfersFormattedTextElementsWithoutDiscriminators()
    {
        var json = """
        {
          "title": "Board",
          "labelOutlineEnabled": true,
          "arrowOutlineEnabled": true,
          "gridStyle": null,
          "surfaceColor": null,
          "themeKey": null,
          "enabledIconGroups": [],
          "customColors": [],
          "recentColors": [],
          "stickyNotePresets": [],
          "stylePresetState": null,
          "elements": [
            {
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
            },
            {
              "id": "22222222-2222-2222-2222-222222222222",
              "x": 40,
              "y": 60,
              "width": 220,
              "height": 120,
              "zIndex": 1,
              "rotation": 0,
              "label": "",
              "labelHorizontalAlignment": "Left",
              "labelVerticalAlignment": "Top",
              "fontSize": 18,
              "autoFontSize": false,
              "color": "#111827",
              "markdown": "# Hello",
              "scrollLeft": 0,
              "scrollTop": 24
            }
          ]
        }
        """;

        var request = JsonSerializer.Deserialize<SaveBoardStateRequest>(json, OrimJsonOptions.Default);

        Assert.NotNull(request);
        Assert.Collection(request.Elements!,
            element => Assert.IsType<RichTextElement>(element),
            element => Assert.IsType<MarkdownElement>(element));
    }
}
