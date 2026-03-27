using Orim.Core.Models;
using static Orim.Web.Components.WhiteboardCanvas;
using WB = Orim.Web.Components.WhiteboardCanvas;

namespace Orim.Tests.Web.WhiteboardCanvas;

public class HitTestingTests
{
    [Fact]
    public void ElementIntersectsSelectionBounds_Overlapping_ReturnsTrue()
    {
        var element = new ShapeElement { X = 10, Y = 10, Width = 50, Height = 50 };
        var bounds = new SelectionBounds(30, 30, 40, 40);
        Assert.True(WB.ElementIntersectsSelectionBounds(element, bounds));
    }

    [Fact]
    public void ElementIntersectsSelectionBounds_NoOverlap_ReturnsFalse()
    {
        var element = new ShapeElement { X = 10, Y = 10, Width = 20, Height = 20 };
        var bounds = new SelectionBounds(100, 100, 40, 40);
        Assert.False(WB.ElementIntersectsSelectionBounds(element, bounds));
    }

    [Fact]
    public void ElementIntersectsSelectionBounds_Touching_ReturnsTrue()
    {
        var element = new ShapeElement { X = 0, Y = 0, Width = 50, Height = 50 };
        var bounds = new SelectionBounds(50, 50, 10, 10);
        Assert.True(WB.ElementIntersectsSelectionBounds(element, bounds));
    }

    [Fact]
    public void ElementIntersectsSelectionBounds_ContainedWithin_ReturnsTrue()
    {
        var element = new ShapeElement { X = 20, Y = 20, Width = 10, Height = 10 };
        var bounds = new SelectionBounds(0, 0, 100, 100);
        Assert.True(WB.ElementIntersectsSelectionBounds(element, bounds));
    }

    [Fact]
    public void PointInSelectionBounds_Inside_ReturnsTrue()
    {
        var point = new Point(50, 50);
        var bounds = new SelectionBounds(0, 0, 100, 100);
        Assert.True(WB.PointInSelectionBounds(point, bounds));
    }

    [Fact]
    public void PointInSelectionBounds_Outside_ReturnsFalse()
    {
        var point = new Point(150, 150);
        var bounds = new SelectionBounds(0, 0, 100, 100);
        Assert.False(WB.PointInSelectionBounds(point, bounds));
    }

    [Fact]
    public void PointInSelectionBounds_OnEdge_ReturnsTrue()
    {
        var point = new Point(0, 50);
        var bounds = new SelectionBounds(0, 0, 100, 100);
        Assert.True(WB.PointInSelectionBounds(point, bounds));
    }

    [Fact]
    public void LinesIntersect_CrossingLines_ReturnsTrue()
    {
        var result = WB.LinesIntersect(
            new Point(0, 0), new Point(10, 10),
            new Point(10, 0), new Point(0, 10));
        Assert.True(result);
    }

    [Fact]
    public void LinesIntersect_ParallelLines_ReturnsFalse()
    {
        var result = WB.LinesIntersect(
            new Point(0, 0), new Point(10, 0),
            new Point(0, 5), new Point(10, 5));
        Assert.False(result);
    }

    [Fact]
    public void LinesIntersect_NonIntersecting_ReturnsFalse()
    {
        var result = WB.LinesIntersect(
            new Point(0, 0), new Point(5, 5),
            new Point(6, 0), new Point(10, 0));
        Assert.False(result);
    }

    [Fact]
    public void LinesIntersect_TouchingAtEndpoint_ReturnsTrue()
    {
        var result = WB.LinesIntersect(
            new Point(0, 0), new Point(5, 5),
            new Point(5, 5), new Point(10, 0));
        Assert.True(result);
    }

    [Fact]
    public void SegmentIntersectsSelectionBounds_Through_ReturnsTrue()
    {
        var start = new Point(-10, 50);
        var end = new Point(200, 50);
        var bounds = new SelectionBounds(0, 0, 100, 100);
        Assert.True(WB.SegmentIntersectsSelectionBounds(start, end, bounds));
    }

    [Fact]
    public void SegmentIntersectsSelectionBounds_Inside_ReturnsTrue()
    {
        var start = new Point(30, 30);
        var end = new Point(70, 70);
        var bounds = new SelectionBounds(0, 0, 100, 100);
        Assert.True(WB.SegmentIntersectsSelectionBounds(start, end, bounds));
    }

    [Fact]
    public void SegmentIntersectsSelectionBounds_Outside_ReturnsFalse()
    {
        var start = new Point(-100, -100);
        var end = new Point(-50, -50);
        var bounds = new SelectionBounds(0, 0, 100, 100);
        Assert.False(WB.SegmentIntersectsSelectionBounds(start, end, bounds));
    }

    [Fact]
    public void PointToLineDistance_PointOnLine_ReturnsZero()
    {
        var distance = WB.PointToLineDistance(
            new Point(5, 5), new Point(0, 0), new Point(10, 10));
        Assert.Equal(0, distance, 4);
    }

    [Fact]
    public void PointToLineDistance_PointAboveLine_ReturnsCorrectDistance()
    {
        var distance = WB.PointToLineDistance(
            new Point(5, 10), new Point(0, 0), new Point(10, 0));
        Assert.Equal(10, distance, 4);
    }

    [Fact]
    public void PointToLineDistance_PointBeyondEnd_ClampsToEndpoint()
    {
        var distance = WB.PointToLineDistance(
            new Point(20, 0), new Point(0, 0), new Point(10, 0));
        Assert.Equal(10, distance, 4);
    }

    [Fact]
    public void PointToLineDistance_ZeroLengthSegment_ReturnsDistanceToPoint()
    {
        var distance = WB.PointToLineDistance(
            new Point(3, 4), new Point(0, 0), new Point(0, 0));
        Assert.Equal(5, distance, 4);
    }

    [Fact]
    public void IsPointNearPolyline_CloseToLine_ReturnsTrue()
    {
        var points = new List<Point> { new(0, 0), new(100, 0) };
        Assert.True(WB.IsPointNearPolyline(new Point(50, 3), points, 5));
    }

    [Fact]
    public void IsPointNearPolyline_FarFromLine_ReturnsFalse()
    {
        var points = new List<Point> { new(0, 0), new(100, 0) };
        Assert.False(WB.IsPointNearPolyline(new Point(50, 20), points, 5));
    }

    [Fact]
    public void IsPointNearPolyline_MultipleSegments_ChecksAll()
    {
        var points = new List<Point> { new(0, 0), new(50, 0), new(50, 50) };
        Assert.True(WB.IsPointNearPolyline(new Point(50, 25), points, 5));
    }
}
