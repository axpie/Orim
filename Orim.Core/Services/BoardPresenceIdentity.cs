namespace Orim.Core.Services;

public static class BoardPresenceIdentity
{
    private static readonly string[] CursorPalette =
    [
        "#ef4444",
        "#f97316",
        "#eab308",
        "#22c55e",
        "#14b8a6",
        "#06b6d4",
        "#3b82f6",
        "#6366f1",
        "#8b5cf6",
        "#ec4899"
    ];

    private static readonly string[] Adjectives =
    [
        "Leuchtender",
        "Wilder",
        "Kleiner",
        "Schneller",
        "Mutiger",
        "Schlauer",
        "Silberner",
        "Funkelnder",
        "Stiller",
        "Sonniger"
    ];

    private static readonly string[] Nouns =
    [
        "Falke",
        "Otter",
        "Komet",
        "Panda",
        "Drache",
        "Fuchs",
        "Tiger",
        "Wolf",
        "Phönix",
        "Kolibri"
    ];

    public static string ResolveColor(string seed)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(seed);

        var hash = StringComparer.Ordinal.GetHashCode(seed);
        var index = Math.Abs(hash % CursorPalette.Length);
        return CursorPalette[index];
    }

    public static string CreateFantasyName()
    {
        var adjective = Adjectives[Random.Shared.Next(Adjectives.Length)];
        var noun = Nouns[Random.Shared.Next(Nouns.Length)];
        var suffix = Random.Shared.Next(10, 100);
        return $"{adjective} {noun} {suffix}";
    }
}