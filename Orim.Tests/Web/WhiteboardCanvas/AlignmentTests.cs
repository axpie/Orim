using static Orim.Web.Components.WhiteboardCanvas;
using WB = Orim.Web.Components.WhiteboardCanvas;

namespace Orim.Tests.Web.WhiteboardCanvas;

public class AlignmentTests
{
    [Fact]
    public void GetCloserAlignmentMatch_BothNull_ReturnsNull()
    {
        Assert.Null(WB.GetCloserAlignmentMatch(null, null));
    }

    [Fact]
    public void GetCloserAlignmentMatch_CurrentNull_ReturnsCandidate()
    {
        var candidate = new AlignmentMatch(true, 50, 0, 100, 2, 2);
        var result = WB.GetCloserAlignmentMatch(null, candidate);
        Assert.Equal(candidate, result);
    }

    [Fact]
    public void GetCloserAlignmentMatch_CandidateNull_ReturnsCurrent()
    {
        var current = new AlignmentMatch(true, 50, 0, 100, 2, 2);
        var result = WB.GetCloserAlignmentMatch(current, null);
        Assert.Equal(current, result);
    }

    [Fact]
    public void GetCloserAlignmentMatch_CandidateCloser_ReturnsCandidate()
    {
        var current = new AlignmentMatch(true, 50, 0, 100, 5, 5);
        var candidate = new AlignmentMatch(true, 50, 0, 100, 1, 1);
        var result = WB.GetCloserAlignmentMatch(current, candidate);
        Assert.Equal(candidate, result);
    }

    [Fact]
    public void GetCloserAlignmentMatch_CurrentCloser_ReturnsCurrent()
    {
        var current = new AlignmentMatch(true, 50, 0, 100, 1, 1);
        var candidate = new AlignmentMatch(true, 50, 0, 100, 5, 5);
        var result = WB.GetCloserAlignmentMatch(current, candidate);
        Assert.Equal(current, result);
    }

    [Fact]
    public void FindAlignmentMatches_VerticalOverlap_FindsMatches()
    {
        var moving = new SelectionBounds(100, 0, 50, 50);
        var reference = new SelectionBounds(100, 100, 50, 50);
        var matches = WB.FindAlignmentMatches(moving, reference, true, 5);
        Assert.True(matches.Count > 0);
    }

    [Fact]
    public void FindAlignmentMatches_NoOverlap_ReturnsEmpty()
    {
        var moving = new SelectionBounds(0, 0, 50, 50);
        var reference = new SelectionBounds(500, 500, 50, 50);
        var matches = WB.FindAlignmentMatches(moving, reference, true, 5);
        Assert.Equal(0, matches.Count);
    }

    [Fact]
    public void FindAlignmentMatches_HorizontalAligned_FindsMatches()
    {
        // Same left edge
        var moving = new SelectionBounds(100, 0, 50, 50);
        var reference = new SelectionBounds(100, 100, 80, 80);
        var matches = WB.FindAlignmentMatches(moving, reference, true, 5);
        Assert.Contains(matches, m => Math.Abs(m.Distance) < 0.1);
    }

    [Fact]
    public void FindAlignmentMatch_ReturnsClosest()
    {
        var moving = new SelectionBounds(101, 0, 50, 50);
        var reference = new SelectionBounds(100, 100, 50, 50);
        var match = WB.FindAlignmentMatch(moving, reference, true, 5);
        Assert.NotNull(match);
        Assert.True(match.Value.Distance <= 5);
    }

    [Fact]
    public void FindAlignmentMatch_NoMatch_ReturnsNull()
    {
        var moving = new SelectionBounds(0, 0, 50, 50);
        var reference = new SelectionBounds(500, 500, 50, 50);
        var match = WB.FindAlignmentMatch(moving, reference, true, 5);
        Assert.Null(match);
    }

    [Fact]
    public void AddOrExtendAlignmentGuide_NewGuide_Adds()
    {
        var guides = new List<AlignmentGuide>();
        WB.AddOrExtendAlignmentGuide(guides, new AlignmentGuide(true, 100, 0, 50));
        Assert.Single(guides);
        Assert.Equal(100, guides[0].Coordinate);
    }

    [Fact]
    public void AddOrExtendAlignmentGuide_OverlappingCoordinate_ExtendExisting()
    {
        var guides = new List<AlignmentGuide>
        {
            new(true, 100, 0, 50)
        };
        WB.AddOrExtendAlignmentGuide(guides, new AlignmentGuide(true, 100, 30, 80));
        Assert.Single(guides);
        Assert.Equal(0, guides[0].Start);
        Assert.Equal(80, guides[0].End);
    }

    [Fact]
    public void AddOrExtendAlignmentGuide_DifferentCoordinate_AddsSeparate()
    {
        var guides = new List<AlignmentGuide>
        {
            new(true, 100, 0, 50)
        };
        WB.AddOrExtendAlignmentGuide(guides, new AlignmentGuide(true, 200, 0, 50));
        Assert.Equal(2, guides.Count);
    }

    [Fact]
    public void AddOrExtendAlignmentGuide_DifferentAxis_AddsSeparate()
    {
        var guides = new List<AlignmentGuide>
        {
            new(true, 100, 0, 50)
        };
        WB.AddOrExtendAlignmentGuide(guides, new AlignmentGuide(false, 100, 0, 50));
        Assert.Equal(2, guides.Count);
    }

    // ResizeHandle tests
    [Fact]
    public void ResizeHandleMovesLeft_CorrectForHandles()
    {
        Assert.True(WB.ResizeHandleMovesLeft(ResizeHandle.NorthWest));
        Assert.True(WB.ResizeHandleMovesLeft(ResizeHandle.SouthWest));
        Assert.True(WB.ResizeHandleMovesLeft(ResizeHandle.West));
        Assert.False(WB.ResizeHandleMovesLeft(ResizeHandle.North));
        Assert.False(WB.ResizeHandleMovesLeft(ResizeHandle.East));
    }

    [Fact]
    public void ResizeHandleMovesRight_CorrectForHandles()
    {
        Assert.True(WB.ResizeHandleMovesRight(ResizeHandle.NorthEast));
        Assert.True(WB.ResizeHandleMovesRight(ResizeHandle.East));
        Assert.True(WB.ResizeHandleMovesRight(ResizeHandle.SouthEast));
        Assert.False(WB.ResizeHandleMovesRight(ResizeHandle.North));
        Assert.False(WB.ResizeHandleMovesRight(ResizeHandle.West));
    }

    [Fact]
    public void ResizeHandleMovesTop_CorrectForHandles()
    {
        Assert.True(WB.ResizeHandleMovesTop(ResizeHandle.NorthWest));
        Assert.True(WB.ResizeHandleMovesTop(ResizeHandle.North));
        Assert.True(WB.ResizeHandleMovesTop(ResizeHandle.NorthEast));
        Assert.False(WB.ResizeHandleMovesTop(ResizeHandle.South));
        Assert.False(WB.ResizeHandleMovesTop(ResizeHandle.East));
    }

    [Fact]
    public void ResizeHandleMovesBottom_CorrectForHandles()
    {
        Assert.True(WB.ResizeHandleMovesBottom(ResizeHandle.SouthWest));
        Assert.True(WB.ResizeHandleMovesBottom(ResizeHandle.South));
        Assert.True(WB.ResizeHandleMovesBottom(ResizeHandle.SouthEast));
        Assert.False(WB.ResizeHandleMovesBottom(ResizeHandle.North));
        Assert.False(WB.ResizeHandleMovesBottom(ResizeHandle.West));
    }

    [Fact]
    public void ResizeHandleMovesHorizontally_CornerHandles_ReturnsTrue()
    {
        Assert.True(WB.ResizeHandleMovesHorizontally(ResizeHandle.NorthWest));
        Assert.True(WB.ResizeHandleMovesHorizontally(ResizeHandle.SouthEast));
    }

    [Fact]
    public void ResizeHandleMovesHorizontally_VerticalOnly_ReturnsFalse()
    {
        Assert.False(WB.ResizeHandleMovesHorizontally(ResizeHandle.North));
        Assert.False(WB.ResizeHandleMovesHorizontally(ResizeHandle.South));
    }

    [Fact]
    public void ResizeHandleMovesVertically_CornerHandles_ReturnsTrue()
    {
        Assert.True(WB.ResizeHandleMovesVertically(ResizeHandle.NorthWest));
        Assert.True(WB.ResizeHandleMovesVertically(ResizeHandle.SouthEast));
    }

    [Fact]
    public void ResizeHandleMovesVertically_HorizontalOnly_ReturnsFalse()
    {
        Assert.False(WB.ResizeHandleMovesVertically(ResizeHandle.East));
        Assert.False(WB.ResizeHandleMovesVertically(ResizeHandle.West));
    }
}
