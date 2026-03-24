using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Rendering;
using Orim.Core.Models;
using Orim.Core.Services;
using Orim.Web.Components.Pages;
using Orim.Web.Services;

namespace Orim.Web.Components;

public partial class WhiteboardCanvas
{
    private string GetSurfaceStyle()
    {
        var gridStep = 24 * _zoom;
        var offsetX = GetWrappedGridOffset(_cameraOffset.X, gridStep);
        var offsetY = GetWrappedGridOffset(_cameraOffset.Y, gridStep);

        return $"position: relative; width: 100%; height: 100%; overflow: hidden; background-color: {GetBoardSurfaceColor()}; background-image: linear-gradient({GetBoardGridColor()} 1px, transparent 1px), linear-gradient(90deg, {GetBoardGridColor()} 1px, transparent 1px); background-size: {CssNumber(gridStep)}px {CssNumber(gridStep)}px; background-position: {CssNumber(offsetX)}px {CssNumber(offsetY)}px; cursor: {GetCursor()}; touch-action: none; user-select: none; transition: background-color 0.2s ease;";
    }

    private string GetWorldStyle() =>
        $"position: absolute; inset: 0; overflow: visible; transform-origin: 0 0; transform: translate({CssNumber(_cameraOffset.X)}px, {CssNumber(_cameraOffset.Y)}px) scale({CssNumber(_zoom)});";

    private Point WorldToScreen(Point point) => new(
        point.X * _zoom + _cameraOffset.X,
        point.Y * _zoom + _cameraOffset.Y);

    private static double GetWrappedGridOffset(double offset, double step)
    {
        if (step <= 0)
        {
            return 0;
        }

        var wrapped = offset % step;
        return wrapped < 0 ? wrapped + step : wrapped;
    }

    private string GetBoardSurfaceColor() => ThemeManager.CurrentPreset switch
    {
        ThemePreset.Dark => "#10192A",
        ThemePreset.Synthwave => "#160A29",
        _ => "#FFFFFF"
    };

    private string GetBoardGridColor() => ThemeManager.CurrentPreset switch
    {
        ThemePreset.Dark => "rgba(148, 163, 184, 0.16)",
        ThemePreset.Synthwave => "rgba(53, 242, 255, 0.16)",
        _ => "#EEF2F7"
    };

    private string GetDefaultShapeFillColor() => ThemeManager.CurrentPreset switch
    {
        ThemePreset.Dark => "#18253B",
        ThemePreset.Synthwave => "#261145",
        _ => "#FFFFFF"
    };

    private string GetDefaultStrokeColor() => ThemeManager.CurrentPreset switch
    {
        ThemePreset.Dark => "#E5EEF9",
        ThemePreset.Synthwave => "#35F2FF",
        _ => "#0F172A"
    };

    private string GetDefaultIconColor() => ThemeManager.CurrentPreset switch
    {
        ThemePreset.Dark => "#E5EEF9",
        ThemePreset.Synthwave => "#FFF0FF",
        _ => "#0F172A"
    };

    private string GetSelectionColor() => ThemeManager.CurrentPreset switch
    {
        ThemePreset.Dark => "#8B5CF6",
        ThemePreset.Synthwave => "#FF4FD8",
        _ => "#2563EB"
    };

    private string GetSelectionTint(double opacity) => ThemeManager.CurrentPreset switch
    {
        ThemePreset.Dark => $"rgba(139, 92, 246, {CssNumber(opacity)})",
        ThemePreset.Synthwave => $"rgba(255, 79, 216, {CssNumber(opacity)})",
        _ => $"rgba(37, 99, 235, {CssNumber(opacity)})"
    };

    private string GetHandleSurfaceColor() => ThemeManager.CurrentPreset switch
    {
        ThemePreset.Dark => "#10192A",
        ThemePreset.Synthwave => "#160A29",
        _ => "#FFFFFF"
    };

    private string GetDockTargetColor() => ThemeManager.CurrentPreset switch
    {
        ThemePreset.Dark => "#22C55E",
        ThemePreset.Synthwave => "#35F2FF",
        _ => "#0F766E"
    };

    private string GetSelectionFrameStyle()
    {
        var bounds = GetSelectionBounds();
        return $"position:absolute; left:{Px(bounds.Left)}; top:{Px(bounds.Top)}; width:{Px(bounds.Width)}; height:{Px(bounds.Height)}; border:{Px(2 / _zoom)} dashed {GetSelectionColor()}; background:{GetSelectionTint(0.10)}; border-radius:{Px(8 / _zoom)}; pointer-events:none;";
    }

    private string GetAlignmentGuideStyle(AlignmentGuide guide)
    {
        var thickness = Math.Max(2 / _zoom, 1);
        var start = Math.Min(guide.Start, guide.End);
        var length = Math.Max(Math.Abs(guide.End - guide.Start), thickness);

        return guide.IsVertical
            ? $"position:absolute; left:{Px(guide.Coordinate - thickness / 2)}; top:{Px(start)}; width:{Px(thickness)}; height:{Px(length)}; background:#dc2626; border-radius:{Px(thickness)}; pointer-events:none; box-shadow:0 0 0 {Px(1 / _zoom)} rgba(220,38,38,0.12);"
            : $"position:absolute; left:{Px(start)}; top:{Px(guide.Coordinate - thickness / 2)}; width:{Px(length)}; height:{Px(thickness)}; background:#dc2626; border-radius:{Px(thickness)}; pointer-events:none; box-shadow:0 0 0 {Px(1 / _zoom)} rgba(220,38,38,0.12);";
    }

    private string GetSingleSelectionOutlineStyle(BoardElement element)
    {
        var padding = 4 / _zoom;
        return $"position:absolute; left:{Px(element.X - padding)}; top:{Px(element.Y - padding)}; width:{Px(element.Width + padding * 2)}; height:{Px(element.Height + padding * 2)}; border:{Px(2 / _zoom)} dashed {GetSelectionColor()}; border-radius:{Px(12 / _zoom)}; pointer-events:none;";
    }

    private string GetSelectionOutlineStyle()
    {
        var elements = GetSelectedNonArrowElements();
        if (elements.Count == 0)
        {
            return "display:none;";
        }

        var padding = 8 / _zoom;
        var left = elements.Min(element => element.X) - padding;
        var top = elements.Min(element => element.Y) - padding;
        var right = elements.Max(element => element.X + element.Width) + padding;
        var bottom = elements.Max(element => element.Y + element.Height) + padding;

        return $"position:absolute; left:{Px(left)}; top:{Px(top)}; width:{Px(right - left)}; height:{Px(bottom - top)}; border:{Px(2 / _zoom)} dashed {GetSelectionColor()}; border-radius:{Px(16 / _zoom)}; background:{GetSelectionTint(0.04)}; pointer-events:none;";
    }

    private string GetCursor() => SelectedTool switch
    {
        _ when _isPanning => "grabbing",
        _ when _isMarqueeSelecting => "crosshair",
        _ when _isResizingSelection => GetResizeCursor(_activeResizeHandle),
        BoardEditor.Tool.Rectangle or BoardEditor.Tool.Circle or BoardEditor.Tool.Triangle => "crosshair",
        BoardEditor.Tool.Arrow => "crosshair",
        _ when _arrowMiddleSegmentDrag is not null => _arrowMiddleSegmentDrag.Value.IsVertical ? "ew-resize" : "ns-resize",
        _ when _arrowEndpointDrag is not null || _hoverArrowEndpointHandle is not null => "pointer",
        _ when _hoverArrowMiddleSegmentHandle is not null => _hoverArrowMiddleSegmentHandle.Value.IsVertical ? "ew-resize" : "ns-resize",
        _ when _hoverResizeHandle != ResizeHandle.None => GetResizeCursor(_hoverResizeHandle),
        _ when _isDraggingSelection => "grabbing",
        _ => "grab"
    };

    private static string CssNumber(double value) =>
        Math.Round(value, 2, MidpointRounding.AwayFromZero)
            .ToString("0.##", System.Globalization.CultureInfo.InvariantCulture);

    private string Px(double value) => $"{CssNumber(value)}px";

    private string GetRemoteCursorStyle(BoardCursorPresence cursor)
    {
        var screenPoint = WorldToScreen(new Point(cursor.WorldX ?? 0, cursor.WorldY ?? 0));
        return $"position:absolute; left:{Px(screenPoint.X)}; top:{Px(screenPoint.Y)}; transform:translate(-2px, -2px); pointer-events:none; z-index:30;";
    }

    private string GetRemoteCursorPointerStyle(BoardCursorPresence cursor) =>
        $"width:18px; height:24px; background:{cursor.ColorHex}; clip-path:polygon(0 0, 0 100%, 22% 79%, 32% 72%, 43% 100%, 57% 94%, 46% 68%, 78% 68%); transform:none; filter:drop-shadow(-1.8px 0 0 #ffffff) drop-shadow(1.8px 0 0 #ffffff) drop-shadow(0 -1.8px 0 #ffffff) drop-shadow(0 1.8px 0 #ffffff) drop-shadow(-0.8px 0 0 #111827) drop-shadow(0.8px 0 0 #111827) drop-shadow(0 -0.8px 0 #111827) drop-shadow(0 0.8px 0 #111827) drop-shadow(0 3px 8px rgba(15, 23, 42, 0.30));";

    private string GetRemoteCursorLabelStyle(BoardCursorPresence cursor) =>
        $"margin-left:12px; margin-top:-4px; display:inline-flex; align-items:center; max-width:220px; padding:3px 8px; border-radius:999px; background:{cursor.ColorHex}; color:#fff; font-size:12px; font-weight:700; line-height:1.2; white-space:nowrap; box-shadow:0 8px 24px rgba(15, 23, 42, 0.18);";

    private RenderFragment RenderElement(BoardElement element) => element switch
    {
        ShapeElement shape => RenderShape(shape),
        TextElement text => RenderText(text),
        IconElement icon => RenderIcon(icon),
        ArrowElement arrow => RenderArrow(arrow),
        _ => builder => { }
    };

    private RenderFragment RenderShape(ShapeElement shape) => builder =>
    {
        var selected = IsSelected(shape);
        var strokeColor = selected ? GetSelectionColor() : shape.StrokeColor;
        var containerStyle = $"position: absolute; left: {Px(shape.X)}; top: {Px(shape.Y)}; width: {Px(shape.Width)}; height: {Px(shape.Height)}; overflow: visible; pointer-events: none;";
        var svgStyle = "width: 100%; height: 100%; overflow: visible; display: block;";
        var dashArray = GetStrokeDashArray(shape.BorderLineStyle);
        var inset = shape.BorderLineStyle == BorderLineStyle.Double ? Math.Max(shape.StrokeWidth * 2.2, 4) : 0;
        var strokeWidth = Math.Max(shape.StrokeWidth, 1);

        builder.OpenElement(0, "div");
        builder.AddAttribute(1, "style", containerStyle);

        builder.OpenElement(2, "svg");
        builder.AddAttribute(3, "viewBox", $"0 0 {CssNumber(Math.Max(shape.Width, 1))} {CssNumber(Math.Max(shape.Height, 1))}");
        builder.AddAttribute(4, "preserveAspectRatio", "none");
        builder.AddAttribute(5, "style", svgStyle);

        RenderShapePrimitive(builder, 6, shape, shape.FillColor, strokeColor, strokeWidth, dashArray, 0);

        if (shape.BorderLineStyle == BorderLineStyle.Double)
        {
            RenderShapePrimitive(builder, 26, shape, "transparent", strokeColor, Math.Max(shape.StrokeWidth * 0.85, 1), string.Empty, inset);
        }

        builder.CloseElement();

        if (!string.IsNullOrWhiteSpace(shape.Label))
        {
            builder.OpenElement(30, "div");
            builder.AddAttribute(31, "style", GetElementLabelStyle(shape, shape.StrokeColor, shape.FillColor));
            builder.AddContent(32, shape.Label);
            builder.CloseElement();
        }

        builder.CloseElement();
    };

    private void RenderShapePrimitive(RenderTreeBuilder builder, int sequence, ShapeElement shape, string fillColor, string strokeColor, double strokeWidth, string dashArray, double inset)
    {
        var safeWidth = Math.Max(shape.Width, 1);
        var safeHeight = Math.Max(shape.Height, 1);
        var halfStroke = strokeWidth / 2;
        var left = Math.Min(inset + halfStroke, safeWidth / 2);
        var top = Math.Min(inset + halfStroke, safeHeight / 2);
        var width = Math.Max(safeWidth - (inset * 2) - strokeWidth, 0.01);
        var height = Math.Max(safeHeight - (inset * 2) - strokeWidth, 0.01);

        switch (shape.ShapeType)
        {
            case ShapeType.Ellipse:
                builder.OpenElement(sequence, "ellipse");
                builder.AddAttribute(sequence + 1, "cx", CssNumber(safeWidth / 2));
                builder.AddAttribute(sequence + 2, "cy", CssNumber(safeHeight / 2));
                builder.AddAttribute(sequence + 3, "rx", CssNumber(Math.Max((safeWidth / 2) - inset - halfStroke, 0.01)));
                builder.AddAttribute(sequence + 4, "ry", CssNumber(Math.Max((safeHeight / 2) - inset - halfStroke, 0.01)));
                break;
            case ShapeType.Triangle:
                builder.OpenElement(sequence, "polygon");
                builder.AddAttribute(sequence + 1, "points", GetTrianglePoints(safeWidth, safeHeight, inset + halfStroke));
                break;
            default:
                builder.OpenElement(sequence, "rect");
                builder.AddAttribute(sequence + 1, "x", CssNumber(left));
                builder.AddAttribute(sequence + 2, "y", CssNumber(top));
                builder.AddAttribute(sequence + 3, "width", CssNumber(width));
                builder.AddAttribute(sequence + 4, "height", CssNumber(height));
                builder.AddAttribute(sequence + 5, "rx", CssNumber(Math.Max(10 - inset, 0)));
                builder.AddAttribute(sequence + 6, "ry", CssNumber(Math.Max(10 - inset, 0)));
                break;
        }

        builder.AddAttribute(sequence + 10, "fill", fillColor);
        builder.AddAttribute(sequence + 11, "stroke", strokeColor);
        builder.AddAttribute(sequence + 12, "stroke-width", CssNumber(strokeWidth));
        builder.AddAttribute(sequence + 13, "vector-effect", "non-scaling-stroke");

        if (!string.IsNullOrWhiteSpace(dashArray))
        {
            builder.AddAttribute(sequence + 14, "stroke-dasharray", dashArray);
        }

        builder.CloseElement();
    }

    private static string GetTrianglePoints(double width, double height, double inset)
    {
        var topX = width / 2;
        var topY = inset;
        var leftX = inset;
        var leftY = Math.Max(height - inset, inset);
        var rightX = Math.Max(width - inset, inset);
        var rightY = Math.Max(height - inset, inset);
        return $"{CssNumber(topX)},{CssNumber(topY)} {CssNumber(leftX)},{CssNumber(leftY)} {CssNumber(rightX)},{CssNumber(rightY)}";
    }

    private static string GetStrokeDashArray(BorderLineStyle borderLineStyle) => borderLineStyle switch
    {
        BorderLineStyle.Dashed => "10 6",
        BorderLineStyle.Dotted => "2 5",
        BorderLineStyle.DashDot => "10 4 2 4",
        BorderLineStyle.LongDash => "16 6",
        _ => string.Empty
    };

    private static string GetStrokeDashArray(ArrowLineStyle lineStyle, double strokeWidth)
    {
        var normalizedStrokeWidth = Math.Max(strokeWidth, 1);

        return lineStyle switch
        {
            ArrowLineStyle.Dashed => FormatDashArray(normalizedStrokeWidth * 4.5, normalizedStrokeWidth * 2.8),
            ArrowLineStyle.Dotted => FormatDashArray(normalizedStrokeWidth * 0.9, normalizedStrokeWidth * 1.8),
            ArrowLineStyle.DashDot => FormatDashArray(normalizedStrokeWidth * 5, normalizedStrokeWidth * 2.2, normalizedStrokeWidth * 1.1, normalizedStrokeWidth * 2.6),
            ArrowLineStyle.LongDash => FormatDashArray(normalizedStrokeWidth * 7, normalizedStrokeWidth * 3),
            _ => string.Empty
        };
    }

    private static string FormatDashArray(params double[] segments) =>
        string.Join(" ", segments.Select(segment => CssNumber(Math.Max(segment, 1))));

    private RenderFragment RenderText(TextElement text) => builder =>
    {
        var minHeight = Math.Max(text.Height, text.FontSize + 8);
        var style = $"position: absolute; left: {Px(text.X)}; top: {Px(text.Y)}; width: {Px(text.Width)}; min-height: {Px(minHeight)}; color: {text.Color}; font-size: {Px(text.FontSize)}; font-weight: {(text.IsBold ? "700" : "400")}; font-style: {(text.IsItalic ? "italic" : "normal")}; line-height: 1.15; white-space: pre-wrap; overflow-wrap: anywhere; text-shadow: {GetTextShadow(text.Color, GetBoardSurfaceColor())};";
        builder.OpenElement(0, "div");
        builder.AddAttribute(1, "style", style);
        builder.AddContent(2, text.Text);
        builder.CloseElement();
    };

    private RenderFragment RenderIcon(IconElement icon) => builder =>
    {
        var containerStyle = $"position: absolute; left: {Px(icon.X)}; top: {Px(icon.Y)}; width: {Px(icon.Width)}; height: {Px(icon.Height)}; display:flex; align-items:center; justify-content:center; pointer-events:none;";
        var iconSize = Math.Clamp(Math.Min(Math.Max(icon.Width, 1), Math.Max(icon.Height, 1)) * 0.82, 16, 512);

        builder.OpenElement(0, "div");
        builder.AddAttribute(1, "style", containerStyle);
        builder.OpenElement(2, "span");
        builder.AddAttribute(3, "class", $"mdi {icon.IconName}");
        builder.AddAttribute(4, "style", $"font-size:{Px(iconSize)}; line-height:1; color:{icon.Color}; display:inline-flex; align-items:center; justify-content:center;");
        builder.CloseElement();

        if (!string.IsNullOrWhiteSpace(icon.Label))
        {
            builder.OpenElement(5, "div");
            builder.AddAttribute(6, "style", GetElementLabelStyle(icon, icon.Color, GetBoardSurfaceColor()));
            builder.AddContent(7, icon.Label);
            builder.CloseElement();
        }

        builder.CloseElement();
    };

    private RenderFragment RenderArrow(ArrowElement arrow) => builder =>
    {
        var renderData = GetArrowRenderData(arrow);
        if (renderData is null)
        {
            return;
        }

        RenderArrowVisual(
            builder,
            renderData.Value.Points,
            renderData.Value.LabelPoint,
            arrow.StrokeColor,
            Math.Max(arrow.StrokeWidth, 1),
            arrow.LineStyle,
            arrow.SourceHeadStyle,
            arrow.TargetHeadStyle,
            string.IsNullOrWhiteSpace(arrow.Label) ? null : arrow.Label,
            GetResolvedLabelFontSize(arrow),
            arrow.LabelHorizontalAlignment,
            arrow.LabelVerticalAlignment,
                IsSelected(arrow),
                1,
                _arrowEndpointDrag is not null && _arrowEndpointDrag.Value.ArrowId == arrow.Id ? _arrowEndpointDrag : null);
    };

    private RenderFragment RenderDraftArrow(ArrowDraft draft) => builder =>
    {
        if (Board is null)
        {
            return;
        }

        var start = draft.SourcePoint;
        if (draft.SourceElementId is Guid sourceElementId)
        {
            var source = Board.Elements.FirstOrDefault(element => element.Id == sourceElementId);
            if (source is null)
            {
                return;
            }

            start = GetDockPosition(source, draft.SourceDock);
        }

        var end = draft.Pointer;
        if (draft.TargetElementId is Guid targetElementId && draft.TargetDock is DockPoint targetDock)
        {
            var target = Board.Elements.FirstOrDefault(element => element.Id == targetElementId);
            if (target is not null)
            {
                end = GetDockPosition(target, targetDock);
            }
        }

        var points = BuildArrowPath(start, draft.SourceDock, end, ResolvePreviewTargetDock(draft, start, end), ArrowRouteStyle.Orthogonal);
        RenderArrowVisual(
            builder,
            points,
            GetPointAlongPolyline(points, 0.5),
            GetSelectionColor(),
            2,
            ArrowLineStyle.Dashed,
            ArrowHeadStyle.None,
            ArrowHeadStyle.FilledTriangle,
            null,
            14,
            HorizontalLabelAlignment.Center,
            VerticalLabelAlignment.Middle,
            false,
            0.6);
    };

    private void RenderArrowVisual(RenderTreeBuilder builder, IReadOnlyList<Point> points, Point labelPoint, string strokeColor, double strokeWidth, ArrowLineStyle lineStyle, ArrowHeadStyle sourceHead, ArrowHeadStyle targetHead, string? label, double labelFontSize, HorizontalLabelAlignment horizontalAlignment, VerticalLabelAlignment verticalAlignment, bool isSelected, double opacity = 1, ArrowEndpointDrag? endpointDrag = null)
    {
        if (points.Count < 2)
        {
            return;
        }

        var effectiveColor = isSelected ? "#2563eb" : strokeColor;
        effectiveColor = isSelected ? GetSelectionColor() : strokeColor;
        var headSize = Math.Max(16, strokeWidth * 6.5);
        var visibleSourceHead = endpointDrag is null || !endpointDrag.Value.IsSource ? sourceHead : ArrowHeadStyle.None;
        var visibleTargetHead = endpointDrag is null || endpointDrag.Value.IsSource ? targetHead : ArrowHeadStyle.None;
        var linePoints = GetTrimmedArrowLinePoints(points, visibleSourceHead, visibleTargetHead, headSize);
        var margin = Math.Max(20, headSize + strokeWidth * 2);
        var minX = points.Min(point => point.X) - margin;
        var minY = points.Min(point => point.Y) - margin;
        var maxX = points.Max(point => point.X) + margin;
        var maxY = points.Max(point => point.Y) + margin;
        var width = Math.Max(maxX - minX, 1);
        var height = Math.Max(maxY - minY, 1);
        var translated = points.Select(point => new Point(point.X - minX, point.Y - minY)).ToList();
        var translatedLine = linePoints.Select(point => new Point(point.X - minX, point.Y - minY)).ToList();
        var polylinePoints = string.Join(" ", translatedLine.Select(point => $"{CssNumber(point.X)},{CssNumber(point.Y)}"));
        var dashArray = GetStrokeDashArray(lineStyle, strokeWidth);

        builder.OpenElement(0, "div");
        builder.AddAttribute(1, "style", $"position:absolute; left:{Px(minX)}; top:{Px(minY)}; width:{Px(width)}; height:{Px(height)}; overflow:visible; pointer-events:none; opacity:{CssNumber(opacity)};");
        builder.OpenElement(2, "svg");
        builder.AddAttribute(3, "viewBox", $"0 0 {CssNumber(width)} {CssNumber(height)}");
        builder.AddAttribute(4, "style", "width:100%; height:100%; overflow:visible; display:block;");

        builder.OpenElement(5, "polyline");
        builder.AddAttribute(6, "points", polylinePoints);
        builder.AddAttribute(7, "fill", "none");
        builder.AddAttribute(8, "stroke", effectiveColor);
        builder.AddAttribute(9, "stroke-width", CssNumber(strokeWidth));
        builder.AddAttribute(10, "stroke-linecap", "round");
        builder.AddAttribute(11, "stroke-linejoin", "round");
        builder.AddAttribute(12, "vector-effect", "non-scaling-stroke");
        if (!string.IsNullOrWhiteSpace(dashArray))
        {
            builder.AddAttribute(13, "stroke-dasharray", dashArray);
        }

        builder.CloseElement();

        if (visibleSourceHead != ArrowHeadStyle.None)
        {
            RenderArrowHead(builder, 20, sourceHead, translated[0], translated[1], effectiveColor, strokeWidth, headSize, true);
        }

        if (visibleTargetHead != ArrowHeadStyle.None)
        {
            RenderArrowHead(builder, 40, targetHead, translated[^1], translated[^2], effectiveColor, strokeWidth, headSize, false);
        }

        builder.CloseElement();
        builder.CloseElement();

        if (!string.IsNullOrWhiteSpace(label))
        {
            var totalLength = GetPolylineLength(points);
            var labelWidth = Math.Min(Math.Max(totalLength * 0.35, 70), 220);
            var labelHeight = Math.Max(labelFontSize * 3.2, 36);
            var labelStyle = $"position: absolute; left: {Px(labelPoint.X - labelWidth / 2)}; top: {Px(labelPoint.Y - labelHeight / 2)}; width: {Px(labelWidth)}; min-height: {Px(labelHeight)}; display:flex; align-items:{GetCssAlignItems(verticalAlignment)}; justify-content:{GetCssJustifyContent(horizontalAlignment)}; text-align:{GetCssTextAlign(horizontalAlignment)}; color: {effectiveColor}; font-size: {Px(labelFontSize)}; line-height: 1.15; pointer-events: none; white-space: pre-wrap; overflow-wrap: anywhere; box-sizing:border-box; background: transparent; border-radius: 10px; padding: 4px 8px; text-shadow: {GetTextShadow(effectiveColor, GetBoardSurfaceColor())};";
            builder.OpenElement(2, "div");
            builder.AddAttribute(3, "style", labelStyle);
            builder.AddContent(4, label);
            builder.CloseElement();
        }
    }

    private RenderFragment RenderDraftShape(ShapeElement shape) => builder =>
    {
        var containerStyle = $"position: absolute; left: {Px(shape.X)}; top: {Px(shape.Y)}; width: {Px(shape.Width)}; height: {Px(shape.Height)}; overflow: visible; pointer-events: none; opacity: 0.7;";
        var svgStyle = "width: 100%; height: 100%; overflow: visible; display: block;";

        builder.OpenElement(0, "div");
        builder.AddAttribute(1, "style", containerStyle);
        builder.OpenElement(2, "svg");
        builder.AddAttribute(3, "viewBox", $"0 0 {CssNumber(Math.Max(shape.Width, 1))} {CssNumber(Math.Max(shape.Height, 1))}");
        builder.AddAttribute(4, "preserveAspectRatio", "none");
        builder.AddAttribute(5, "style", svgStyle);
        RenderShapePrimitive(builder, 6, shape, GetSelectionTint(0.12), GetSelectionColor(), 2, "6 4", 0);
        builder.CloseElement();
        builder.CloseElement();
    };

    private static bool TryGetShapeTypeFromTool(BoardEditor.Tool tool, out ShapeType shapeType)
    {
        switch (tool)
        {
            case BoardEditor.Tool.Rectangle:
                shapeType = ShapeType.Rectangle;
                return true;
            case BoardEditor.Tool.Circle:
                shapeType = ShapeType.Ellipse;
                return true;
            case BoardEditor.Tool.Triangle:
                shapeType = ShapeType.Triangle;
                return true;
            default:
                shapeType = default;
                return false;
        }
    }

    private string GetElementLabelStyle(BoardElement element, string color, string backgroundColor)
    {
        var padding = Math.Max(8 / _zoom, 4);
        return $"position: absolute; inset: 0; display: flex; align-items: {GetCssAlignItems(element.LabelVerticalAlignment)}; justify-content: {GetCssJustifyContent(element.LabelHorizontalAlignment)}; padding: {Px(padding)}; box-sizing: border-box; text-align: {GetCssTextAlign(element.LabelHorizontalAlignment)}; color: {color}; font-size: {Px(GetResolvedLabelFontSize(element))}; line-height: 1.15; white-space: pre-wrap; overflow-wrap: anywhere; overflow: hidden; pointer-events: none; text-shadow: {GetTextShadow(color, backgroundColor)};";
    }

    private double GetResolvedLabelFontSize(BoardElement element)
    {
        if (element.LabelFontSize is double fontSize)
        {
            return Math.Max(1, fontSize);
        }

        if (element is ArrowElement arrow)
        {
            var sourceEndpoint = ResolveArrowEndpoint(arrow, true);
            var targetEndpoint = ResolveArrowEndpoint(arrow, false);
            if (sourceEndpoint is not null && targetEndpoint is not null)
            {
                var points = BuildArrowPath(sourceEndpoint.Value.Point, sourceEndpoint.Value.Dock, targetEndpoint.Value.Point, targetEndpoint.Value.Dock, arrow.RouteStyle);
                var length = GetPolylineLength(points);
                var availableWidth = Math.Min(Math.Max(length * 0.35, 70), 220) - 16;
                var availableHeight = Math.Max(Math.Min(length * 0.16, 72), 28);
                var preferredSize = Math.Clamp(length * 0.07, MinimumAutoLabelFontSize, 24);
                return EstimateFittingFontSize(arrow.Label, availableWidth, availableHeight, preferredSize, 24);
            }
        }

        var availableWidthForText = Math.Max(element.Width - 16, 12);
        var availableHeightForText = Math.Max(element.Height - 16, 12);
        var basis = Math.Min(Math.Max(element.Width, 1), Math.Max(element.Height, 1));
        var preferredElementSize = Math.Clamp(basis * 0.22, MinimumAutoLabelFontSize, MaximumLabelFontSize);
        return EstimateFittingFontSize(element.Label, availableWidthForText, availableHeightForText, preferredElementSize, MaximumLabelFontSize);
    }

    private static double EstimateFittingFontSize(string? text, double availableWidth, double availableHeight, double preferredSize, double maximumSize)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return Math.Clamp(preferredSize, MinimumAutoLabelFontSize, maximumSize);
        }

        var maxSize = Math.Clamp(preferredSize, MinimumAutoLabelFontSize, maximumSize);
        var minSize = Math.Min(MinimumLabelFontSize, maxSize);

        for (var candidate = maxSize; candidate >= MinimumAutoLabelFontSize; candidate -= 0.5)
        {
            if (DoesTextFit(text, availableWidth, availableHeight, candidate))
            {
                return candidate;
            }
        }

        return minSize;
    }

    private static bool DoesTextFit(string text, double availableWidth, double availableHeight, double fontSize)
    {
        if (availableWidth <= 0 || availableHeight <= 0 || fontSize <= 0)
        {
            return false;
        }

        const double averageCharacterWidthFactor = 0.58;
        const double lineHeightFactor = 1.15;
        var charactersPerLine = Math.Max((int)Math.Floor(availableWidth / (fontSize * averageCharacterWidthFactor)), 1);
        var totalLines = 0;

        foreach (var paragraph in text.Replace("\r", string.Empty).Split('\n'))
        {
            if (paragraph.Length == 0)
            {
                totalLines++;
                continue;
            }

            totalLines += (int)Math.Ceiling(paragraph.Length / (double)charactersPerLine);
        }

        var requiredHeight = totalLines * fontSize * lineHeightFactor;
        return requiredHeight <= availableHeight;
    }

    private string GetTextShadow(string textColor, string backgroundColor)
    {
        if (!(Board?.LabelOutlineEnabled ?? true))
        {
            return "none";
        }

        var outlineColor = GetOutlineColor(textColor, backgroundColor);
        return $"0 0 0.35px {outlineColor}, 0.45px 0 0 {outlineColor}, -0.45px 0 0 {outlineColor}, 0 0.45px 0 {outlineColor}, 0 -0.45px 0 {outlineColor}";
    }

    private static string GetOutlineColor(string textColor, string backgroundColor)
    {
        var useWhite = true;

        if (TryParseCssColor(textColor, out var parsedTextColor) && TryParseCssColor(backgroundColor, out var parsedBackgroundColor))
        {
            var whiteScore = Math.Min(GetContrastRatio(new RgbColor(255, 255, 255), parsedTextColor), GetContrastRatio(new RgbColor(255, 255, 255), parsedBackgroundColor));
            var blackScore = Math.Min(GetContrastRatio(new RgbColor(0, 0, 0), parsedTextColor), GetContrastRatio(new RgbColor(0, 0, 0), parsedBackgroundColor));
            useWhite = whiteScore >= blackScore;
        }
        else if (TryParseCssColor(textColor, out parsedTextColor))
        {
            useWhite = GetRelativeLuminance(parsedTextColor) < 0.45;
        }

        return useWhite ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.82)";
    }

    private static bool TryParseCssColor(string color, out RgbColor parsed)
    {
        parsed = default;
        if (string.IsNullOrWhiteSpace(color))
        {
            return false;
        }

        var value = color.Trim();
        if (value.StartsWith('#'))
        {
            var hex = value[1..];
            if (hex.Length == 3)
            {
                hex = string.Concat(hex.Select(ch => new string(ch, 2)));
            }

            if (hex.Length >= 6 &&
                byte.TryParse(hex[..2], System.Globalization.NumberStyles.HexNumber, null, out var red) &&
                byte.TryParse(hex[2..4], System.Globalization.NumberStyles.HexNumber, null, out var green) &&
                byte.TryParse(hex[4..6], System.Globalization.NumberStyles.HexNumber, null, out var blue))
            {
                parsed = new RgbColor(red, green, blue);
                return true;
            }

            return false;
        }

        if (value.StartsWith("rgb", StringComparison.OrdinalIgnoreCase))
        {
            var start = value.IndexOf('(');
            var end = value.LastIndexOf(')');
            if (start < 0 || end <= start)
            {
                return false;
            }

            var parts = value[(start + 1)..end].Split(',');
            if (parts.Length < 3)
            {
                return false;
            }

            if (byte.TryParse(parts[0].Trim(), out var red) &&
                byte.TryParse(parts[1].Trim(), out var green) &&
                byte.TryParse(parts[2].Trim(), out var blue))
            {
                parsed = new RgbColor(red, green, blue);
                return true;
            }
        }

        return false;
    }

    private static double GetContrastRatio(RgbColor first, RgbColor second)
    {
        var luminance1 = GetRelativeLuminance(first);
        var luminance2 = GetRelativeLuminance(second);
        var lighter = Math.Max(luminance1, luminance2);
        var darker = Math.Min(luminance1, luminance2);
        return (lighter + 0.05) / (darker + 0.05);
    }

    private static double GetRelativeLuminance(RgbColor color)
    {
        static double Channel(byte value)
        {
            var normalized = value / 255d;
            return normalized <= 0.03928 ? normalized / 12.92 : Math.Pow((normalized + 0.055) / 1.055, 2.4);
        }

        return 0.2126 * Channel(color.R) + 0.7152 * Channel(color.G) + 0.0722 * Channel(color.B);
    }

    private static string GetCssTextAlign(HorizontalLabelAlignment alignment) => alignment switch
    {
        HorizontalLabelAlignment.Left => "left",
        HorizontalLabelAlignment.Right => "right",
        _ => "center"
    };

    private static string GetCssJustifyContent(HorizontalLabelAlignment alignment) => alignment switch
    {
        HorizontalLabelAlignment.Left => "flex-start",
        HorizontalLabelAlignment.Right => "flex-end",
        _ => "center"
    };

    private static string GetCssAlignItems(VerticalLabelAlignment alignment) => alignment switch
    {
        VerticalLabelAlignment.Top => "flex-start",
        VerticalLabelAlignment.Bottom => "flex-end",
        _ => "center"
    };

    private string GetArrowEndpointHandleStyle(ArrowEndpointHandleDefinition handle)
    {
        var isHovered = _hoverArrowEndpointHandle is not null &&
            _hoverArrowEndpointHandle.Value.IsSource == handle.IsSource &&
            Math.Abs(_hoverArrowEndpointHandle.Value.Center.X - handle.Center.X) < 0.1 &&
            Math.Abs(_hoverArrowEndpointHandle.Value.Center.Y - handle.Center.Y) < 0.1;
        var size = (handle.IsActive || isHovered ? 16 : 12) / _zoom;
        var left = handle.Center.X - (size / 2);
        var top = handle.Center.Y - (size / 2);
        var background = handle.IsSource ? GetHandleSurfaceColor() : GetSelectionColor();
        var border = handle.IsSource ? GetSelectionColor() : GetHandleSurfaceColor();
        return $"position:absolute; left:{Px(left)}; top:{Px(top)}; width:{Px(size)}; height:{Px(size)}; border-radius:999px; background:{background}; border:2px solid {border}; box-sizing:border-box; pointer-events:none; box-shadow:0 0 0 {Px(2 / _zoom)} {GetSelectionTint(0.18)};";
    }

    private string GetArrowMiddleSegmentHandleStyle(ArrowMiddleSegmentHandleDefinition handle)
    {
        var isHovered = _hoverArrowMiddleSegmentHandle is not null &&
            _hoverArrowMiddleSegmentHandle.Value.IsVertical == handle.IsVertical &&
            Math.Abs(_hoverArrowMiddleSegmentHandle.Value.Center.X - handle.Center.X) < 0.1 &&
            Math.Abs(_hoverArrowMiddleSegmentHandle.Value.Center.Y - handle.Center.Y) < 0.1;
        var thickness = (handle.IsActive || isHovered ? 12 : 8) / _zoom;
        var length = Math.Max(handle.IsVertical ? Math.Abs(handle.End.Y - handle.Start.Y) : Math.Abs(handle.End.X - handle.Start.X), 18 / _zoom);
        var left = handle.IsVertical ? handle.Center.X - thickness / 2 : handle.Center.X - length / 2;
        var top = handle.IsVertical ? handle.Center.Y - length / 2 : handle.Center.Y - thickness / 2;
        var width = handle.IsVertical ? thickness : length;
        var height = handle.IsVertical ? length : thickness;
        return $"position:absolute; left:{Px(left)}; top:{Px(top)}; width:{Px(width)}; height:{Px(height)}; border-radius:{Px(Math.Max(thickness, 6 / _zoom))}; background:{GetSelectionTint(handle.IsActive || isHovered ? 0.28 : 0.18)}; border:{Px(2 / _zoom)} solid {GetSelectionColor()}; box-sizing:border-box; pointer-events:none;";
    }

    private string GetDockHandleStyle(DockHandleDefinition handle)
    {
        var size = (handle.IsActive || handle.IsTarget ? 14 : 10) / _zoom;
        var left = handle.Center.X - (size / 2);
        var top = handle.Center.Y - (size / 2);
        var background = handle.IsActive ? GetSelectionColor() : handle.IsTarget ? GetDockTargetColor() : GetHandleSurfaceColor();
        var border = handle.IsActive || handle.IsTarget ? GetHandleSurfaceColor() : GetSelectionColor();
        return $"position:absolute; left:{Px(left)}; top:{Px(top)}; width:{Px(size)}; height:{Px(size)}; border-radius:999px; background:{background}; border:2px solid {border}; box-sizing:border-box; pointer-events:none; box-shadow:0 0 0 {Px(1 / _zoom)} {GetSelectionTint(0.12)};";
    }

    private void RenderArrowHead(RenderTreeBuilder builder, int sequence, ArrowHeadStyle style, Point tip, Point adjacent, string color, double strokeWidth, double size, bool reverse)
    {
        if (style == ArrowHeadStyle.None)
        {
            return;
        }

        var dx = tip.X - adjacent.X;
        var dy = tip.Y - adjacent.Y;
        var length = Math.Sqrt(dx * dx + dy * dy);
        if (length < 0.001)
        {
            return;
        }

        var ux = dx / length;
        var uy = dy / length;
        if (reverse)
        {
            ux *= -1;
            uy *= -1;
        }

        var normalX = -uy;
        var normalY = ux;
        var baseDistance = size;
        var wing = size * 0.52;
        var baseCenter = new Point(tip.X - ux * baseDistance, tip.Y - uy * baseDistance);
        var left = new Point(baseCenter.X + normalX * wing, baseCenter.Y + normalY * wing);
        var right = new Point(baseCenter.X - normalX * wing, baseCenter.Y - normalY * wing);
        var circleRadius = Math.Max(strokeWidth * 1.4, size * 0.28);

        switch (style)
        {
            case ArrowHeadStyle.FilledTriangle:
                builder.OpenElement(sequence, "polygon");
                builder.AddAttribute(sequence + 1, "points", $"{CssNumber(tip.X)},{CssNumber(tip.Y)} {CssNumber(left.X)},{CssNumber(left.Y)} {CssNumber(right.X)},{CssNumber(right.Y)}");
                builder.AddAttribute(sequence + 2, "fill", color);
                builder.CloseElement();
                break;
            case ArrowHeadStyle.OpenTriangle:
                builder.OpenElement(sequence, "polyline");
                builder.AddAttribute(sequence + 1, "points", $"{CssNumber(left.X)},{CssNumber(left.Y)} {CssNumber(tip.X)},{CssNumber(tip.Y)} {CssNumber(right.X)},{CssNumber(right.Y)}");
                builder.AddAttribute(sequence + 2, "fill", "none");
                builder.AddAttribute(sequence + 3, "stroke", color);
                builder.AddAttribute(sequence + 4, "stroke-width", CssNumber(Math.Max(strokeWidth, 1.5)));
                builder.AddAttribute(sequence + 5, "stroke-linecap", "round");
                builder.AddAttribute(sequence + 6, "stroke-linejoin", "round");
                builder.CloseElement();
                break;
            case ArrowHeadStyle.FilledCircle:
                builder.OpenElement(sequence, "circle");
                builder.AddAttribute(sequence + 1, "cx", CssNumber(tip.X - ux * circleRadius * 0.2));
                builder.AddAttribute(sequence + 2, "cy", CssNumber(tip.Y - uy * circleRadius * 0.2));
                builder.AddAttribute(sequence + 3, "r", CssNumber(circleRadius));
                builder.AddAttribute(sequence + 4, "fill", color);
                builder.CloseElement();
                break;
            case ArrowHeadStyle.OpenCircle:
                builder.OpenElement(sequence, "circle");
                builder.AddAttribute(sequence + 1, "cx", CssNumber(tip.X - ux * circleRadius * 0.2));
                builder.AddAttribute(sequence + 2, "cy", CssNumber(tip.Y - uy * circleRadius * 0.2));
                builder.AddAttribute(sequence + 3, "r", CssNumber(circleRadius));
                builder.AddAttribute(sequence + 4, "fill", GetHandleSurfaceColor());
                builder.AddAttribute(sequence + 5, "stroke", color);
                builder.AddAttribute(sequence + 6, "stroke-width", CssNumber(Math.Max(strokeWidth, 1.5)));
                builder.CloseElement();
                break;
        }
    }

    private string GetResizeHandleStyle(ResizeHandleDefinition handle)
    {
        var size = ResizeHandleScreenSize / _zoom;
        var left = handle.Center.X - (size / 2);
        var top = handle.Center.Y - (size / 2);
        return $"position: absolute; left: {Px(left)}; top: {Px(top)}; width: {Px(size)}; height: {Px(size)}; background: {GetHandleSurfaceColor()}; border: 2px solid {GetSelectionColor()}; border-radius: 999px; box-sizing: border-box; pointer-events: none;";
    }

    private static string GetResizeCursor(ResizeHandle handle) => handle switch
    {
        ResizeHandle.North or ResizeHandle.South => "ns-resize",
        ResizeHandle.East or ResizeHandle.West => "ew-resize",
        ResizeHandle.NorthEast or ResizeHandle.SouthWest => "nesw-resize",
        ResizeHandle.NorthWest or ResizeHandle.SouthEast => "nwse-resize",
        _ => "grab"
    };
}
