using Orim.Core.Models;

namespace Orim.Web.Components;

public partial class WhiteboardCanvas
{
    internal static string GetTrianglePoints(double width, double height, double inset)
    {
        var topX = width / 2;
        var topY = inset;
        var leftX = inset;
        var leftY = Math.Max(height - inset, inset);
        var rightX = Math.Max(width - inset, inset);
        var rightY = Math.Max(height - inset, inset);
        return $"{CssNumber(topX)},{CssNumber(topY)} {CssNumber(leftX)},{CssNumber(leftY)} {CssNumber(rightX)},{CssNumber(rightY)}";
    }

    internal static string GetStrokeDashArray(BorderLineStyle borderLineStyle) => borderLineStyle switch
    {
        BorderLineStyle.Dashed => "10 6",
        BorderLineStyle.Dotted => "2 5",
        BorderLineStyle.DashDot => "10 4 2 4",
        BorderLineStyle.LongDash => "16 6",
        _ => string.Empty
    };

    internal static string GetStrokeDashArray(ArrowLineStyle lineStyle, double strokeWidth)
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

    internal static string FormatDashArray(params double[] segments) =>
        string.Join(" ", segments.Select(segment => CssNumber(Math.Max(segment, 1))));
}
