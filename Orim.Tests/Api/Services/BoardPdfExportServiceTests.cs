using System.Text;
using Orim.Api.Services;
using Orim.Core.Models;

namespace Orim.Tests.Api.Services;

public sealed class BoardPdfExportServiceTests
{
    [Fact]
    public void Export_WithStickyNote_ReturnsPdfDocument()
    {
        var board = new Board
        {
            Title = "Sticky notes",
            Elements =
            [
                new StickyNoteElement
                {
                    X = 120,
                    Y = 80,
                    Width = 220,
                    Height = 160,
                    Text = "Follow up with the ORIM team",
                    FillColor = "#FDE68A",
                    Color = "#111827"
                }
            ]
        };

        var sut = new BoardPdfExportService();

        var pdfBytes = sut.Export(board);

        Assert.NotEmpty(pdfBytes);
        Assert.Equal("%PDF", Encoding.ASCII.GetString(pdfBytes, 0, 4));
    }

    [Fact]
    public void Export_WithFrame_ReturnsPdfDocument()
    {
        var board = new Board
        {
            Title = "Frames",
            Elements =
            [
                new FrameElement
                {
                    X = 80,
                    Y = 60,
                    Width = 320,
                    Height = 220,
                    Label = "Quarterly plan",
                    FillColor = "rgba(37, 99, 235, 0.08)",
                    StrokeColor = "rgba(37, 99, 235, 0.48)"
                },
                new StickyNoteElement
                {
                    X = 120,
                    Y = 132,
                    Width = 180,
                    Height = 120,
                    Text = "Milestones",
                    FillColor = "#FDE68A",
                    Color = "#111827"
                }
            ]
        };

        var sut = new BoardPdfExportService();

        var pdfBytes = sut.Export(board);

        Assert.NotEmpty(pdfBytes);
        Assert.Equal("%PDF", Encoding.ASCII.GetString(pdfBytes, 0, 4));
    }
}
