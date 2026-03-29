import { create } from 'zustand';
import type { BoardElement } from '../../../types/models';

interface SnapshotCommand {
  before: BoardElement[];
  after: BoardElement[];
}

interface CommandStackState {
  undoStack: SnapshotCommand[];
  redoStack: SnapshotCommand[];
  canUndo: boolean;
  canRedo: boolean;
  push: (before: BoardElement[], after: BoardElement[]) => void;
  undo: () => BoardElement[] | null;
  redo: () => BoardElement[] | null;
  clear: () => void;
}

const MAX_UNDO = 50;

export const useCommandStack = create<CommandStackState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  canUndo: false,
  canRedo: false,

  push: (before, after) => {
    const command: SnapshotCommand = {
      before: structuredClone(before),
      after: structuredClone(after),
    };

    set((state) => {
      const newUndo = [...state.undoStack, command];
      if (newUndo.length > MAX_UNDO) newUndo.shift();
      return {
        undoStack: newUndo,
        redoStack: [],
        canUndo: true,
        canRedo: false,
      };
    });
  },

  undo: () => {
    const { undoStack, redoStack } = get();
    if (undoStack.length === 0) return null;
    const command = undoStack[undoStack.length - 1];
    const elements = structuredClone(command.before);
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, command],
      canUndo: undoStack.length > 1,
      canRedo: true,
    });
    return elements;
  },

  redo: () => {
    const { undoStack, redoStack } = get();
    if (redoStack.length === 0) return null;
    const command = redoStack[redoStack.length - 1];
    const elements = structuredClone(command.after);
    set({
      undoStack: [...undoStack, command],
      redoStack: redoStack.slice(0, -1),
      canUndo: true,
      canRedo: redoStack.length > 1,
    });
    return elements;
  },

  clear: () =>
    set({ undoStack: [], redoStack: [], canUndo: false, canRedo: false }),
}));
