using System.Text.Json;
using Azure;
using Azure.AI.OpenAI;
using OpenAI.Chat;
using Orim.Core;
using Orim.Core.Models;

namespace Orim.Web.Services;

public sealed class DiagramAssistantService
{
    private readonly ChatClient? _chatClient;
    private readonly ILogger<DiagramAssistantService> _logger;
    private readonly bool _isConfigured;

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
        var boardSummary = BuildBoardSummary(board);
        var boardJson = JsonSerializer.Serialize(board, OrimJsonOptions.Indented);
        var existingElementsSummary = board.Elements.Count > 0
            ? $"The board currently has {board.Elements.Count} elements."
            : "The board is currently empty.";

        return $"""
            You are a diagram assistant for the Orim whiteboard application.
            Your job is to interpret and modify diagrams on the whiteboard by calling the provided tools.
            
            {existingElementsSummary}
            {boardSummary}

            ## Current Board JSON
            ```json
            {boardJson}
            ```
            
            ## Available Tools
            You can create shapes (rectangles, ellipses, triangles), arrows between elements, and icon elements.
            You can also update or remove existing elements.
            Use these tools to build, interpret, and modify the board that the user describes.
            
            ## Guidelines
            - Always inspect the current board JSON before deciding whether to modify an existing diagram or create a new one.
            - Reuse and update existing elements when the user's request is an edit to the current board.
            - Only clear the board when the user explicitly asks for a fresh diagram or a full replacement.
            - Position elements logically on the canvas with good spacing (use coordinates like 100-1500 for x, 100-1000 for y).
            - Use a grid-like layout with consistent spacing (e.g., 200px between elements).
            - Use meaningful labels on shapes to describe components.
            - Connect related elements with arrows.
            - Use orthogonal arrow routing by default. Only use straight routing when the user explicitly requests it.
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

    private static string BuildBoardSummary(Board board)
    {
        if (board.Elements.Count == 0)
        {
            return "The current board has no elements.";
        }

        var shapeCount = board.Elements.OfType<ShapeElement>().Count();
        var arrowCount = board.Elements.OfType<ArrowElement>().Count();
        var iconCount = board.Elements.OfType<IconElement>().Count();
        var textCount = board.Elements.OfType<TextElement>().Count();

        return $"Element counts: {shapeCount} shapes, {arrowCount} arrows, {iconCount} icons, {textCount} text elements.";
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
                "Add an arrow connecting two elements on the whiteboard. Use orthogonal routing unless the user explicitly wants a straight line.",
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
                            "description": "Arrow routing style. Prefer Orthogonal by default."
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
                "update_element",
                "Update an existing element on the board using its element ID. Use this to modify the current diagram instead of recreating it.",
                BinaryData.FromString("""
                {
                    "type": "object",
                    "properties": {
                        "elementId": { "type": "string", "description": "ID of the element to update (GUID)." },
                        "x": { "type": "number" },
                        "y": { "type": "number" },
                        "width": { "type": "number" },
                        "height": { "type": "number" },
                        "zIndex": { "type": "integer" },
                        "rotation": { "type": "number" },
                        "label": { "type": "string" },
                        "labelFontSize": { "type": ["number", "null"] },
                        "labelHorizontalAlignment": { "type": "string", "enum": ["Left", "Center", "Right"] },
                        "labelVerticalAlignment": { "type": "string", "enum": ["Top", "Middle", "Bottom"] },
                        "shapeType": { "type": "string", "enum": ["Rectangle", "Ellipse", "Triangle"] },
                        "fillColor": { "type": "string" },
                        "strokeColor": { "type": "string" },
                        "strokeWidth": { "type": "number" },
                        "borderLineStyle": { "type": "string", "enum": ["Solid", "Dashed", "Dotted", "DashDot", "LongDash", "Double"] },
                        "text": { "type": "string" },
                        "fontSize": { "type": "number" },
                        "color": { "type": "string" },
                        "isBold": { "type": "boolean" },
                        "isItalic": { "type": "boolean" },
                        "iconName": { "type": "string" },
                        "sourceElementId": { "type": ["string", "null"] },
                        "targetElementId": { "type": ["string", "null"] },
                        "sourceX": { "type": ["number", "null"] },
                        "sourceY": { "type": ["number", "null"] },
                        "targetX": { "type": ["number", "null"] },
                        "targetY": { "type": ["number", "null"] },
                        "sourceDock": { "type": "string", "enum": ["Top", "Bottom", "Left", "Right", "Center"] },
                        "targetDock": { "type": "string", "enum": ["Top", "Bottom", "Left", "Right", "Center"] },
                        "routeStyle": { "type": "string", "enum": ["Straight", "Orthogonal"] },
                        "lineStyle": { "type": "string", "enum": ["Solid", "Dashed", "Dotted", "DashDot", "LongDash"] },
                        "targetHeadStyle": { "type": "string", "enum": ["None", "FilledTriangle", "OpenTriangle", "FilledCircle", "OpenCircle"] },
                        "sourceHeadStyle": { "type": "string", "enum": ["None", "FilledTriangle", "OpenTriangle", "FilledCircle", "OpenCircle"] },
                        "orthogonalMiddleCoordinate": { "type": ["number", "null"] }
                    },
                    "required": ["elementId"]
                }
                """)),

            ChatTool.CreateFunctionTool(
                "remove_element",
                "Remove an existing element from the board by ID. When removing a non-arrow element, connected arrows can be removed as well.",
                BinaryData.FromString("""
                {
                    "type": "object",
                    "properties": {
                        "elementId": { "type": "string", "description": "ID of the element to remove (GUID)." },
                        "removeConnectedArrows": { "type": "boolean", "description": "When true, also removes arrows connected to the element. Defaults to true." }
                    },
                    "required": ["elementId"]
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
                case "update_element":
                    return ExecuteUpdateElement(argumentsJson, board, events);
                case "remove_element":
                    return ExecuteRemoveElement(argumentsJson, board, events);
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
            Content = JsonSerializer.Serialize(element, OrimJsonOptions.Default)
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
            ? Enum.TryParse<ArrowRouteStyle>(rsProp.GetString(), true, out var rs) ? rs : ArrowRouteStyle.Orthogonal
            : ArrowRouteStyle.Orthogonal;

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
            Content = JsonSerializer.Serialize(arrow, OrimJsonOptions.Default)
        });

        return ($"Arrow created with ID: {arrow.Id}", events);
    }

    private static (string, List<DiagramAssistantEvent>) ExecuteUpdateElement(
        string argsJson, Board board, List<DiagramAssistantEvent> events)
    {
        using var doc = JsonDocument.Parse(argsJson);
        var root = doc.RootElement;

        var elementId = Guid.Parse(root.GetProperty("elementId").GetString()!);
        var element = board.Elements.FirstOrDefault(candidate => candidate.Id == elementId);
        if (element is null)
        {
            return ("Error: Element not found on the board.", events);
        }

        ApplyCommonElementUpdates(element, root);

        switch (element)
        {
            case ShapeElement shape:
                ApplyShapeUpdates(shape, root);
                break;
            case TextElement text:
                ApplyTextUpdates(text, root);
                break;
            case ArrowElement arrow:
                ApplyArrowUpdates(arrow, root);
                break;
            case IconElement icon:
                ApplyIconUpdates(icon, root);
                break;
        }

        events.Add(new DiagramAssistantEvent
        {
            Type = EventType.ElementUpdated,
            Content = JsonSerializer.Serialize(element, OrimJsonOptions.Default)
        });

        return ($"Element updated: {element.Id}", events);
    }

    private static (string, List<DiagramAssistantEvent>) ExecuteRemoveElement(
        string argsJson, Board board, List<DiagramAssistantEvent> events)
    {
        using var doc = JsonDocument.Parse(argsJson);
        var root = doc.RootElement;

        var elementId = Guid.Parse(root.GetProperty("elementId").GetString()!);
        var removeConnectedArrows = !root.TryGetProperty("removeConnectedArrows", out var removeProp) || removeProp.GetBoolean();

        var targetElement = board.Elements.FirstOrDefault(candidate => candidate.Id == elementId);
        if (targetElement is null)
        {
            return ("Error: Element not found on the board.", events);
        }

        var removedCount = 0;
        if (targetElement is not ArrowElement && removeConnectedArrows)
        {
            removedCount += board.Elements.RemoveAll(candidate => candidate is ArrowElement arrow &&
                (arrow.SourceElementId == elementId || arrow.TargetElementId == elementId));
        }

        if (board.Elements.Remove(targetElement))
        {
            removedCount++;
        }

        events.Add(new DiagramAssistantEvent
        {
            Type = EventType.ElementRemoved,
            Content = $"Removed {removedCount} element(s)."
        });

        return ($"Removed {removedCount} element(s).", events);
    }

    private static void ApplyCommonElementUpdates(BoardElement element, JsonElement root)
    {
        if (root.TryGetProperty("x", out var xProp))
        {
            element.X = xProp.GetDouble();
        }

        if (root.TryGetProperty("y", out var yProp))
        {
            element.Y = yProp.GetDouble();
        }

        if (root.TryGetProperty("width", out var widthProp))
        {
            element.Width = widthProp.GetDouble();
        }

        if (root.TryGetProperty("height", out var heightProp))
        {
            element.Height = heightProp.GetDouble();
        }

        if (root.TryGetProperty("zIndex", out var zIndexProp))
        {
            element.ZIndex = zIndexProp.GetInt32();
        }

        if (root.TryGetProperty("rotation", out var rotationProp))
        {
            element.Rotation = rotationProp.GetDouble();
        }

        if (root.TryGetProperty("label", out var labelProp))
        {
            element.Label = labelProp.GetString() ?? string.Empty;
        }

        if (root.TryGetProperty("labelFontSize", out var labelFontSizeProp))
        {
            element.LabelFontSize = labelFontSizeProp.ValueKind == JsonValueKind.Null ? null : labelFontSizeProp.GetDouble();
        }

        if (root.TryGetProperty("labelHorizontalAlignment", out var horizontalProp) &&
            Enum.TryParse<HorizontalLabelAlignment>(horizontalProp.GetString(), true, out var horizontalAlignment))
        {
            element.LabelHorizontalAlignment = horizontalAlignment;
        }

        if (root.TryGetProperty("labelVerticalAlignment", out var verticalProp) &&
            Enum.TryParse<VerticalLabelAlignment>(verticalProp.GetString(), true, out var verticalAlignment))
        {
            element.LabelVerticalAlignment = verticalAlignment;
        }
    }

    private static void ApplyShapeUpdates(ShapeElement shape, JsonElement root)
    {
        if (root.TryGetProperty("shapeType", out var shapeTypeProp) &&
            Enum.TryParse<ShapeType>(shapeTypeProp.GetString(), true, out var shapeType))
        {
            shape.ShapeType = shapeType;
        }

        if (root.TryGetProperty("fillColor", out var fillColorProp))
        {
            shape.FillColor = fillColorProp.GetString() ?? shape.FillColor;
        }

        if (root.TryGetProperty("strokeColor", out var strokeColorProp))
        {
            shape.StrokeColor = strokeColorProp.GetString() ?? shape.StrokeColor;
        }

        if (root.TryGetProperty("strokeWidth", out var strokeWidthProp))
        {
            shape.StrokeWidth = strokeWidthProp.GetDouble();
        }

        if (root.TryGetProperty("borderLineStyle", out var borderStyleProp) &&
            Enum.TryParse<BorderLineStyle>(borderStyleProp.GetString(), true, out var borderStyle))
        {
            shape.BorderLineStyle = borderStyle;
        }
    }

    private static void ApplyTextUpdates(TextElement text, JsonElement root)
    {
        if (root.TryGetProperty("text", out var textProp))
        {
            text.Text = textProp.GetString() ?? string.Empty;
        }

        if (root.TryGetProperty("fontSize", out var fontSizeProp))
        {
            text.FontSize = fontSizeProp.GetDouble();
        }

        if (root.TryGetProperty("color", out var colorProp))
        {
            text.Color = colorProp.GetString() ?? text.Color;
        }

        if (root.TryGetProperty("isBold", out var isBoldProp))
        {
            text.IsBold = isBoldProp.GetBoolean();
        }

        if (root.TryGetProperty("isItalic", out var isItalicProp))
        {
            text.IsItalic = isItalicProp.GetBoolean();
        }
    }

    private static void ApplyArrowUpdates(ArrowElement arrow, JsonElement root)
    {
        if (root.TryGetProperty("sourceElementId", out var sourceElementIdProp))
        {
            arrow.SourceElementId = sourceElementIdProp.ValueKind == JsonValueKind.Null
                ? null
                : Guid.Parse(sourceElementIdProp.GetString()!);
        }

        if (root.TryGetProperty("targetElementId", out var targetElementIdProp))
        {
            arrow.TargetElementId = targetElementIdProp.ValueKind == JsonValueKind.Null
                ? null
                : Guid.Parse(targetElementIdProp.GetString()!);
        }

        if (root.TryGetProperty("sourceX", out var sourceXProp))
        {
            arrow.SourceX = sourceXProp.ValueKind == JsonValueKind.Null ? null : sourceXProp.GetDouble();
        }

        if (root.TryGetProperty("sourceY", out var sourceYProp))
        {
            arrow.SourceY = sourceYProp.ValueKind == JsonValueKind.Null ? null : sourceYProp.GetDouble();
        }

        if (root.TryGetProperty("targetX", out var targetXProp))
        {
            arrow.TargetX = targetXProp.ValueKind == JsonValueKind.Null ? null : targetXProp.GetDouble();
        }

        if (root.TryGetProperty("targetY", out var targetYProp))
        {
            arrow.TargetY = targetYProp.ValueKind == JsonValueKind.Null ? null : targetYProp.GetDouble();
        }

        if (root.TryGetProperty("sourceDock", out var sourceDockProp) &&
            Enum.TryParse<DockPoint>(sourceDockProp.GetString(), true, out var sourceDock))
        {
            arrow.SourceDock = sourceDock;
        }

        if (root.TryGetProperty("targetDock", out var targetDockProp) &&
            Enum.TryParse<DockPoint>(targetDockProp.GetString(), true, out var targetDock))
        {
            arrow.TargetDock = targetDock;
        }

        if (root.TryGetProperty("strokeColor", out var strokeColorProp))
        {
            arrow.StrokeColor = strokeColorProp.GetString() ?? arrow.StrokeColor;
        }

        if (root.TryGetProperty("strokeWidth", out var strokeWidthProp))
        {
            arrow.StrokeWidth = strokeWidthProp.GetDouble();
        }

        if (root.TryGetProperty("routeStyle", out var routeStyleProp) &&
            Enum.TryParse<ArrowRouteStyle>(routeStyleProp.GetString(), true, out var routeStyle))
        {
            arrow.RouteStyle = routeStyle;
        }

        if (root.TryGetProperty("lineStyle", out var lineStyleProp) &&
            Enum.TryParse<ArrowLineStyle>(lineStyleProp.GetString(), true, out var lineStyle))
        {
            arrow.LineStyle = lineStyle;
        }

        if (root.TryGetProperty("targetHeadStyle", out var targetHeadStyleProp) &&
            Enum.TryParse<ArrowHeadStyle>(targetHeadStyleProp.GetString(), true, out var targetHeadStyle))
        {
            arrow.TargetHeadStyle = targetHeadStyle;
        }

        if (root.TryGetProperty("sourceHeadStyle", out var sourceHeadStyleProp) &&
            Enum.TryParse<ArrowHeadStyle>(sourceHeadStyleProp.GetString(), true, out var sourceHeadStyle))
        {
            arrow.SourceHeadStyle = sourceHeadStyle;
        }

        if (root.TryGetProperty("orthogonalMiddleCoordinate", out var orthogonalMiddleCoordinateProp))
        {
            arrow.OrthogonalMiddleCoordinate = orthogonalMiddleCoordinateProp.ValueKind == JsonValueKind.Null
                ? null
                : orthogonalMiddleCoordinateProp.GetDouble();
        }
    }

    private static void ApplyIconUpdates(IconElement icon, JsonElement root)
    {
        if (root.TryGetProperty("iconName", out var iconNameProp))
        {
            icon.IconName = iconNameProp.GetString() ?? icon.IconName;
        }

        if (root.TryGetProperty("color", out var colorProp))
        {
            icon.Color = colorProp.GetString() ?? icon.Color;
        }
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
            Content = JsonSerializer.Serialize(icon, OrimJsonOptions.Default)
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
    ElementUpdated,
    ElementRemoved,
    BoardCleared,
    Error
}

public class ChatMessageEntry
{
    public string Role { get; set; } = "user";
    public string Content { get; set; } = "";
}
