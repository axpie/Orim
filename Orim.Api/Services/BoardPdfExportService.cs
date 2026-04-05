using System.Globalization;
using PdfSharp.Drawing;
using PdfSharp.Fonts;
using PdfSharp.Pdf;
using Orim.Core.Models;

namespace Orim.Api.Services;

public sealed class BoardPdfExportService
{
    static BoardPdfExportService()
    {
        if (OperatingSystem.IsWindows())
        {
            GlobalFontSettings.UseWindowsFontsUnderWindows = true;
        }
        else
        {
            GlobalFontSettings.FontResolver = new LinuxFontResolver();
        }
    }

    private const double PageWidthPoints = 842;
    private const double PageHeightPoints = 595;
    private const double PageMarginPoints = 36;
    private const double OrthogonalDockStubLength = 40;
    private const double OrthogonalBendPenalty = 40;
    private const int OrthogonalMaxBends = 12;
    private const double OrthogonalSolverTimeBudgetMs = 8;
    private const int ArcSegmentCount = 24;
    private const double ArcMinMidpointOffset = 48;
    private const double ArcMaxMidpointOffset = 160;
    private const double StickyPadding = 12;
    private const double FrameTitlePadding = 14;
    private const string StickyBorderColor = "rgba(15, 23, 42, 0.14)";
    private const string StickyFoldColor = "rgba(255, 255, 255, 0.32)";
    private static readonly DockPoint[] EdgeDocks = [DockPoint.Top, DockPoint.Right, DockPoint.Bottom, DockPoint.Left];

    public byte[] Export(Board board)
    {
        using var document = new PdfDocument();
        var page = document.AddPage();
        page.Width = XUnit.FromPoint(PageWidthPoints);
        page.Height = XUnit.FromPoint(PageHeightPoints);

        using var gfx = XGraphics.FromPdfPage(page);
        gfx.DrawRectangle(XBrushes.White, 0, 0, page.Width.Point, page.Height.Point);

        var orderedElements = board.Elements.OrderBy(element => element.ZIndex).ToList();
        if (orderedElements.Count == 0)
        {
            using var emptyStream = new MemoryStream();
            document.Save(emptyStream, false);
            return emptyStream.ToArray();
        }

        var contentBounds = ComputeContentBounds(orderedElements);
        var usableWidth = Math.Max(1, page.Width.Point - PageMarginPoints * 2);
        var usableHeight = Math.Max(1, page.Height.Point - PageMarginPoints * 2);
        var scale = Math.Min(usableWidth / Math.Max(1, contentBounds.Width), usableHeight / Math.Max(1, contentBounds.Height));
        if (double.IsNaN(scale) || double.IsInfinity(scale) || scale <= 0)
        {
            scale = 1;
        }

        var offsetX = PageMarginPoints + (usableWidth - contentBounds.Width * scale) / 2 - (contentBounds.Left * scale);
        var offsetY = PageMarginPoints + (usableHeight - contentBounds.Height * scale) / 2 - (contentBounds.Top * scale);

        foreach (var element in orderedElements)
        {
            switch (element)
            {
                case ShapeElement shape:
                    DrawShape(gfx, shape, scale, offsetX, offsetY);
                    break;
                case TextElement text:
                    DrawText(gfx, text, scale, offsetX, offsetY);
                    break;
                case StickyNoteElement sticky:
                    DrawStickyNote(gfx, sticky, scale, offsetX, offsetY);
                    break;
                case FrameElement frame:
                    DrawFrame(gfx, frame, scale, offsetX, offsetY);
                    break;
                case ArrowElement arrow:
                    DrawArrow(gfx, arrow, orderedElements, scale, offsetX, offsetY);
                    break;
                case IconElement icon:
                    DrawIconPlaceholder(gfx, icon, scale, offsetX, offsetY);
                    break;
            }
        }

        using var stream = new MemoryStream();
        document.Save(stream, false);
        return stream.ToArray();
    }

    private static PdfBounds ComputeContentBounds(IReadOnlyList<BoardElement> elements)
    {
        var hasBounds = false;
        var left = 0d;
        var top = 0d;
        var right = 0d;
        var bottom = 0d;

        foreach (var element in elements)
        {
            var bounds = element switch
            {
                ShapeElement shape => ExpandBounds(new PdfBounds(shape.X, shape.Y, shape.Width, shape.Height), shape.StrokeWidth / 2),
                TextElement text => new PdfBounds(text.X, text.Y, Math.Max(text.Width, 100), Math.Max(text.Height, 30)),
                StickyNoteElement sticky => new PdfBounds(sticky.X, sticky.Y, Math.Max(sticky.Width, 120), Math.Max(sticky.Height, 80)),
                FrameElement frame => ExpandBounds(new PdfBounds(frame.X, frame.Y, Math.Max(frame.Width, 120), Math.Max(frame.Height, 80)), frame.StrokeWidth / 2),
                IconElement icon => new PdfBounds(icon.X, icon.Y, icon.Width, icon.Height),
                ArrowElement arrow => GetArrowBounds(arrow, elements),
                _ => new PdfBounds(element.X, element.Y, element.Width, element.Height),
            };

            if (!hasBounds)
            {
                left = bounds.Left;
                top = bounds.Top;
                right = bounds.Right;
                bottom = bounds.Bottom;
                hasBounds = true;
                continue;
            }

            left = Math.Min(left, bounds.Left);
            top = Math.Min(top, bounds.Top);
            right = Math.Max(right, bounds.Right);
            bottom = Math.Max(bottom, bounds.Bottom);
        }

        return hasBounds ? PdfBounds.FromEdges(left, top, right, bottom) : new PdfBounds(0, 0, 1, 1);
    }

    private static PdfBounds ExpandBounds(PdfBounds bounds, double padding) => PdfBounds.FromEdges(
        bounds.Left - padding,
        bounds.Top - padding,
        bounds.Right + padding,
        bounds.Bottom + padding);

    private static void DrawShape(XGraphics gfx, ShapeElement shape, double scale, double offsetX, double offsetY)
    {
        var x = TransformX(shape.X, scale, offsetX);
        var y = TransformY(shape.Y, scale, offsetY);
        var width = Math.Max(1, shape.Width * scale);
        var height = Math.Max(1, shape.Height * scale);
        var strokeWidth = Math.Max(0.5, shape.StrokeWidth * scale);
        var fillBrush = new XSolidBrush(ParseColor(shape.FillColor));
        var strokePen = CreatePen(shape.StrokeColor, strokeWidth, shape.BorderLineStyle.ToString());

        switch (shape.ShapeType)
        {
            case ShapeType.Rectangle:
                gfx.DrawRectangle(strokePen, fillBrush, x, y, width, height);
                break;
            case ShapeType.Ellipse:
                gfx.DrawEllipse(strokePen, fillBrush, x, y, width, height);
                break;
            case ShapeType.Triangle:
            {
                var points = new[]
                {
                    new XPoint(x + width / 2, y),
                    new XPoint(x, y + height),
                    new XPoint(x + width, y + height),
                };
                gfx.DrawPolygon(strokePen, fillBrush, points, XFillMode.Winding);
                break;
            }
            case ShapeType.Rhombus:
            {
                var points = new[]
                {
                    new XPoint(x + width / 2, y),
                    new XPoint(x + width, y + height / 2),
                    new XPoint(x + width / 2, y + height),
                    new XPoint(x, y + height / 2),
                };
                gfx.DrawPolygon(strokePen, fillBrush, points, XFillMode.Winding);
                break;
            }
        }

        if (!string.IsNullOrWhiteSpace(shape.Label))
        {
            var fontStyle = GetFontStyle(shape.IsBold, shape.IsItalic);
            var font = new XFont(ResolveFontFamily(shape.FontFamily), Math.Max(8, (shape.LabelFontSize ?? 12) * scale), fontStyle);
            var labelBrush = new XSolidBrush(ParseColor(shape.LabelColor ?? "#000000"));
            gfx.DrawString(
                shape.Label,
                font,
                labelBrush,
                new XRect(x, y, width, height),
                XStringFormats.Center);
        }
    }

    private static void DrawText(XGraphics gfx, TextElement text, double scale, double offsetX, double offsetY)
    {
        var fontStyle = GetFontStyle(text.IsBold, text.IsItalic);
        var font = new XFont(ResolveFontFamily(text.FontFamily), Math.Max(8, text.FontSize * scale), fontStyle);
        var brush = new XSolidBrush(ParseColor(text.Color));
        gfx.DrawString(
            text.Text,
            font,
            brush,
            new XRect(
                TransformX(text.X, scale, offsetX),
                TransformY(text.Y, scale, offsetY),
                Math.Max(text.Width, 100) * scale,
                Math.Max(text.Height, 30) * scale),
            XStringFormats.TopLeft);
    }

    private static void DrawStickyNote(XGraphics gfx, StickyNoteElement sticky, double scale, double offsetX, double offsetY)
    {
        var x = TransformX(sticky.X, scale, offsetX);
        var y = TransformY(sticky.Y, scale, offsetY);
        var width = Math.Max(1, sticky.Width * scale);
        var height = Math.Max(1, sticky.Height * scale);
        var foldSize = Math.Max(8, Math.Min(24, Math.Min(width, height) * 0.22));
        var padding = StickyPadding * scale;

        var stickyBorderPen = new XPen(ParseColor(StickyBorderColor), Math.Max(0.75, scale));
        var stickyFillBrush = new XSolidBrush(ParseColor(sticky.FillColor));
        gfx.DrawRectangle(
            stickyBorderPen,
            stickyFillBrush,
            x,
            y,
            width,
            height);

        var foldBrush = new XSolidBrush(ParseColor(StickyFoldColor));
        gfx.DrawPolygon(
            stickyBorderPen,
            foldBrush,
            [
                new XPoint(x + width - foldSize, y),
                new XPoint(x + width, y),
                new XPoint(x + width, y + foldSize),
            ],
            XFillMode.Winding);

        var fontStyle = GetFontStyle(sticky.IsBold, sticky.IsItalic);
        var font = new XFont(ResolveFontFamily(sticky.FontFamily), Math.Max(8, sticky.FontSize * scale), fontStyle);
        var brush = new XSolidBrush(ParseColor(sticky.Color));
        gfx.DrawString(
            sticky.Text,
            font,
            brush,
            new XRect(
                x + padding,
                y + padding,
                Math.Max(1, width - padding * 2),
            Math.Max(1, height - padding * 2)),
            XStringFormats.TopLeft);
    }

    private static void DrawFrame(XGraphics gfx, FrameElement frame, double scale, double offsetX, double offsetY)
    {
        var x = TransformX(frame.X, scale, offsetX);
        var y = TransformY(frame.Y, scale, offsetY);
        var width = Math.Max(1, frame.Width * scale);
        var height = Math.Max(1, frame.Height * scale);
        var strokeWidth = Math.Max(0.75, frame.StrokeWidth * scale);
        var titleBarHeight = GetFrameTitleBarHeight(height);
        var strokeColor = ParseColor(frame.StrokeColor);

        var framePen = new XPen(strokeColor, strokeWidth);
        var frameFillBrush = new XSolidBrush(ParseColor(frame.FillColor));
        gfx.DrawRectangle(
            framePen,
            frameFillBrush,
            x,
            y,
            width,
            height);

        if (height > titleBarHeight)
        {
            var separatorPen = new XPen(strokeColor, Math.Max(0.5, strokeWidth * 0.75));
            gfx.DrawLine(
                separatorPen,
                x,
                y + titleBarHeight,
                x + width,
                y + titleBarHeight);
        }

        if (string.IsNullOrWhiteSpace(frame.Label))
        {
            return;
        }

        var fontStyle = GetFontStyle(frame.IsBold, frame.IsItalic);
        var fontSize = frame.LabelFontSize is double explicitSize
            ? Math.Max(8, explicitSize * scale)
            : Math.Min(22, Math.Max(10, titleBarHeight * 0.5));
        var font = new XFont(ResolveFontFamily(frame.FontFamily), fontSize, fontStyle);
        var brush = new XSolidBrush(ParseColor(frame.LabelColor ?? "#0F172A"));
        gfx.DrawString(
            frame.Label,
            font,
            brush,
            new XRect(
                x + FrameTitlePadding * scale,
                y + Math.Max(4, (titleBarHeight - fontSize) / 2),
                Math.Max(1, width - FrameTitlePadding * scale * 2),
                Math.Max(1, titleBarHeight)),
            XStringFormats.TopLeft);
    }

    private static void DrawIconPlaceholder(XGraphics gfx, IconElement icon, double scale, double offsetX, double offsetY)
    {
        var x = TransformX(icon.X, scale, offsetX);
        var y = TransformY(icon.Y, scale, offsetY);
        var width = Math.Max(1, icon.Width * scale);
        var height = Math.Max(1, icon.Height * scale);
        var pen = CreatePen(icon.Color, Math.Max(1, scale), null);
        gfx.DrawRectangle(pen, x, y, width, height);
    }

    private static void DrawArrow(XGraphics gfx, ArrowElement arrow, IReadOnlyList<BoardElement> elements, double scale, double offsetX, double offsetY)
    {
        var path = ComputeArrowPolyline(arrow, elements);
        if (path.Count < 2)
        {
            return;
        }

        var sourceElement = arrow.SourceElementId is Guid sourceId
            ? elements.FirstOrDefault(element => element.Id == sourceId)
            : null;
        var targetElement = arrow.TargetElementId is Guid targetId
            ? elements.FirstOrDefault(element => element.Id == targetId)
            : null;
        var linePoints = TrimArrowLinePoints(path, arrow, sourceElement is not null, targetElement is not null);

        var pen = CreatePen(arrow.StrokeColor, Math.Max(0.5, arrow.StrokeWidth * scale), arrow.LineStyle.ToString());
        var transformedLinePoints = linePoints
            .Select(point => new XPoint(TransformX(point.X, scale, offsetX), TransformY(point.Y, scale, offsetY)))
            .ToArray();

        if (transformedLinePoints.Length >= 2)
        {
            gfx.DrawLines(pen, transformedLinePoints);
        }

        DrawArrowHead(gfx, arrow, arrow.SourceHeadStyle, path[0], path[1], scale, offsetX, offsetY);
        DrawArrowHead(gfx, arrow, arrow.TargetHeadStyle, path[^1], path[^2], scale, offsetX, offsetY);
    }

    private static void DrawArrowHead(XGraphics gfx, ArrowElement arrow, ArrowHeadStyle style, PdfPoint tip, PdfPoint from, double scale, double offsetX, double offsetY)
    {
        if (style == ArrowHeadStyle.None)
        {
            return;
        }

        var strokeColor = ParseColor(arrow.StrokeColor);
        var strokeWidth = Math.Max(0.5, arrow.StrokeWidth * scale);
        var size = GetArrowHeadSize(arrow) * scale;

        switch (style)
        {
            case ArrowHeadStyle.FilledTriangle:
            case ArrowHeadStyle.OpenTriangle:
            {
                var points = GetArrowHeadPoints(tip, from, size)
                    .Select(point => new XPoint(TransformX(point.X, scale, offsetX), TransformY(point.Y, scale, offsetY)))
                    .ToArray();
                var pen = new XPen(strokeColor, strokeWidth)
                {
                    LineCap = XLineCap.Round,
                    LineJoin = XLineJoin.Round,
                };
                if (style == ArrowHeadStyle.FilledTriangle)
                {
                    var headBrush = new XSolidBrush(strokeColor);
                    gfx.DrawPolygon(pen, headBrush, points, XFillMode.Winding);
                }
                else
                {
                    gfx.DrawPolygon(pen, XBrushes.Transparent, points, XFillMode.Winding);
                }

                break;
            }
            case ArrowHeadStyle.FilledCircle:
            case ArrowHeadStyle.OpenCircle:
            {
                var radius = size / 2;
                var center = MovePointToward(tip, from, GetArrowHeadCircleRadius(arrow));
                var cx = TransformX(center.X, scale, offsetX) - radius;
                var cy = TransformY(center.Y, scale, offsetY) - radius;
                var circlePen = new XPen(strokeColor, strokeWidth);
                if (style == ArrowHeadStyle.FilledCircle)
                {
                    var circleBrush = new XSolidBrush(strokeColor);
                    gfx.DrawEllipse(circlePen, circleBrush, cx, cy, radius * 2, radius * 2);
                }
                else
                {
                    gfx.DrawEllipse(circlePen, XBrushes.Transparent, cx, cy, radius * 2, radius * 2);
                }

                break;
            }
        }
    }

    private static PdfBounds GetArrowBounds(ArrowElement arrow, IReadOnlyList<BoardElement> elements)
    {
        var path = ComputeArrowPolyline(arrow, elements);
        if (path.Count == 0)
        {
            return new PdfBounds(0, 0, 1, 1);
        }

        var sourceElement = arrow.SourceElementId is Guid sourceId
            ? elements.FirstOrDefault(element => element.Id == sourceId)
            : null;
        var targetElement = arrow.TargetElementId is Guid targetId
            ? elements.FirstOrDefault(element => element.Id == targetId)
            : null;
        var linePoints = TrimArrowLinePoints(path, arrow, sourceElement is not null, targetElement is not null);

        var left = linePoints.Min(point => point.X);
        var top = linePoints.Min(point => point.Y);
        var right = linePoints.Max(point => point.X);
        var bottom = linePoints.Max(point => point.Y);

        ExpandForHead(arrow.SourceHeadStyle, path[0], arrow, ref left, ref top, ref right, ref bottom);
        ExpandForHead(arrow.TargetHeadStyle, path[^1], arrow, ref left, ref top, ref right, ref bottom);
        var padding = Math.Max(arrow.StrokeWidth, 2);
        return PdfBounds.FromEdges(left - padding, top - padding, right + padding, bottom + padding);
    }

    private static void ExpandForHead(ArrowHeadStyle style, PdfPoint tip, ArrowElement arrow, ref double left, ref double top, ref double right, ref double bottom)
    {
        var expansion = style switch
        {
            ArrowHeadStyle.FilledTriangle or ArrowHeadStyle.OpenTriangle => GetArrowHeadSize(arrow),
            ArrowHeadStyle.FilledCircle or ArrowHeadStyle.OpenCircle => GetArrowHeadCircleRadius(arrow) * 2,
            _ => 0,
        };

        left = Math.Min(left, tip.X - expansion);
        top = Math.Min(top, tip.Y - expansion);
        right = Math.Max(right, tip.X + expansion);
        bottom = Math.Max(bottom, tip.Y + expansion);
    }

    private static List<PdfPoint> ComputeArrowPolyline(ArrowElement arrow, IReadOnlyList<BoardElement> elements)
    {
        var sourceElement = arrow.SourceElementId is Guid sourceId
            ? elements.FirstOrDefault(element => element.Id == sourceId)
            : null;
        var targetElement = arrow.TargetElementId is Guid targetId
            ? elements.FirstOrDefault(element => element.Id == targetId)
            : null;

        var start = sourceElement is not null
            ? GetDockPosition(sourceElement, arrow.SourceDock)
            : new PdfPoint(arrow.SourceX ?? 0, arrow.SourceY ?? 0);
        var end = targetElement is not null
            ? GetDockPosition(targetElement, arrow.TargetDock)
            : new PdfPoint(arrow.TargetX ?? 0, arrow.TargetY ?? 0);

        if (arrow.RouteStyle == ArrowRouteStyle.Straight)
        {
            return [start, end];
        }

        if (arrow.RouteStyle == ArrowRouteStyle.Arc)
        {
            return ComputeArcRoute(start, end, arrow.ArcMidX, arrow.ArcMidY);
        }

        var obstacles = elements
            .Where(element => element is not ArrowElement)
            .Select(element => new PdfBounds(element.X, element.Y, element.Width, element.Height))
            .ToList();

        return ComputeOrthogonalRoute(start, end, arrow.SourceDock, arrow.TargetDock, arrow.OrthogonalMiddleCoordinate, obstacles);
    }

    private static List<PdfPoint> ComputeArcRoute(PdfPoint start, PdfPoint end, double? arcMidX, double? arcMidY)
    {
        var midpoint = ResolveArcMidpoint(start, end, arcMidX, arcMidY);
        var controlPoint = ComputeQuadraticControlPointThroughMidpoint(start, end, midpoint);
        return SampleQuadraticBezier(start, controlPoint, end, ArcSegmentCount);
    }

    private static List<PdfPoint> ComputeOrthogonalRoute(PdfPoint start, PdfPoint end, DockPoint sourceDock, DockPoint targetDock, double? orthogonalMiddleCoordinate, IReadOnlyList<PdfBounds> obstacles)
    {
        var startStub = OffsetPoint(start, sourceDock, OrthogonalDockStubLength);
        var endStub = OffsetPoint(end, targetDock, OrthogonalDockStubLength);

        var obstaclePath = FindOrthogonalPathAvoidingObstacles(start, startStub, sourceDock, end, endStub, targetDock, obstacles);
        if (obstaclePath is not null)
        {
            return obstaclePath;
        }

        var isHorizontalSource = sourceDock is DockPoint.Left or DockPoint.Right;
        var isHorizontalTarget = targetDock is DockPoint.Left or DockPoint.Right;
        var points = new List<PdfPoint> { start, startStub };

        if (isHorizontalSource && isHorizontalTarget)
        {
            var midX = orthogonalMiddleCoordinate ?? (startStub.X + endStub.X) / 2;
            points.Add(new PdfPoint(midX, startStub.Y));
            points.Add(new PdfPoint(midX, endStub.Y));
        }
        else if (!isHorizontalSource && !isHorizontalTarget)
        {
            var midY = orthogonalMiddleCoordinate ?? (startStub.Y + endStub.Y) / 2;
            points.Add(new PdfPoint(startStub.X, midY));
            points.Add(new PdfPoint(endStub.X, midY));
        }
        else if (isHorizontalSource)
        {
            points.Add(new PdfPoint(endStub.X, startStub.Y));
        }
        else
        {
            points.Add(new PdfPoint(startStub.X, endStub.Y));
        }

        points.Add(endStub);
        points.Add(end);
        return SimplifyPoints(points);
    }

    private static PdfPoint ResolveArcMidpoint(PdfPoint start, PdfPoint end, double? arcMidX, double? arcMidY)
    {
        if (arcMidX.HasValue && arcMidY.HasValue)
        {
            return new PdfPoint(arcMidX.Value, arcMidY.Value);
        }

        return GetDefaultArcMidpoint(start, end);
    }

    private static PdfPoint GetDefaultArcMidpoint(PdfPoint start, PdfPoint end)
    {
        var midX = (start.X + end.X) / 2;
        var midY = (start.Y + end.Y) / 2;
        var dx = end.X - start.X;
        var dy = end.Y - start.Y;
        var length = Math.Sqrt(dx * dx + dy * dy);

        if (length < 0.001)
        {
            return new PdfPoint(midX, midY);
        }

        var offset = Math.Max(ArcMinMidpointOffset, Math.Min(length * 0.35, ArcMaxMidpointOffset));
        return new PdfPoint(
            midX + (-dy / length) * offset,
            midY + (dx / length) * offset);
    }

    private static PdfPoint ComputeQuadraticControlPointThroughMidpoint(PdfPoint start, PdfPoint end, PdfPoint midpoint) =>
        new(
            2 * midpoint.X - (start.X + end.X) / 2,
            2 * midpoint.Y - (start.Y + end.Y) / 2);

    private static List<PdfPoint> SampleQuadraticBezier(PdfPoint start, PdfPoint controlPoint, PdfPoint end, int segmentCount)
    {
        var count = Math.Max(2, segmentCount);
        var points = new List<PdfPoint>(count + 1);

        for (var index = 0; index <= count; index++)
        {
            var t = (double)index / count;
            var oneMinusT = 1 - t;
            points.Add(new PdfPoint(
                oneMinusT * oneMinusT * start.X + 2 * oneMinusT * t * controlPoint.X + t * t * end.X,
                oneMinusT * oneMinusT * start.Y + 2 * oneMinusT * t * controlPoint.Y + t * t * end.Y));
        }

        return SimplifyPoints(points);
    }

    private static List<PdfPoint>? FindOrthogonalPathAvoidingObstacles(
        PdfPoint start,
        PdfPoint startStub,
        DockPoint sourceDock,
        PdfPoint end,
        PdfPoint endStub,
        DockPoint targetDock,
        IReadOnlyList<PdfBounds> obstacles)
    {
        if (obstacles.Count == 0)
        {
            return null;
        }

        var rects = obstacles.Select(obstacle => new ExpandedRect(
            obstacle.Left - OrthogonalDockStubLength,
            obstacle.Top - OrthogonalDockStubLength,
            obstacle.Right + OrthogonalDockStubLength,
            obstacle.Bottom + OrthogonalDockStubLength)).ToList();

        var xSet = new HashSet<double> { startStub.X, endStub.X };
        var ySet = new HashSet<double> { startStub.Y, endStub.Y };

        var globalLeft = startStub.X;
        var globalTop = startStub.Y;
        var globalRight = startStub.X;
        var globalBottom = startStub.Y;

        foreach (var rect in rects)
        {
            xSet.Add(rect.Left);
            xSet.Add(rect.Right);
            ySet.Add(rect.Top);
            ySet.Add(rect.Bottom);
            globalLeft = Math.Min(globalLeft, rect.Left);
            globalTop = Math.Min(globalTop, rect.Top);
            globalRight = Math.Max(globalRight, rect.Right);
            globalBottom = Math.Max(globalBottom, rect.Bottom);
        }

        globalLeft = Math.Min(globalLeft, Math.Min(startStub.X, endStub.X)) - OrthogonalDockStubLength;
        globalTop = Math.Min(globalTop, Math.Min(startStub.Y, endStub.Y)) - OrthogonalDockStubLength;
        globalRight = Math.Max(globalRight, Math.Max(startStub.X, endStub.X)) + OrthogonalDockStubLength;
        globalBottom = Math.Max(globalBottom, Math.Max(startStub.Y, endStub.Y)) + OrthogonalDockStubLength;
        xSet.Add(globalLeft);
        xSet.Add(globalRight);
        ySet.Add(globalTop);
        ySet.Add(globalBottom);

        var xs = xSet.OrderBy(value => value).ToList();
        var ys = ySet.OrderBy(value => value).ToList();
        var nx = xs.Count;
        var ny = ys.Count;

        var startXi = xs.IndexOf(startStub.X);
        var startYi = ys.IndexOf(startStub.Y);
        var endXi = xs.IndexOf(endStub.X);
        var endYi = ys.IndexOf(endStub.Y);
        if (startXi < 0 || startYi < 0 || endXi < 0 || endYi < 0)
        {
            return null;
        }

        var sourceHorizontal = sourceDock is DockPoint.Left or DockPoint.Right;
        var targetHorizontal = targetDock is DockPoint.Left or DockPoint.Right;
        var startDir = sourceHorizontal ? 0 : 1;
        var endDir = targetHorizontal ? 0 : 1;
        var endKey = ((endXi * ny) + endYi) * 2 + endDir;
        var stateCount = nx * ny * 2;
        var gScore = Enumerable.Repeat(double.PositiveInfinity, stateCount).ToArray();
        var cameFrom = Enumerable.Repeat(-1, stateCount).ToArray();
        var bendCount = new int[stateCount];
        var queue = new List<QueueEntry>();

        var startKey = ((startXi * ny) + startYi) * 2 + startDir;
        gScore[startKey] = 0;
        queue.Add(new QueueEntry(startKey, Heuristic(startXi, startYi)));

        List<PdfPoint>? bestPath = null;
        var bestCost = double.PositiveInfinity;
        var deadline = DateTime.UtcNow.AddMilliseconds(OrthogonalSolverTimeBudgetMs);

        while (queue.Count > 0)
        {
            queue.Sort((left, right) => left.Priority.CompareTo(right.Priority));
            var next = queue[0];
            queue.RemoveAt(0);

            if (DateTime.UtcNow > deadline)
            {
                break;
            }

            var key = next.Key;
            var g = gScore[key];
            if (g >= bestCost)
            {
                continue;
            }

            var dir = key & 1;
            var position = key >> 1;
            var yi = position % ny;
            var xi = position / ny;
            var bends = bendCount[key];

            if (key == endKey)
            {
                bestCost = g;
                bestPath = ReconstructOrthogonalPath(cameFrom, key, xs, ys, ny, start, end);
                continue;
            }

            if (dir == 0)
            {
                for (var nextXi = xi - 1; nextXi >= 0; nextXi--)
                {
                    if (IsHorizontalSegmentBlocked(ys[yi], xs[nextXi], xs[nextXi + 1], rects))
                    {
                        break;
                    }

                    TryAdd(((nextXi * ny) + yi) * 2, g + (xs[xi] - xs[nextXi]), key, bends);
                }

                for (var nextXi = xi + 1; nextXi < nx; nextXi++)
                {
                    if (IsHorizontalSegmentBlocked(ys[yi], xs[nextXi - 1], xs[nextXi], rects))
                    {
                        break;
                    }

                    TryAdd(((nextXi * ny) + yi) * 2, g + (xs[nextXi] - xs[xi]), key, bends);
                }
            }
            else
            {
                for (var nextYi = yi - 1; nextYi >= 0; nextYi--)
                {
                    if (IsVerticalSegmentBlocked(xs[xi], ys[nextYi], ys[nextYi + 1], rects))
                    {
                        break;
                    }

                    TryAdd(((xi * ny) + nextYi) * 2 + 1, g + (ys[yi] - ys[nextYi]), key, bends);
                }

                for (var nextYi = yi + 1; nextYi < ny; nextYi++)
                {
                    if (IsVerticalSegmentBlocked(xs[xi], ys[nextYi - 1], ys[nextYi], rects))
                    {
                        break;
                    }

                    TryAdd(((xi * ny) + nextYi) * 2 + 1, g + (ys[nextYi] - ys[yi]), key, bends);
                }
            }

            if (bends < OrthogonalMaxBends)
            {
                var newDir = 1 - dir;
                var turnKey = ((xi * ny) + yi) * 2 + newDir;
                var nextCost = g + OrthogonalBendPenalty;
                if (nextCost < gScore[turnKey] && nextCost < bestCost)
                {
                    gScore[turnKey] = nextCost;
                    cameFrom[turnKey] = key;
                    bendCount[turnKey] = bends + 1;
                    queue.Add(new QueueEntry(turnKey, nextCost + Heuristic(xi, yi)));
                }
            }
        }

        return bestPath;

        void TryAdd(int nextKey, double nextCost, int fromKey, int bends)
        {
            if (nextCost < gScore[nextKey] && nextCost < bestCost)
            {
                gScore[nextKey] = nextCost;
                cameFrom[nextKey] = fromKey;
                bendCount[nextKey] = bends;
                var position = nextKey >> 1;
                var nextYi = position % ny;
                var nextXi = position / ny;
                queue.Add(new QueueEntry(nextKey, nextCost + Heuristic(nextXi, nextYi)));
            }
        }

        double Heuristic(int xi, int yi) => Math.Abs(xs[xi] - xs[endXi]) + Math.Abs(ys[yi] - ys[endYi]);
    }

    private static bool IsHorizontalSegmentBlocked(double y, double x1, double x2, IReadOnlyList<ExpandedRect> rects)
    {
        var minX = Math.Min(x1, x2);
        var maxX = Math.Max(x1, x2);
        return rects.Any(rect => y > rect.Top && y < rect.Bottom && maxX > rect.Left && minX < rect.Right);
    }

    private static bool IsVerticalSegmentBlocked(double x, double y1, double y2, IReadOnlyList<ExpandedRect> rects)
    {
        var minY = Math.Min(y1, y2);
        var maxY = Math.Max(y1, y2);
        return rects.Any(rect => x > rect.Left && x < rect.Right && maxY > rect.Top && minY < rect.Bottom);
    }

    private static List<PdfPoint> ReconstructOrthogonalPath(int[] cameFrom, int endKey, IReadOnlyList<double> xs, IReadOnlyList<double> ys, int ny, PdfPoint start, PdfPoint end)
    {
        var keys = new List<int>();
        var current = endKey;
        while (current >= 0)
        {
            keys.Add(current);
            current = cameFrom[current];
        }

        keys.Reverse();
        var path = new List<PdfPoint> { start };
        PdfPoint? lastPoint = null;
        foreach (var key in keys)
        {
            var position = key >> 1;
            var yi = position % ny;
            var xi = position / ny;
            var point = new PdfPoint(xs[xi], ys[yi]);
            if (lastPoint is null || Math.Abs(lastPoint.Value.X - point.X) > 0.1 || Math.Abs(lastPoint.Value.Y - point.Y) > 0.1)
            {
                path.Add(point);
                lastPoint = point;
            }
        }

        path.Add(end);
        return SimplifyPoints(path);
    }

    private static List<PdfPoint> TrimArrowLinePoints(IReadOnlyList<PdfPoint> points, ArrowElement arrow, bool hasSourceDock, bool hasTargetDock)
    {
        if (points.Count < 2)
        {
            return points.ToList();
        }

        var trimmed = points.ToArray();
        var sourceTrim = GetArrowEndpointTrimDistance(arrow.SourceHeadStyle, arrow.StrokeWidth, hasSourceDock);
        var targetTrim = GetArrowEndpointTrimDistance(arrow.TargetHeadStyle, arrow.StrokeWidth, hasTargetDock);

        if (sourceTrim > 0)
        {
            trimmed[0] = MovePointToward(trimmed[0], trimmed[1], sourceTrim);
        }

        if (targetTrim > 0)
        {
            trimmed[^1] = MovePointToward(trimmed[^1], trimmed[^2], targetTrim);
        }

        return trimmed.ToList();
    }

    private static double GetArrowEndpointTrimDistance(ArrowHeadStyle style, double strokeWidth, bool isDocked)
    {
        var dockTrim = isDocked ? Math.Max(0.75, strokeWidth / 2) : 0;
        var headTrim = style switch
        {
            ArrowHeadStyle.FilledTriangle or ArrowHeadStyle.OpenTriangle => GetArrowHeadBaseDistance(strokeWidth),
            ArrowHeadStyle.FilledCircle or ArrowHeadStyle.OpenCircle => GetArrowHeadCircleRadius(strokeWidth) * 2,
            _ => 0,
        };

        return Math.Max(dockTrim, headTrim);
    }

    private static double GetArrowHeadSize(ArrowElement arrow) => Math.Max(10, (arrow.StrokeWidth <= 0 ? 2 : arrow.StrokeWidth) * 4);

    private static double GetArrowHeadBaseDistance(double strokeWidth)
    {
        var size = Math.Max(10, (strokeWidth <= 0 ? 2 : strokeWidth) * 4);
        return size * Math.Cos(Math.PI / 6);
    }

    private static double GetArrowHeadCircleRadius(ArrowElement arrow) => GetArrowHeadSize(arrow) / 2;

    private static double GetArrowHeadCircleRadius(double strokeWidth) => Math.Max(10, (strokeWidth <= 0 ? 2 : strokeWidth) * 4) / 2;

    private static double GetFrameTitleBarHeight(double scaledHeight)
    {
        var preferred = Math.Max(24, scaledHeight * 0.2);
        var available = Math.Max(scaledHeight - 16, 14);
        return Math.Min(40, Math.Min(preferred, available));
    }

    private static PdfPoint[] GetArrowHeadPoints(PdfPoint tip, PdfPoint from, double size)
    {
        var angle = Math.Atan2(tip.Y - from.Y, tip.X - from.X);
        const double spread = Math.PI / 6;
        return
        [
            tip,
            new PdfPoint(tip.X - size * Math.Cos(angle - spread), tip.Y - size * Math.Sin(angle - spread)),
            new PdfPoint(tip.X - size * Math.Cos(angle + spread), tip.Y - size * Math.Sin(angle + spread)),
        ];
    }

    private static PdfPoint GetDockPosition(BoardElement element, DockPoint dock) => dock switch
    {
        DockPoint.Top => new PdfPoint(element.X + element.Width / 2, element.Y),
        DockPoint.Bottom => new PdfPoint(element.X + element.Width / 2, element.Y + element.Height),
        DockPoint.Left => new PdfPoint(element.X, element.Y + element.Height / 2),
        DockPoint.Right => new PdfPoint(element.X + element.Width, element.Y + element.Height / 2),
        DockPoint.Center => new PdfPoint(element.X + element.Width / 2, element.Y + element.Height / 2),
        _ => new PdfPoint(element.X + element.Width / 2, element.Y + element.Height / 2),
    };

    private static PdfPoint OffsetPoint(PdfPoint point, DockPoint dock, double distance) => dock switch
    {
        DockPoint.Top => new PdfPoint(point.X, point.Y - distance),
        DockPoint.Right => new PdfPoint(point.X + distance, point.Y),
        DockPoint.Bottom => new PdfPoint(point.X, point.Y + distance),
        DockPoint.Left => new PdfPoint(point.X - distance, point.Y),
        _ => point,
    };

    private static List<PdfPoint> SimplifyPoints(IEnumerable<PdfPoint> points)
    {
        var simplified = new List<PdfPoint>();
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

                var keepsDirection = sameX
                    ? (b.Y - a.Y) * (c.Y - b.Y) >= 0
                    : (b.X - a.X) * (c.X - b.X) >= 0;
                if (!keepsDirection)
                {
                    break;
                }

                simplified.RemoveAt(simplified.Count - 2);
            }
        }

        return simplified;
    }

    private static PdfPoint MovePointToward(PdfPoint from, PdfPoint to, double distance)
    {
        var dx = to.X - from.X;
        var dy = to.Y - from.Y;
        var length = Math.Sqrt((dx * dx) + (dy * dy));
        if (length < 0.0001)
        {
            return from;
        }

        return new PdfPoint(from.X + (dx / length) * distance, from.Y + (dy / length) * distance);
    }

    private static XPen CreatePen(string color, double strokeWidth, string? lineStyle)
    {
        var pen = new XPen(ParseColor(color), strokeWidth)
        {
            LineCap = XLineCap.Round,
            LineJoin = XLineJoin.Round,
        };

        var dashPattern = GetDashPattern(lineStyle, strokeWidth);
        if (dashPattern is not null)
        {
            pen.DashStyle = XDashStyle.Custom;
            pen.DashPattern = dashPattern;
        }

        return pen;
    }

    private static double[]? GetDashPattern(string? lineStyle, double strokeWidth) => lineStyle switch
    {
        "Dashed" => [strokeWidth * 4, strokeWidth * 2],
        "Dotted" => [strokeWidth, strokeWidth * 2],
        "DashDot" => [strokeWidth * 4, strokeWidth * 2, strokeWidth, strokeWidth * 2],
        "LongDash" => [strokeWidth * 8, strokeWidth * 3],
        _ => null,
    };

    private static XColor ParseColor(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return XColor.FromArgb(255, 0, 0, 0);
        }

        var trimmed = value.Trim();
        if (trimmed.StartsWith('#'))
        {
            return ParseHexColor(trimmed);
        }

        if (trimmed.StartsWith("rgb", StringComparison.OrdinalIgnoreCase))
        {
            return ParseRgbColor(trimmed);
        }

        return XColor.FromArgb(255, 0, 0, 0);
    }

    private static XColor ParseHexColor(string value)
    {
        var hex = value[1..];
        if (hex.Length == 3)
        {
            hex = string.Concat(hex.Select(character => new string(character, 2)));
        }
        else if (hex.Length == 4)
        {
            hex = string.Concat(hex.Select(character => new string(character, 2)));
        }

        if (hex.Length == 6)
        {
            return XColor.FromArgb(255,
                int.Parse(hex[0..2], NumberStyles.HexNumber, CultureInfo.InvariantCulture),
                int.Parse(hex[2..4], NumberStyles.HexNumber, CultureInfo.InvariantCulture),
                int.Parse(hex[4..6], NumberStyles.HexNumber, CultureInfo.InvariantCulture));
        }

        if (hex.Length == 8)
        {
            return XColor.FromArgb(
                int.Parse(hex[6..8], NumberStyles.HexNumber, CultureInfo.InvariantCulture),
                int.Parse(hex[0..2], NumberStyles.HexNumber, CultureInfo.InvariantCulture),
                int.Parse(hex[2..4], NumberStyles.HexNumber, CultureInfo.InvariantCulture),
                int.Parse(hex[4..6], NumberStyles.HexNumber, CultureInfo.InvariantCulture));
        }

        return XColor.FromArgb(255, 0, 0, 0);
    }

    private static XColor ParseRgbColor(string value)
    {
        var openParen = value.IndexOf('(');
        var closeParen = value.IndexOf(')');
        if (openParen < 0 || closeParen <= openParen)
        {
            return XColor.FromArgb(255, 0, 0, 0);
        }

        var parts = value[(openParen + 1)..closeParen]
            .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 3)
        {
            return XColor.FromArgb(255, 0, 0, 0);
        }

        var red = ClampByte(ParseInt(parts[0]));
        var green = ClampByte(ParseInt(parts[1]));
        var blue = ClampByte(ParseInt(parts[2]));
        var alpha = parts.Length > 3 ? ClampAlpha(parts[3]) : 255;
        return XColor.FromArgb(alpha, red, green, blue);
    }

    private static int ParseInt(string value) => int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
        ? parsed
        : 0;

    private static int ClampByte(int value) => Math.Max(0, Math.Min(255, value));

    private static int ClampAlpha(string value)
    {
        if (!double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var alpha))
        {
            return 255;
        }

        if (alpha <= 1)
        {
            return ClampByte((int)Math.Round(alpha * 255));
        }

        return ClampByte((int)Math.Round(alpha));
    }

    private static XFontStyleEx GetFontStyle(bool isBold, bool isItalic)
    {
        var style = XFontStyleEx.Regular;
        if (isBold)
        {
            style |= XFontStyleEx.Bold;
        }
        if (isItalic)
        {
            style |= XFontStyleEx.Italic;
        }

        return style;
    }

    private static string ResolveFontFamily(string? fontFamily)
    {
        if (string.IsNullOrWhiteSpace(fontFamily))
        {
            return "Arial";
        }

        return fontFamily.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "Arial";
    }

    private static double TransformX(double x, double scale, double offsetX) => offsetX + x * scale;
    private static double TransformY(double y, double scale, double offsetY) => offsetY + y * scale;

    private readonly record struct QueueEntry(int Key, double Priority);
    private readonly record struct PdfPoint(double X, double Y);
    private readonly record struct PdfBounds(double Left, double Top, double Width, double Height)
    {
        public double Right => Left + Width;
        public double Bottom => Top + Height;

        public static PdfBounds FromEdges(double left, double top, double right, double bottom) =>
            new(left, top, Math.Max(1, right - left), Math.Max(1, bottom - top));
    }

    private readonly record struct ExpandedRect(double Left, double Top, double Right, double Bottom);

    /// <summary>
    /// Font resolver for non-Windows (Linux/macOS) environments such as Azure App Service on Linux.
    /// Maps common Windows font family names to TTF files found in standard system font directories,
    /// falling back to any available TTF when an exact match is not found.
    /// </summary>
    private sealed class LinuxFontResolver : IFontResolver
    {
        private static readonly string[] SearchDirectories =
        [
            "/usr/share/fonts",
            "/usr/local/share/fonts",
            $"{Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)}/.fonts",
        ];

        // Map common Windows font names to Linux equivalents (DejaVu and Liberation are pre-installed on most Debian/Ubuntu images)
        private static readonly Dictionary<string, string> FamilyAliases = new(StringComparer.OrdinalIgnoreCase)
        {
            ["Arial"] = "DejaVu Sans",
            ["Helvetica"] = "DejaVu Sans",
            ["sans-serif"] = "DejaVu Sans",
            ["Calibri"] = "DejaVu Sans",
            ["Verdana"] = "DejaVu Sans",
            ["Tahoma"] = "DejaVu Sans",
            ["Times New Roman"] = "DejaVu Serif",
            ["Georgia"] = "DejaVu Serif",
            ["serif"] = "DejaVu Serif",
            ["Courier New"] = "DejaVu Sans Mono",
            ["monospace"] = "DejaVu Sans Mono",
        };

        // File name patterns per family + style; ordered by preference
        private static readonly Dictionary<string, string[]> FamilyFilePatterns = new(StringComparer.OrdinalIgnoreCase)
        {
            ["DejaVu Sans"] = ["DejaVuSans-BoldOblique.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans-Oblique.ttf", "DejaVuSans.ttf"],
            ["DejaVu Serif"] = ["DejaVuSerif-BoldItalic.ttf", "DejaVuSerif-Bold.ttf", "DejaVuSerif-Italic.ttf", "DejaVuSerif.ttf"],
            ["DejaVu Sans Mono"] = ["DejaVuSansMono-BoldOblique.ttf", "DejaVuSansMono-Bold.ttf", "DejaVuSansMono-Oblique.ttf", "DejaVuSansMono.ttf"],
            ["Liberation Sans"] = ["LiberationSans-BoldItalic.ttf", "LiberationSans-Bold.ttf", "LiberationSans-Italic.ttf", "LiberationSans-Regular.ttf"],
            ["Liberation Serif"] = ["LiberationSerif-BoldItalic.ttf", "LiberationSerif-Bold.ttf", "LiberationSerif-Italic.ttf", "LiberationSerif-Regular.ttf"],
            ["Liberation Mono"] = ["LiberationMono-BoldItalic.ttf", "LiberationMono-Bold.ttf", "LiberationMono-Italic.ttf", "LiberationMono-Regular.ttf"],
        };

        private static readonly Lock CacheLock = new();
        private static readonly Dictionary<string, string?> FilePathCache = new(StringComparer.OrdinalIgnoreCase);
        private static string? _anyFontFallback;

        public FontResolverInfo? ResolveTypeface(string familyName, bool isBold, bool isItalic)
        {
            if (FamilyAliases.TryGetValue(familyName, out var mapped))
                familyName = mapped;

            var styleSuffix = (isBold, isItalic) switch
            {
                (true, true)   => "BoldItalic",
                (true, false)  => "Bold",
                (false, true)  => "Italic",
                _              => "Regular",
            };

            return new FontResolverInfo($"{familyName}|{styleSuffix}");
        }

        public byte[]? GetFont(string faceName)
        {
            var path = ResolvePath(faceName);
            return path is not null ? File.ReadAllBytes(path) : null;
        }

        private static string? ResolvePath(string faceName)
        {
            lock (CacheLock)
            {
                if (FilePathCache.TryGetValue(faceName, out var cached))
                    return cached;
            }

            var separatorIndex = faceName.IndexOf('|');
            var family = separatorIndex > 0 ? faceName[..separatorIndex] : faceName;
            var style  = separatorIndex > 0 ? faceName[(separatorIndex + 1)..] : "Regular";

            var allFiles = EnumerateAllTtfFiles();
            var path = FindBestMatch(family, style, allFiles) ?? GetAnyFontFallback(allFiles);

            lock (CacheLock)
            {
                FilePathCache[faceName] = path;
            }

            return path;
        }

        private static string? FindBestMatch(string family, string style, IReadOnlyList<string> allFiles)
        {
            if (!FamilyFilePatterns.TryGetValue(family, out var patterns))
            {
                // Build patterns from family + style on the fly
                patterns =
                [
                    $"{family.Replace(" ", "")}-{style}.ttf",
                    $"{family.Replace(" ", "")}.ttf",
                    $"{family}-{style}.ttf",
                    $"{family}.ttf",
                ];
            }
            else
            {
                // Pick the pattern matching the requested style
                var styleIndex = style switch
                {
                    "BoldItalic" => 0,
                    "Bold"       => 1,
                    "Italic"     => 2,
                    _            => 3,
                };
                // Fall back to lower-style variants if exact index isn't available
                patterns = patterns.Skip(styleIndex).Concat(patterns.Take(styleIndex)).ToArray();
            }

            foreach (var pattern in patterns)
            {
                var match = allFiles.FirstOrDefault(f =>
                    string.Equals(Path.GetFileName(f), pattern, StringComparison.OrdinalIgnoreCase));
                if (match is not null)
                    return match;
            }

            return null;
        }

        private static string? GetAnyFontFallback(IReadOnlyList<string> allFiles)
        {
            if (_anyFontFallback is not null)
                return _anyFontFallback;

            _anyFontFallback = allFiles.FirstOrDefault();
            return _anyFontFallback;
        }

        private static IReadOnlyList<string> EnumerateAllTtfFiles()
        {
            var files = new List<string>();
            foreach (var dir in SearchDirectories)
            {
                if (!Directory.Exists(dir))
                    continue;
                try
                {
                    files.AddRange(Directory.EnumerateFiles(dir, "*.ttf", SearchOption.AllDirectories));
                }
                catch (UnauthorizedAccessException) { }
                catch (IOException) { }
            }
            return files;
        }
    }
}
