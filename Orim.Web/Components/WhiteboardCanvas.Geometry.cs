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

    private Point ClampToSurface(Point point) => new(
        Clamp(SanitizeCoordinate(point.X), 0, Math.Max(0, SanitizeCoordinate(_surfaceSize.Width))),
        Clamp(SanitizeCoordinate(point.Y), 0, Math.Max(0, SanitizeCoordinate(_surfaceSize.Height))));

    private static double SanitizeCoordinate(double value) =>
        double.IsFinite(value) ? value : 0;

    private static double Clamp(double value, double min, double max) => Math.Max(min, Math.Min(max, value));

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

        var obstacles = GetArrowObstacles();
        var points = BuildArrowPath(sourceEndpoint.Value.Point, sourceEndpoint.Value.Dock, targetEndpoint.Value.Point, targetEndpoint.Value.Dock, arrow.RouteStyle, obstacles);
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

        var obstacles = GetArrowObstacles();

        var points = drag.IsSource
            ? BuildArrowPath(movingPoint, movingDock, fixedPoint, drag.FixedDock, arrow.RouteStyle, obstacles)
            : BuildArrowPath(fixedPoint, drag.FixedDock, movingPoint, movingDock, arrow.RouteStyle, obstacles);

        return new ArrowRenderData(points, GetPointAlongPolyline(points, 0.5));
    }

    private IReadOnlyList<(double X, double Y, double Width, double Height)> GetArrowObstacles()
    {
        if (Board is null)
        {
            return [];
        }

        return Board.Elements
            .Where(e => e is not ArrowElement)
            .Select(e => (e.X, e.Y, e.Width, e.Height))
            .ToList();
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
