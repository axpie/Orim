using System.Diagnostics;
using Orim.Core.Models;

namespace Orim.Web.Components;

public partial class WhiteboardCanvas
{
    private const double OrthogonalDockStubLength = 40;

    private static List<Point> BuildArrowPath(Point start, DockPoint sourceDock, Point end, DockPoint targetDock, ArrowRouteStyle routeStyle, IReadOnlyList<(double X, double Y, double Width, double Height)>? obstacles = null)
    {
        if (routeStyle == ArrowRouteStyle.Straight)
        {
            return new List<Point> { start, end };
        }

        var startStub = OffsetPoint(start, sourceDock, OrthogonalDockStubLength);
        var endStub = OffsetPoint(end, targetDock, OrthogonalDockStubLength);

        if (obstacles is { Count: > 0 })
        {
            var path = FindOrthogonalPathAvoidingObstacles(start, startStub, sourceDock, end, endStub, targetDock, obstacles);
            if (path is not null)
            {
                return path;
            }
        }

        var points = new List<Point> { start, startStub };
        var sourceHorizontal = sourceDock is DockPoint.Left or DockPoint.Right;
        var targetHorizontal = targetDock is DockPoint.Left or DockPoint.Right;

        if (sourceHorizontal && targetHorizontal)
        {
            var middleX = (startStub.X + endStub.X) / 2;
            points.Add(new Point(middleX, startStub.Y));
            points.Add(new Point(middleX, endStub.Y));
        }
        else if (!sourceHorizontal && !targetHorizontal)
        {
            var middleY = (startStub.Y + endStub.Y) / 2;
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

    private static List<Point>? FindOrthogonalPathAvoidingObstacles(
        Point start, Point startStub, DockPoint sourceDock,
        Point end, Point endStub, DockPoint targetDock,
        IReadOnlyList<(double X, double Y, double Width, double Height)> obstacles)
    {
        const double padding = OrthogonalDockStubLength;
        const double bendPenalty = 40;
        const int maxBends = 12;
        var deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency / 2;

        var rects = new (double Left, double Top, double Right, double Bottom)[obstacles.Count];
        for (var i = 0; i < obstacles.Count; i++)
        {
            var o = obstacles[i];
            rects[i] = (o.X - padding, o.Y - padding, o.X + o.Width + padding, o.Y + o.Height + padding);
        }

        var xSet = new SortedSet<double> { startStub.X, endStub.X };
        var ySet = new SortedSet<double> { startStub.Y, endStub.Y };

        double globalLeft = startStub.X, globalTop = startStub.Y, globalRight = startStub.X, globalBottom = startStub.Y;

        foreach (var r in rects)
        {
            xSet.Add(r.Left);
            xSet.Add(r.Right);
            ySet.Add(r.Top);
            ySet.Add(r.Bottom);
            if (r.Left < globalLeft) globalLeft = r.Left;
            if (r.Top < globalTop) globalTop = r.Top;
            if (r.Right > globalRight) globalRight = r.Right;
            if (r.Bottom > globalBottom) globalBottom = r.Bottom;
        }

        globalLeft = Math.Min(globalLeft, Math.Min(startStub.X, endStub.X)) - OrthogonalDockStubLength;
        globalTop = Math.Min(globalTop, Math.Min(startStub.Y, endStub.Y)) - OrthogonalDockStubLength;
        globalRight = Math.Max(globalRight, Math.Max(startStub.X, endStub.X)) + OrthogonalDockStubLength;
        globalBottom = Math.Max(globalBottom, Math.Max(startStub.Y, endStub.Y)) + OrthogonalDockStubLength;
        xSet.Add(globalLeft);
        xSet.Add(globalRight);
        ySet.Add(globalTop);
        ySet.Add(globalBottom);

        var xs = new List<double>(xSet);
        var ys = new List<double>(ySet);
        var nx = xs.Count;
        var ny = ys.Count;

        var startXi = xs.IndexOf(startStub.X);
        var startYi = ys.IndexOf(startStub.Y);
        var endXi = xs.IndexOf(endStub.X);
        var endYi = ys.IndexOf(endStub.Y);

        var sourceHorizontal = sourceDock is DockPoint.Left or DockPoint.Right;
        var targetHorizontal = targetDock is DockPoint.Left or DockPoint.Right;
        var startDir = sourceHorizontal ? 0 : 1;
        var endDir = targetHorizontal ? 0 : 1;
        var endKey = (endXi * ny + endYi) * 2 + endDir;

        var stateCount = nx * ny * 2;
        var gScore = new double[stateCount];
        Array.Fill(gScore, double.MaxValue);
        var cameFrom = new int[stateCount];
        Array.Fill(cameFrom, -1);
        var bendCount = new int[stateCount];

        var startKey = (startXi * ny + startYi) * 2 + startDir;
        gScore[startKey] = 0;
        bendCount[startKey] = 0;

        var openSet = new PriorityQueue<int, double>();
        openSet.Enqueue(startKey, Heuristic(startXi, startYi));

        List<Point>? bestPath = null;
        var bestCost = double.MaxValue;

        while (openSet.Count > 0)
        {
            if (Stopwatch.GetTimestamp() > deadline)
                break;

            var key = openSet.Dequeue();
            var g = gScore[key];

            if (g >= bestCost)
                continue;

            var dir = key & 1;
            var pos = key >> 1;
            var yi = pos % ny;
            var xi = pos / ny;
            var b = bendCount[key];

            if (key == endKey)
            {
                bestCost = g;
                bestPath = ReconstructOrthogonalPath(cameFrom, key, xs, ys, ny, start, end);
                continue;
            }

            if (dir == 0)
            {
                for (var nxi = xi - 1; nxi >= 0; nxi--)
                {
                    if (IsHSegmentBlocked(ys[yi], xs[nxi], xs[nxi + 1], rects)) break;
                    var dist = xs[xi] - xs[nxi];
                    TryAdd((nxi * ny + yi) * 2, g + dist, key, b);
                }

                for (var nxi = xi + 1; nxi < nx; nxi++)
                {
                    if (IsHSegmentBlocked(ys[yi], xs[nxi - 1], xs[nxi], rects)) break;
                    var dist = xs[nxi] - xs[xi];
                    TryAdd((nxi * ny + yi) * 2, g + dist, key, b);
                }
            }
            else
            {
                for (var nyi = yi - 1; nyi >= 0; nyi--)
                {
                    if (IsVSegmentBlocked(xs[xi], ys[nyi], ys[nyi + 1], rects)) break;
                    var dist = ys[yi] - ys[nyi];
                    TryAdd((xi * ny + nyi) * 2 + 1, g + dist, key, b);
                }

                for (var nyi = yi + 1; nyi < ny; nyi++)
                {
                    if (IsVSegmentBlocked(xs[xi], ys[nyi - 1], ys[nyi], rects)) break;
                    var dist = ys[nyi] - ys[yi];
                    TryAdd((xi * ny + nyi) * 2 + 1, g + dist, key, b);
                }
            }

            if (b < maxBends)
            {
                var newDir = 1 - dir;
                var nk = (xi * ny + yi) * 2 + newDir;
                var ng = g + bendPenalty;
                if (ng < gScore[nk] && ng < bestCost)
                {
                    gScore[nk] = ng;
                    cameFrom[nk] = key;
                    bendCount[nk] = b + 1;
                    openSet.Enqueue(nk, ng + Heuristic(xi, yi));
                }
            }
        }

        return bestPath;

        void TryAdd(int nk, double ng, int fromKey, int b)
        {
            if (ng < gScore[nk] && ng < bestCost)
            {
                gScore[nk] = ng;
                cameFrom[nk] = fromKey;
                bendCount[nk] = b;
                openSet.Enqueue(nk, ng + Heuristic((nk >> 1) / ny, (nk >> 1) % ny));
            }
        }

        double Heuristic(int xi, int yi)
        {
            return Math.Abs(xs[xi] - xs[endXi]) + Math.Abs(ys[yi] - ys[endYi]);
        }
    }

    private static bool IsHSegmentBlocked(double y, double x1, double x2, (double Left, double Top, double Right, double Bottom)[] rects)
    {
        var minX = Math.Min(x1, x2);
        var maxX = Math.Max(x1, x2);
        foreach (var r in rects)
        {
            if (y > r.Top && y < r.Bottom && maxX > r.Left && minX < r.Right)
                return true;
        }

        return false;
    }

    private static bool IsVSegmentBlocked(double x, double y1, double y2, (double Left, double Top, double Right, double Bottom)[] rects)
    {
        var minY = Math.Min(y1, y2);
        var maxY = Math.Max(y1, y2);
        foreach (var r in rects)
        {
            if (x > r.Left && x < r.Right && maxY > r.Top && minY < r.Bottom)
                return true;
        }

        return false;
    }

    private static List<Point> ReconstructOrthogonalPath(int[] cameFrom, int endKey, List<double> xs, List<double> ys, int ny, Point start, Point end)
    {
        var keys = new List<int>();
        var current = endKey;
        while (current >= 0)
        {
            keys.Add(current);
            current = cameFrom[current];
        }

        keys.Reverse();

        var path = new List<Point> { start };
        Point? last = null;
        foreach (var key in keys)
        {
            var pos = key >> 1;
            var yi = pos % ny;
            var xi = pos / ny;
            var point = new Point(xs[xi], ys[yi]);
            if (last is null || Math.Abs(last.Value.X - point.X) > 0.1 || Math.Abs(last.Value.Y - point.Y) > 0.1)
            {
                path.Add(point);
                last = point;
            }
        }

        path.Add(end);
        return SimplifyPoints(path);
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
}
