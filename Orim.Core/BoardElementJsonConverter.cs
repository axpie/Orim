using System.Text.Json;
using System.Text.Json.Serialization;
using Orim.Core.Models;

namespace Orim.Core;

/// <summary>
/// Custom converter for <see cref="BoardElement"/> that handles polymorphic
/// serialization without relying on STJ's built-in [JsonPolymorphic] attributes.
/// Reads by inferring the concrete type from field presence (with optional explicit
/// <c>$type</c> discriminator), and writes by prepending <c>$type</c> to the object.
/// </summary>
public sealed class BoardElementJsonConverter : JsonConverter<BoardElement>
{
    /// <summary>
    /// Inner options used for concrete-type serialization/deserialization.
    /// Must NOT include this converter to avoid infinite recursion.
    /// </summary>
    private static readonly JsonSerializerOptions InnerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter() },
    };

    public override BoardElement? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
        {
            return null;
        }

        using var document = JsonDocument.ParseValue(ref reader);
        var payload = document.RootElement;

        if (payload.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        var inferredType = BoardElementPayloadSerializer.InferType(payload)
            ?? throw new NotSupportedException(BoardElementPayloadSerializer.MissingTypeDiscriminatorMessage);

        return inferredType switch
        {
            "shape" => payload.Deserialize<ShapeElement>(InnerOptions),
            "text" => payload.Deserialize<TextElement>(InnerOptions),
            "richtext" => payload.Deserialize<RichTextElement>(InnerOptions),
            "markdown" => payload.Deserialize<MarkdownElement>(InnerOptions),
            "sticky" => payload.Deserialize<StickyNoteElement>(InnerOptions),
            "frame" => payload.Deserialize<FrameElement>(InnerOptions),
            "arrow" => payload.Deserialize<ArrowElement>(InnerOptions),
            "icon" => payload.Deserialize<IconElement>(InnerOptions),
            "file" => payload.Deserialize<FileElement>(InnerOptions),
            "drawing" => payload.Deserialize<DrawingElement>(InnerOptions),
            _ => throw new NotSupportedException($"Unknown board element type: '{inferredType}'"),
        };
    }

    public override void Write(Utf8JsonWriter writer, BoardElement value, JsonSerializerOptions options)
    {
        var typeDiscriminator = value switch
        {
            ShapeElement => "shape",
            TextElement => "text",
            RichTextElement => "richtext",
            MarkdownElement => "markdown",
            StickyNoteElement => "sticky",
            FrameElement => "frame",
            ArrowElement => "arrow",
            IconElement => "icon",
            FileElement => "file",
            DrawingElement => "drawing",
            _ => throw new NotSupportedException($"Unsupported board element type: '{value.GetType().Name}'"),
        };

        using var doc = JsonSerializer.SerializeToDocument(value, value.GetType(), InnerOptions);
        writer.WriteStartObject();
        writer.WriteString("$type", typeDiscriminator);
        foreach (var property in doc.RootElement.EnumerateObject())
        {
            property.WriteTo(writer);
        }

        writer.WriteEndObject();
    }
}
