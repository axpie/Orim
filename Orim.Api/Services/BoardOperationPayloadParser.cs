using System.Text.Json;
using Orim.Api.Contracts;
using Orim.Core;

namespace Orim.Api.Services;

public sealed class BoardOperationPayloadParseException : Exception
{
    public BoardOperationPayloadParseException(string clientMessage, Exception innerException)
        : this(clientMessage, null, innerException)
    {
    }

    public BoardOperationPayloadParseException(string clientMessage, int? index, Exception innerException)
        : base(clientMessage, innerException)
    {
        ClientMessage = clientMessage;
        Index = index;
    }

    public string ClientMessage { get; }

    public int? Index { get; }
}

public static class BoardOperationPayloadParser
{
    public const string InvalidPayloadMessage = "Invalid board operation payload.";

    public static BoardOperationDto ParseSingle(JsonElement payload)
    {
        try
        {
            return Deserialize(payload);
        }
        catch (Exception exception) when (exception is JsonException or NotSupportedException)
        {
            throw new BoardOperationPayloadParseException(InvalidPayloadMessage, exception);
        }
    }

    public static IReadOnlyList<BoardOperationDto> ParseMany(IReadOnlyList<JsonElement> payloads)
    {
        ArgumentNullException.ThrowIfNull(payloads);

        var operations = new List<BoardOperationDto>(payloads.Count);
        for (var index = 0; index < payloads.Count; index++)
        {
            try
            {
                operations.Add(Deserialize(payloads[index]));
            }
            catch (Exception exception) when (exception is JsonException or NotSupportedException)
            {
                throw new BoardOperationPayloadParseException(GetInvalidPayloadMessage(index), index, exception);
            }
        }

        return operations;
    }

    public static string GetInvalidPayloadMessage(int index) => $"Invalid board operation payload at index {index}.";

    private static BoardOperationDto Deserialize(JsonElement payload)
    {
        if (payload.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            throw new JsonException("Board operation payload was null.");
        }

        return payload.Deserialize<BoardOperationDto>(OrimJsonOptions.Default)
            ?? throw new JsonException("Board operation payload could not be deserialized.");
    }
}
