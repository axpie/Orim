import { create } from 'zustand';
import type { BoardCommandExecution, LocalBoardCommand } from '../realtime/localBoardCommands';

interface CommandStackState {
  undoStack: LocalBoardCommand[];
  redoStack: LocalBoardCommand[];
  canUndo: boolean;
  canRedo: boolean;
  push: (command: LocalBoardCommand) => void;
  peekUndo: () => BoardCommandExecution | null;
  commitUndo: () => void;
  peekRedo: () => BoardCommandExecution | null;
  commitRedo: () => void;
  clear: () => void;
}

const MAX_UNDO = 50;

export const useCommandStack = create<CommandStackState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  canUndo: false,
  canRedo: false,

  push: (command) => {
    if (command.forward.length === 0 && command.inverse.length === 0) {
      return;
    }

    const nextCommand = structuredClone(command);

    set((state) => {
      const nextUndo = [...state.undoStack, nextCommand];
      if (nextUndo.length > MAX_UNDO) {
        nextUndo.shift();
      }

      return {
        undoStack: nextUndo,
        redoStack: [],
        canUndo: nextUndo.length > 0,
        canRedo: false,
      };
    });
  },

  peekUndo: () => {
    const { undoStack } = get();
    if (undoStack.length === 0) {
      return null;
    }

    const command = undoStack[undoStack.length - 1];
    return {
      direction: 'undo',
      operations: structuredClone(command.inverse),
      counterpartOperations: structuredClone(command.forward),
      changedKeysByElementId: structuredClone(command.changedKeysByElementId ?? {}),
    };
  },

  commitUndo: () =>
    set((state) => {
      if (state.undoStack.length === 0) {
        return state;
      }

      const command = state.undoStack[state.undoStack.length - 1];
      const nextUndo = state.undoStack.slice(0, -1);
      const nextRedo = [...state.redoStack, structuredClone(command)];

      return {
        undoStack: nextUndo,
        redoStack: nextRedo,
        canUndo: nextUndo.length > 0,
        canRedo: nextRedo.length > 0,
      };
    }),

  peekRedo: () => {
    const { redoStack } = get();
    if (redoStack.length === 0) {
      return null;
    }

    const command = redoStack[redoStack.length - 1];
    return {
      direction: 'redo',
      operations: structuredClone(command.forward),
      counterpartOperations: structuredClone(command.inverse),
      changedKeysByElementId: structuredClone(command.changedKeysByElementId ?? {}),
    };
  },

  commitRedo: () =>
    set((state) => {
      if (state.redoStack.length === 0) {
        return state;
      }

      const command = state.redoStack[state.redoStack.length - 1];
      const nextUndo = [...state.undoStack, structuredClone(command)];
      const nextRedo = state.redoStack.slice(0, -1);

      return {
        undoStack: nextUndo,
        redoStack: nextRedo,
        canUndo: nextUndo.length > 0,
        canRedo: nextRedo.length > 0,
      };
    }),

  clear: () => set({ undoStack: [], redoStack: [], canUndo: false, canRedo: false }),
}));
