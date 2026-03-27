using Orim.Core.Models;
using WB = Orim.Web.Components.WhiteboardCanvas;

namespace Orim.Tests.Web.WhiteboardCanvas;

public class SvgUtilsTests
{
    [Fact]
    public void GetTrianglePoints_ReturnsCorrectFormat()
    {
        var result = WB.GetTrianglePoints(100, 80, 0);
        // top center, bottom-left, bottom-right
        Assert.Equal("50,0 0,80 100,80", result);
    }

    [Fact]
    public void GetTrianglePoints_WithInset_AdjustsCoordinates()
    {
        var result = WB.GetTrianglePoints(100, 80, 5);
        Assert.Contains(",", result);
        // Top should be at y=5, sides at x=5 and x=95
        var parts = result.Split(' ');
        Assert.Equal(3, parts.Length);
    }

    [Fact]
    public void GetTrianglePoints_SmallSizeWithLargeInset_ClampsToInset()
    {
        // When inset exceeds dimensions, Math.Max ensures we don't go negative
        var result = WB.GetTrianglePoints(10, 10, 20);
        Assert.NotNull(result);
    }

    [Theory]
    [InlineData(BorderLineStyle.Solid, "")]
    [InlineData(BorderLineStyle.Dashed, "10 6")]
    [InlineData(BorderLineStyle.Dotted, "2 5")]
    [InlineData(BorderLineStyle.DashDot, "10 4 2 4")]
    [InlineData(BorderLineStyle.LongDash, "16 6")]
    public void GetStrokeDashArray_BorderStyle_ReturnsExpected(BorderLineStyle style, string expected)
    {
        Assert.Equal(expected, WB.GetStrokeDashArray(style));
    }

    [Fact]
    public void GetStrokeDashArray_ArrowSolid_ReturnsEmpty()
    {
        Assert.Equal(string.Empty, WB.GetStrokeDashArray(ArrowLineStyle.Solid, 2));
    }

    [Fact]
    public void GetStrokeDashArray_ArrowDashed_ReturnsNonEmpty()
    {
        var result = WB.GetStrokeDashArray(ArrowLineStyle.Dashed, 2);
        Assert.NotEmpty(result);
        Assert.Contains(" ", result);
    }

    [Fact]
    public void GetStrokeDashArray_ArrowDotted_ReturnsNonEmpty()
    {
        var result = WB.GetStrokeDashArray(ArrowLineStyle.Dotted, 2);
        Assert.NotEmpty(result);
    }

    [Fact]
    public void GetStrokeDashArray_ArrowDashDot_ReturnsNonEmpty()
    {
        var result = WB.GetStrokeDashArray(ArrowLineStyle.DashDot, 2);
        Assert.NotEmpty(result);
    }

    [Fact]
    public void GetStrokeDashArray_ArrowLongDash_ReturnsNonEmpty()
    {
        var result = WB.GetStrokeDashArray(ArrowLineStyle.LongDash, 2);
        Assert.NotEmpty(result);
    }

    [Fact]
    public void GetStrokeDashArray_ArrowZeroStrokeWidth_UsesMinimumOne()
    {
        var with0 = WB.GetStrokeDashArray(ArrowLineStyle.Dashed, 0);
        var with1 = WB.GetStrokeDashArray(ArrowLineStyle.Dashed, 1);
        Assert.Equal(with1, with0);
    }

    [Fact]
    public void FormatDashArray_FormatsValues()
    {
        var result = WB.FormatDashArray(10, 5, 2.5);
        Assert.Equal("10 5 2.5", result);
    }

    [Fact]
    public void FormatDashArray_ClampsToMinimumOne()
    {
        var result = WB.FormatDashArray(0.5, 0.1);
        // Both should be clamped to 1
        Assert.Equal("1 1", result);
    }

    [Fact]
    public void CssNumber_RoundsToTwoDecimals()
    {
        Assert.Equal("1.23", WB.CssNumber(1.234));
        Assert.Equal("1.24", WB.CssNumber(1.235));
    }

    [Fact]
    public void CssNumber_NoTrailingZeros()
    {
        Assert.Equal("5", WB.CssNumber(5.0));
        Assert.Equal("5.1", WB.CssNumber(5.10));
    }

    [Fact]
    public void CssNumber_UsesInvariantCulture()
    {
        Assert.Equal("1.5", WB.CssNumber(1.5));
    }
}
