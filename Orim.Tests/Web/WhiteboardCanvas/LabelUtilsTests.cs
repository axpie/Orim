using Orim.Core.Models;
using WB = Orim.Web.Components.WhiteboardCanvas;

namespace Orim.Tests.Web.WhiteboardCanvas;

public class LabelUtilsTests
{
    [Theory]
    [InlineData(HorizontalLabelAlignment.Left, "left")]
    [InlineData(HorizontalLabelAlignment.Center, "center")]
    [InlineData(HorizontalLabelAlignment.Right, "right")]
    public void GetCssTextAlign_ReturnsCorrectValue(HorizontalLabelAlignment alignment, string expected)
    {
        Assert.Equal(expected, WB.GetCssTextAlign(alignment));
    }

    [Theory]
    [InlineData(HorizontalLabelAlignment.Left, "flex-start")]
    [InlineData(HorizontalLabelAlignment.Center, "center")]
    [InlineData(HorizontalLabelAlignment.Right, "flex-end")]
    public void GetCssJustifyContent_ReturnsCorrectValue(HorizontalLabelAlignment alignment, string expected)
    {
        Assert.Equal(expected, WB.GetCssJustifyContent(alignment));
    }

    [Theory]
    [InlineData(VerticalLabelAlignment.Top, "flex-start")]
    [InlineData(VerticalLabelAlignment.Middle, "center")]
    [InlineData(VerticalLabelAlignment.Bottom, "flex-end")]
    public void GetCssAlignItems_ReturnsCorrectValue(VerticalLabelAlignment alignment, string expected)
    {
        Assert.Equal(expected, WB.GetCssAlignItems(alignment));
    }

    [Fact]
    public void DoesTextFit_ShortText_LargeArea_ReturnsTrue()
    {
        Assert.True(WB.DoesTextFit("Hello", 500, 200, 16));
    }

    [Fact]
    public void DoesTextFit_LongText_SmallArea_ReturnsFalse()
    {
        var longText = new string('A', 1000);
        Assert.False(WB.DoesTextFit(longText, 50, 20, 16));
    }

    [Fact]
    public void DoesTextFit_ZeroWidth_ReturnsFalse()
    {
        Assert.False(WB.DoesTextFit("Hello", 0, 100, 16));
    }

    [Fact]
    public void DoesTextFit_ZeroHeight_ReturnsFalse()
    {
        Assert.False(WB.DoesTextFit("Hello", 100, 0, 16));
    }

    [Fact]
    public void DoesTextFit_ZeroFontSize_ReturnsFalse()
    {
        Assert.False(WB.DoesTextFit("Hello", 100, 100, 0));
    }

    [Fact]
    public void DoesTextFit_MultilineText_CountsLines()
    {
        var text = "Line1\nLine2\nLine3";
        // 3 lines at font=16 requires ~55.2px height
        Assert.True(WB.DoesTextFit(text, 200, 100, 16));
        Assert.False(WB.DoesTextFit(text, 200, 20, 16));
    }

    [Fact]
    public void EstimateFittingFontSize_NullText_ReturnsClampedPreferred()
    {
        var result = WB.EstimateFittingFontSize(null, 200, 100, 20, 48);
        Assert.Equal(20, result);
    }

    [Fact]
    public void EstimateFittingFontSize_EmptyText_ReturnsClampedPreferred()
    {
        var result = WB.EstimateFittingFontSize("", 200, 100, 20, 48);
        Assert.Equal(20, result);
    }

    [Fact]
    public void EstimateFittingFontSize_ShortText_ReturnsPreferred()
    {
        var result = WB.EstimateFittingFontSize("Hi", 300, 200, 24, 48);
        Assert.Equal(24, result);
    }

    [Fact]
    public void EstimateFittingFontSize_LongText_ReducesSize()
    {
        var longText = new string('X', 500);
        var result = WB.EstimateFittingFontSize(longText, 100, 80, 24, 48);
        Assert.True(result < 24);
        Assert.True(result >= WB.MinimumLabelFontSize);
    }

    [Fact]
    public void EstimateFittingFontSize_PreferredExceedsMaximum_ClampsToMaximum()
    {
        var result = WB.EstimateFittingFontSize("Hi", 500, 500, 60, 48);
        Assert.True(result <= 48);
    }
}
