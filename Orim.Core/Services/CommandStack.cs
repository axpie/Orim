using System.Text.Json;
using Orim.Core.Models;

namespace Orim.Core.Services;

public interface IBoardCommand
{
    void Execute(Board board);
    void Undo(Board board);
}


public class RemoveElementCommand : IBoardCommand
{
    private readonly Guid _elementId;
    private List<BoardElement> _removed = [];
    public RemoveElementCommand(Guid elementId) => _elementId = elementId;
    public void Execute(Board board)
    {
        _removed = board.Elements
            .Where(e => e.Id == _elementId ||
                        (e is ArrowElement arrow &&
                         (arrow.SourceElementId == _elementId || arrow.TargetElementId == _elementId)))
            .ToList();

        if (_removed.Count == 0)
        {
            return;
        }

        var removedIds = _removed.Select(element => element.Id).ToHashSet();
        board.Elements.RemoveAll(e => removedIds.Contains(e.Id));
    }
    public void Undo(Board board)
    {
        if (_removed.Count == 0)
        {
            return;
        }

        board.Elements.AddRange(_removed);
    }
}

public class BoardSnapshotCommand : IBoardCommand
{
    private readonly string _beforeSnapshotJson;
    private readonly string _afterSnapshotJson;

    public BoardSnapshotCommand(string beforeSnapshotJson, string afterSnapshotJson)
    {
        _beforeSnapshotJson = beforeSnapshotJson;
        _afterSnapshotJson = afterSnapshotJson;
    }

    public void Execute(Board board) => ApplySnapshot(board, _afterSnapshotJson);

    public void Undo(Board board) => ApplySnapshot(board, _beforeSnapshotJson);

    private static void ApplySnapshot(Board board, string snapshotJson)
    {
        var snapshot = JsonSerializer.Deserialize<Board>(snapshotJson, OrimJsonOptions.Default);
        if (snapshot is null)
        {
            return;
        }

        board.Id = snapshot.Id;
        board.Title = snapshot.Title;
        board.OwnerId = snapshot.OwnerId;
        board.Visibility = snapshot.Visibility;
        board.ShareLinkToken = snapshot.ShareLinkToken;
        board.Members = snapshot.Members;
        board.Elements = snapshot.Elements;
        board.CreatedAt = snapshot.CreatedAt;
        board.UpdatedAt = snapshot.UpdatedAt;
    }
}

public class CommandStack
{
    private readonly Stack<IBoardCommand> _undoStack = new();
    private readonly Stack<IBoardCommand> _redoStack = new();

    public void Execute(Board board, IBoardCommand command)
    {
        command.Execute(board);
        _undoStack.Push(command);
        _redoStack.Clear();
    }

    public bool CanUndo => _undoStack.Count > 0;
    public bool CanRedo => _redoStack.Count > 0;

    public void Undo(Board board)
    {
        if (!CanUndo) return;
        var cmd = _undoStack.Pop();
        cmd.Undo(board);
        _redoStack.Push(cmd);
    }

    public void Redo(Board board)
    {
        if (!CanRedo) return;
        var cmd = _redoStack.Pop();
        cmd.Execute(board);
        _undoStack.Push(cmd);
    }

    public void Clear()
    {
        _undoStack.Clear();
        _redoStack.Clear();
    }
}
