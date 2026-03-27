namespace Orim.Web.Components;

public partial class WhiteboardCanvas
{
    private static AlignmentMatch? GetCloserAlignmentMatch(AlignmentMatch? current, AlignmentMatch? candidate)
    {
        if (candidate is null)
        {
            return current;
        }

        if (current is null || candidate.Value.Distance < current.Value.Distance)
        {
            return candidate;
        }

        return current;
    }

    private static AlignmentMatch? FindAlignmentMatch(SelectionBounds movingBounds, SelectionBounds referenceBounds, bool vertical, double threshold)
    {
        var matches = FindAlignmentMatches(movingBounds, referenceBounds, vertical, threshold);
        return matches.Count == 0
            ? null
            : matches.MinBy(candidate => candidate.Distance);
    }

    private static IReadOnlyList<AlignmentMatch> FindAlignmentMatches(SelectionBounds movingBounds, SelectionBounds referenceBounds, bool vertical, double threshold)
    {
        var movingAnchors = vertical
            ? new[] { movingBounds.Left, movingBounds.Left + movingBounds.Width / 2, movingBounds.Left + movingBounds.Width }
            : new[] { movingBounds.Top, movingBounds.Top + movingBounds.Height / 2, movingBounds.Top + movingBounds.Height };

        var referenceAnchors = vertical
            ? new[] { referenceBounds.Left, referenceBounds.Left + referenceBounds.Width / 2, referenceBounds.Left + referenceBounds.Width }
            : new[] { referenceBounds.Top, referenceBounds.Top + referenceBounds.Height / 2, referenceBounds.Top + referenceBounds.Height };

        var matches = new List<AlignmentMatch>();

        foreach (var movingAnchor in movingAnchors)
        {
            foreach (var referenceAnchor in referenceAnchors)
            {
                var distance = Math.Abs(referenceAnchor - movingAnchor);
                if (distance > threshold)
                {
                    continue;
                }

                var start = vertical
                    ? Math.Min(movingBounds.Top, referenceBounds.Top)
                    : Math.Min(movingBounds.Left, referenceBounds.Left);
                var end = vertical
                    ? Math.Max(movingBounds.Top + movingBounds.Height, referenceBounds.Top + referenceBounds.Height)
                    : Math.Max(movingBounds.Left + movingBounds.Width, referenceBounds.Left + referenceBounds.Width);

                matches.Add(new AlignmentMatch(
                    vertical,
                    referenceAnchor,
                    start,
                    end,
                    referenceAnchor - movingAnchor,
                    distance));
            }
        }

        return matches;
    }

    private static void AddOrExtendAlignmentGuide(List<AlignmentGuide> guides, AlignmentGuide candidate)
    {
        for (var index = 0; index < guides.Count; index++)
        {
            var existing = guides[index];
            if (existing.IsVertical != candidate.IsVertical || Math.Abs(existing.Coordinate - candidate.Coordinate) > 0.1)
            {
                continue;
            }

            guides[index] = new AlignmentGuide(
                existing.IsVertical,
                existing.Coordinate,
                Math.Min(existing.Start, candidate.Start),
                Math.Max(existing.End, candidate.End));
            return;
        }

        guides.Add(candidate);
    }

    private static bool ResizeHandleMovesLeft(ResizeHandle handle) => handle is ResizeHandle.NorthWest or ResizeHandle.SouthWest or ResizeHandle.West;

    private static bool ResizeHandleMovesRight(ResizeHandle handle) => handle is ResizeHandle.NorthEast or ResizeHandle.East or ResizeHandle.SouthEast;

    private static bool ResizeHandleMovesTop(ResizeHandle handle) => handle is ResizeHandle.NorthWest or ResizeHandle.North or ResizeHandle.NorthEast;

    private static bool ResizeHandleMovesBottom(ResizeHandle handle) => handle is ResizeHandle.SouthWest or ResizeHandle.South or ResizeHandle.SouthEast;

    private static bool ResizeHandleMovesHorizontally(ResizeHandle handle) => ResizeHandleMovesLeft(handle) || ResizeHandleMovesRight(handle);

    private static bool ResizeHandleMovesVertically(ResizeHandle handle) => ResizeHandleMovesTop(handle) || ResizeHandleMovesBottom(handle);
}
