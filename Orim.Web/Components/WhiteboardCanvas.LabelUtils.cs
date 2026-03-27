using Orim.Core.Models;

namespace Orim.Web.Components;

public partial class WhiteboardCanvas
{
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
}
