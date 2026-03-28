using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Orim.Core.Models;

namespace Orim.Web.Components;

public partial class WhiteboardCanvas
{
    private BoardElement? GetInlineEditingElement()
    {
        if (_editingElementId is not Guid elementId || Board is null)
        {
            return null;
        }

        return Board.Elements.FirstOrDefault(element => element.Id == elementId);
    }

    public Task BeginInlineTextEditingAsync()
    {
        var editableElement = ResolveInlineEditableElement(SelectedElement);
        if (editableElement is null)
        {
            return Task.CompletedTask;
        }

        _editingElementId = editableElement.Id;
        _editingElementUsesLabel = editableElement is not TextElement;
        _inlineEditorText = editableElement is TextElement text ? text.Text : editableElement.Label;
        _focusInlineEditor = true;
        StateHasChanged();
        return Task.CompletedTask;
    }

    private static BoardElement? ResolveInlineEditableElement(BoardElement? element) =>
        element is ShapeElement or TextElement ? element : null;

    private void HandleInlineEditorInput(ChangeEventArgs args)
    {
        _inlineEditorText = args.Value?.ToString() ?? string.Empty;
    }

    private async Task HandleInlineEditorKeyDown(KeyboardEventArgs args)
    {
        if (args.Key == "Escape")
        {
            CancelInlineTextEdit();
            return;
        }

        if (args.Key == "Enter" && !args.ShiftKey)
        {
            await CommitInlineTextEditAsync();
        }
    }

    private void CancelInlineTextEdit()
    {
        _editingElementId = null;
        _editingElementUsesLabel = false;
        _inlineEditorText = string.Empty;
        StateHasChanged();
    }

    private async Task CommitInlineTextEditAsync()
    {
        var editableElement = GetInlineEditingElement();
        if (editableElement is null)
        {
            CancelInlineTextEdit();
            return;
        }

        var nextValue = _inlineEditorText.TrimEnd();
        if (_editingElementUsesLabel)
        {
            editableElement.Label = nextValue;
        }
        else if (editableElement is TextElement text)
        {
            text.Text = nextValue;
        }

        _editingElementId = null;
        _editingElementUsesLabel = false;
        _inlineEditorText = string.Empty;
        await OnBoardChanged.InvokeAsync();
        StateHasChanged();
    }

    private string GetInlineEditorStyle(BoardElement element)
    {
        var topLeft = WorldToScreen(new Point(element.X, element.Y));
        var width = Math.Max(element.Width * _zoom, element is TextElement ? 180 : 140);
        var height = Math.Max(element.Height * _zoom, element is TextElement text ? Math.Max(text.FontSize * _zoom * 2, 52) : 52);
        var fontSize = element is TextElement textElement
            ? Math.Max(textElement.FontSize * _zoom, 14)
            : Math.Max(GetResolvedLabelFontSize(element) * _zoom, 14);
        var fontWeight = element is TextElement boldText && boldText.IsBold ? "700" : "500";
        var fontStyle = element is TextElement italicText && italicText.IsItalic ? "italic" : "normal";
        var color = element switch
        {
            TextElement textColorElement => textColorElement.Color,
            ShapeElement shape => shape.StrokeColor,
            _ => GetDefaultStrokeColor()
        };

        return $"position:absolute; left:{Px(topLeft.X)}; top:{Px(topLeft.Y)}; width:{Px(width)}; min-height:{Px(height)}; padding:12px 14px; resize:none; overflow:hidden; border:2px solid {GetSelectionColor()}; border-radius:12px; outline:none; background:color-mix(in srgb, {GetBoardSurfaceColor()} 94%, white); color:{color}; font-size:{Px(fontSize)}; font-weight:{fontWeight}; font-style:{fontStyle}; line-height:1.2; box-sizing:border-box; z-index:40; box-shadow:0 18px 48px rgba(15, 23, 42, 0.18);";
    }
}