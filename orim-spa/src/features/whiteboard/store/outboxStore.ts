import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BoardOperation } from '../../../types/models';

interface OutboxEntry {
  id: string;
  boardId: string;
  operation: BoardOperation;
  queuedAt: string;
}

interface OperationOutboxState {
  entries: OutboxEntry[];
  enqueueOperations: (boardId: string, operations: BoardOperation[]) => void;
  removeEntry: (entryId: string) => void;
  clearBoardEntries: (boardId: string) => void;
  getBoardEntries: (boardId: string) => OutboxEntry[];
  countForBoard: (boardId: string) => number;
}

function createEntry(boardId: string, operation: BoardOperation): OutboxEntry {
  const entryId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return {
    id: entryId,
    boardId,
    operation,
    queuedAt: new Date().toISOString(),
  };
}

function appendOperation(entries: OutboxEntry[], boardId: string, operation: BoardOperation): OutboxEntry[] {
  if (operation.type === 'elements.deleted') {
    return operation.elementIds.reduce<OutboxEntry[]>(
      (nextEntries, elementId) => appendOperation(nextEntries, boardId, { type: 'element.deleted', elementId }),
      entries,
    );
  }

  const nextEntries = [...entries];

  switch (operation.type) {
    case 'element.updated': {
      for (let index = nextEntries.length - 1; index >= 0; index -= 1) {
        const entry = nextEntries[index];
        if (entry.boardId !== boardId) {
          continue;
        }

        if (entry.operation.type === 'element.added' && entry.operation.element.id === operation.element.id) {
          nextEntries[index] = {
            ...entry,
            operation: { type: 'element.added', element: operation.element },
            queuedAt: new Date().toISOString(),
          };
          return nextEntries;
        }

        if (entry.operation.type === 'element.updated' && entry.operation.element.id === operation.element.id) {
          nextEntries[index] = {
            ...entry,
            operation,
            queuedAt: new Date().toISOString(),
          };
          return nextEntries;
        }
      }

      nextEntries.push(createEntry(boardId, operation));
      return nextEntries;
    }
    case 'element.deleted': {
      let addedAndRemovedLocally = false;
      let existingDeleteIndex = -1;

      for (let index = nextEntries.length - 1; index >= 0; index -= 1) {
        const entry = nextEntries[index];
        if (entry.boardId !== boardId) {
          continue;
        }

        if (entry.operation.type === 'element.added' && entry.operation.element.id === operation.elementId) {
          nextEntries.splice(index, 1);
          addedAndRemovedLocally = true;
          continue;
        }

        if (entry.operation.type === 'element.updated' && entry.operation.element.id === operation.elementId) {
          nextEntries.splice(index, 1);
          continue;
        }

        if (entry.operation.type === 'element.deleted' && entry.operation.elementId === operation.elementId) {
          existingDeleteIndex = index;
        }
      }

      if (addedAndRemovedLocally || existingDeleteIndex >= 0) {
        return nextEntries;
      }

      nextEntries.push(createEntry(boardId, operation));
      return nextEntries;
    }
    case 'board.metadata.updated': {
      const filteredEntries = nextEntries.filter((entry) => entry.boardId !== boardId || entry.operation.type !== 'board.metadata.updated');
      filteredEntries.push(createEntry(boardId, operation));
      return filteredEntries;
    }
    case 'element.added':
    default:
      nextEntries.push(createEntry(boardId, operation));
      return nextEntries;
  }
}

export const useOperationOutboxStore = create<OperationOutboxState>()(
  persist(
    (set, get) => ({
      entries: [],

      enqueueOperations: (boardId, operations) =>
        set((state) => ({
          entries: operations.reduce(
            (nextEntries, operation) => appendOperation(nextEntries, boardId, operation),
            state.entries,
          ),
        })),

      removeEntry: (entryId) =>
        set((state) => ({
          entries: state.entries.filter((entry) => entry.id !== entryId),
        })),

      clearBoardEntries: (boardId) =>
        set((state) => ({
          entries: state.entries.filter((entry) => entry.boardId !== boardId),
        })),

      getBoardEntries: (boardId) => get().entries.filter((entry) => entry.boardId === boardId),

      countForBoard: (boardId) => get().entries.filter((entry) => entry.boardId === boardId).length,
    }),
    {
      name: 'orim-board-operation-outbox',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ entries: state.entries }),
    },
  ),
);
