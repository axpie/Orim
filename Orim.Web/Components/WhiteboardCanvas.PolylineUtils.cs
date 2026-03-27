using Orim.Core.Models;

namespace Orim.Web.Components;

public partial class WhiteboardCanvas
{
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
}
