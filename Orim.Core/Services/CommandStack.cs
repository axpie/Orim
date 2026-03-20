using Orim.Core.Models;

namespace Orim.Core.Services;

public interface IBoardCommand
{
    void Execute(Board board);
    void Undo(Board board);
}

public class AddElementCommand : IBoardCommand
{
    private readonly BoardElement _element;
    public AddElementCommand(BoardElement element) => _element = element;
    public void Execute(Board board) => board.Elements.Add(_element);
    public void Undo(Board board) => board.Elements.RemoveAll(e => e.Id == _element.Id);
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

public class MoveElementCommand : IBoardCommand
{
    private readonly Guid _elementId;
    private readonly double _newX, _newY;
    private double _oldX, _oldY;

    public MoveElementCommand(Guid elementId, double newX, double newY)
    {
        _elementId = elementId;
        _newX = newX;
        _newY = newY;
    }

    public void Execute(Board board)
    {
        var el = board.Elements.FirstOrDefault(e => e.Id == _elementId);
        if (el is null) return;
        _oldX = el.X;
        _oldY = el.Y;
        el.X = _newX;
        el.Y = _newY;
    }

    public void Undo(Board board)
    {
        var el = board.Elements.FirstOrDefault(e => e.Id == _elementId);
        if (el is null) return;
        el.X = _oldX;
        el.Y = _oldY;
    }
}

public class ResizeElementCommand : IBoardCommand
{
    private readonly Guid _elementId;
    private readonly double _newX, _newY, _newW, _newH;
    private double _oldX, _oldY, _oldW, _oldH;

    public ResizeElementCommand(Guid elementId, double newX, double newY, double newW, double newH)
    {
        _elementId = elementId;
        _newX = newX;
        _newY = newY;
        _newW = newW;
        _newH = newH;
    }

    public void Execute(Board board)
    {
        var el = board.Elements.FirstOrDefault(e => e.Id == _elementId);
        if (el is null) return;
        _oldX = el.X; _oldY = el.Y; _oldW = el.Width; _oldH = el.Height;
        el.X = _newX; el.Y = _newY; el.Width = _newW; el.Height = _newH;
    }

    public void Undo(Board board)
    {
        var el = board.Elements.FirstOrDefault(e => e.Id == _elementId);
        if (el is null) return;
        el.X = _oldX; el.Y = _oldY; el.Width = _oldW; el.Height = _oldH;
    }
}

public class UpdateElementCommand : IBoardCommand
{
    private readonly BoardElement _newState;
    private BoardElement? _oldState;

    public UpdateElementCommand(BoardElement newState) => _newState = newState;

    public void Execute(Board board)
    {
        var idx = board.Elements.FindIndex(e => e.Id == _newState.Id);
        if (idx < 0) return;
        _oldState = board.Elements[idx];
        board.Elements[idx] = _newState;
    }

    public void Undo(Board board)
    {
        if (_oldState is null) return;
        var idx = board.Elements.FindIndex(e => e.Id == _newState.Id);
        if (idx >= 0)
            board.Elements[idx] = _oldState;
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
