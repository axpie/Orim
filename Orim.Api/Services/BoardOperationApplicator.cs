using Orim.Api.Contracts;
using Orim.Core.Models;

namespace Orim.Api.Services;

internal static class BoardOperationApplicator
{
    internal static void Apply(Board board, IReadOnlyList<BoardOperationDto> operations)
    {
        ArgumentNullException.ThrowIfNull(board);
        ArgumentNullException.ThrowIfNull(operations);

        foreach (var operation in operations)
        {
            Apply(board, operation);
        }
    }

    internal static void Apply(Board board, BoardOperationDto operation)
    {
        ArgumentNullException.ThrowIfNull(board);
        ArgumentNullException.ThrowIfNull(operation);

        switch (operation)
        {
            case BoardElementAddedOperationDto added:
                ApplyElementAdded(board, added);
                break;
            case BoardElementUpdatedOperationDto updated:
                ApplyElementUpdated(board, updated);
                break;
            case BoardElementDeletedOperationDto deleted:
                if (Guid.TryParse(deleted.ElementId, out var deletedId))
                {
                    board.Elements.RemoveAll(element => element.Id == deletedId);
                }
                break;
            case BoardElementsDeletedOperationDto deletedMany:
            {
                var deletedIds = deletedMany.ElementIds
                    .Select(static id => Guid.TryParse(id, out var parsedId) ? parsedId : (Guid?)null)
                    .Where(static id => id.HasValue)
                    .Select(static id => id!.Value)
                    .ToHashSet();
                board.Elements.RemoveAll(element => deletedIds.Contains(element.Id));
                break;
            }
            case BoardMetadataUpdatedOperationDto metadata:
                ApplyMetadata(board, metadata);
                break;
        }
    }

    private static void ApplyElementAdded(Board board, BoardElementAddedOperationDto operation)
    {
        var existingIndex = board.Elements.FindIndex(element => element.Id == operation.Element.Id);
        if (existingIndex >= 0)
        {
            board.Elements[existingIndex] = operation.Element;
            BoardStylePresetState.RememberStyle(board, operation.Element);
            return;
        }

        board.Elements.Add(operation.Element);
        BoardStylePresetState.RememberStyle(board, operation.Element);
    }

    private static void ApplyElementUpdated(Board board, BoardElementUpdatedOperationDto operation)
    {
        var existingIndex = board.Elements.FindIndex(element => element.Id == operation.Element.Id);
        if (existingIndex >= 0)
        {
            board.Elements[existingIndex] = operation.Element;
            BoardStylePresetState.RememberStyle(board, operation.Element);
        }
    }

    private static void ApplyMetadata(Board board, BoardMetadataUpdatedOperationDto operation)
    {
        if (!string.IsNullOrWhiteSpace(operation.Title))
        {
            board.Title = operation.Title.Trim();
        }

        if (operation.LabelOutlineEnabled.HasValue)
        {
            board.LabelOutlineEnabled = operation.LabelOutlineEnabled.Value;
        }

        if (operation.ArrowOutlineEnabled.HasValue)
        {
            board.ArrowOutlineEnabled = operation.ArrowOutlineEnabled.Value;
        }

        if (operation.GridStyle is not null)
        {
            board.GridStyle = operation.GridStyle is "lines" or "dots" or "none"
                ? operation.GridStyle
                : null;
        }

        board.SurfaceColor = operation.SurfaceColor;
        board.ThemeKey = operation.ThemeKey;
        if (operation.EnabledIconGroups is not null)
        {
            board.EnabledIconGroups = Board.NormalizeEnabledIconGroups(operation.EnabledIconGroups);
        }

        if (operation.CustomColors is not null)
        {
            board.CustomColors = operation.CustomColors.ToList();
        }

        if (operation.RecentColors is not null)
        {
            board.RecentColors = operation.RecentColors.ToList();
        }

        if (operation.StickyNotePresets is not null)
        {
            board.StickyNotePresets = operation.StickyNotePresets.ToList();
        }

        if (operation.StylePresetState is not null)
        {
            board.StylePresetState = BoardStylePresetState.Clone(operation.StylePresetState);
        }
    }
}
