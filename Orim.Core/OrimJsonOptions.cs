using System.Text.Json;
using System.Text.Json.Serialization;

namespace Orim.Core;

public static class OrimJsonOptions
{
    public static readonly JsonSerializerOptions Default = Create();

    public static readonly JsonSerializerOptions Indented = Create(writeIndented: true);

    public static JsonSerializerOptions Create(bool writeIndented = false)
    {
        var options = new JsonSerializerOptions
        {
            WriteIndented = writeIndented,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        Configure(options);
        return options;
    }

    public static void Configure(JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);

        options.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;

        if (!options.Converters.OfType<BoardElementJsonConverter>().Any())
        {
            options.Converters.Add(new BoardElementJsonConverter());
        }

        if (!options.Converters.OfType<JsonStringEnumConverter>().Any())
        {
            options.Converters.Add(new JsonStringEnumConverter());
        }
    }
}
