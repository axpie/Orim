using Orim.Core.Models;

namespace Orim.Web.Components;

public partial class WhiteboardCanvas
{
    private IReadOnlyList<BoardElement> GetElementsInSelectionBounds(SelectionBounds bounds)
    {
        if (Board is null)
        {
            return [];
        }

        var selection = new List<BoardElement>();

        foreach (var element in Board.Elements.OrderBy(element => element.ZIndex))
        {
            var intersects = element switch
            {
                ArrowElement arrow => ArrowIntersectsSelectionBounds(arrow, bounds),
                _ => ElementIntersectsSelectionBounds(element, bounds)
            };

            if (!intersects)
            {
                continue;
            }

            foreach (var scopedElement in ResolveSelectionScope(element))
            {
                if (selection.All(candidate => candidate.Id != scopedElement.Id))
                {
                    selection.Add(scopedElement);
                }
            }
        }

        return selection;
    }

    private static bool ElementIntersectsSelectionBounds(BoardElement element, SelectionBounds bounds)
    {
        var elementRight = element.X + element.Width;
        var elementBottom = element.Y + element.Height;
        var selectionRight = bounds.Left + bounds.Width;
        var selectionBottom = bounds.Top + bounds.Height;

        return element.X <= selectionRight &&
               elementRight >= bounds.Left &&
               element.Y <= selectionBottom &&
               elementBottom >= bounds.Top;
    }

    private void SetAlignmentGuides(IEnumerable<AlignmentGuide> guides)
    {
        _activeAlignmentGuides.Clear();
        _activeAlignmentGuides.AddRange(guides);
    }

    private void ClearAlignmentGuides() => _activeAlignmentGuides.Clear();

    private (double DeltaX, double DeltaY, IReadOnlyList<AlignmentGuide> Guides) GetSnappedSelectionDelta(double deltaX, double deltaY)
    {
        if (Board is null)
        {
            return (deltaX, deltaY, []);
        }

        var draggedBounds = GetDraggedSelectionBounds(deltaX, deltaY);
        if (draggedBounds is null)
        {
            return (deltaX, deltaY, []);
        }

        var selectedIds = _dragStartPositions.Keys.ToHashSet();
        var threshold = ElementAlignmentSnapThresholdScreen / _zoom;
        AlignmentMatch? verticalMatch = null;
        AlignmentMatch? horizontalMatch = null;

        foreach (var element in Board.Elements.Where(element => element is not ArrowElement && !selectedIds.Contains(element.Id)))
        {
            var referenceBounds = new SelectionBounds(element.X, element.Y, element.Width, element.Height);
            verticalMatch = GetCloserAlignmentMatch(verticalMatch, FindAlignmentMatch(draggedBounds.Value, referenceBounds, true, threshold));
            horizontalMatch = GetCloserAlignmentMatch(horizontalMatch, FindAlignmentMatch(draggedBounds.Value, referenceBounds, false, threshold));
        }

        var guides = new List<AlignmentGuide>(2);

        if (verticalMatch is AlignmentMatch vertical)
        {
            deltaX += vertical.Delta;
            guides.Add(new AlignmentGuide(true, vertical.Coordinate, vertical.Start, vertical.End));
        }

        if (horizontalMatch is AlignmentMatch horizontal)
        {
            deltaY += horizontal.Delta;
            guides.Add(new AlignmentGuide(false, horizontal.Coordinate, horizontal.Start, horizontal.End));
        }

        return (deltaX, deltaY, guides);
    }

    private IReadOnlyList<AlignmentGuide> GetAlignmentGuidesForBounds(SelectionBounds movingBounds, IEnumerable<BoardElement> referenceElements, bool includeVertical = true, bool includeHorizontal = true)
    {
        var threshold = ElementAlignmentSnapThresholdScreen / _zoom;
        var guides = new List<AlignmentGuide>();

        foreach (var element in referenceElements)
        {
            var referenceBounds = new SelectionBounds(element.X, element.Y, element.Width, element.Height);
            if (includeVertical)
            {
                foreach (var match in FindAlignmentMatches(movingBounds, referenceBounds, true, threshold))
                {
                    AddOrExtendAlignmentGuide(guides, new AlignmentGuide(true, match.Coordinate, match.Start, match.End));
                }
            }

            if (includeHorizontal)
            {
                foreach (var match in FindAlignmentMatches(movingBounds, referenceBounds, false, threshold))
                {
                    AddOrExtendAlignmentGuide(guides, new AlignmentGuide(false, match.Coordinate, match.Start, match.End));
                }
            }
        }

        return guides;
    }

    private SelectionBounds GetSnappedResizeBounds(SelectionBounds proposedBounds, IReadOnlyList<BoardElement> referenceElements)
    {
        var snappedBounds = proposedBounds;

        if (ResizeHandleMovesHorizontally(_activeResizeHandle))
        {
            var verticalMatch = GetBestResizeAlignmentMatch(snappedBounds, referenceElements, true);
            if (verticalMatch is ResizeAlignmentMatch match)
            {
                snappedBounds = ApplyResizeAlignmentMatch(snappedBounds, match);
            }
        }

        if (ResizeHandleMovesVertically(_activeResizeHandle))
        {
            var horizontalMatch = GetBestResizeAlignmentMatch(snappedBounds, referenceElements, false);
            if (horizontalMatch is ResizeAlignmentMatch match)
            {
                snappedBounds = ApplyResizeAlignmentMatch(snappedBounds, match);
            }
        }

        return snappedBounds;
    }

    private ResizeAlignmentMatch? GetBestResizeAlignmentMatch(SelectionBounds movingBounds, IEnumerable<BoardElement> referenceElements, bool vertical)
    {
        var threshold = ElementAlignmentSnapThresholdScreen / _zoom;
        ResizeAlignmentMatch? bestMatch = null;

        foreach (var element in referenceElements)
        {
            var referenceBounds = new SelectionBounds(element.X, element.Y, element.Width, element.Height);
            var candidate = FindResizeAlignmentMatch(movingBounds, referenceBounds, vertical, threshold);
            if (candidate is null)
            {
                continue;
            }

            if (bestMatch is null || candidate.Value.Distance < bestMatch.Value.Distance)
            {
                bestMatch = candidate;
            }
        }

        return bestMatch;
    }

    private ResizeAlignmentMatch? FindResizeAlignmentMatch(SelectionBounds movingBounds, SelectionBounds referenceBounds, bool vertical, double threshold)
    {
        var referenceAnchors = vertical
            ? new[] { referenceBounds.Left, referenceBounds.Left + referenceBounds.Width / 2, referenceBounds.Left + referenceBounds.Width }
            : new[] { referenceBounds.Top, referenceBounds.Top + referenceBounds.Height / 2, referenceBounds.Top + referenceBounds.Height };

        var candidates = new List<ResizeAlignmentMatch>();

        if (vertical)
        {
            if (ResizeHandleMovesLeft(_activeResizeHandle))
            {
                AddResizeAlignmentCandidates(candidates, true, movingBounds.Left, 1, movingBounds.Width, referenceAnchors, threshold);
                AddResizeAlignmentCandidates(candidates, true, movingBounds.Left + movingBounds.Width / 2, 2, movingBounds.Width, referenceAnchors, threshold);
            }

            if (ResizeHandleMovesRight(_activeResizeHandle))
            {
                AddResizeAlignmentCandidates(candidates, true, movingBounds.Left + movingBounds.Width, 1, movingBounds.Width, referenceAnchors, threshold);
                AddResizeAlignmentCandidates(candidates, true, movingBounds.Left + movingBounds.Width / 2, 2, movingBounds.Width, referenceAnchors, threshold);
            }
        }
        else
        {
            if (ResizeHandleMovesTop(_activeResizeHandle))
            {
                AddResizeAlignmentCandidates(candidates, false, movingBounds.Top, 1, movingBounds.Height, referenceAnchors, threshold);
                AddResizeAlignmentCandidates(candidates, false, movingBounds.Top + movingBounds.Height / 2, 2, movingBounds.Height, referenceAnchors, threshold);
            }

            if (ResizeHandleMovesBottom(_activeResizeHandle))
            {
                AddResizeAlignmentCandidates(candidates, false, movingBounds.Top + movingBounds.Height, 1, movingBounds.Height, referenceAnchors, threshold);
                AddResizeAlignmentCandidates(candidates, false, movingBounds.Top + movingBounds.Height / 2, 2, movingBounds.Height, referenceAnchors, threshold);
            }
        }

        return candidates.Count == 0 ? null : candidates.MinBy(candidate => candidate.Distance);
    }

    private void AddResizeAlignmentCandidates(List<ResizeAlignmentMatch> candidates, bool vertical, double movingAnchor, double scaleFactor, double currentSize, IEnumerable<double> referenceAnchors, double threshold)
    {
        foreach (var referenceAnchor in referenceAnchors)
        {
            var anchorDistance = referenceAnchor - movingAnchor;
            if (Math.Abs(anchorDistance) > threshold)
            {
                continue;
            }

            var appliedDelta = anchorDistance * scaleFactor;
            var nextSize = AffectsLeadingResizeEdge(vertical)
                ? currentSize - appliedDelta
                : currentSize + appliedDelta;

            if (nextSize < MinimumRectangleSize)
            {
                continue;
            }

            candidates.Add(new ResizeAlignmentMatch(vertical, appliedDelta, Math.Abs(anchorDistance)));
        }
    }

    private SelectionBounds ApplyResizeAlignmentMatch(SelectionBounds bounds, ResizeAlignmentMatch match)
    {
        if (match.IsVertical)
        {
            if (ResizeHandleMovesLeft(_activeResizeHandle))
            {
                return new SelectionBounds(bounds.Left + match.AppliedDelta, bounds.Top, bounds.Width - match.AppliedDelta, bounds.Height);
            }

            if (ResizeHandleMovesRight(_activeResizeHandle))
            {
                return new SelectionBounds(bounds.Left, bounds.Top, bounds.Width + match.AppliedDelta, bounds.Height);
            }
        }
        else
        {
            if (ResizeHandleMovesTop(_activeResizeHandle))
            {
                return new SelectionBounds(bounds.Left, bounds.Top + match.AppliedDelta, bounds.Width, bounds.Height - match.AppliedDelta);
            }

            if (ResizeHandleMovesBottom(_activeResizeHandle))
            {
                return new SelectionBounds(bounds.Left, bounds.Top, bounds.Width, bounds.Height + match.AppliedDelta);
            }
        }

        return bounds;
    }

    private static bool ResizeHandleMovesLeft(ResizeHandle handle) => handle is ResizeHandle.NorthWest or ResizeHandle.SouthWest or ResizeHandle.West;

    private static bool ResizeHandleMovesRight(ResizeHandle handle) => handle is ResizeHandle.NorthEast or ResizeHandle.East or ResizeHandle.SouthEast;

    private static bool ResizeHandleMovesTop(ResizeHandle handle) => handle is ResizeHandle.NorthWest or ResizeHandle.North or ResizeHandle.NorthEast;

    private static bool ResizeHandleMovesBottom(ResizeHandle handle) => handle is ResizeHandle.SouthWest or ResizeHandle.South or ResizeHandle.SouthEast;

    private static bool ResizeHandleMovesHorizontally(ResizeHandle handle) => ResizeHandleMovesLeft(handle) || ResizeHandleMovesRight(handle);

    private static bool ResizeHandleMovesVertically(ResizeHandle handle) => ResizeHandleMovesTop(handle) || ResizeHandleMovesBottom(handle);

    private bool AffectsLeadingResizeEdge(bool vertical) => vertical
        ? ResizeHandleMovesLeft(_activeResizeHandle)
        : ResizeHandleMovesTop(_activeResizeHandle);

    private SelectionBounds? GetDraggedSelectionBounds(double deltaX, double deltaY)
    {
        var draggedElements = _selectedElements.Where(element => _dragStartPositions.ContainsKey(element.Id)).ToList();
        if (draggedElements.Count == 0)
        {
            return null;
        }

        double? left = null;
        double? top = null;
        double? right = null;
        double? bottom = null;

        foreach (var element in draggedElements)
        {
            var start = _dragStartPositions[element.Id];
            var elementLeft = start.X + deltaX;
            var elementTop = start.Y + deltaY;
            var elementRight = elementLeft + element.Width;
            var elementBottom = elementTop + element.Height;

            left = left is null ? elementLeft : Math.Min(left.Value, elementLeft);
            top = top is null ? elementTop : Math.Min(top.Value, elementTop);
            right = right is null ? elementRight : Math.Max(right.Value, elementRight);
            bottom = bottom is null ? elementBottom : Math.Max(bottom.Value, elementBottom);
        }

        return left is null || top is null || right is null || bottom is null
            ? null
            : new SelectionBounds(left.Value, top.Value, right.Value - left.Value, bottom.Value - top.Value);
    }

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

    private bool ArrowIntersectsSelectionBounds(ArrowElement arrow, SelectionBounds bounds)
    {
        var renderData = GetArrowRenderData(arrow);
        if (renderData is null)
        {
            return false;
        }

        var points = renderData.Value.Points;
        if (points.Any(point => PointInSelectionBounds(point, bounds)))
        {
            return true;
        }

        for (var index = 0; index < points.Count - 1; index++)
        {
            if (SegmentIntersectsSelectionBounds(points[index], points[index + 1], bounds))
            {
                return true;
            }
        }

        return false;
    }

    private static bool PointInSelectionBounds(Point point, SelectionBounds bounds)
    {
        return point.X >= bounds.Left &&
               point.X <= bounds.Left + bounds.Width &&
               point.Y >= bounds.Top &&
               point.Y <= bounds.Top + bounds.Height;
    }

    private static bool SegmentIntersectsSelectionBounds(Point start, Point end, SelectionBounds bounds)
    {
        if (PointInSelectionBounds(start, bounds) || PointInSelectionBounds(end, bounds))
        {
            return true;
        }

        var topLeft = new Point(bounds.Left, bounds.Top);
        var topRight = new Point(bounds.Left + bounds.Width, bounds.Top);
        var bottomLeft = new Point(bounds.Left, bounds.Top + bounds.Height);
        var bottomRight = new Point(bounds.Left + bounds.Width, bounds.Top + bounds.Height);

        return LinesIntersect(start, end, topLeft, topRight)
            || LinesIntersect(start, end, topRight, bottomRight)
            || LinesIntersect(start, end, bottomRight, bottomLeft)
            || LinesIntersect(start, end, bottomLeft, topLeft);
    }

    private static bool LinesIntersect(Point a1, Point a2, Point b1, Point b2)
    {
        static double Cross(Point origin, Point first, Point second) =>
            (first.X - origin.X) * (second.Y - origin.Y) - (first.Y - origin.Y) * (second.X - origin.X);

        static bool OnSegment(Point start, Point point, Point end) =>
            point.X >= Math.Min(start.X, end.X) - 0.001 &&
            point.X <= Math.Max(start.X, end.X) + 0.001 &&
            point.Y >= Math.Min(start.Y, end.Y) - 0.001 &&
            point.Y <= Math.Max(start.Y, end.Y) + 0.001;

        var d1 = Cross(a1, a2, b1);
        var d2 = Cross(a1, a2, b2);
        var d3 = Cross(b1, b2, a1);
        var d4 = Cross(b1, b2, a2);

        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
            ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)))
        {
            return true;
        }

        if (Math.Abs(d1) < 0.001 && OnSegment(a1, b1, a2))
        {
            return true;
        }

        if (Math.Abs(d2) < 0.001 && OnSegment(a1, b2, a2))
        {
            return true;
        }

        if (Math.Abs(d3) < 0.001 && OnSegment(b1, a1, b2))
        {
            return true;
        }

        return Math.Abs(d4) < 0.001 && OnSegment(b1, a2, b2);
    }

    private Point ClampToSurface(Point point) => new(
        Clamp(SanitizeCoordinate(point.X), 0, Math.Max(0, SanitizeCoordinate(_surfaceSize.Width))),
        Clamp(SanitizeCoordinate(point.Y), 0, Math.Max(0, SanitizeCoordinate(_surfaceSize.Height))));

    private static double SanitizeCoordinate(double value) =>
        double.IsFinite(value) ? value : 0;

    private static double Clamp(double value, double min, double max) => Math.Max(min, Math.Min(max, value));

    private static double PointToLineDistance(Point point, Point start, Point end)
    {
        var dx = end.X - start.X;
        var dy = end.Y - start.Y;
        var lengthSquared = dx * dx + dy * dy;
        if (lengthSquared == 0)
        {
            return Math.Sqrt(Math.Pow(point.X - start.X, 2) + Math.Pow(point.Y - start.Y, 2));
        }

        var projection = Math.Clamp(((point.X - start.X) * dx + (point.Y - start.Y) * dy) / lengthSquared, 0, 1);
        var projectionX = start.X + projection * dx;
        var projectionY = start.Y + projection * dy;
        return Math.Sqrt(Math.Pow(point.X - projectionX, 2) + Math.Pow(point.Y - projectionY, 2));
    }

    private static bool IsPointNearPolyline(Point point, IReadOnlyList<Point> points, double tolerance)
    {
        for (var index = 0; index < points.Count - 1; index++)
        {
            if (PointToLineDistance(point, points[index], points[index + 1]) <= tolerance)
            {
                return true;
            }
        }

        return false;
    }

    private static Point GetDockPosition(BoardElement element, DockPoint dockPoint) => dockPoint switch
    {
        DockPoint.Top => new Point(element.X + element.Width / 2, element.Y),
        DockPoint.Bottom => new Point(element.X + element.Width / 2, element.Y + element.Height),
        DockPoint.Left => new Point(element.X, element.Y + element.Height / 2),
        DockPoint.Right => new Point(element.X + element.Width, element.Y + element.Height / 2),
        _ => new Point(element.X + element.Width / 2, element.Y + element.Height / 2)
    };

    private IEnumerable<DockHandleDefinition> GetDockHandles()
    {
        if (Board is null)
        {
            yield break;
        }

        var draft = _draftArrow;
        var endpointDrag = _arrowEndpointDrag;

        foreach (var element in Board.Elements.Where(element => element is not ArrowElement))
        {
            foreach (var dockPoint in new[] { DockPoint.Top, DockPoint.Right, DockPoint.Bottom, DockPoint.Left })
            {
                var isActive = (draft is not null && draft.Value.SourceElementId == element.Id && draft.Value.SourceDock == dockPoint)
                    || (endpointDrag is not null && endpointDrag.Value.HoverElementId == element.Id && endpointDrag.Value.HoverDock == dockPoint);
                var isTarget = draft is not null && draft.Value.TargetElementId == element.Id && draft.Value.TargetDock == dockPoint;
                yield return new DockHandleDefinition(element.Id, dockPoint, GetDockPosition(element, dockPoint), isActive, isTarget);
            }
        }
    }

    private IEnumerable<ArrowEndpointHandleDefinition> GetArrowEndpointHandles(ArrowElement arrow)
    {
        var renderData = GetArrowRenderData(arrow);
        if (renderData is null || renderData.Value.Points.Count < 2)
        {
            yield break;
        }

        yield return new ArrowEndpointHandleDefinition(true, renderData.Value.Points[0], _arrowEndpointDrag is not null && _arrowEndpointDrag.Value.ArrowId == arrow.Id && _arrowEndpointDrag.Value.IsSource);
        yield return new ArrowEndpointHandleDefinition(false, renderData.Value.Points[^1], _arrowEndpointDrag is not null && _arrowEndpointDrag.Value.ArrowId == arrow.Id && !_arrowEndpointDrag.Value.IsSource);
    }

    private ArrowMiddleSegmentHandleDefinition? GetArrowMiddleSegmentHandle(ArrowElement arrow)
    {
        if (!TryResolveOrthogonalMiddleSegment(arrow, out var isVertical, out var start, out var end, out _))
        {
            return null;
        }

        return new ArrowMiddleSegmentHandleDefinition(
            isVertical,
            start,
            end,
            new Point((start.X + end.X) / 2, (start.Y + end.Y) / 2),
            _arrowMiddleSegmentDrag is not null && _arrowMiddleSegmentDrag.Value.ArrowId == arrow.Id);
    }

    private ArrowEndpointHandleDefinition? GetArrowEndpointHandleAtPoint(ArrowElement arrow, Point point)
    {
        foreach (var handle in GetArrowEndpointHandles(arrow))
        {
            var hitSize = 18 / _zoom;
            if (Math.Abs(point.X - handle.Center.X) <= hitSize && Math.Abs(point.Y - handle.Center.Y) <= hitSize)
            {
                return handle;
            }
        }

        return null;
    }

    private ArrowMiddleSegmentHandleDefinition? GetArrowMiddleSegmentHandleAtPoint(ArrowElement arrow, Point point)
    {
        var handle = GetArrowMiddleSegmentHandle(arrow);
        if (handle is null)
        {
            return null;
        }

        var hitTolerance = 14 / _zoom;
        var distance = PointToLineDistance(point, handle.Value.Start, handle.Value.End);
        return distance <= hitTolerance ? handle : null;
    }

    private DockHandleDefinition? GetDockHandleAtPoint(Point point, Guid? excludedElementId = null)
    {
        DockHandleDefinition? nearestHandle = null;
        var nearestDistance = double.MaxValue;

        foreach (var handle in GetDockHandles())
        {
            if (excludedElementId.HasValue && handle.ElementId == excludedElementId.Value)
            {
                continue;
            }

            var distance = Math.Sqrt(Math.Pow(point.X - handle.Center.X, 2) + Math.Pow(point.Y - handle.Center.Y, 2));
            var snapRadius = DockSnapRadiusScreen / _zoom;
            if (distance <= snapRadius && distance < nearestDistance)
            {
                nearestHandle = handle;
                nearestDistance = distance;
            }
        }

        return nearestHandle;
    }

    private ArrowRenderData? GetArrowRenderData(ArrowElement arrow)
    {
        if (Board is null)
        {
            return null;
        }

        if (_arrowEndpointDrag is not null && _arrowEndpointDrag.Value.ArrowId == arrow.Id)
        {
            return GetArrowRenderData(_arrowEndpointDrag.Value);
        }

        var sourceEndpoint = ResolveArrowEndpoint(arrow, true);
        var targetEndpoint = ResolveArrowEndpoint(arrow, false);
        if (sourceEndpoint is null || targetEndpoint is null)
        {
            return null;
        }

        var points = BuildArrowPath(sourceEndpoint.Value.Point, sourceEndpoint.Value.Dock, targetEndpoint.Value.Point, targetEndpoint.Value.Dock, arrow.RouteStyle, arrow.OrthogonalMiddleCoordinate);
        return new ArrowRenderData(points, GetPointAlongPolyline(points, 0.5));
    }

    private ArrowRenderData? GetArrowRenderData(ArrowEndpointDrag drag)
    {
        if (Board is null)
        {
            return null;
        }

        var arrow = Board.Elements.OfType<ArrowElement>().FirstOrDefault(candidate => candidate.Id == drag.ArrowId);
        if (arrow is null)
        {
            return null;
        }

        var fixedPoint = drag.FixedPoint;
        var movingPoint = drag.Pointer;
        var movingDock = ResolvePreviewTargetDock(new ArrowDraft(null, fixedPoint, drag.FixedDock, drag.HoverElementId, drag.HoverDock, drag.Pointer), fixedPoint, drag.Pointer);

        if (drag.HoverElementId is Guid hoverElementId && drag.HoverDock is DockPoint hoverDock)
        {
            var hoverElement = Board.Elements.FirstOrDefault(element => element.Id == hoverElementId);
            if (hoverElement is not null)
            {
                movingPoint = GetDockPosition(hoverElement, hoverDock);
                movingDock = hoverDock;
            }
        }

        var points = drag.IsSource
            ? BuildArrowPath(movingPoint, movingDock, fixedPoint, drag.FixedDock, arrow.RouteStyle, arrow.OrthogonalMiddleCoordinate)
            : BuildArrowPath(fixedPoint, drag.FixedDock, movingPoint, movingDock, arrow.RouteStyle, arrow.OrthogonalMiddleCoordinate);

        return new ArrowRenderData(points, GetPointAlongPolyline(points, 0.5));
    }

    private static List<Point> BuildArrowPath(Point start, DockPoint sourceDock, Point end, DockPoint targetDock, ArrowRouteStyle routeStyle, double? orthogonalMiddleCoordinate = null)
    {
        if (routeStyle == ArrowRouteStyle.Straight)
        {
            return new List<Point> { start, end };
        }

        const double stub = 24;
        var startStub = OffsetPoint(start, sourceDock, stub);
        var endStub = OffsetPoint(end, targetDock, stub);
        var points = new List<Point> { start, startStub };
        var sourceHorizontal = sourceDock is DockPoint.Left or DockPoint.Right;
        var targetHorizontal = targetDock is DockPoint.Left or DockPoint.Right;

        if (sourceHorizontal && targetHorizontal)
        {
            var middleX = orthogonalMiddleCoordinate ?? (startStub.X + endStub.X) / 2;
            points.Add(new Point(middleX, startStub.Y));
            points.Add(new Point(middleX, endStub.Y));
        }
        else if (!sourceHorizontal && !targetHorizontal)
        {
            var middleY = orthogonalMiddleCoordinate ?? (startStub.Y + endStub.Y) / 2;
            points.Add(new Point(startStub.X, middleY));
            points.Add(new Point(endStub.X, middleY));
        }
        else if (sourceHorizontal)
        {
            points.Add(new Point(endStub.X, startStub.Y));
        }
        else
        {
            points.Add(new Point(startStub.X, endStub.Y));
        }

        points.Add(endStub);
        points.Add(end);
        return SimplifyPoints(points);
    }

    private static List<Point> SimplifyPoints(IEnumerable<Point> points)
    {
        var simplified = new List<Point>();

        foreach (var point in points)
        {
            if (simplified.Count == 0)
            {
                simplified.Add(point);
                continue;
            }

            var previous = simplified[^1];
            if (Math.Abs(previous.X - point.X) < 0.1 && Math.Abs(previous.Y - point.Y) < 0.1)
            {
                continue;
            }

            simplified.Add(point);

            while (simplified.Count >= 3)
            {
                var a = simplified[^3];
                var b = simplified[^2];
                var c = simplified[^1];
                var sameX = Math.Abs(a.X - b.X) < 0.1 && Math.Abs(b.X - c.X) < 0.1;
                var sameY = Math.Abs(a.Y - b.Y) < 0.1 && Math.Abs(b.Y - c.Y) < 0.1;
                if (!sameX && !sameY)
                {
                    break;
                }

                simplified.RemoveAt(simplified.Count - 2);
            }
        }

        return simplified;
    }

    private static Point OffsetPoint(Point point, DockPoint dockPoint, double distance) => dockPoint switch
    {
        DockPoint.Top => new Point(point.X, point.Y - distance),
        DockPoint.Right => new Point(point.X + distance, point.Y),
        DockPoint.Bottom => new Point(point.X, point.Y + distance),
        DockPoint.Left => new Point(point.X - distance, point.Y),
        _ => point
    };

    private static DockPoint ResolvePreviewTargetDock(ArrowDraft draft, Point start, Point end)
    {
        if (draft.TargetDock is DockPoint dockPoint)
        {
            return dockPoint;
        }

        var dx = end.X - start.X;
        var dy = end.Y - start.Y;
        return Math.Abs(dx) >= Math.Abs(dy)
            ? dx >= 0 ? DockPoint.Left : DockPoint.Right
            : dy >= 0 ? DockPoint.Top : DockPoint.Bottom;
    }

    private static DockPoint ResolveFreeDock(Point start, Point end)
    {
        var dx = end.X - start.X;
        var dy = end.Y - start.Y;
        return Math.Abs(dx) >= Math.Abs(dy)
            ? dx >= 0 ? DockPoint.Right : DockPoint.Left
            : dy >= 0 ? DockPoint.Bottom : DockPoint.Top;
    }

    private Point GetStraightArrowMagnetPoint(Point fixedPoint, Point pointer, ArrowRouteStyle routeStyle)
    {
        if (routeStyle != ArrowRouteStyle.Straight)
        {
            return pointer;
        }

        return SnapPointToMagneticAngle(fixedPoint, pointer, StraightArrowAngleSnapStepDegrees, StraightArrowAngleSnapThresholdDegrees);
    }

    private ArrowRouteStyle GetArrowRouteStyle(Guid arrowId)
    {
        if (Board is null)
        {
            return ArrowRouteStyle.Orthogonal;
        }

        return Board.Elements.OfType<ArrowElement>().FirstOrDefault(arrow => arrow.Id == arrowId)?.RouteStyle ?? ArrowRouteStyle.Orthogonal;
    }

    private bool TryResolveOrthogonalMiddleSegment(ArrowElement arrow, out bool isVertical, out Point start, out Point end, out double coordinate)
    {
        isVertical = false;
        start = default;
        end = default;
        coordinate = 0;

        if (arrow.RouteStyle != ArrowRouteStyle.Orthogonal)
        {
            return false;
        }

        var sourceEndpoint = ResolveArrowEndpoint(arrow, true);
        var targetEndpoint = ResolveArrowEndpoint(arrow, false);
        if (sourceEndpoint is null || targetEndpoint is null)
        {
            return false;
        }

        const double stub = 24;
        var startStub = OffsetPoint(sourceEndpoint.Value.Point, sourceEndpoint.Value.Dock, stub);
        var endStub = OffsetPoint(targetEndpoint.Value.Point, targetEndpoint.Value.Dock, stub);
        var sourceHorizontal = sourceEndpoint.Value.Dock is DockPoint.Left or DockPoint.Right;
        var targetHorizontal = targetEndpoint.Value.Dock is DockPoint.Left or DockPoint.Right;

        if (sourceHorizontal && targetHorizontal)
        {
            coordinate = arrow.OrthogonalMiddleCoordinate ?? (startStub.X + endStub.X) / 2;
            start = new Point(coordinate, startStub.Y);
            end = new Point(coordinate, endStub.Y);
            isVertical = true;
            return Math.Abs(start.Y - end.Y) > 0.1;
        }

        if (!sourceHorizontal && !targetHorizontal)
        {
            coordinate = arrow.OrthogonalMiddleCoordinate ?? (startStub.Y + endStub.Y) / 2;
            start = new Point(startStub.X, coordinate);
            end = new Point(endStub.X, coordinate);
            isVertical = false;
            return Math.Abs(start.X - end.X) > 0.1;
        }

        return false;
    }

    private static Point SnapPointToMagneticAngle(Point origin, Point point, double stepDegrees, double thresholdDegrees)
    {
        var dx = point.X - origin.X;
        var dy = point.Y - origin.Y;
        var distance = Math.Sqrt(dx * dx + dy * dy);
        if (distance < 0.001)
        {
            return point;
        }

        var angle = Math.Atan2(dy, dx);
        var stepRadians = Math.PI * stepDegrees / 180d;
        var thresholdRadians = Math.PI * thresholdDegrees / 180d;
        var snappedAngle = Math.Round(angle / stepRadians) * stepRadians;
        var delta = Math.Abs(NormalizeAngle(angle - snappedAngle));
        if (delta > thresholdRadians)
        {
            return point;
        }

        return new Point(
            origin.X + Math.Cos(snappedAngle) * distance,
            origin.Y + Math.Sin(snappedAngle) * distance);
    }

    private static double NormalizeAngle(double angle)
    {
        while (angle <= -Math.PI)
        {
            angle += Math.PI * 2;
        }

        while (angle > Math.PI)
        {
            angle -= Math.PI * 2;
        }

        return angle;
    }

    private (Guid? ElementId, Point Point, DockPoint Dock)? ResolveArrowEndpoint(ArrowElement arrow, bool isSource)
    {
        if (Board is null)
        {
            return null;
        }

        var elementId = isSource ? arrow.SourceElementId : arrow.TargetElementId;
        var dock = isSource ? arrow.SourceDock : arrow.TargetDock;
        if (elementId is Guid connectedElementId)
        {
            var connectedElement = Board.Elements.FirstOrDefault(element => element.Id == connectedElementId);
            if (connectedElement is null)
            {
                var fallbackX = isSource ? arrow.SourceX : arrow.TargetX;
                var fallbackY = isSource ? arrow.SourceY : arrow.TargetY;
                if (fallbackX is null || fallbackY is null)
                {
                    return null;
                }

                return (connectedElementId, new Point(fallbackX.Value, fallbackY.Value), dock);
            }

            return (connectedElementId, GetDockPosition(connectedElement, dock), dock);
        }

        var x = isSource ? arrow.SourceX : arrow.TargetX;
        var y = isSource ? arrow.SourceY : arrow.TargetY;
        if (x is null || y is null)
        {
            return null;
        }

        return (null, new Point(x.Value, y.Value), dock);
    }

    private void ApplyDraggedEndpoint(ArrowElement arrow, bool isSource, ArrowEndpointDrag drag)
    {
        if (drag.HoverElementId is Guid hoverElementId && drag.HoverDock is DockPoint hoverDock)
        {
            var hoverElement = Board?.Elements.FirstOrDefault(element => element.Id == hoverElementId);
            var hoverPoint = hoverElement is not null ? GetDockPosition(hoverElement, hoverDock) : drag.Pointer;
            if (isSource)
            {
                arrow.SourceElementId = hoverElementId;
                arrow.SourceDock = hoverDock;
                arrow.SourceX = hoverPoint.X;
                arrow.SourceY = hoverPoint.Y;
            }
            else
            {
                arrow.TargetElementId = hoverElementId;
                arrow.TargetDock = hoverDock;
                arrow.TargetX = hoverPoint.X;
                arrow.TargetY = hoverPoint.Y;
            }

            return;
        }

        var freeDock = ResolveFreeDock(drag.FixedPoint, drag.Pointer);
        if (isSource)
        {
            arrow.SourceElementId = null;
            arrow.SourceDock = freeDock;
            arrow.SourceX = drag.Pointer.X;
            arrow.SourceY = drag.Pointer.Y;
        }
        else
        {
            arrow.TargetElementId = null;
            arrow.TargetDock = freeDock;
            arrow.TargetX = drag.Pointer.X;
            arrow.TargetY = drag.Pointer.Y;
        }
    }

    private static double GetPolylineLength(IReadOnlyList<Point> points)
    {
        var total = 0d;
        for (var index = 0; index < points.Count - 1; index++)
        {
            total += Math.Sqrt(Math.Pow(points[index + 1].X - points[index].X, 2) + Math.Pow(points[index + 1].Y - points[index].Y, 2));
        }

        return total;
    }

    private static Point GetPointAlongPolyline(IReadOnlyList<Point> points, double progress)
    {
        if (points.Count == 0)
        {
            return default;
        }

        if (points.Count == 1)
        {
            return points[0];
        }

        var target = GetPolylineLength(points) * Math.Clamp(progress, 0, 1);
        var traversed = 0d;

        for (var index = 0; index < points.Count - 1; index++)
        {
            var start = points[index];
            var end = points[index + 1];
            var segmentLength = Math.Sqrt(Math.Pow(end.X - start.X, 2) + Math.Pow(end.Y - start.Y, 2));
            if (traversed + segmentLength >= target)
            {
                var factor = segmentLength <= 0.001 ? 0 : (target - traversed) / segmentLength;
                return new Point(start.X + (end.X - start.X) * factor, start.Y + (end.Y - start.Y) * factor);
            }

            traversed += segmentLength;
        }

        return points[^1];
    }

    private static List<Point> GetTrimmedArrowLinePoints(IReadOnlyList<Point> points, ArrowHeadStyle sourceHead, ArrowHeadStyle targetHead, double headSize)
    {
        if (points.Count < 2)
        {
            return points.ToList();
        }

        var trimmed = points.ToList();

        if (RequiresLineTrim(sourceHead))
        {
            trimmed[0] = MovePointToward(trimmed[0], trimmed[1], headSize * 0.92);
        }

        if (RequiresLineTrim(targetHead))
        {
            var lastIndex = trimmed.Count - 1;
            trimmed[lastIndex] = MovePointToward(trimmed[lastIndex], trimmed[lastIndex - 1], headSize * 0.92);
        }

        return trimmed;
    }

    private static bool RequiresLineTrim(ArrowHeadStyle headStyle) => headStyle is ArrowHeadStyle.FilledTriangle or ArrowHeadStyle.OpenTriangle;

    private static Point MovePointToward(Point point, Point toward, double distance)
    {
        var dx = toward.X - point.X;
        var dy = toward.Y - point.Y;
        var length = Math.Sqrt(dx * dx + dy * dy);
        if (length < 0.001)
        {
            return point;
        }

        var safeDistance = Math.Min(distance, Math.Max(0, length - 0.5));
        var factor = safeDistance / length;
        return new Point(point.X + dx * factor, point.Y + dy * factor);
    }

    private IEnumerable<ResizeHandleDefinition> GetResizeHandles(BoardElement element)
    {
        var left = element.X;
        var centerX = element.X + (element.Width / 2);
        var right = element.X + element.Width;
        var top = element.Y;
        var centerY = element.Y + (element.Height / 2);
        var bottom = element.Y + element.Height;

        yield return new ResizeHandleDefinition(ResizeHandle.NorthWest, new Point(left, top));
        yield return new ResizeHandleDefinition(ResizeHandle.North, new Point(centerX, top));
        yield return new ResizeHandleDefinition(ResizeHandle.NorthEast, new Point(right, top));
        yield return new ResizeHandleDefinition(ResizeHandle.East, new Point(right, centerY));
        yield return new ResizeHandleDefinition(ResizeHandle.SouthEast, new Point(right, bottom));
        yield return new ResizeHandleDefinition(ResizeHandle.South, new Point(centerX, bottom));
        yield return new ResizeHandleDefinition(ResizeHandle.SouthWest, new Point(left, bottom));
        yield return new ResizeHandleDefinition(ResizeHandle.West, new Point(left, centerY));
    }

    private ResizeHandle GetResizeHandleAtPoint(Point point)
    {
        if (SelectedElement is null || !CanResizeSelectedElement)
        {
            return ResizeHandle.None;
        }

        var hitSize = ResizeHandleHitScreenSize / _zoom;
        var halfHitSize = hitSize / 2;

        foreach (var handle in GetResizeHandles(SelectedElement))
        {
            if (Math.Abs(point.X - handle.Center.X) <= halfHitSize && Math.Abs(point.Y - handle.Center.Y) <= halfHitSize)
            {
                return handle.Handle;
            }
        }

        return ResizeHandle.None;
    }

    private void ResizeSelectedElement(Point point, bool showAlignmentGuides)
    {
        if (SelectedElement is null || _activeResizeHandle == ResizeHandle.None)
        {
            return;
        }

        var pointerX = SanitizeCoordinate(point.X);
        var pointerY = SanitizeCoordinate(point.Y);
        var nextX = _resizeStartBounds.X;
        var nextY = _resizeStartBounds.Y;
        var nextWidth = _resizeStartBounds.Width;
        var nextHeight = _resizeStartBounds.Height;
        var minSize = MinimumRectangleSize;
        var right = _resizeStartBounds.X + _resizeStartBounds.Width;
        var bottom = _resizeStartBounds.Y + _resizeStartBounds.Height;

        switch (_activeResizeHandle)
        {
            case ResizeHandle.NorthWest:
                nextX = Math.Min(pointerX, right - minSize);
                nextY = Math.Min(pointerY, bottom - minSize);
                nextWidth = right - nextX;
                nextHeight = bottom - nextY;
                break;
            case ResizeHandle.North:
                nextY = Math.Min(pointerY, bottom - minSize);
                nextHeight = bottom - nextY;
                break;
            case ResizeHandle.NorthEast:
                nextY = Math.Min(pointerY, bottom - minSize);
                nextWidth = Math.Max(minSize, pointerX - _resizeStartBounds.X);
                nextHeight = bottom - nextY;
                break;
            case ResizeHandle.East:
                nextWidth = Math.Max(minSize, pointerX - _resizeStartBounds.X);
                break;
            case ResizeHandle.SouthEast:
                nextWidth = Math.Max(minSize, pointerX - _resizeStartBounds.X);
                nextHeight = Math.Max(minSize, pointerY - _resizeStartBounds.Y);
                break;
            case ResizeHandle.South:
                nextHeight = Math.Max(minSize, pointerY - _resizeStartBounds.Y);
                break;
            case ResizeHandle.SouthWest:
                nextX = Math.Min(pointerX, right - minSize);
                nextWidth = right - nextX;
                nextHeight = Math.Max(minSize, pointerY - _resizeStartBounds.Y);
                break;
            case ResizeHandle.West:
                nextX = Math.Min(pointerX, right - minSize);
                nextWidth = right - nextX;
                break;
        }

        nextWidth = Math.Max(minSize, SanitizeCoordinate(nextWidth));
        nextHeight = Math.Max(minSize, SanitizeCoordinate(nextHeight));
        nextX = SanitizeCoordinate(nextX);
        nextY = SanitizeCoordinate(nextY);

        if (showAlignmentGuides && Board is not null)
        {
            var referenceElements = Board.Elements.Where(element => element.Id != SelectedElement.Id && element is not ArrowElement).ToList();
            var resizedBounds = new SelectionBounds(nextX, nextY, nextWidth, nextHeight);
            resizedBounds = GetSnappedResizeBounds(resizedBounds, referenceElements);

            nextX = resizedBounds.Left;
            nextY = resizedBounds.Top;
            nextWidth = resizedBounds.Width;
            nextHeight = resizedBounds.Height;

            SetAlignmentGuides(GetAlignmentGuidesForBounds(
                resizedBounds,
                referenceElements,
                ResizeHandleMovesHorizontally(_activeResizeHandle),
                ResizeHandleMovesVertically(_activeResizeHandle)));
        }
        else
        {
            ClearAlignmentGuides();
        }

        if (Math.Abs(SelectedElement.X - nextX) > 0.1 ||
            Math.Abs(SelectedElement.Y - nextY) > 0.1 ||
            Math.Abs(SelectedElement.Width - nextWidth) > 0.1 ||
            Math.Abs(SelectedElement.Height - nextHeight) > 0.1)
        {
            SelectedElement.X = nextX;
            SelectedElement.Y = nextY;
            SelectedElement.Width = nextWidth;
            SelectedElement.Height = nextHeight;
            _hasInteractionChanged = true;
        }
    }
}
