namespace Orim.Web.Components;

public partial class WhiteboardCanvas
{
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
}
