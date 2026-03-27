using Orim.Core.Models;
using Orim.Core.Services;

namespace Orim.Tests.Core.Services;

public class CommandStackTests
{
    private Board CreateTestBoard() => new()
    {
        Title = "Test",
        Elements =
        [
            new ShapeElement { Label = "Shape1" },
            new ShapeElement { Label = "Shape2" },
            new TextElement { Text = "Text1" }
        ]
    };

    #region CommandStack

    [Fact]
    public void NewStack_CannotUndoOrRedo()
    {
        var stack = new CommandStack();

        Assert.False(stack.CanUndo);
        Assert.False(stack.CanRedo);
    }

    [Fact]
    public void Execute_CommandCanBeUndone()
    {
        var stack = new CommandStack();
        var board = CreateTestBoard();
        var elementId = board.Elements[0].Id;

        stack.Execute(board, new RemoveElementCommand(elementId));

        Assert.True(stack.CanUndo);
        Assert.Equal(2, board.Elements.Count);
    }

    [Fact]
    public void Undo_RestoresState()
    {
        var stack = new CommandStack();
        var board = CreateTestBoard();
        var elementId = board.Elements[0].Id;

        stack.Execute(board, new RemoveElementCommand(elementId));
        stack.Undo(board);

        Assert.Equal(3, board.Elements.Count);
        Assert.True(stack.CanRedo);
        Assert.False(stack.CanUndo);
    }

    [Fact]
    public void Redo_ReappliesCommand()
    {
        var stack = new CommandStack();
        var board = CreateTestBoard();
        var elementId = board.Elements[0].Id;

        stack.Execute(board, new RemoveElementCommand(elementId));
        stack.Undo(board);
        stack.Redo(board);

        Assert.Equal(2, board.Elements.Count);
        Assert.True(stack.CanUndo);
        Assert.False(stack.CanRedo);
    }

    [Fact]
    public void Execute_ClearsRedoStack()
    {
        var stack = new CommandStack();
        var board = CreateTestBoard();

        stack.Execute(board, new RemoveElementCommand(board.Elements[0].Id));
        stack.Undo(board);
        Assert.True(stack.CanRedo);

        stack.Execute(board, new RemoveElementCommand(board.Elements[0].Id));
        Assert.False(stack.CanRedo);
    }

    [Fact]
    public void Undo_EmptyStack_IsNoOp()
    {
        var stack = new CommandStack();
        var board = CreateTestBoard();

        stack.Undo(board);

        Assert.Equal(3, board.Elements.Count);
    }

    [Fact]
    public void Redo_EmptyStack_IsNoOp()
    {
        var stack = new CommandStack();
        var board = CreateTestBoard();

        stack.Redo(board);

        Assert.Equal(3, board.Elements.Count);
    }

    [Fact]
    public void Execute_EnforcesMaxUndoHistory()
    {
        var stack = new CommandStack();
        var board = new Board { Title = "Test" };

        for (var i = 0; i < 60; i++)
        {
            board.Elements.Add(new ShapeElement { Label = $"el-{i}" });
        }

        for (var i = 0; i < 55; i++)
        {
            stack.Execute(board, new RemoveElementCommand(board.Elements[0].Id));
        }

        // Should be capped at 50
        var undoCount = 0;
        while (stack.CanUndo)
        {
            stack.Undo(board);
            undoCount++;
        }

        Assert.Equal(50, undoCount);
    }

    [Fact]
    public void Clear_ResetsStacks()
    {
        var stack = new CommandStack();
        var board = CreateTestBoard();

        stack.Execute(board, new RemoveElementCommand(board.Elements[0].Id));
        stack.Undo(board);

        stack.Clear();

        Assert.False(stack.CanUndo);
        Assert.False(stack.CanRedo);
    }

    #endregion

    #region RemoveElementCommand

    [Fact]
    public void RemoveElementCommand_RemovesTargetElement()
    {
        var board = CreateTestBoard();
        var target = board.Elements[0];
        var cmd = new RemoveElementCommand(target.Id);

        cmd.Execute(board);

        Assert.Equal(2, board.Elements.Count);
        Assert.DoesNotContain(board.Elements, e => e.Id == target.Id);
    }

    [Fact]
    public void RemoveElementCommand_RemovesConnectedArrows()
    {
        var shape1 = new ShapeElement { Label = "s1" };
        var shape2 = new ShapeElement { Label = "s2" };
        var arrow = new ArrowElement { SourceElementId = shape1.Id, TargetElementId = shape2.Id };
        var board = new Board { Elements = [shape1, shape2, arrow] };

        var cmd = new RemoveElementCommand(shape1.Id);
        cmd.Execute(board);

        Assert.Single(board.Elements);
        Assert.Same(shape2, board.Elements[0]);
    }

    [Fact]
    public void RemoveElementCommand_Undo_RestoresElementAndArrows()
    {
        var shape1 = new ShapeElement { Label = "s1" };
        var shape2 = new ShapeElement { Label = "s2" };
        var arrow = new ArrowElement { SourceElementId = shape1.Id, TargetElementId = shape2.Id };
        var board = new Board { Elements = [shape1, shape2, arrow] };

        var cmd = new RemoveElementCommand(shape1.Id);
        cmd.Execute(board);
        cmd.Undo(board);

        Assert.Equal(3, board.Elements.Count);
    }

    [Fact]
    public void RemoveElementCommand_NonExistentElement_IsNoOp()
    {
        var board = CreateTestBoard();
        var cmd = new RemoveElementCommand(Guid.NewGuid());

        cmd.Execute(board);

        Assert.Equal(3, board.Elements.Count);
    }

    [Fact]
    public void RemoveElementCommand_Undo_AfterNoOp_IsNoOp()
    {
        var board = CreateTestBoard();
        var cmd = new RemoveElementCommand(Guid.NewGuid());

        cmd.Execute(board);
        cmd.Undo(board);

        Assert.Equal(3, board.Elements.Count);
    }

    #endregion

    #region BoardSnapshotCommand

    [Fact]
    public void BoardSnapshotCommand_Execute_AppliesAfterSnapshot()
    {
        var board = new Board { Title = "Before" };
        var beforeJson = System.Text.Json.JsonSerializer.Serialize(board, Orim.Core.OrimJsonOptions.Default);
        board.Title = "After";
        var afterJson = System.Text.Json.JsonSerializer.Serialize(board, Orim.Core.OrimJsonOptions.Default);
        board.Title = "Before";

        var cmd = new BoardSnapshotCommand(beforeJson, afterJson);
        cmd.Execute(board);

        Assert.Equal("After", board.Title);
    }

    [Fact]
    public void BoardSnapshotCommand_Undo_AppliesBeforeSnapshot()
    {
        var board = new Board { Title = "Before" };
        var beforeJson = System.Text.Json.JsonSerializer.Serialize(board, Orim.Core.OrimJsonOptions.Default);
        board.Title = "After";
        var afterJson = System.Text.Json.JsonSerializer.Serialize(board, Orim.Core.OrimJsonOptions.Default);

        var cmd = new BoardSnapshotCommand(beforeJson, afterJson);
        cmd.Execute(board);
        cmd.Undo(board);

        Assert.Equal("Before", board.Title);
    }

    #endregion
}
