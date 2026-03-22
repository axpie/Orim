using Microsoft.AspNetCore.Components.Web;
using Microsoft.JSInterop;
using Orim.Core.Models;
using Orim.Web.Components.Pages;

namespace Orim.Web.Components;

public partial class WhiteboardCanvas
{
    private async Task SetSelectionAsync(IEnumerable<BoardElement> elements)
    {
        _selectedElements.Clear();
        _selectedElements.AddRange(elements.DistinctBy(element => element.Id));
        await OnSelectedElementChanged.InvokeAsync(SelectedElement);
        await OnSelectedElementsChanged.InvokeAsync(_selectedElements.ToList());
    }

    private async Task<Point> GetScreenPointerAsync(MouseEventArgs e)
    {
        var pointer = await JS.InvokeAsync<RelativePointer>("orimWhiteboard.clientToElement", SurfaceId, e.ClientX, e.ClientY);
        _surfaceSize = new Size(SanitizeCoordinate(pointer.Width), SanitizeCoordinate(pointer.Height));
        return ClampToSurface(new Point(SanitizeCoordinate(pointer.X), SanitizeCoordinate(pointer.Y)));
    }

    private async Task EnsureSurfaceSizeAsync()
    {
        if (_surfaceSize.Width > 0 && _surfaceSize.Height > 0)
        {
            return;
        }

        var size = await JS.InvokeAsync<Size>("orimWhiteboard.getElementSize", SurfaceId);
        _surfaceSize = new Size(SanitizeCoordinate(size.Width), SanitizeCoordinate(size.Height));
    }

    private Point ScreenToWorld(Point point) => new(
        (point.X - _cameraOffset.X) / _zoom,
        (point.Y - _cameraOffset.Y) / _zoom);

    private async Task OnSurfaceMouseDown(MouseEventArgs e)
    {
        if (e.Button != 0 && e.Button != 1)
        {
            return;
        }

        var screenPoint = await GetScreenPointerAsync(e);
        var suppressSnap = e.CtrlKey || e.MetaKey;
        ClearAlignmentGuides();

        if (e.Button == 1)
        {
            _isPanning = true;
            _panStartScreen = screenPoint;
            _panPointerOrigin = screenPoint;
            _clearSelectionOnPanRelease = false;
            _panExceededClickThreshold = true;
            return;
        }

        var worldPoint = ScreenToWorld(screenPoint);

        if (CanEdit && TryGetShapeTypeFromTool(SelectedTool, out var shapeType))
        {
            await SetSelectionAsync([]);
            _isDrawingRectangle = true;
            _hasInteractionChanged = false;
            _drawStart = worldPoint;
            _draftShape = new ShapeElement
            {
                X = SanitizeCoordinate(worldPoint.X),
                Y = SanitizeCoordinate(worldPoint.Y),
                Width = 0,
                Height = 0,
                ShapeType = shapeType,
                FillColor = GetDefaultShapeFillColor(),
                StrokeColor = GetDefaultStrokeColor(),
                StrokeWidth = 2
            };
            return;
        }

        if (CanEdit && SelectedTool == BoardEditor.Tool.Icon && !string.IsNullOrWhiteSpace(PendingIconName) && Board is not null)
        {
            var iconSize = 96d;
            var icon = new IconElement
            {
                X = SanitizeCoordinate(worldPoint.X - (iconSize / 2)),
                Y = SanitizeCoordinate(worldPoint.Y - (iconSize / 2)),
                Width = iconSize,
                Height = iconSize,
                IconName = PendingIconName,
                Color = GetDefaultIconColor(),
                ZIndex = Board.Elements.Count
            };

            Board.Elements.Add(icon);
            await SetSelectionAsync([icon]);
            await OnBoardChanged.InvokeAsync();
            await OnToolChanged.InvokeAsync(BoardEditor.Tool.Select);
            return;
        }

        if (CanEdit && SelectedTool == BoardEditor.Tool.Arrow)
        {
            var anchor = suppressSnap ? null : GetDockHandleAtPoint(worldPoint);
            _draftArrow = anchor is not null
                ? new ArrowDraft(anchor.Value.ElementId, anchor.Value.Center, anchor.Value.DockPoint, null, null, worldPoint)
                : new ArrowDraft(null, worldPoint, ResolveFreeDock(worldPoint, worldPoint), null, null, worldPoint);
            _hasInteractionChanged = false;
            await SetSelectionAsync([]);

            return;
        }

        if (CanEdit && SelectedTool == BoardEditor.Tool.Select && CanResizeSelectedElement)
        {
            var resizeHandle = GetResizeHandleAtPoint(worldPoint);
            if (resizeHandle != ResizeHandle.None && SelectedElement is not null)
            {
                _activeResizeHandle = resizeHandle;
                _hoverResizeHandle = resizeHandle;
                _isResizingSelection = true;
                _hasInteractionChanged = false;
                _resizeStartBounds = new ElementBounds(SelectedElement.X, SelectedElement.Y, SelectedElement.Width, SelectedElement.Height);
                return;
            }
        }

        if (CanEdit && SelectedTool == BoardEditor.Tool.Select && _selectedElements.Count == 1 && SelectedElement is ArrowElement selectedArrow)
        {
            var endpointHandle = GetArrowEndpointHandleAtPoint(selectedArrow, worldPoint);
            if (endpointHandle is not null)
            {
                var fixedEndpoint = endpointHandle.Value.IsSource
                    ? ResolveArrowEndpoint(selectedArrow, false)
                    : ResolveArrowEndpoint(selectedArrow, true);

                if (fixedEndpoint is null)
                {
                    return;
                }

                _arrowEndpointDrag = new ArrowEndpointDrag(
                    selectedArrow.Id,
                    endpointHandle.Value.IsSource,
                    fixedEndpoint.Value.ElementId,
                    fixedEndpoint.Value.Point,
                    fixedEndpoint.Value.Dock,
                    null,
                    null,
                    endpointHandle.Value.Center);

                return;
            }

            var middleHandle = GetArrowMiddleSegmentHandleAtPoint(selectedArrow, worldPoint);
            if (middleHandle is not null)
            {
                var coordinate = middleHandle.Value.IsVertical ? middleHandle.Value.Center.X : middleHandle.Value.Center.Y;
                var pointerCoordinate = middleHandle.Value.IsVertical ? worldPoint.X : worldPoint.Y;
                _arrowMiddleSegmentDrag = new ArrowMiddleSegmentDrag(
                    selectedArrow.Id,
                    middleHandle.Value.IsVertical,
                    pointerCoordinate - coordinate,
                    coordinate,
                    coordinate);
                _hoverArrowMiddleSegmentHandle = middleHandle;
                _hasInteractionChanged = false;
                return;
            }
        }

        var clicked = HitTest(worldPoint);
        var isAdditiveSelection = e.CtrlKey || e.MetaKey;
        var shouldStartMarqueeSelection = e.ShiftKey && clicked is null;

        if (clicked is not null)
        {
            var selectionScope = ResolveSelectionScope(clicked);
            if (isAdditiveSelection)
            {
                await ToggleSelectionAsync(selectionScope);
            }
            else if (!IsSelected(clicked) && !IsSelectionEquivalent(selectionScope))
            {
                await SetSelectionAsync(selectionScope);
            }
        }
        _hoverResizeHandle = ResizeHandle.None;

        if (!CanEdit || SelectedTool != BoardEditor.Tool.Select)
        {
            return;
        }

        if (shouldStartMarqueeSelection)
        {
            _isMarqueeSelecting = true;
            _marqueeStart = worldPoint;
            _marqueeCurrent = worldPoint;
            _hasInteractionChanged = false;
            return;
        }

        if (clicked is null)
        {
            _isPanning = true;
            _panStartScreen = screenPoint;
            _panPointerOrigin = screenPoint;
            _clearSelectionOnPanRelease = true;
            _panExceededClickThreshold = false;
            return;
        }

        if (clicked is ArrowElement)
        {
            return;
        }

        _dragStartPositions.Clear();
        foreach (var element in _selectedElements.Where(element => element is not ArrowElement))
        {
            _dragStartPositions[element.Id] = new Point(element.X, element.Y);
        }

        if (_dragStartPositions.Count == 0)
        {
            return;
        }

        _isDraggingSelection = true;
        _hasInteractionChanged = false;
        _dragStartPointer = worldPoint;
    }

    private async Task OnSurfaceMouseMove(MouseEventArgs e)
    {
        var screenPoint = await GetScreenPointerAsync(e);
        var suppressSnap = e.CtrlKey || e.MetaKey;

        if (_isPanning)
        {
            var dx = screenPoint.X - _panStartScreen.X;
            var dy = screenPoint.Y - _panStartScreen.Y;
            var totalDx = screenPoint.X - _panPointerOrigin.X;
            var totalDy = screenPoint.Y - _panPointerOrigin.Y;
            if (!_panExceededClickThreshold && Math.Sqrt(totalDx * totalDx + totalDy * totalDy) > ClickPanThreshold)
            {
                _panExceededClickThreshold = true;
            }

            _cameraOffset = new Point(_cameraOffset.X + dx, _cameraOffset.Y + dy);
            _panStartScreen = screenPoint;
            return;
        }

        var worldPoint = ScreenToWorld(screenPoint);

        if (!_isDraggingSelection && !_isDrawingRectangle && !_isResizingSelection && !_isMarqueeSelecting)
        {
            _hoverResizeHandle = CanResizeSelectedElement ? GetResizeHandleAtPoint(worldPoint) : ResizeHandle.None;
            _hoverArrowEndpointHandle = CanEdit && SelectedTool == BoardEditor.Tool.Select && _selectedElements.Count == 1 && SelectedElement is ArrowElement selectedArrow
                ? GetArrowEndpointHandleAtPoint(selectedArrow, worldPoint)
                : null;
            _hoverArrowMiddleSegmentHandle = CanEdit && SelectedTool == BoardEditor.Tool.Select && _selectedElements.Count == 1 && SelectedElement is ArrowElement selectedArrowForMiddle
                ? GetArrowMiddleSegmentHandleAtPoint(selectedArrowForMiddle, worldPoint)
                : null;
        }

        if (_isResizingSelection && SelectedElement is not null)
        {
            ResizeSelectedElement(worldPoint, !suppressSnap);
            return;
        }

        if (_arrowEndpointDrag is not null)
        {
            var nextTarget = suppressSnap ? null : GetDockHandleAtPoint(worldPoint);
            var nextPointer = suppressSnap
                ? worldPoint
                : nextTarget?.Center ?? GetStraightArrowMagnetPoint(_arrowEndpointDrag.Value.FixedPoint, worldPoint, GetArrowRouteStyle(_arrowEndpointDrag.Value.ArrowId));
            _arrowEndpointDrag = _arrowEndpointDrag.Value with
            {
                HoverElementId = nextTarget?.ElementId,
                HoverDock = nextTarget?.DockPoint,
                Pointer = nextPointer
            };
            return;
        }

        if (_arrowMiddleSegmentDrag is not null)
        {
            if (Board is null)
            {
                return;
            }

            var arrow = Board.Elements.OfType<ArrowElement>().FirstOrDefault(candidate => candidate.Id == _arrowMiddleSegmentDrag.Value.ArrowId);
            if (arrow is null)
            {
                return;
            }

            var pointerCoordinate = _arrowMiddleSegmentDrag.Value.IsVertical ? worldPoint.X : worldPoint.Y;
            var nextCoordinate = pointerCoordinate - _arrowMiddleSegmentDrag.Value.PointerOffset;
            arrow.OrthogonalMiddleCoordinate = nextCoordinate;
            _arrowMiddleSegmentDrag = _arrowMiddleSegmentDrag.Value with { CurrentCoordinate = nextCoordinate };
            _hasInteractionChanged = Math.Abs(nextCoordinate - _arrowMiddleSegmentDrag.Value.InitialCoordinate) > 0.1;
            _hoverArrowMiddleSegmentHandle = GetArrowMiddleSegmentHandle(arrow);
            return;
        }

        if (_draftArrow is not null)
        {
            var nextTarget = suppressSnap ? null : GetDockHandleAtPoint(worldPoint, _draftArrow.Value.SourceElementId);
            var nextPointer = suppressSnap
                ? worldPoint
                : nextTarget?.Center ?? GetStraightArrowMagnetPoint(_draftArrow.Value.SourcePoint, worldPoint, ArrowRouteStyle.Orthogonal);
            _draftArrow = _draftArrow.Value with
            {
                TargetElementId = nextTarget?.ElementId,
                TargetDock = nextTarget?.DockPoint,
                Pointer = nextPointer
            };
            return;
        }

        if (_isDraggingSelection && _dragStartPositions.Count > 0)
        {
            var deltaX = worldPoint.X - _dragStartPointer.X;
            var deltaY = worldPoint.Y - _dragStartPointer.Y;

            if (!suppressSnap)
            {
                var snappedDrag = GetSnappedSelectionDelta(deltaX, deltaY);
                deltaX = snappedDrag.DeltaX;
                deltaY = snappedDrag.DeltaY;
                SetAlignmentGuides(snappedDrag.Guides);
            }
            else
            {
                ClearAlignmentGuides();
            }

            foreach (var element in _selectedElements.Where(element => _dragStartPositions.ContainsKey(element.Id)))
            {
                var startPosition = _dragStartPositions[element.Id];
                var nextX = startPosition.X + deltaX;
                var nextY = startPosition.Y + deltaY;

                if (Math.Abs(element.X - nextX) > 0.1 || Math.Abs(element.Y - nextY) > 0.1)
                {
                    element.X = nextX;
                    element.Y = nextY;
                    _hasInteractionChanged = true;
                }
            }

            return;
        }

        if (_isMarqueeSelecting)
        {
            _marqueeCurrent = worldPoint;
            _hasInteractionChanged = true;
            return;
        }

        if (_isDrawingRectangle && _draftShape is not null)
        {
            UpdateDraftRectangle(worldPoint);
        }
    }

    private async Task OnSurfaceMouseUp(MouseEventArgs e)
    {
        var worldPoint = ScreenToWorld(await GetScreenPointerAsync(e));
        await FinalizeInteractionAsync(worldPoint);
    }

    private async Task OnSurfaceMouseLeave(MouseEventArgs _)
    {
        await FinalizeInteractionAsync(null);
    }

    private async Task OnSurfaceWheel(WheelEventArgs e)
    {
        var screenPoint = await GetScreenPointerAsync(new MouseEventArgs { ClientX = e.ClientX, ClientY = e.ClientY });
        var worldPoint = ScreenToWorld(screenPoint);
        var factor = e.DeltaY < 0 ? ZoomStep : 1 / ZoomStep;
        await ApplyZoomAsync(_zoom * factor, screenPoint, worldPoint);
    }

    [JSInvokable]
    public async Task OnTouchStartFromJs(double clientX, double clientY)
    {
        var screenPoint = await GetScreenPointerFromCoordsAsync(clientX, clientY);
        var worldPoint = ScreenToWorld(screenPoint);
        _lastTouchWorldPoint = worldPoint;
        ClearAlignmentGuides();

        if (CanEdit && TryGetShapeTypeFromTool(SelectedTool, out var shapeType))
        {
            await SetSelectionAsync([]);
            _isDrawingRectangle = true;
            _hasInteractionChanged = false;
            _drawStart = worldPoint;
            _draftShape = new ShapeElement
            {
                X = SanitizeCoordinate(worldPoint.X),
                Y = SanitizeCoordinate(worldPoint.Y),
                Width = 0,
                Height = 0,
                ShapeType = shapeType,
                FillColor = GetDefaultShapeFillColor(),
                StrokeColor = GetDefaultStrokeColor(),
                StrokeWidth = 2
            };
            StateHasChanged();
            return;
        }

        if (CanEdit && SelectedTool == BoardEditor.Tool.Icon && !string.IsNullOrWhiteSpace(PendingIconName) && Board is not null)
        {
            var iconSize = 96d;
            var icon = new IconElement
            {
                X = SanitizeCoordinate(worldPoint.X - (iconSize / 2)),
                Y = SanitizeCoordinate(worldPoint.Y - (iconSize / 2)),
                Width = iconSize,
                Height = iconSize,
                IconName = PendingIconName,
                Color = GetDefaultIconColor(),
                ZIndex = Board.Elements.Count
            };

            Board.Elements.Add(icon);
            await SetSelectionAsync([icon]);
            await OnBoardChanged.InvokeAsync();
            await OnToolChanged.InvokeAsync(BoardEditor.Tool.Select);
            StateHasChanged();
            return;
        }

        if (CanEdit && SelectedTool == BoardEditor.Tool.Arrow)
        {
            var anchor = GetDockHandleAtPoint(worldPoint);
            _draftArrow = anchor is not null
                ? new ArrowDraft(anchor.Value.ElementId, anchor.Value.Center, anchor.Value.DockPoint, null, null, worldPoint)
                : new ArrowDraft(null, worldPoint, ResolveFreeDock(worldPoint, worldPoint), null, null, worldPoint);
            _hasInteractionChanged = false;
            await SetSelectionAsync([]);
            StateHasChanged();
            return;
        }

        if (CanEdit && SelectedTool == BoardEditor.Tool.Select && CanResizeSelectedElement)
        {
            var resizeHandle = GetResizeHandleAtPoint(worldPoint);
            if (resizeHandle != ResizeHandle.None && SelectedElement is not null)
            {
                _activeResizeHandle = resizeHandle;
                _hoverResizeHandle = resizeHandle;
                _isResizingSelection = true;
                _hasInteractionChanged = false;
                _resizeStartBounds = new ElementBounds(SelectedElement.X, SelectedElement.Y, SelectedElement.Width, SelectedElement.Height);
                StateHasChanged();
                return;
            }
        }

        if (CanEdit && SelectedTool == BoardEditor.Tool.Select && _selectedElements.Count == 1 && SelectedElement is ArrowElement selectedArrowTouch)
        {
            var endpointHandle = GetArrowEndpointHandleAtPoint(selectedArrowTouch, worldPoint);
            if (endpointHandle is not null)
            {
                var fixedEndpoint = endpointHandle.Value.IsSource
                    ? ResolveArrowEndpoint(selectedArrowTouch, false)
                    : ResolveArrowEndpoint(selectedArrowTouch, true);

                if (fixedEndpoint is not null)
                {
                    _arrowEndpointDrag = new ArrowEndpointDrag(
                        selectedArrowTouch.Id,
                        endpointHandle.Value.IsSource,
                        fixedEndpoint.Value.ElementId,
                        fixedEndpoint.Value.Point,
                        fixedEndpoint.Value.Dock,
                        null,
                        null,
                        endpointHandle.Value.Center);
                    StateHasChanged();
                    return;
                }
            }

            var middleHandle = GetArrowMiddleSegmentHandleAtPoint(selectedArrowTouch, worldPoint);
            if (middleHandle is not null)
            {
                var coordinate = middleHandle.Value.IsVertical ? middleHandle.Value.Center.X : middleHandle.Value.Center.Y;
                var pointerCoordinate = middleHandle.Value.IsVertical ? worldPoint.X : worldPoint.Y;
                _arrowMiddleSegmentDrag = new ArrowMiddleSegmentDrag(
                    selectedArrowTouch.Id,
                    middleHandle.Value.IsVertical,
                    pointerCoordinate - coordinate,
                    coordinate,
                    coordinate);
                _hoverArrowMiddleSegmentHandle = middleHandle;
                _hasInteractionChanged = false;
                StateHasChanged();
                return;
            }
        }

        var clicked = HitTest(worldPoint);

        var tapNow = DateTime.UtcNow;
        if (clicked is not null && clicked.Id == _lastTapElementId && (tapNow - _lastTapTime).TotalMilliseconds < 350)
        {
            _lastTapTime = DateTime.MinValue;
            _lastTapElementId = null;
            await OnElementDoubleTapped.InvokeAsync();
        }
        else
        {
            _lastTapTime = tapNow;
            _lastTapElementId = clicked?.Id;
        }

        if (clicked is not null)
        {
            var selectionScope = ResolveSelectionScope(clicked);
            if (!IsSelected(clicked) && !IsSelectionEquivalent(selectionScope))
            {
                await SetSelectionAsync(selectionScope);
            }
        }

        if (!CanEdit || SelectedTool != BoardEditor.Tool.Select)
        {
            if (clicked is null)
            {
                _isPanning = true;
                _panStartScreen = screenPoint;
                _panPointerOrigin = screenPoint;
                _clearSelectionOnPanRelease = true;
                _panExceededClickThreshold = false;
            }
            StateHasChanged();
            return;
        }

        if (clicked is null)
        {
            _isPanning = true;
            _panStartScreen = screenPoint;
            _panPointerOrigin = screenPoint;
            _clearSelectionOnPanRelease = true;
            _panExceededClickThreshold = false;
            StateHasChanged();
            return;
        }

        if (clicked is ArrowElement)
        {
            StateHasChanged();
            return;
        }

        _dragStartPositions.Clear();
        foreach (var element in _selectedElements.Where(element => element is not ArrowElement))
        {
            _dragStartPositions[element.Id] = new Point(element.X, element.Y);
        }

        if (_dragStartPositions.Count > 0)
        {
            _isDraggingSelection = true;
            _hasInteractionChanged = false;
            _dragStartPointer = worldPoint;
        }

        StateHasChanged();
    }

    [JSInvokable]
    public async Task OnTouchMoveFromJs(double clientX, double clientY)
    {
        var screenPoint = await GetScreenPointerFromCoordsAsync(clientX, clientY);

        if (_isPanning && !_isDraggingSelection && !_isResizingSelection)
        {
            var dx = screenPoint.X - _panStartScreen.X;
            var dy = screenPoint.Y - _panStartScreen.Y;
            var totalDx = screenPoint.X - _panPointerOrigin.X;
            var totalDy = screenPoint.Y - _panPointerOrigin.Y;
            if (!_panExceededClickThreshold && Math.Sqrt(totalDx * totalDx + totalDy * totalDy) > ClickPanThreshold)
            {
                _panExceededClickThreshold = true;
            }

            _cameraOffset = new Point(_cameraOffset.X + dx, _cameraOffset.Y + dy);
            _panStartScreen = screenPoint;
            StateHasChanged();
            return;
        }

        var worldPoint = ScreenToWorld(screenPoint);
        _lastTouchWorldPoint = worldPoint;

        if (_isResizingSelection && SelectedElement is not null)
        {
            ResizeSelectedElement(worldPoint, true);
            StateHasChanged();
            return;
        }

        if (_arrowEndpointDrag is not null)
        {
            var nextTarget = GetDockHandleAtPoint(worldPoint);
            var nextPointer = nextTarget?.Center ?? GetStraightArrowMagnetPoint(_arrowEndpointDrag.Value.FixedPoint, worldPoint, GetArrowRouteStyle(_arrowEndpointDrag.Value.ArrowId));
            _arrowEndpointDrag = _arrowEndpointDrag.Value with
            {
                HoverElementId = nextTarget?.ElementId,
                HoverDock = nextTarget?.DockPoint,
                Pointer = nextPointer
            };
            StateHasChanged();
            return;
        }

        if (_arrowMiddleSegmentDrag is not null)
        {
            if (Board is not null)
            {
                var arrow = Board.Elements.OfType<ArrowElement>().FirstOrDefault(candidate => candidate.Id == _arrowMiddleSegmentDrag.Value.ArrowId);
                if (arrow is not null)
                {
                    var pointerCoordinate = _arrowMiddleSegmentDrag.Value.IsVertical ? worldPoint.X : worldPoint.Y;
                    var nextCoordinate = pointerCoordinate - _arrowMiddleSegmentDrag.Value.PointerOffset;
                    arrow.OrthogonalMiddleCoordinate = nextCoordinate;
                    _arrowMiddleSegmentDrag = _arrowMiddleSegmentDrag.Value with { CurrentCoordinate = nextCoordinate };
                    _hasInteractionChanged = Math.Abs(nextCoordinate - _arrowMiddleSegmentDrag.Value.InitialCoordinate) > 0.1;
                    _hoverArrowMiddleSegmentHandle = GetArrowMiddleSegmentHandle(arrow);
                }
            }
            StateHasChanged();
            return;
        }

        if (_draftArrow is not null)
        {
            var nextTarget = GetDockHandleAtPoint(worldPoint, _draftArrow.Value.SourceElementId);
            var nextPointer = nextTarget?.Center ?? GetStraightArrowMagnetPoint(_draftArrow.Value.SourcePoint, worldPoint, ArrowRouteStyle.Orthogonal);
            _draftArrow = _draftArrow.Value with
            {
                TargetElementId = nextTarget?.ElementId,
                TargetDock = nextTarget?.DockPoint,
                Pointer = nextPointer
            };
            StateHasChanged();
            return;
        }

        if (_isDraggingSelection && _dragStartPositions.Count > 0)
        {
            var deltaX = worldPoint.X - _dragStartPointer.X;
            var deltaY = worldPoint.Y - _dragStartPointer.Y;

            var snappedDrag = GetSnappedSelectionDelta(deltaX, deltaY);
            deltaX = snappedDrag.DeltaX;
            deltaY = snappedDrag.DeltaY;
            SetAlignmentGuides(snappedDrag.Guides);

            foreach (var element in _selectedElements.Where(element => _dragStartPositions.ContainsKey(element.Id)))
            {
                var startPosition = _dragStartPositions[element.Id];
                var nextX = startPosition.X + deltaX;
                var nextY = startPosition.Y + deltaY;

                if (Math.Abs(element.X - nextX) > 0.1 || Math.Abs(element.Y - nextY) > 0.1)
                {
                    element.X = nextX;
                    element.Y = nextY;
                    _hasInteractionChanged = true;
                }
            }

            StateHasChanged();
            return;
        }

        if (_isDrawingRectangle && _draftShape is not null)
        {
            UpdateDraftRectangle(worldPoint);
            StateHasChanged();
        }
    }

    [JSInvokable]
    public async Task OnTouchEndFromJs()
    {
        await FinalizeInteractionAsync(_lastTouchWorldPoint);
        StateHasChanged();
    }

    private async Task<Point> GetScreenPointerFromCoordsAsync(double clientX, double clientY)
    {
        var pointer = await JS.InvokeAsync<RelativePointer>("orimWhiteboard.clientToElement", SurfaceId, clientX, clientY);
        _surfaceSize = new Size(SanitizeCoordinate(pointer.Width), SanitizeCoordinate(pointer.Height));
        return ClampToSurface(new Point(SanitizeCoordinate(pointer.X), SanitizeCoordinate(pointer.Y)));
    }

    private async Task ApplyZoomAsync(double nextZoom, Point screenAnchor, Point? worldAnchor = null)
    {
        var clampedZoom = Math.Clamp(nextZoom, MinZoom, MaxZoom);
        if (Math.Abs(clampedZoom - _zoom) < 0.0001)
        {
            return;
        }

        var anchor = worldAnchor ?? ScreenToWorld(screenAnchor);
        _zoom = clampedZoom;
        _cameraOffset = new Point(
            screenAnchor.X - anchor.X * _zoom,
            screenAnchor.Y - anchor.Y * _zoom);

        await NotifyZoomChangedAsync();
        StateHasChanged();
    }

    private void ApplyFitToContent()
    {
        if (_surfaceSize.Width <= 0 || _surfaceSize.Height <= 0)
        {
            return;
        }

        var bounds = GetContentBounds();
        if (bounds is null)
        {
            _zoom = 1;
            _cameraOffset = new Point(_surfaceSize.Width / 2, _surfaceSize.Height / 2);
            return;
        }

        const double margin = 64;
        var contentWidth = Math.Max(bounds.Value.Width, 1);
        var contentHeight = Math.Max(bounds.Value.Height, 1);
        var viewportLeft = margin;
        var viewportTop = margin;
        var viewportRight = Math.Max(_surfaceSize.Width - GetEffectiveFitRightInset() - margin, viewportLeft + 1);
        var viewportBottom = Math.Max(_surfaceSize.Height - margin, viewportTop + 1);
        var availableWidth = Math.Max(viewportRight - viewportLeft, 1);
        var availableHeight = Math.Max(viewportBottom - viewportTop, 1);
        var fittedZoom = Math.Min(availableWidth / contentWidth, availableHeight / contentHeight);

        _zoom = Math.Clamp(fittedZoom, MinZoom, MaxZoom);
        _cameraOffset = new Point(
            viewportLeft + (availableWidth - contentWidth * _zoom) / 2 - bounds.Value.Left * _zoom,
            viewportTop + (availableHeight - contentHeight * _zoom) / 2 - bounds.Value.Top * _zoom);
    }

    private double GetEffectiveFitRightInset()
    {
        if (_surfaceSize.Width <= 900)
        {
            return 0;
        }

        return Math.Clamp(FitRightInset, 0, Math.Max(_surfaceSize.Width - 1, 0));
    }

    private SelectionBounds? GetContentBounds()
    {
        if (Board is null || Board.Elements.Count == 0)
        {
            return null;
        }

        double? left = null;
        double? top = null;
        double? right = null;
        double? bottom = null;

        foreach (var element in Board.Elements)
        {
            if (element is ArrowElement arrow)
            {
                var renderData = GetArrowRenderData(arrow);
                if (renderData is null)
                {
                    continue;
                }

                foreach (var point in renderData.Value.Points)
                {
                    left = left is null ? point.X : Math.Min(left.Value, point.X);
                    top = top is null ? point.Y : Math.Min(top.Value, point.Y);
                    right = right is null ? point.X : Math.Max(right.Value, point.X);
                    bottom = bottom is null ? point.Y : Math.Max(bottom.Value, point.Y);
                }

                continue;
            }

            left = left is null ? element.X : Math.Min(left.Value, element.X);
            top = top is null ? element.Y : Math.Min(top.Value, element.Y);
            right = right is null ? element.X + element.Width : Math.Max(right.Value, element.X + element.Width);
            bottom = bottom is null ? element.Y + element.Height : Math.Max(bottom.Value, element.Y + element.Height);
        }

        if (left is null || top is null || right is null || bottom is null)
        {
            return null;
        }

        return new SelectionBounds(left.Value, top.Value, right.Value - left.Value, bottom.Value - top.Value);
    }

    private Point GetSurfaceCenter() => new(
        Math.Max(_surfaceSize.Width, 1) / 2,
        Math.Max(_surfaceSize.Height, 1) / 2);

    private async Task NotifyZoomChangedAsync()
    {
        await OnZoomChanged.InvokeAsync((int)Math.Round(_zoom * 100, MidpointRounding.AwayFromZero));
    }

    private async Task FinalizeInteractionAsync(Point? pointer)
    {
        var shouldClearSelection = _isPanning && _clearSelectionOnPanRelease && !_panExceededClickThreshold && pointer is not null;
        _isPanning = false;
        _clearSelectionOnPanRelease = false;
        _panExceededClickThreshold = false;
        _hoverArrowEndpointHandle = null;
        _hoverArrowMiddleSegmentHandle = null;
        ClearAlignmentGuides();

        if (_isResizingSelection)
        {
            _isResizingSelection = false;
            _activeResizeHandle = ResizeHandle.None;
            if (_hasInteractionChanged)
            {
                _hasInteractionChanged = false;
                await OnBoardChanged.InvokeAsync();
            }
        }

        if (_isDraggingSelection)
        {
            _isDraggingSelection = false;
            _dragStartPositions.Clear();
            if (_hasInteractionChanged)
            {
                _hasInteractionChanged = false;
                await OnBoardChanged.InvokeAsync();
            }
        }

        if (_isMarqueeSelecting)
        {
            _isMarqueeSelecting = false;
            _marqueeCurrent = pointer ?? _marqueeCurrent;
            var selectionBounds = GetSelectionBounds();

            if (selectionBounds.Width >= 4 && selectionBounds.Height >= 4)
            {
                var selection = GetElementsInSelectionBounds(selectionBounds);
                await SetSelectionAsync(selection);
            }

            _hasInteractionChanged = false;
        }

        if (_arrowEndpointDrag is not null)
        {
            if (Board is not null)
            {
                var arrow = Board.Elements.OfType<ArrowElement>().FirstOrDefault(candidate => candidate.Id == _arrowEndpointDrag.Value.ArrowId);
                if (arrow is not null)
                {
                    if (_arrowEndpointDrag.Value.IsSource)
                    {
                        ApplyDraggedEndpoint(arrow, true, _arrowEndpointDrag.Value);
                    }
                    else
                    {
                        ApplyDraggedEndpoint(arrow, false, _arrowEndpointDrag.Value);
                    }

                    await OnBoardChanged.InvokeAsync();
                }
            }

            _arrowEndpointDrag = null;
        }

        if (_arrowMiddleSegmentDrag is not null)
        {
            if (_hasInteractionChanged)
            {
                _hasInteractionChanged = false;
                await OnBoardChanged.InvokeAsync();
            }

            _arrowMiddleSegmentDrag = null;
        }

        if (_isDrawingRectangle)
        {
            if (pointer is not null && _draftShape is not null)
            {
                UpdateDraftRectangle(pointer.Value);
            }

            _isDrawingRectangle = false;

            if (_draftShape is not null &&
                _draftShape.Width >= MinimumRectangleSize &&
                _draftShape.Height >= MinimumRectangleSize &&
                Board is not null)
            {
                var rectangle = new ShapeElement
                {
                    X = SanitizeCoordinate(_draftShape.X),
                    Y = SanitizeCoordinate(_draftShape.Y),
                    Width = SanitizeCoordinate(_draftShape.Width),
                    Height = SanitizeCoordinate(_draftShape.Height),
                    ShapeType = _draftShape.ShapeType,
                    FillColor = _draftShape.FillColor,
                    StrokeColor = _draftShape.StrokeColor,
                    StrokeWidth = 2,
                    ZIndex = Board.Elements.Count
                };

                Board.Elements.Add(rectangle);
                await SetSelectionAsync([rectangle]);
                await OnBoardChanged.InvokeAsync();
                await OnToolChanged.InvokeAsync(BoardEditor.Tool.Select);
            }

            _draftShape = null;
            _hasInteractionChanged = false;
        }

        if (_draftArrow is not null)
        {
            if (Board is not null)
            {
                var arrow = new ArrowElement
                {
                    SourceElementId = _draftArrow.Value.SourceElementId,
                    SourceX = _draftArrow.Value.SourceElementId is null ? _draftArrow.Value.SourcePoint.X : null,
                    SourceY = _draftArrow.Value.SourceElementId is null ? _draftArrow.Value.SourcePoint.Y : null,
                    SourceDock = _draftArrow.Value.SourceDock,
                    TargetElementId = _draftArrow.Value.TargetElementId,
                    TargetX = _draftArrow.Value.TargetElementId is null ? _draftArrow.Value.Pointer.X : null,
                    TargetY = _draftArrow.Value.TargetElementId is null ? _draftArrow.Value.Pointer.Y : null,
                    TargetDock = _draftArrow.Value.TargetDock ?? ResolveFreeDock(_draftArrow.Value.SourcePoint, _draftArrow.Value.Pointer),
                    StrokeColor = GetDefaultStrokeColor(),
                    StrokeWidth = 2,
                    RouteStyle = ArrowRouteStyle.Orthogonal,
                    ZIndex = Board.Elements.Count
                };

                Board.Elements.Add(arrow);
                await SetSelectionAsync([arrow]);
                await OnBoardChanged.InvokeAsync();
                await OnToolChanged.InvokeAsync(BoardEditor.Tool.Select);
            }

            _draftArrow = null;
        }

        if (shouldClearSelection)
        {
            await SetSelectionAsync([]);
        }

        if (!_isDraggingSelection && !_isDrawingRectangle && !_isMarqueeSelecting && _draftArrow is null)
        {
            _hoverResizeHandle = ResizeHandle.None;
        }
    }

    private SelectionBounds GetSelectionBounds()
    {
        var left = Math.Min(_marqueeStart.X, _marqueeCurrent.X);
        var top = Math.Min(_marqueeStart.Y, _marqueeCurrent.Y);
        var right = Math.Max(_marqueeStart.X, _marqueeCurrent.X);
        var bottom = Math.Max(_marqueeStart.Y, _marqueeCurrent.Y);
        return new SelectionBounds(left, top, right - left, bottom - top);
    }

    private void UpdateDraftRectangle(Point point)
    {
        if (_draftShape is null)
        {
            return;
        }

        var currentX = SanitizeCoordinate(point.X);
        var currentY = SanitizeCoordinate(point.Y);
        var startX = SanitizeCoordinate(_drawStart.X);
        var startY = SanitizeCoordinate(_drawStart.Y);

        _draftShape.X = Math.Min(startX, currentX);
        _draftShape.Y = Math.Min(startY, currentY);
        _draftShape.Width = Math.Abs(currentX - startX);
        _draftShape.Height = Math.Abs(currentY - startY);
        _hasInteractionChanged = _draftShape.Width >= MinimumRectangleSize || _draftShape.Height >= MinimumRectangleSize;
    }

    private BoardElement? HitTest(Point point)
    {
        if (Board is null)
        {
            return null;
        }

        foreach (var element in Board.Elements.OrderByDescending(e => e.ZIndex))
        {
            if (element is ArrowElement arrow)
            {
                var renderData = GetArrowRenderData(arrow);
                if (renderData is null)
                {
                    continue;
                }

                if (IsPointNearPolyline(point, renderData.Value.Points, Math.Max(8, arrow.StrokeWidth + 4)))
                {
                    return element;
                }

                continue;
            }

            if (point.X >= element.X && point.X <= element.X + element.Width &&
                point.Y >= element.Y && point.Y <= element.Y + element.Height)
            {
                return element;
            }
        }

        return null;
    }

    private List<BoardElement> ResolveSelectionScope(BoardElement element)
    {
        if (Board is null)
        {
            return [];
        }

        if (element.GroupId is Guid groupId)
        {
            return Board.Elements.Where(candidate => candidate.GroupId == groupId).OrderBy(candidate => candidate.ZIndex).ToList();
        }

        return [element];
    }

    private async Task ToggleSelectionAsync(IEnumerable<BoardElement> elements)
    {
        var scope = elements.DistinctBy(element => element.Id).ToList();
        var selectionIds = _selectedElements.Select(element => element.Id).ToHashSet();
        var allSelected = scope.All(element => selectionIds.Contains(element.Id));
        var nextSelection = _selectedElements.ToList();

        if (allSelected)
        {
            nextSelection.RemoveAll(element => scope.Any(candidate => candidate.Id == element.Id));
        }
        else
        {
            foreach (var element in scope)
            {
                if (nextSelection.All(candidate => candidate.Id != element.Id))
                {
                    nextSelection.Add(element);
                }
            }
        }

        await SetSelectionAsync(nextSelection);
    }

    private bool IsSelectionEquivalent(IEnumerable<BoardElement> elements)
    {
        var candidateIds = elements.Select(element => element.Id).OrderBy(id => id).ToArray();
        var currentIds = _selectedElements.Select(element => element.Id).OrderBy(id => id).ToArray();
        return candidateIds.SequenceEqual(currentIds);
    }

    private bool IsSelected(BoardElement element) => _selectedElements.Any(candidate => candidate.Id == element.Id);
}
