using System.Text.Json;
using Azure;
using Azure.AI.OpenAI;
using OpenAI.Chat;
using Orim.Core.Models;

namespace Orim.Web.Services;

public sealed class DiagramAssistantService
{
    private readonly ChatClient? _chatClient;
    private readonly ILogger<DiagramAssistantService> _logger;
    private readonly bool _isConfigured;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
    };

    public DiagramAssistantService(IConfiguration configuration, ILogger<DiagramAssistantService> logger)
    {
        _logger = logger;

        var endpoint = configuration["AzureOpenAI:Endpoint"];
        var apiKey = configuration["AzureOpenAI:ApiKey"];
        var deploymentName = configuration["AzureOpenAI:DeploymentName"] ?? "gpt-4.1";

        if (string.IsNullOrWhiteSpace(endpoint) || string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogWarning("AzureOpenAI is not configured. Chat assistant will be unavailable.");
            _isConfigured = false;
            return;
        }

        var azureClient = new AzureOpenAIClient(new Uri(endpoint), new AzureKeyCredential(apiKey));
        _chatClient = azureClient.GetChatClient(deploymentName);
        _isConfigured = true;
    }

    public bool IsConfigured => _isConfigured;

    public async IAsyncEnumerable<DiagramAssistantEvent> StreamDiagramAsync(
        Board board,
        IReadOnlyList<ChatMessageEntry> conversationHistory,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        if (_chatClient is null)
        {
            yield return new DiagramAssistantEvent { Type = EventType.Error, Content = "AI assistant is not configured." };
            yield break;
        }

        var systemPrompt = BuildSystemPrompt(board);

        var messages = new List<ChatMessage> { new SystemChatMessage(systemPrompt) };
        foreach (var entry in conversationHistory)
        {
            switch (entry.Role)
            {
                case "user":
                    messages.Add(new UserChatMessage(entry.Content));
                    break;
                case "assistant":
                    messages.Add(new AssistantChatMessage(entry.Content));
                    break;
            }
        }

        var tools = BuildToolDefinitions();
        var options = new ChatCompletionOptions
        {
            MaxOutputTokenCount = 8192,
            Temperature = 0.4f,
        };

        foreach (var tool in tools)
        {
            options.Tools.Add(tool);
        }

        // Tool-calling loop: the model may request multiple rounds of tool calls
        const int maxToolRounds = 10;
        DiagramAssistantEvent? errorEvent = null;
        for (var round = 0; round < maxToolRounds; round++)
        {
            ChatCompletion completion;
            try
            {
                completion = await _chatClient.CompleteChatAsync(messages, options, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Azure OpenAI call failed.");
                errorEvent = new DiagramAssistantEvent { Type = EventType.Error, Content = $"AI error: {ex.Message}" };
                break;
            }

            // If the model wants to call tools
            if (completion.FinishReason == ChatFinishReason.ToolCalls)
            {
                // Collect the assistant message with all tool calls
                var assistantMessage = new AssistantChatMessage(completion);
                messages.Add(assistantMessage);

                foreach (var toolCall in completion.ToolCalls)
                {
                    var (toolResult, events) = ExecuteTool(toolCall.FunctionName, toolCall.FunctionArguments.ToString(), board);

                    foreach (var evt in events)
                    {
                        yield return evt;
                    }

                    messages.Add(new ToolChatMessage(toolCall.Id, toolResult));
                }

                // Continue the loop so the model can produce more tool calls or a final response
                continue;
            }

            // Final text response
            var text = completion.Content.Count > 0 ? completion.Content[0].Text ?? "" : "";
            if (!string.IsNullOrWhiteSpace(text))
            {
                yield return new DiagramAssistantEvent { Type = EventType.Message, Content = text };
            }

            yield break;
        }

        if (errorEvent is not null)
        {
            yield return errorEvent;
            yield break;
        }

        yield return new DiagramAssistantEvent { Type = EventType.Message, Content = "Diagram generation complete." };
    }

    private static string BuildSystemPrompt(Board board)
    {
        var existingElementsSummary = board.Elements.Count > 0
            ? $"The board currently has {board.Elements.Count} elements."
            : "The board is currently empty.";

        return $"""
            You are a diagram assistant for the Orim whiteboard application.
            Your job is to create diagrams on the whiteboard by calling the provided tools.
            
            {existingElementsSummary}
            
            ## Available Tools
            You can create shapes (rectangles, ellipses, triangles), arrows between elements, and icon elements.
            Use these tools to build diagrams that the user describes.
            
            ## Guidelines
            - Position elements logically on the canvas with good spacing (use coordinates like 100-1500 for x, 100-1000 for y).
            - Use a grid-like layout with consistent spacing (e.g., 200px between elements).
            - Use meaningful labels on shapes to describe components.
            - Connect related elements with arrows.
            - Use colors to distinguish different types of components:
              - Primary components: #6e40c9 (purple) fill with white text
              - Secondary components: #238636 (green) fill
              - Interfaces/abstractions: #1f6feb (blue) fill
              - Data/storage: #f0883e (orange) fill
              - Background/containers: #f6f8fa (light gray) fill with darker border
            - Default shape size is 160x80 for regular components, 200x100 for larger ones.
            - For architecture diagrams, place the central component (e.g., mediator) in the center.
            - First create all shapes, then connect them with arrows.
            - When the user asks for a specific pattern (e.g. Mediator, Observer, MVC), create the correct structure.
            - Respond in the same language the user writes in.
            - After creating the diagram, briefly explain what you created.
            """;
    }

    private static List<ChatTool> BuildToolDefinitions()
    {
        return
        [
            ChatTool.CreateFunctionTool(
                "add_shape",
                "Add a shape element (rectangle, ellipse, or triangle) to the whiteboard.",
                BinaryData.FromString("""
                {
                    "type": "object",
                    "properties": {
                        "shapeType": {
                            "type": "string",
                            "enum": ["Rectangle", "Ellipse", "Triangle"],
                            "description": "The type of shape to create."
                        },
                        "x": { "type": "number", "description": "X position on the canvas." },
                        "y": { "type": "number", "description": "Y position on the canvas." },
                        "width": { "type": "number", "description": "Width of the shape." },
                        "height": { "type": "number", "description": "Height of the shape." },
                        "label": { "type": "string", "description": "Text label displayed on the shape." },
                        "fillColor": { "type": "string", "description": "Fill color as hex string (e.g. #FFFFFF)." },
                        "strokeColor": { "type": "string", "description": "Stroke/border color as hex string." },
                        "strokeWidth": { "type": "number", "description": "Border width in pixels." }
                    },
                    "required": ["shapeType", "x", "y", "width", "height", "label"]
                }
                """)),

            ChatTool.CreateFunctionTool(
                "add_arrow",
                "Add an arrow connecting two elements on the whiteboard. Use element IDs returned from add_shape.",
                BinaryData.FromString("""
                {
                    "type": "object",
                    "properties": {
                        "sourceElementId": { "type": "string", "description": "ID of the source element (GUID)." },
                        "targetElementId": { "type": "string", "description": "ID of the target element (GUID)." },
                        "sourceDock": {
                            "type": "string",
                            "enum": ["Top", "Bottom", "Left", "Right", "Center"],
                            "description": "Dock point on the source element."
                        },
                        "targetDock": {
                            "type": "string",
                            "enum": ["Top", "Bottom", "Left", "Right", "Center"],
                            "description": "Dock point on the target element."
                        },
                        "strokeColor": { "type": "string", "description": "Arrow color as hex string." },
                        "strokeWidth": { "type": "number", "description": "Arrow line width." },
                        "label": { "type": "string", "description": "Optional label on the arrow." },
                        "routeStyle": {
                            "type": "string",
                            "enum": ["Straight", "Orthogonal"],
                            "description": "Arrow routing style."
                        },
                        "lineStyle": {
                            "type": "string",
                            "enum": ["Solid", "Dashed", "Dotted"],
                            "description": "Line dash style."
                        },
                        "targetHeadStyle": {
                            "type": "string",
                            "enum": ["None", "FilledTriangle", "OpenTriangle", "FilledCircle", "OpenCircle"],
                            "description": "Arrowhead style at the target."
                        },
                        "sourceHeadStyle": {
                            "type": "string",
                            "enum": ["None", "FilledTriangle", "OpenTriangle", "FilledCircle", "OpenCircle"],
                            "description": "Arrowhead style at the source."
                        }
                    },
                    "required": ["sourceElementId", "targetElementId"]
                }
                """)),

            ChatTool.CreateFunctionTool(
                "add_icon",
                "Add a Material Design icon element to the whiteboard.",
                BinaryData.FromString("""
                {
                    "type": "object",
                    "properties": {
                        "iconName": { "type": "string", "description": "MDI icon class name (e.g. mdi-database, mdi-server, mdi-cloud)." },
                        "x": { "type": "number", "description": "X position." },
                        "y": { "type": "number", "description": "Y position." },
                        "width": { "type": "number", "description": "Width." },
                        "height": { "type": "number", "description": "Height." },
                        "color": { "type": "string", "description": "Icon color as hex string." },
                        "label": { "type": "string", "description": "Optional label." }
                    },
                    "required": ["iconName", "x", "y"]
                }
                """)),

            ChatTool.CreateFunctionTool(
                "clear_board",
                "Remove all elements from the whiteboard before creating a new diagram.",
                BinaryData.FromString("""
                {
                    "type": "object",
                    "properties": {
                        "confirm": { "type": "boolean", "description": "Must be true to confirm clearing." }
                    },
                    "required": ["confirm"]
                }
                """))
        ];
    }

    private static (string result, List<DiagramAssistantEvent> events) ExecuteTool(
        string functionName, string argumentsJson, Board board)
    {
        var events = new List<DiagramAssistantEvent>();

        try
        {
            switch (functionName)
            {
                case "add_shape":
                    return ExecuteAddShape(argumentsJson, board, events);
                case "add_arrow":
                    return ExecuteAddArrow(argumentsJson, board, events);
                case "add_icon":
                    return ExecuteAddIcon(argumentsJson, board, events);
                case "clear_board":
                    return ExecuteClearBoard(argumentsJson, board, events);
                default:
                    return ($"Unknown tool: {functionName}", events);
            }
        }
        catch (Exception ex)
        {
            return ($"Error executing {functionName}: {ex.Message}", events);
        }
    }

    private static (string, List<DiagramAssistantEvent>) ExecuteAddShape(
        string argsJson, Board board, List<DiagramAssistantEvent> events)
    {
        using var doc = JsonDocument.Parse(argsJson);
        var root = doc.RootElement;

        var shapeTypeStr = root.GetProperty("shapeType").GetString() ?? "Rectangle";
        var shapeType = Enum.TryParse<ShapeType>(shapeTypeStr, true, out var st) ? st : ShapeType.Rectangle;

        var element = new ShapeElement
        {
            ShapeType = shapeType,
            X = root.GetProperty("x").GetDouble(),
            Y = root.GetProperty("y").GetDouble(),
            Width = root.GetProperty("width").GetDouble(),
            Height = root.GetProperty("height").GetDouble(),
            Label = root.TryGetProperty("label", out var labelProp) ? labelProp.GetString() ?? "" : "",
            FillColor = root.TryGetProperty("fillColor", out var fillProp) ? fillProp.GetString() ?? "#FFFFFF" : "#FFFFFF",
            StrokeColor = root.TryGetProperty("strokeColor", out var strokeProp) ? strokeProp.GetString() ?? "#000000" : "#000000",
            StrokeWidth = root.TryGetProperty("strokeWidth", out var swProp) ? swProp.GetDouble() : 2,
            ZIndex = board.Elements.Count
        };

        board.Elements.Add(element);
        events.Add(new DiagramAssistantEvent
        {
            Type = EventType.ElementAdded,
            Content = JsonSerializer.Serialize(element, JsonOptions)
        });

        return ($"Shape created with ID: {element.Id}", events);
    }

    private static (string, List<DiagramAssistantEvent>) ExecuteAddArrow(
        string argsJson, Board board, List<DiagramAssistantEvent> events)
    {
        using var doc = JsonDocument.Parse(argsJson);
        var root = doc.RootElement;

        var sourceId = Guid.Parse(root.GetProperty("sourceElementId").GetString()!);
        var targetId = Guid.Parse(root.GetProperty("targetElementId").GetString()!);

        var sourceElement = board.Elements.FirstOrDefault(e => e.Id == sourceId);
        var targetElement = board.Elements.FirstOrDefault(e => e.Id == targetId);

        if (sourceElement is null || targetElement is null)
        {
            return ("Error: Source or target element not found on the board.", events);
        }

        var sourceDock = root.TryGetProperty("sourceDock", out var sdProp)
            ? Enum.TryParse<DockPoint>(sdProp.GetString(), true, out var sd) ? sd : DockPoint.Right
            : DockPoint.Right;

        var targetDock = root.TryGetProperty("targetDock", out var tdProp)
            ? Enum.TryParse<DockPoint>(tdProp.GetString(), true, out var td) ? td : DockPoint.Left
            : DockPoint.Left;

        var routeStyle = root.TryGetProperty("routeStyle", out var rsProp)
            ? Enum.TryParse<ArrowRouteStyle>(rsProp.GetString(), true, out var rs) ? rs : ArrowRouteStyle.Straight
            : ArrowRouteStyle.Straight;

        var lineStyle = root.TryGetProperty("lineStyle", out var lsProp)
            ? Enum.TryParse<ArrowLineStyle>(lsProp.GetString(), true, out var ls) ? ls : ArrowLineStyle.Solid
            : ArrowLineStyle.Solid;

        var targetHeadStyle = root.TryGetProperty("targetHeadStyle", out var thsProp)
            ? Enum.TryParse<ArrowHeadStyle>(thsProp.GetString(), true, out var ths) ? ths : ArrowHeadStyle.FilledTriangle
            : ArrowHeadStyle.FilledTriangle;

        var sourceHeadStyle = root.TryGetProperty("sourceHeadStyle", out var shsProp)
            ? Enum.TryParse<ArrowHeadStyle>(shsProp.GetString(), true, out var shs) ? shs : ArrowHeadStyle.None
            : ArrowHeadStyle.None;

        var arrow = new ArrowElement
        {
            SourceElementId = sourceId,
            TargetElementId = targetId,
            SourceDock = sourceDock,
            TargetDock = targetDock,
            StrokeColor = root.TryGetProperty("strokeColor", out var scProp) ? scProp.GetString() ?? "#000000" : "#000000",
            StrokeWidth = root.TryGetProperty("strokeWidth", out var swProp) ? swProp.GetDouble() : 2,
            RouteStyle = routeStyle,
            LineStyle = lineStyle,
            TargetHeadStyle = targetHeadStyle,
            SourceHeadStyle = sourceHeadStyle,
            Label = root.TryGetProperty("label", out var labelProp) ? labelProp.GetString() ?? "" : "",
            ZIndex = board.Elements.Count
        };

        board.Elements.Add(arrow);
        events.Add(new DiagramAssistantEvent
        {
            Type = EventType.ElementAdded,
            Content = JsonSerializer.Serialize(arrow, JsonOptions)
        });

        return ($"Arrow created with ID: {arrow.Id}", events);
    }

    private static (string, List<DiagramAssistantEvent>) ExecuteAddIcon(
        string argsJson, Board board, List<DiagramAssistantEvent> events)
    {
        using var doc = JsonDocument.Parse(argsJson);
        var root = doc.RootElement;

        var icon = new IconElement
        {
            IconName = root.GetProperty("iconName").GetString() ?? "mdi-star",
            X = root.GetProperty("x").GetDouble(),
            Y = root.GetProperty("y").GetDouble(),
            Width = root.TryGetProperty("width", out var wProp) ? wProp.GetDouble() : 48,
            Height = root.TryGetProperty("height", out var hProp) ? hProp.GetDouble() : 48,
            Color = root.TryGetProperty("color", out var cProp) ? cProp.GetString() ?? "#0f172a" : "#0f172a",
            Label = root.TryGetProperty("label", out var labelProp) ? labelProp.GetString() ?? "" : "",
            ZIndex = board.Elements.Count
        };

        board.Elements.Add(icon);
        events.Add(new DiagramAssistantEvent
        {
            Type = EventType.ElementAdded,
            Content = JsonSerializer.Serialize(icon, JsonOptions)
        });

        return ($"Icon created with ID: {icon.Id}", events);
    }

    private static (string, List<DiagramAssistantEvent>) ExecuteClearBoard(
        string argsJson, Board board, List<DiagramAssistantEvent> events)
    {
        using var doc = JsonDocument.Parse(argsJson);
        var root = doc.RootElement;

        var confirm = root.TryGetProperty("confirm", out var confirmProp) && confirmProp.GetBoolean();
        if (!confirm)
        {
            return ("Clear board was not confirmed.", events);
        }

        board.Elements.Clear();
        events.Add(new DiagramAssistantEvent
        {
            Type = EventType.BoardCleared,
            Content = "All elements removed."
        });

        return ("Board cleared successfully.", events);
    }
}

public class DiagramAssistantEvent
{
    public EventType Type { get; set; }
    public string Content { get; set; } = "";
}

public enum EventType
{
    Message,
    ElementAdded,
    BoardCleared,
    Error
}

public class ChatMessageEntry
{
    public string Role { get; set; } = "user";
    public string Content { get; set; } = "";
}
