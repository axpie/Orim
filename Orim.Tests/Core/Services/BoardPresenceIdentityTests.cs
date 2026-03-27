using Orim.Core.Services;

namespace Orim.Tests.Core.Services;

public class BoardPresenceIdentityTests
{
    [Fact]
    public void ResolveColor_SameSeed_ReturnsSameColor()
    {
        var color1 = BoardPresenceIdentity.ResolveColor("test-seed");
        var color2 = BoardPresenceIdentity.ResolveColor("test-seed");

        Assert.Equal(color1, color2);
    }

    [Fact]
    public void ResolveColor_DifferentSeeds_MayReturnDifferentColors()
    {
        var colors = Enumerable.Range(0, 20)
            .Select(i => BoardPresenceIdentity.ResolveColor($"seed-{i}"))
            .Distinct()
            .ToList();

        Assert.True(colors.Count > 1, "Expected different seeds to produce different colors");
    }

    [Fact]
    public void ResolveColor_ReturnsValidHexColor()
    {
        var color = BoardPresenceIdentity.ResolveColor("test");

        Assert.Matches("^#[0-9a-fA-F]{6}$", color);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void ResolveColor_NullOrEmpty_Throws(string? seed)
    {
        Assert.ThrowsAny<ArgumentException>(() => BoardPresenceIdentity.ResolveColor(seed!));
    }

    [Fact]
    public void CreateFantasyName_ReturnsNonEmptyString()
    {
        var name = BoardPresenceIdentity.CreateFantasyName();

        Assert.NotEmpty(name);
    }

    [Fact]
    public void CreateFantasyName_MatchesExpectedFormat()
    {
        var name = BoardPresenceIdentity.CreateFantasyName();
        var parts = name.Split(' ');

        Assert.Equal(3, parts.Length);
        Assert.True(int.TryParse(parts[2], out var number));
        Assert.InRange(number, 10, 99);
    }

    [Fact]
    public void CreateFantasyName_GeneratesVariousNames()
    {
        var names = Enumerable.Range(0, 50)
            .Select(_ => BoardPresenceIdentity.CreateFantasyName())
            .Distinct()
            .ToList();

        Assert.True(names.Count > 1, "Expected different fantasy names to be generated");
    }
}
