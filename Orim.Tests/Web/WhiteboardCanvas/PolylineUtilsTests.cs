using Orim.Core.Models;
using static Orim.Web.Components.WhiteboardCanvas;
using WB = Orim.Web.Components.WhiteboardCanvas;

namespace Orim.Tests.Web.WhiteboardCanvas;

public class PolylineUtilsTests
{
    [Fact]
    public void GetPolylineLength_SingleSegment_ReturnsLength()
    {
        var points = new List<Point> { new(0, 0), new(3, 4) };
        Assert.Equal(5, WB.GetPolylineLength(points), 4);
    }

    [Fact]
    public void GetPolylineLength_MultipleSegments_ReturnsTotalLength()
    {
        var points = new List<Point> { new(0, 0), new(10, 0), new(10, 10) };
        Assert.Equal(20, WB.GetPolylineLength(points), 4);
    }

    [Fact]
    public void GetPolylineLength_SinglePoint_ReturnsZero()
    {
        var points = new List<Point> { new(5, 5) };
        Assert.Equal(0, WB.GetPolylineLength(points), 4);
    }

    [Fact]
    public void GetPointAlongPolyline_EmptyList_ReturnsDefault()
    {
        var result = WB.GetPointAlongPolyline(new List<Point>(), 0.5);
        Assert.Equal(default, result);
    }

    [Fact]
    public void GetPointAlongPolyline_SinglePoint_ReturnsThatPoint()
    {
        var point = new Point(7, 3);
        var result = WB.GetPointAlongPolyline(new List<Point> { point }, 0.5);
        Assert.Equal(point, result);
    }

    [Fact]
    public void GetPointAlongPolyline_AtStart_ReturnsFirstPoint()
    {
        var points = new List<Point> { new(0, 0), new(10, 0) };
        var result = WB.GetPointAlongPolyline(points, 0);
        Assert.Equal(0, result.X, 4);
        Assert.Equal(0, result.Y, 4);
    }

    [Fact]
    public void GetPointAlongPolyline_AtEnd_ReturnsLastPoint()
    {
        var points = new List<Point> { new(0, 0), new(10, 0) };
        var result = WB.GetPointAlongPolyline(points, 1);
        Assert.Equal(10, result.X, 4);
        Assert.Equal(0, result.Y, 4);
    }

    [Fact]
    public void GetPointAlongPolyline_AtMidpoint_ReturnsMiddle()
    {
        var points = new List<Point> { new(0, 0), new(10, 0) };
        var result = WB.GetPointAlongPolyline(points, 0.5);
        Assert.Equal(5, result.X, 4);
        Assert.Equal(0, result.Y, 4);
    }

    [Fact]
    public void GetPointAlongPolyline_MultiSegment_CorrectPosition()
    {
        // L-shape: (0,0) -> (10,0) -> (10,10), total length = 20
        var points = new List<Point> { new(0, 0), new(10, 0), new(10, 10) };
        var result = WB.GetPointAlongPolyline(points, 0.75);
        // 75% of 20 = 15, so 10 along first segment + 5 along second
        Assert.Equal(10, result.X, 4);
        Assert.Equal(5, result.Y, 4);
    }

    [Fact]
    public void GetPointAlongPolyline_ClampsBeyondOne()
    {
        var points = new List<Point> { new(0, 0), new(10, 0) };
        var result = WB.GetPointAlongPolyline(points, 2.0);
        Assert.Equal(10, result.X, 4);
    }

    [Fact]
    public void MovePointToward_MovesCorrectly()
    {
        var result = WB.MovePointToward(new Point(0, 0), new Point(10, 0), 3);
        Assert.Equal(3, result.X, 4);
        Assert.Equal(0, result.Y, 4);
    }

    [Fact]
    public void MovePointToward_ZeroDistance_ReturnsSamePoint()
    {
        var point = new Point(5, 5);
        var result = WB.MovePointToward(point, new Point(10, 10), 0);
        Assert.Equal(point, result);
    }

    [Fact]
    public void MovePointToward_SamePoint_ReturnsSamePoint()
    {
        var point = new Point(5, 5);
        var result = WB.MovePointToward(point, point, 10);
        Assert.Equal(point, result);
    }

    [Fact]
    public void MovePointToward_DistanceExceedsLength_ClampsNearTarget()
    {
        var result = WB.MovePointToward(new Point(0, 0), new Point(5, 0), 100);
        // Should clamp to length - 0.5 = 4.5
        Assert.True(result.X < 5);
        Assert.True(result.X > 0);
    }

    [Theory]
    [InlineData(ArrowHeadStyle.FilledTriangle, true)]
    [InlineData(ArrowHeadStyle.OpenTriangle, true)]
    [InlineData(ArrowHeadStyle.None, false)]
    public void RequiresLineTrim_CorrectForStyles(ArrowHeadStyle style, bool expected)
    {
        Assert.Equal(expected, WB.RequiresLineTrim(style));
    }

    [Fact]
    public void GetTrimmedArrowLinePoints_NoTrim_ReturnsSamePoints()
    {
        var points = new List<Point> { new(0, 0), new(100, 0) };
        var result = WB.GetTrimmedArrowLinePoints(points, ArrowHeadStyle.None, ArrowHeadStyle.None, 10);
        Assert.Equal(0, result[0].X, 4);
        Assert.Equal(100, result[1].X, 4);
    }

    [Fact]
    public void GetTrimmedArrowLinePoints_TrimsSource()
    {
        var points = new List<Point> { new(0, 0), new(100, 0) };
        var result = WB.GetTrimmedArrowLinePoints(points, ArrowHeadStyle.FilledTriangle, ArrowHeadStyle.None, 10);
        Assert.True(result[0].X > 0);
        Assert.Equal(100, result[1].X, 4);
    }

    [Fact]
    public void GetTrimmedArrowLinePoints_TrimsTarget()
    {
        var points = new List<Point> { new(0, 0), new(100, 0) };
        var result = WB.GetTrimmedArrowLinePoints(points, ArrowHeadStyle.None, ArrowHeadStyle.FilledTriangle, 10);
        Assert.Equal(0, result[0].X, 4);
        Assert.True(result[^1].X < 100);
    }

    [Fact]
    public void GetTrimmedArrowLinePoints_SinglePoint_ReturnsAsList()
    {
        var points = new List<Point> { new(50, 50) };
        var result = WB.GetTrimmedArrowLinePoints(points, ArrowHeadStyle.FilledTriangle, ArrowHeadStyle.FilledTriangle, 10);
        Assert.Single(result);
    }
}
