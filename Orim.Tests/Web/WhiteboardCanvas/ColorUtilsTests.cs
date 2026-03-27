using Orim.Web.Components;
using static Orim.Web.Components.WhiteboardCanvas;
using WB = Orim.Web.Components.WhiteboardCanvas;

namespace Orim.Tests.Web.WhiteboardCanvas;

public class ColorUtilsTests
{
    [Theory]
    [InlineData("#ff0000", 255, 0, 0)]
    [InlineData("#00ff00", 0, 255, 0)]
    [InlineData("#0000ff", 0, 0, 255)]
    [InlineData("#FFFFFF", 255, 255, 255)]
    [InlineData("#000000", 0, 0, 0)]
    [InlineData("#1a2b3c", 0x1a, 0x2b, 0x3c)]
    public void TryParseCssColor_ParsesHex6(string input, byte r, byte g, byte b)
    {
        var result = WB.TryParseCssColor(input, out var color);
        Assert.True(result);
        Assert.Equal(new RgbColor(r, g, b), color);
    }

    [Theory]
    [InlineData("#f00", 255, 0, 0)]
    [InlineData("#0f0", 0, 255, 0)]
    [InlineData("#fff", 255, 255, 255)]
    public void TryParseCssColor_ParsesShortHex(string input, byte r, byte g, byte b)
    {
        var result = WB.TryParseCssColor(input, out var color);
        Assert.True(result);
        Assert.Equal(new RgbColor(r, g, b), color);
    }

    [Theory]
    [InlineData("rgb(255, 0, 0)", 255, 0, 0)]
    [InlineData("rgb(0,128,255)", 0, 128, 255)]
    [InlineData("RGB(10, 20, 30)", 10, 20, 30)]
    public void TryParseCssColor_ParsesRgb(string input, byte r, byte g, byte b)
    {
        var result = WB.TryParseCssColor(input, out var color);
        Assert.True(result);
        Assert.Equal(new RgbColor(r, g, b), color);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("red")]
    [InlineData("#gg0000")]
    [InlineData("#12")]
    [InlineData("rgb(")]
    [InlineData("rgb(1,2)")]
    public void TryParseCssColor_ReturnsFalseForInvalid(string input)
    {
        var result = WB.TryParseCssColor(input, out _);
        Assert.False(result);
    }

    [Fact]
    public void TryParseCssColor_ReturnsFalseForNull()
    {
        var result = WB.TryParseCssColor(null!, out _);
        Assert.False(result);
    }

    [Fact]
    public void GetRelativeLuminance_Black_ReturnsZero()
    {
        var luminance = WB.GetRelativeLuminance(new RgbColor(0, 0, 0));
        Assert.Equal(0, luminance, 6);
    }

    [Fact]
    public void GetRelativeLuminance_White_ReturnsOne()
    {
        var luminance = WB.GetRelativeLuminance(new RgbColor(255, 255, 255));
        Assert.Equal(1, luminance, 4);
    }

    [Fact]
    public void GetContrastRatio_BlackAndWhite_Returns21()
    {
        var ratio = WB.GetContrastRatio(
            new RgbColor(0, 0, 0), new RgbColor(255, 255, 255));
        Assert.Equal(21, ratio, 1);
    }

    [Fact]
    public void GetContrastRatio_SameColor_Returns1()
    {
        var ratio = WB.GetContrastRatio(
            new RgbColor(128, 128, 128), new RgbColor(128, 128, 128));
        Assert.Equal(1, ratio, 4);
    }

    [Fact]
    public void GetOutlineColor_DarkTextOnDarkBg_ReturnsWhite()
    {
        var result = WB.GetOutlineColor("#000000", "#111111");
        Assert.Equal("rgba(255,255,255,0.92)", result);
    }

    [Fact]
    public void GetOutlineColor_LightTextOnLightBg_ReturnsBlack()
    {
        var result = WB.GetOutlineColor("#ffffff", "#eeeeee");
        Assert.Equal("rgba(0,0,0,0.82)", result);
    }

    [Fact]
    public void GetOutlineColor_InvalidColors_FallsBackToWhite()
    {
        var result = WB.GetOutlineColor("notacolor", "alsonotacolor");
        Assert.Equal("rgba(255,255,255,0.92)", result);
    }

    [Fact]
    public void GetOutlineColor_OnlyTextColorValid_Dark_ReturnsWhite()
    {
        var result = WB.GetOutlineColor("#111111", "invalid");
        Assert.Equal("rgba(255,255,255,0.92)", result);
    }

    [Fact]
    public void GetOutlineColor_OnlyTextColorValid_Light_ReturnsBlack()
    {
        var result = WB.GetOutlineColor("#eeeeee", "invalid");
        Assert.Equal("rgba(0,0,0,0.82)", result);
    }
}
