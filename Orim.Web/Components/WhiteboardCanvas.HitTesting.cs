using Orim.Core.Models;

namespace Orim.Web.Components;

public partial class WhiteboardCanvas
{
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
}
