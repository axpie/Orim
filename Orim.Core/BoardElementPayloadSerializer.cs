using System.Text.Json;
using Orim.Core.Models;

namespace Orim.Core;

public static class BoardElementPayloadSerializer
{
    public const string MissingTypeDiscriminatorMessage =
        "The JSON payload for polymorphic interface or abstract type 'Orim.Core.Models.BoardElement' must specify a type discriminator.";

    private static readonly HashSet<string> SupportedTypes =
    [
        "shape",
        "text",
        "richtext",
        "markdown",
        "sticky",
        "frame",
        "arrow",
        "icon",
        "file",
        "drawing"
    ];

    public static string? InferType(JsonElement payload)
    {
        if (payload.TryGetProperty("$type", out var typeProperty)
            && typeProperty.ValueKind == JsonValueKind.String)
        {
            var discriminator = typeProperty.GetString();
            if (!string.IsNullOrWhiteSpace(discriminator) && SupportedTypes.Contains(discriminator))
            {
                return discriminator;
            }
        }

        if (payload.TryGetProperty("shapeType", out _))
        {
            return "shape";
        }

        if (payload.TryGetProperty("html", out _))
        {
            return "richtext";
        }

        if (payload.TryGetProperty("markdown", out _))
        {
            return "markdown";
        }

        if (payload.TryGetProperty("text", out _))
        {
            return payload.TryGetProperty("fillColor", out _) ? "sticky" : "text";
        }

        if (payload.TryGetProperty("iconName", out _))
        {
            return "icon";
        }

        if (payload.TryGetProperty("points", out _))
        {
            return "drawing";
        }

        if (payload.TryGetProperty("contentType", out _) || payload.TryGetProperty("fileUrl", out _))
        {
            return "file";
        }

        if (payload.TryGetProperty("sourceElementId", out _)
            || payload.TryGetProperty("targetElementId", out _)
            || payload.TryGetProperty("routeStyle", out _)
            || payload.TryGetProperty("sourceX", out _)
            || payload.TryGetProperty("targetX", out _))
        {
            return "arrow";
        }

        if (payload.TryGetProperty("fillColor", out _) && payload.TryGetProperty("strokeColor", out _))
        {
            return "frame";
        }

        return null;
    }
}
