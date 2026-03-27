using Orim.Core.Models;
using static Orim.Web.Components.WhiteboardCanvas;
using WB = Orim.Web.Components.WhiteboardCanvas;

namespace Orim.Tests.Web.WhiteboardCanvas;

public class ArrowRoutingTests
{
    // OffsetPoint
    [Theory]
    [InlineData(DockPoint.Top, 50, 40)]
    [InlineData(DockPoint.Bottom, 50, 60)]
    [InlineData(DockPoint.Left, 40, 50)]
    [InlineData(DockPoint.Right, 60, 50)]
    public void OffsetPoint_OffsetsInCorrectDirection(DockPoint dock, double expectedX, double expectedY)
    {
        var result = WB.OffsetPoint(new Point(50, 50), dock, 10);
        Assert.Equal(expectedX, result.X, 4);
        Assert.Equal(expectedY, result.Y, 4);
    }

    // ResolveFreeDock
    [Fact]
    public void ResolveFreeDock_RightOfTarget_ReturnsRight()
    {
        var result = WB.ResolveFreeDock(new Point(0, 0), new Point(100, 0));
        Assert.Equal(DockPoint.Right, result);
    }

    [Fact]
    public void ResolveFreeDock_LeftOfTarget_ReturnsLeft()
    {
        var result = WB.ResolveFreeDock(new Point(100, 0), new Point(0, 0));
        Assert.Equal(DockPoint.Left, result);
    }

    [Fact]
    public void ResolveFreeDock_BelowTarget_ReturnsBottom()
    {
        var result = WB.ResolveFreeDock(new Point(0, 0), new Point(0, 100));
        Assert.Equal(DockPoint.Bottom, result);
    }

    [Fact]
    public void ResolveFreeDock_AboveTarget_ReturnsTop()
    {
        var result = WB.ResolveFreeDock(new Point(0, 100), new Point(0, 0));
        Assert.Equal(DockPoint.Top, result);
    }

    [Fact]
    public void ResolveFreeDock_DiagonalDx_GreaterThanDy_ReturnsHorizontal()
    {
        var result = WB.ResolveFreeDock(new Point(0, 0), new Point(100, 50));
        Assert.True(result is DockPoint.Left or DockPoint.Right);
    }

    // NormalizeAngle
    [Fact]
    public void NormalizeAngle_Zero_ReturnsZero()
    {
        Assert.Equal(0, WB.NormalizeAngle(0), 6);
    }

    [Fact]
    public void NormalizeAngle_TwoPi_ReturnsZeroish()
    {
        var result = WB.NormalizeAngle(Math.PI * 2);
        Assert.True(Math.Abs(result) < 0.001);
    }

    [Fact]
    public void NormalizeAngle_NegativeTwoPi_ReturnsZeroish()
    {
        var result = WB.NormalizeAngle(-Math.PI * 2);
        Assert.True(Math.Abs(result) < 0.001);
    }

    [Fact]
    public void NormalizeAngle_LargePositive_NormalizedRange()
    {
        var result = WB.NormalizeAngle(Math.PI * 5);
        Assert.True(result > -Math.PI && result <= Math.PI);
    }

    // SnapPointToMagneticAngle
    [Fact]
    public void SnapPointToMagneticAngle_ExactlyOnStep_SnapsToAngle()
    {
        // Point exactly at 0° (horizontal right), step = 45, threshold = 5
        var result = WB.SnapPointToMagneticAngle(
            new Point(0, 0), new Point(100, 0), 45, 5);
        Assert.Equal(100, result.X, 2);
        Assert.Equal(0, result.Y, 2);
    }

    [Fact]
    public void SnapPointToMagneticAngle_SlightlyOffStep_Snaps()
    {
        // Point at ~2° off horizontal, should snap to 0° within 5° threshold
        var result = WB.SnapPointToMagneticAngle(
            new Point(0, 0), new Point(100, 3), 45, 5);
        Assert.Equal(0, result.Y, 1);
    }

    [Fact]
    public void SnapPointToMagneticAngle_FarFromStep_NoSnap()
    {
        // Point at ~26.5° angle, 45° step, 5° threshold - should NOT snap
        var result = WB.SnapPointToMagneticAngle(
            new Point(0, 0), new Point(100, 50), 45, 5);
        Assert.Equal(50, result.Y, 2);
    }

    [Fact]
    public void SnapPointToMagneticAngle_ZeroDistance_ReturnsOriginal()
    {
        var origin = new Point(50, 50);
        var result = WB.SnapPointToMagneticAngle(origin, origin, 45, 5);
        Assert.Equal(origin, result);
    }

    // BuildArrowPath - Straight
    [Fact]
    public void BuildArrowPath_Straight_ReturnsTwoPoints()
    {
        var start = new Point(0, 0);
        var end = new Point(100, 100);
        var result = WB.BuildArrowPath(start, DockPoint.Right, end, DockPoint.Left, ArrowRouteStyle.Straight);
        Assert.Equal(2, result.Count);
        Assert.Equal(start, result[0]);
        Assert.Equal(end, result[1]);
    }

    // BuildArrowPath - Orthogonal without obstacles
    [Fact]
    public void BuildArrowPath_Orthogonal_HorizontalToHorizontal_ReturnsPath()
    {
        var start = new Point(0, 0);
        var end = new Point(200, 100);
        var result = WB.BuildArrowPath(start, DockPoint.Right, end, DockPoint.Left, ArrowRouteStyle.Orthogonal);
        Assert.True(result.Count >= 2);
        Assert.Equal(start, result[0]);
        Assert.Equal(end, result[^1]);
    }

    [Fact]
    public void BuildArrowPath_Orthogonal_VerticalToVertical_ReturnsPath()
    {
        var start = new Point(0, 0);
        var end = new Point(100, 200);
        var result = WB.BuildArrowPath(start, DockPoint.Bottom, end, DockPoint.Top, ArrowRouteStyle.Orthogonal);
        Assert.True(result.Count >= 2);
        Assert.Equal(start, result[0]);
        Assert.Equal(end, result[^1]);
    }

    [Fact]
    public void BuildArrowPath_Orthogonal_HorizontalToVertical_ReturnsPath()
    {
        var start = new Point(0, 0);
        var end = new Point(100, 100);
        var result = WB.BuildArrowPath(start, DockPoint.Right, end, DockPoint.Top, ArrowRouteStyle.Orthogonal);
        Assert.True(result.Count >= 2);
        Assert.Equal(start, result[0]);
        Assert.Equal(end, result[^1]);
    }

    // SimplifyPoints
    [Fact]
    public void SimplifyPoints_RemovesCollinearPoints()
    {
        var points = new List<Point>
        {
            new(0, 0), new(5, 0), new(10, 0)
        };
        var result = WB.SimplifyPoints(points);
        Assert.Equal(2, result.Count);
        Assert.Equal(new Point(0, 0), result[0]);
        Assert.Equal(new Point(10, 0), result[1]);
    }

    [Fact]
    public void SimplifyPoints_KeepsBends()
    {
        var points = new List<Point>
        {
            new(0, 0), new(10, 0), new(10, 10)
        };
        var result = WB.SimplifyPoints(points);
        Assert.Equal(3, result.Count);
    }

    [Fact]
    public void SimplifyPoints_RemovesDuplicatePoints()
    {
        var points = new List<Point>
        {
            new(0, 0), new(0, 0), new(10, 0)
        };
        var result = WB.SimplifyPoints(points);
        Assert.Equal(2, result.Count);
    }

    [Fact]
    public void SimplifyPoints_SinglePoint_ReturnsSingle()
    {
        var points = new List<Point> { new(5, 5) };
        var result = WB.SimplifyPoints(points);
        Assert.Single(result);
    }

    [Fact]
    public void SimplifyPoints_Empty_ReturnsEmpty()
    {
        var result = WB.SimplifyPoints(new List<Point>());
        Assert.Empty(result);
    }

    // BuildArrowPath with obstacles
    [Fact]
    public void BuildArrowPath_Orthogonal_WithObstacles_ReturnsValidPath()
    {
        var start = new Point(0, 50);
        var end = new Point(200, 50);
        var obstacles = new List<(double X, double Y, double Width, double Height)>
        {
            (80, 20, 40, 60) // obstacle in the middle
        };
        var result = WB.BuildArrowPath(start, DockPoint.Right, end, DockPoint.Left, ArrowRouteStyle.Orthogonal, obstacles);
        Assert.True(result.Count >= 2);
        Assert.Equal(start, result[0]);
        Assert.Equal(end, result[^1]);
    }
}
