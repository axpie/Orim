using System.ClientModel;
using System.Net;
using System.Text.Json;
using OpenAI;
using OpenAI.Chat;
using Orim.Core;
using Orim.Core.Models;

namespace Orim.Api.Services;

public sealed class DiagramAssistantService
{
    private readonly AssistantSettingsService _assistantSettingsService;
    private readonly ILogger<DiagramAssistantService> _logger;

    public DiagramAssistantService(AssistantSettingsService assistantSettingsService, ILogger<DiagramAssistantService> logger)
    {
        _assistantSettingsService = assistantSettingsService;
        _logger = logger;
    }

    public bool IsConfigured => _assistantSettingsService.GetSnapshot().IsConfigured;

    public string? GetUnavailableReason()
    {
        var settings = _assistantSettingsService.GetSnapshot();

        if (!settings.IsEnabled)
        {
            return "AI assistant is disabled.";
        }

        if (!settings.IsConfigured)
        {
            return "AI assistant is not configured.";
        }

        return null;
    }

    public async IAsyncEnumerable<DiagramAssistantEvent> StreamDiagramAsync(
        Board board,
        IReadOnlyList<ChatMessageEntry> conversationHistory,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var settings = _assistantSettingsService.GetSnapshot();
        var unavailableReason = GetUnavailableReason();
        if (unavailableReason is not null)
        {
            yield return new DiagramAssistantEvent { Type = EventType.Error, Content = unavailableReason };
            yield break;
        }

        var chatClient = new ChatClient(
            model: settings.DeploymentName,
            credential: new ApiKeyCredential(settings.ApiKey),
            options: new OpenAIClientOptions { Endpoint = new Uri(settings.Endpoint) });

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
        var options = new ChatCompletionOptions();

        foreach (var tool in tools)
        {
            options.Tools.Add(tool);
        }

        const int maxToolRounds = 10;
        DiagramAssistantEvent? errorEvent = null;
        for (var round = 0; round < maxToolRounds; round++)
        {
            ChatCompletion completion;
            try
            {
                completion = await chatClient.CompleteChatAsync(messages, options, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "OpenAI SDK call failed.");
                errorEvent = new DiagramAssistantEvent
                {
                    Type = EventType.Error,
                    Content = "The assistant is currently unavailable. Please try again later."
                };
                break;
            }

            if (completion.FinishReason == ChatFinishReason.ToolCalls)
            {
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

                continue;
            }

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
        var boardJson = JsonSerializer.Serialize(board, OrimJsonOptions.Indented);
        var shapeCount = board.Elements.OfType<ShapeElement>().Count();
        var arrowCount = board.Elements.OfType<ArrowElement>().Count();
        var iconCount = board.Elements.OfType<IconElement>().Count();
        var textCount = board.Elements.OfType<TextElement>().Count();
        var richTextCount = board.Elements.OfType<RichTextElement>().Count();
        var markdownCount = board.Elements.OfType<MarkdownElement>().Count();
        var existingElementsSummary = board.Elements.Count > 0
            ? $"The board currently has {board.Elements.Count} elements: {shapeCount} shapes, {arrowCount} arrows, {iconCount} icons, {textCount} plain text elements, {richTextCount} rich text elements, and {markdownCount} markdown elements."
            : "The board is currently empty.";

        return $"""
            You are a diagram assistant for the Orim whiteboard application.
            Your job is to interpret and modify diagrams on the whiteboard by calling the provided tools.
            
            {existingElementsSummary}

            ## Current Board JSON
            ```json
            {boardJson}
            ```
            
            ## Available Tools
            You can create shapes (rectangles, ellipses, triangles), arrows between elements, icon elements, and text elements (plain text, rich text, markdown).
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
            - Use orthogonal arrow routing by default.
            - Use colors to distinguish different types of components.
            - Default shape size is 160x80 for regular components, 200x100 for larger ones.
            - First create all shapes, then connect them with arrows.
            - Respond in the same language the user writes in.
            - After creating the diagram, briefly explain what you created.
            """;
    }

    private static List<ChatTool> BuildToolDefinitions() =>
    [
        ChatTool.CreateFunctionTool("add_shape", "Add a shape element to the whiteboard.",
            BinaryData.FromString("""{"type":"object","properties":{"shapeType":{"type":"string","enum":["Rectangle","Ellipse","Triangle","Rhombus"]},"x":{"type":"number"},"y":{"type":"number"},"width":{"type":"number"},"height":{"type":"number"},"label":{"type":"string"},"fillColor":{"type":"string"},"strokeColor":{"type":"string"},"strokeWidth":{"type":"number"}},"required":["shapeType","x","y","width","height","label"]}""")),
        ChatTool.CreateFunctionTool("add_text", "Add a plain text, rich text, or markdown element to the whiteboard.",
            BinaryData.FromString("""{"type":"object","properties":{"textType":{"type":"string","enum":["text","richtext","markdown"]},"x":{"type":"number"},"y":{"type":"number"},"width":{"type":"number"},"height":{"type":"number"},"label":{"type":"string"},"text":{"type":"string"},"html":{"type":"string"},"markdown":{"type":"string"},"fontSize":{"type":"number"},"autoFontSize":{"type":"boolean"},"color":{"type":"string"},"fontFamily":{"type":"string"},"isBold":{"type":"boolean"},"isItalic":{"type":"boolean"},"isUnderline":{"type":"boolean"},"isStrikethrough":{"type":"boolean"}},"required":["textType","x","y"]}""")),
        ChatTool.CreateFunctionTool("add_arrow", "Add an arrow connecting two elements.",
            BinaryData.FromString("""{"type":"object","properties":{"sourceElementId":{"type":"string"},"targetElementId":{"type":"string"},"sourceDock":{"type":"string","enum":["Top","Bottom","Left","Right","Center"]},"targetDock":{"type":"string","enum":["Top","Bottom","Left","Right","Center"]},"strokeColor":{"type":"string"},"strokeWidth":{"type":"number"},"label":{"type":"string"},"routeStyle":{"type":"string","enum":["Straight","Orthogonal"]},"lineStyle":{"type":"string","enum":["Solid","Dashed","Dotted"]},"targetHeadStyle":{"type":"string","enum":["None","FilledTriangle","OpenTriangle","FilledCircle","OpenCircle"]},"sourceHeadStyle":{"type":"string","enum":["None","FilledTriangle","OpenTriangle","FilledCircle","OpenCircle"]}},"required":["sourceElementId","targetElementId"]}""")),
        ChatTool.CreateFunctionTool("update_element", "Update an existing element on the board.",
            BinaryData.FromString("""{"type":"object","properties":{"elementId":{"type":"string"},"x":{"type":"number"},"y":{"type":"number"},"width":{"type":"number"},"height":{"type":"number"},"label":{"type":"string"},"fillColor":{"type":"string"},"strokeColor":{"type":"string"},"strokeWidth":{"type":"number"},"text":{"type":"string"},"html":{"type":"string"},"markdown":{"type":"string"},"fontSize":{"type":"number"},"autoFontSize":{"type":"boolean"},"color":{"type":"string"},"fontFamily":{"type":"string"},"isBold":{"type":"boolean"},"isItalic":{"type":"boolean"},"isUnderline":{"type":"boolean"},"isStrikethrough":{"type":"boolean"},"iconName":{"type":"string"}},"required":["elementId"]}""")),
        ChatTool.CreateFunctionTool("remove_element", "Remove an element from the board.",
            BinaryData.FromString("""{"type":"object","properties":{"elementId":{"type":"string"},"removeConnectedArrows":{"type":"boolean"}},"required":["elementId"]}""")),
        ChatTool.CreateFunctionTool("add_icon", "Add an icon element to the whiteboard.",
            BinaryData.FromString("""{"type":"object","properties":{"iconName":{"type":"string"},"x":{"type":"number"},"y":{"type":"number"},"width":{"type":"number"},"height":{"type":"number"},"color":{"type":"string"},"label":{"type":"string"}},"required":["iconName","x","y"]}""")),
        ChatTool.CreateFunctionTool("clear_board", "Remove all elements from the whiteboard.",
            BinaryData.FromString("""{"type":"object","properties":{"confirm":{"type":"boolean"}},"required":["confirm"]}"""))
    ];

    private (string result, List<DiagramAssistantEvent> events) ExecuteTool(string functionName, string argumentsJson, Board board)
    {
        var events = new List<DiagramAssistantEvent>();
        try
        {
            return functionName switch
            {
                "add_shape" => ExecuteAddShape(argumentsJson, board, events),
                "add_text" => ExecuteAddText(argumentsJson, board, events),
                "add_arrow" => ExecuteAddArrow(argumentsJson, board, events),
                "update_element" => ExecuteUpdateElement(argumentsJson, board, events),
                "remove_element" => ExecuteRemoveElement(argumentsJson, board, events),
                "add_icon" => ExecuteAddIcon(argumentsJson, board, events),
                "clear_board" => ExecuteClearBoard(argumentsJson, board, events),
                _ => ($"Unknown tool: {functionName}", events)
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Assistant tool {FunctionName} failed.", functionName);
            return ("The requested tool action could not be completed.", events);
        }
    }

    private static (string, List<DiagramAssistantEvent>) ExecuteAddShape(string argsJson, Board board, List<DiagramAssistantEvent> events)
    {
        using var doc = JsonDocument.Parse(argsJson);
        var root = doc.RootElement;
        var shapeType = Enum.TryParse<ShapeType>(root.GetProperty("shapeType").GetString(), true, out var st) ? st : ShapeType.Rectangle;
        var element = new ShapeElement
        {
            ShapeType = shapeType,
            X = root.GetProperty("x").GetDouble(),
            Y = root.GetProperty("y").GetDouble(),
            Width = root.GetProperty("width").GetDouble(),
            Height = root.GetProperty("height").GetDouble(),
            Label = root.TryGetProperty("label", out var lp) ? lp.GetString() ?? "" : "",
            FillColor = root.TryGetProperty("fillColor", out var fp) ? fp.GetString() ?? "#FFFFFF" : "#FFFFFF",
            StrokeColor = root.TryGetProperty("strokeColor", out var sp) ? sp.GetString() ?? "#000000" : "#000000",
            StrokeWidth = root.TryGetProperty("strokeWidth", out var sw) ? sw.GetDouble() : 2,
            ZIndex = board.Elements.Count
        };
        board.Elements.Add(element);
        events.Add(new DiagramAssistantEvent { Type = EventType.ElementAdded, Content = JsonSerializer.Serialize(element, OrimJsonOptions.Default) });
        return ($"Shape created with ID: {element.Id}", events);
    }

    private static string NormalizeTextElementType(string? rawTextType) =>
        rawTextType?.Trim().ToLowerInvariant() switch
        {
            "richtext" or "rich-text" or "rich_text" or "rich" => "richtext",
            "markdown" or "md" => "markdown",
            _ => "text"
        };

    private static void ApplyTextBaseProperties(
        TextStyleElementBase element,
        int zIndex,
        double x,
        double y,
        double width,
        double height,
        string label,
        double fontSize,
        bool autoFontSize,
        string color,
        string? fontFamily,
        bool isBold,
        bool isItalic,
        bool isUnderline,
        bool isStrikethrough)
    {
        element.X = x;
        element.Y = y;
        element.Width = width;
        element.Height = height;
        element.ZIndex = zIndex;
        element.Label = label;
        element.LabelHorizontalAlignment = HorizontalLabelAlignment.Left;
        element.LabelVerticalAlignment = VerticalLabelAlignment.Top;
        element.FontSize = fontSize;
        element.AutoFontSize = autoFontSize;
        element.Color = color;
        element.FontFamily = fontFamily;
        element.IsBold = isBold;
        element.IsItalic = isItalic;
        element.IsUnderline = isUnderline;
        element.IsStrikethrough = isStrikethrough;
    }

    private static (string, List<DiagramAssistantEvent>) ExecuteAddText(string argsJson, Board board, List<DiagramAssistantEvent> events)
    {
        using var doc = JsonDocument.Parse(argsJson);
        var root = doc.RootElement;
        var textType = NormalizeTextElementType(root.TryGetProperty("textType", out var textTypeProperty) ? textTypeProperty.GetString() : null);
        var x = root.GetProperty("x").GetDouble();
        var y = root.GetProperty("y").GetDouble();
        var width = root.TryGetProperty("width", out var widthProperty) ? widthProperty.GetDouble() : 220;
        var height = root.TryGetProperty("height", out var heightProperty) ? heightProperty.GetDouble() : 56;
        var label = root.TryGetProperty("label", out var labelProperty) ? labelProperty.GetString() ?? "" : "";
        var fontSize = root.TryGetProperty("fontSize", out var fontSizeProperty) ? fontSizeProperty.GetDouble() : 18;
        var autoFontSize = root.TryGetProperty("autoFontSize", out var autoFontSizeProperty) && autoFontSizeProperty.GetBoolean();
        var color = root.TryGetProperty("color", out var colorProperty) ? colorProperty.GetString() ?? "#000000" : "#000000";
        var fontFamily = root.TryGetProperty("fontFamily", out var fontFamilyProperty) ? fontFamilyProperty.GetString() : null;
        var isBold = root.TryGetProperty("isBold", out var isBoldProperty) && isBoldProperty.GetBoolean();
        var isItalic = root.TryGetProperty("isItalic", out var isItalicProperty) && isItalicProperty.GetBoolean();
        var isUnderline = root.TryGetProperty("isUnderline", out var isUnderlineProperty) && isUnderlineProperty.GetBoolean();
        var isStrikethrough = root.TryGetProperty("isStrikethrough", out var isStrikethroughProperty) && isStrikethroughProperty.GetBoolean();

        var plainText = root.TryGetProperty("text", out var textProperty) ? textProperty.GetString() ?? "" : "";
        var html = root.TryGetProperty("html", out var htmlProperty)
            ? htmlProperty.GetString() ?? ""
            : $"<p>{WebUtility.HtmlEncode(plainText)}</p>";
        if (string.IsNullOrWhiteSpace(html))
        {
            html = "<p></p>";
        }

        var markdown = root.TryGetProperty("markdown", out var markdownProperty)
            ? markdownProperty.GetString() ?? ""
            : plainText;

        TextStyleElementBase element = textType switch
        {
            "richtext" => new RichTextElement
            {
                Html = html,
                ScrollLeft = 0,
                ScrollTop = 0,
            },
            "markdown" => new MarkdownElement
            {
                Markdown = markdown,
                ScrollLeft = 0,
                ScrollTop = 0,
            },
            _ => new TextElement
            {
                Text = plainText,
            },
        };

        ApplyTextBaseProperties(
            element,
            board.Elements.Count,
            x,
            y,
            width,
            height,
            label,
            fontSize,
            autoFontSize,
            color,
            fontFamily,
            isBold,
            isItalic,
            isUnderline,
            isStrikethrough);

        board.Elements.Add(element);
        events.Add(new DiagramAssistantEvent { Type = EventType.ElementAdded, Content = JsonSerializer.Serialize(element, OrimJsonOptions.Default) });
        return ($"Text element created with ID: {element.Id}", events);
    }

    private static (string, List<DiagramAssistantEvent>) ExecuteAddArrow(string argsJson, Board board, List<DiagramAssistantEvent> events)
    {
        using var doc = JsonDocument.Parse(argsJson);
        var root = doc.RootElement;
        var sourceId = Guid.Parse(root.GetProperty("sourceElementId").GetString()!);
        var targetId = Guid.Parse(root.GetProperty("targetElementId").GetString()!);
        if (board.Elements.All(e => e.Id != sourceId) || board.Elements.All(e => e.Id != targetId))
            return ("Error: Source or target element not found.", events);

        var arrow = new ArrowElement
        {
            SourceElementId = sourceId,
            TargetElementId = targetId,
            SourceDock = root.TryGetProperty("sourceDock", out var sd) && Enum.TryParse<DockPoint>(sd.GetString(), true, out var sdv) ? sdv : DockPoint.Right,
            TargetDock = root.TryGetProperty("targetDock", out var td) && Enum.TryParse<DockPoint>(td.GetString(), true, out var tdv) ? tdv : DockPoint.Left,
            StrokeColor = root.TryGetProperty("strokeColor", out var sc) ? sc.GetString() ?? "#000000" : "#000000",
            StrokeWidth = root.TryGetProperty("strokeWidth", out var sw) ? sw.GetDouble() : 2,
            RouteStyle = root.TryGetProperty("routeStyle", out var rs) && Enum.TryParse<ArrowRouteStyle>(rs.GetString(), true, out var rsv) ? rsv : ArrowRouteStyle.Orthogonal,
            LineStyle = root.TryGetProperty("lineStyle", out var ls) && Enum.TryParse<ArrowLineStyle>(ls.GetString(), true, out var lsv) ? lsv : ArrowLineStyle.Solid,
            TargetHeadStyle = root.TryGetProperty("targetHeadStyle", out var ths) && Enum.TryParse<ArrowHeadStyle>(ths.GetString(), true, out var thsv) ? thsv : ArrowHeadStyle.FilledTriangle,
            SourceHeadStyle = root.TryGetProperty("sourceHeadStyle", out var shs) && Enum.TryParse<ArrowHeadStyle>(shs.GetString(), true, out var shsv) ? shsv : ArrowHeadStyle.None,
            Label = root.TryGetProperty("label", out var lp) ? lp.GetString() ?? "" : "",
            ZIndex = board.Elements.Count
        };
        board.Elements.Add(arrow);
        events.Add(new DiagramAssistantEvent { Type = EventType.ElementAdded, Content = JsonSerializer.Serialize(arrow, OrimJsonOptions.Default) });
        return ($"Arrow created with ID: {arrow.Id}", events);
    }

    private static (string, List<DiagramAssistantEvent>) ExecuteUpdateElement(string argsJson, Board board, List<DiagramAssistantEvent> events)
    {
        using var doc = JsonDocument.Parse(argsJson);
        var root = doc.RootElement;
        var elementId = Guid.Parse(root.GetProperty("elementId").GetString()!);
        var element = board.Elements.FirstOrDefault(e => e.Id == elementId);
        if (element is null) return ("Error: Element not found.", events);

        if (root.TryGetProperty("x", out var xp)) element.X = xp.GetDouble();
        if (root.TryGetProperty("y", out var yp)) element.Y = yp.GetDouble();
        if (root.TryGetProperty("width", out var wp)) element.Width = wp.GetDouble();
        if (root.TryGetProperty("height", out var hp)) element.Height = hp.GetDouble();
        if (root.TryGetProperty("label", out var lp)) element.Label = lp.GetString() ?? "";

        if (element is ShapeElement shape)
        {
            if (root.TryGetProperty("fillColor", out var fp)) shape.FillColor = fp.GetString() ?? shape.FillColor;
            if (root.TryGetProperty("strokeColor", out var sp)) shape.StrokeColor = sp.GetString() ?? shape.StrokeColor;
            if (root.TryGetProperty("strokeWidth", out var sw)) shape.StrokeWidth = sw.GetDouble();
        }
        else if (element is TextStyleElementBase text)
        {
            if (root.TryGetProperty("fontSize", out var fs)) text.FontSize = fs.GetDouble();
            if (root.TryGetProperty("autoFontSize", out var afs)) text.AutoFontSize = afs.GetBoolean();
            if (root.TryGetProperty("color", out var cp)) text.Color = cp.GetString() ?? text.Color;
            if (root.TryGetProperty("fontFamily", out var ff)) text.FontFamily = ff.GetString();
            if (root.TryGetProperty("isBold", out var bp)) text.IsBold = bp.GetBoolean();
            if (root.TryGetProperty("isItalic", out var ip)) text.IsItalic = ip.GetBoolean();
            if (root.TryGetProperty("isUnderline", out var up)) text.IsUnderline = up.GetBoolean();
            if (root.TryGetProperty("isStrikethrough", out var sp)) text.IsStrikethrough = sp.GetBoolean();

            switch (element)
            {
                case TextElement plainText when root.TryGetProperty("text", out var tp):
                    plainText.Text = tp.GetString() ?? "";
                    break;
                case RichTextElement richText when root.TryGetProperty("html", out var htmlProperty):
                    richText.Html = htmlProperty.GetString() ?? "";
                    break;
                case RichTextElement richText when root.TryGetProperty("text", out var richTextProperty):
                    richText.Html = $"<p>{WebUtility.HtmlEncode(richTextProperty.GetString() ?? "")}</p>";
                    break;
                case MarkdownElement markdown when root.TryGetProperty("markdown", out var mp):
                    markdown.Markdown = mp.GetString() ?? "";
                    break;
                case MarkdownElement markdown when root.TryGetProperty("text", out var markdownTextProperty):
                    markdown.Markdown = markdownTextProperty.GetString() ?? "";
                    break;
            }
        }
        else if (element is IconElement icon)
        {
            if (root.TryGetProperty("iconName", out var inp)) icon.IconName = inp.GetString() ?? icon.IconName;
            if (root.TryGetProperty("color", out var cp)) icon.Color = cp.GetString() ?? icon.Color;
        }

        events.Add(new DiagramAssistantEvent { Type = EventType.ElementUpdated, Content = JsonSerializer.Serialize(element, OrimJsonOptions.Default) });
        return ($"Element updated: {element.Id}", events);
    }

    private static (string, List<DiagramAssistantEvent>) ExecuteRemoveElement(string argsJson, Board board, List<DiagramAssistantEvent> events)
    {
        using var doc = JsonDocument.Parse(argsJson);
        var root = doc.RootElement;
        var elementId = Guid.Parse(root.GetProperty("elementId").GetString()!);
        var removeConnected = !root.TryGetProperty("removeConnectedArrows", out var rp) || rp.GetBoolean();
        var target = board.Elements.FirstOrDefault(e => e.Id == elementId);
        if (target is null) return ("Error: Element not found.", events);

        var removedCount = 0;
        if (target is not ArrowElement && removeConnected)
            removedCount += board.Elements.RemoveAll(e => e is ArrowElement a && (a.SourceElementId == elementId || a.TargetElementId == elementId));
        if (board.Elements.Remove(target)) removedCount++;

        events.Add(new DiagramAssistantEvent { Type = EventType.ElementRemoved, Content = $"Removed {removedCount} element(s)." });
        return ($"Removed {removedCount} element(s).", events);
    }

    private static (string, List<DiagramAssistantEvent>) ExecuteAddIcon(string argsJson, Board board, List<DiagramAssistantEvent> events)
    {
        using var doc = JsonDocument.Parse(argsJson);
        var root = doc.RootElement;
        var icon = new IconElement
        {
            IconName = root.GetProperty("iconName").GetString() ?? "mdi-star",
            X = root.GetProperty("x").GetDouble(),
            Y = root.GetProperty("y").GetDouble(),
            Width = root.TryGetProperty("width", out var wp) ? wp.GetDouble() : 48,
            Height = root.TryGetProperty("height", out var hp) ? hp.GetDouble() : 48,
            Color = root.TryGetProperty("color", out var cp) ? cp.GetString() ?? "#0f172a" : "#0f172a",
            Label = root.TryGetProperty("label", out var lp) ? lp.GetString() ?? "" : "",
            ZIndex = board.Elements.Count
        };
        board.Elements.Add(icon);
        events.Add(new DiagramAssistantEvent { Type = EventType.ElementAdded, Content = JsonSerializer.Serialize(icon, OrimJsonOptions.Default) });
        return ($"Icon created with ID: {icon.Id}", events);
    }

    private static (string, List<DiagramAssistantEvent>) ExecuteClearBoard(string argsJson, Board board, List<DiagramAssistantEvent> events)
    {
        using var doc = JsonDocument.Parse(argsJson);
        var root = doc.RootElement;
        var confirm = root.TryGetProperty("confirm", out var cp) && cp.GetBoolean();
        if (!confirm) return ("Clear board was not confirmed.", events);

        board.Elements.Clear();
        events.Add(new DiagramAssistantEvent { Type = EventType.BoardCleared, Content = "All elements removed." });
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
