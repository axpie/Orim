import { create } from 'zustand';
import type {
  Board,
  BoardComment,
  BoardElement,
  BoardOperation,
  CursorPresence,
} from '../../../types/models';
import type {
  BoardCommandConflict,
  BoardCommandExecution,
} from '../realtime/localBoardCommands';
import { applyBoardOperation, createElementUpdatedOperation } from '../realtime/boardOperations';

export type ToolType = 'select' | 'hand' | 'rectangle' | 'ellipse' | 'triangle' | 'rhombus' | 'text' | 'sticky' | 'frame' | 'icon' | 'arrow' | 'image' | 'drawing';

interface ViewportInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface SetBoardOptions {
  preserveSelection?: boolean;
  resetTool?: boolean;
}

export interface ApplyLocalCommandResult {
  success: boolean;
  operations: BoardOperation[];
  conflict?: BoardCommandConflict;
}

interface BoardState {
  board: Board | null;
  /** Cached O(1) element lookup map; rebuilt whenever elements change. */
  _elementsMap: Map<string, BoardElement>;
  selectedElementIds: string[];
  activeTool: ToolType;
  zoom: number;
  cameraX: number;
  cameraY: number;
  viewportWidth: number;
  viewportHeight: number;
  viewportInsets: ViewportInsets;
  remoteCursors: CursorPresence[];
  isDirty: boolean;
  pendingIconName: string | null;
  pendingStickyNotePresetId: string | null;
  commandConflict: BoardCommandConflict | null;
  followingClientId: string | null;

  getElementById: (id: string) => BoardElement | undefined;
  setBoard: (board: Board | null, options?: SetBoardOptions) => void;
  setBoardTitle: (title: string) => void;
  updateBoard: (updater: ((board: Board) => Board) | Partial<Board>) => void;
  setElements: (elements: BoardElement[]) => void;
  addElement: (element: BoardElement) => void;
  updateElement: (id: string, updater: ((el: BoardElement) => BoardElement) | Partial<BoardElement>) => void;
  removeElements: (ids: string[]) => void;
  setComments: (comments: BoardComment[]) => void;
  upsertComment: (comment: BoardComment) => void;
  removeComment: (commentId: string) => void;
  applyLocalCommand: (execution: BoardCommandExecution) => ApplyLocalCommandResult;
  applyRemoteOperation: (operation: BoardOperation) => void;
  clearCommandConflict: () => void;
  setSelectedElementIds: (ids: string[]) => void;
  setActiveTool: (tool: ToolType) => void;
  setZoom: (zoom: number) => void;
  setCamera: (x: number, y: number) => void;
  setViewportSize: (width: number, height: number) => void;
  setViewportInsets: (insets: ViewportInsets) => void;
  setRemoteCursors: (cursors: CursorPresence[]) => void;
  setDirty: (dirty: boolean) => void;
  setPendingIconName: (iconName: string | null) => void;
  setPendingStickyNotePresetId: (presetId: string | null) => void;
  setFollowingClientId: (clientId: string | null) => void;
}

function areValuesEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => Object.is(value, right[index]));
  }

  return Object.is(left, right);
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return [...value] as T;
  }

  return value;
}

function areStringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function getChangedElementKeys(left: BoardElement, right: BoardElement): string[] {
  const leftRecord = left as unknown as Record<string, unknown>;
  const rightRecord = right as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
  keys.delete('id');

  return [...keys].filter((key) => !areValuesEqual(leftRecord[key], rightRecord[key]));
}

function createCommandConflict(
  direction: 'undo' | 'redo',
  reason: BoardCommandConflict['reason'],
  elementIds: string[],
): BoardCommandConflict {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    direction,
    reason,
    elementIds: [...new Set(elementIds)],
  };
}

function findUpdatedOperation(
  operations: BoardOperation[],
  elementId: string,
): Extract<BoardOperation, { type: 'element.updated' }> | null {
  return operations.find(
    (operation): operation is Extract<BoardOperation, { type: 'element.updated' }> =>
      operation.type === 'element.updated' && operation.element.id === elementId,
  ) ?? null;
}

function findAddedOperation(
  operations: BoardOperation[],
  elementId: string,
): Extract<BoardOperation, { type: 'element.added' }> | null {
  return operations.find(
    (operation): operation is Extract<BoardOperation, { type: 'element.added' }> =>
      operation.type === 'element.added' && operation.element.id === elementId,
  ) ?? null;
}

function doElementKeysMatch(
  currentElement: BoardElement,
  expectedElement: BoardElement,
  keys: readonly string[],
): boolean {
  const currentRecord = currentElement as unknown as Record<string, unknown>;
  const expectedRecord = expectedElement as unknown as Record<string, unknown>;
  return keys.every((key) => areValuesEqual(currentRecord[key], expectedRecord[key]));
}

function resolveTrackedKeys(
  execution: BoardCommandExecution,
  elementId: string,
  currentElement: BoardElement,
  nextElement: BoardElement,
): string[] {
  const trackedKeys = execution.changedKeysByElementId[elementId];
  if (trackedKeys && trackedKeys.length > 0) {
    return trackedKeys;
  }

  const counterpart = findUpdatedOperation(execution.counterpartOperations, elementId);
  if (counterpart) {
    return getChangedElementKeys(counterpart.element, nextElement);
  }

  return getChangedElementKeys(currentElement, nextElement);
}

function buildElementsMap(elements: BoardElement[]): Map<string, BoardElement> {
  return new Map(elements.map((element) => [element.id, element]));
}

function validateLocalCommand(elementsById: Map<string, BoardElement>, execution: BoardCommandExecution): BoardCommandConflict | null {

  for (const operation of execution.operations) {
    switch (operation.type) {
      case 'element.added':
        if (elementsById.has(operation.element.id)) {
          return createCommandConflict(execution.direction, 'element-exists', [operation.element.id]);
        }
        break;
      case 'element.updated': {
        const current = elementsById.get(operation.element.id);
        if (!current) {
          return createCommandConflict(execution.direction, 'element-missing', [operation.element.id]);
        }

        if (current.$type !== operation.element.$type) {
          return createCommandConflict(execution.direction, 'element-type-mismatch', [operation.element.id]);
        }

        const counterpart = findUpdatedOperation(execution.counterpartOperations, operation.element.id);
        if (counterpart) {
          const trackedKeys = resolveTrackedKeys(execution, operation.element.id, counterpart.element, operation.element);
          if (trackedKeys.length > 0 && !doElementKeysMatch(current, counterpart.element, trackedKeys)) {
            return createCommandConflict(execution.direction, 'element-changed', [operation.element.id]);
          }
        }
        break;
      }
      case 'element.deleted': {
        const current = elementsById.get(operation.elementId);
        if (!current) {
          return createCommandConflict(execution.direction, 'element-missing', [operation.elementId]);
        }

        const counterpart = findAddedOperation(execution.counterpartOperations, operation.elementId);
        if (counterpart && getChangedElementKeys(current, counterpart.element).length > 0) {
          return createCommandConflict(execution.direction, 'element-changed', [operation.elementId]);
        }
        break;
      }
      case 'elements.deleted': {
        const missingIds = operation.elementIds.filter((elementId) => !elementsById.has(elementId));
        if (missingIds.length > 0) {
          return createCommandConflict(execution.direction, 'element-missing', missingIds);
        }

        const changedIds = operation.elementIds.filter((elementId) => {
          const current = elementsById.get(elementId);
          const counterpart = findAddedOperation(execution.counterpartOperations, elementId);
          return !!current && !!counterpart && getChangedElementKeys(current, counterpart.element).length > 0;
        });

        if (changedIds.length > 0) {
          return createCommandConflict(execution.direction, 'element-changed', changedIds);
        }
        break;
      }
      case 'board.metadata.updated':
        break;
      default:
        break;
    }
  }

  return null;
}

export const useBoardStore = create<BoardState>((set, get) => ({
  board: null,
  _elementsMap: new Map(),
  selectedElementIds: [],
  activeTool: 'select',
  zoom: 1,
  cameraX: 0,
  cameraY: 0,
  viewportWidth: 800,
  viewportHeight: 600,
  viewportInsets: { top: 0, right: 0, bottom: 0, left: 0 },
  remoteCursors: [],
  isDirty: false,
  pendingIconName: 'mdi-star',
  pendingStickyNotePresetId: null,
  commandConflict: null,
  followingClientId: null,

  getElementById: (id) => get()._elementsMap.get(id),

  setBoard: (board, options) =>
    set((state) => {
      if (!board) {
        return {
          board: null,
          _elementsMap: new Map(),
          isDirty: false,
          selectedElementIds: [],
          activeTool: options?.resetTool ? 'select' : state.activeTool,
          commandConflict: null,
        };
      }

      const elementsMap = buildElementsMap(board.elements);
      const preserveSelection = options?.preserveSelection ?? state.board?.id === board.id;

      return {
        board,
        _elementsMap: elementsMap,
        isDirty: false,
        selectedElementIds: preserveSelection
          ? state.selectedElementIds.filter((id) => elementsMap.has(id))
          : [],
        activeTool: options?.resetTool ? 'select' : state.activeTool,
        commandConflict: null,
      };
    }),

  setBoardTitle: (title) =>
    set((state) => {
      if (!state.board || state.board.title === title) {
        return state;
      }

      return {
        board: {
          ...state.board,
          title,
        },
      };
    }),

  updateBoard: (updater) =>
    set((state) => {
      if (!state.board) return state;

      const nextBoard = typeof updater === 'function'
        ? updater(state.board)
        : { ...state.board, ...updater };

      return {
        board: nextBoard,
        _elementsMap: nextBoard.elements !== state.board.elements
          ? buildElementsMap(nextBoard.elements)
          : state._elementsMap,
        isDirty: true,
      };
    }),

  setElements: (elements) =>
    set((state) => {
      if (!state.board) return state;
      return {
        board: { ...state.board, elements },
        _elementsMap: buildElementsMap(elements),
        isDirty: true,
      };
    }),

  addElement: (element) =>
    set((state) => {
      if (!state.board) return state;
      const newMap = new Map(state._elementsMap);
      newMap.set(element.id, element);
      return {
        board: { ...state.board, elements: [...state.board.elements, element] },
        _elementsMap: newMap,
        isDirty: true,
      };
    }),

  updateElement: (id, updater) =>
    set((state) => {
      if (!state.board) return state;
      const existing = state._elementsMap.get(id);
      if (!existing) return state;

      const updated = (typeof updater === 'function'
        ? updater(existing)
        : { ...existing, ...updater }) as BoardElement;

      if (updated === existing) return state;

      const newMap = new Map(state._elementsMap);
      newMap.set(id, updated);
      return {
        board: {
          ...state.board,
          elements: state.board.elements.map((el) => el.id === id ? updated : el),
        },
        _elementsMap: newMap,
        isDirty: true,
      };
    }),

  removeElements: (ids) =>
    set((state) => {
      if (!state.board) return state;
      const idSet = new Set(ids);
      const newMap = new Map(state._elementsMap);
      for (const id of ids) newMap.delete(id);
      return {
        board: {
          ...state.board,
          elements: state.board.elements.filter((el: BoardElement) => !idSet.has(el.id)),
        },
        _elementsMap: newMap,
        selectedElementIds: state.selectedElementIds.filter((sid) => !idSet.has(sid)),
        isDirty: true,
      };
    }),

  setComments: (comments) =>
    set((state) => {
      if (!state.board) {
        return state;
      }

      return {
        board: {
          ...state.board,
          comments: [...comments],
        },
      };
    }),

  upsertComment: (comment) =>
    set((state) => {
      if (!state.board) {
        return state;
      }

      const existingComments = state.board.comments ?? [];
      const nextComments = existingComments.some((entry) => entry.id === comment.id)
        ? existingComments.map((entry) => (entry.id === comment.id ? comment : entry))
        : [...existingComments, comment];

      return {
        board: {
          ...state.board,
          comments: nextComments,
        },
      };
    }),

  removeComment: (commentId) =>
    set((state) => {
      if (!state.board) {
        return state;
      }

      return {
        board: {
          ...state.board,
          comments: (state.board.comments ?? []).filter((comment) => comment.id !== commentId),
        },
      };
    }),

  applyLocalCommand: (execution) => {
    const state = get();
    const currentBoard = state.board;
    if (!currentBoard) {
      return { success: false, operations: [] };
    }

    const conflict = validateLocalCommand(state._elementsMap, execution);
    if (conflict) {
      set({ commandConflict: conflict });
      return { success: false, operations: [], conflict };
    }

    let nextBoard = currentBoard;
    const appliedOperations: BoardOperation[] = [];

    for (const operation of execution.operations) {
      switch (operation.type) {
        case 'element.updated': {
          const currentElement = nextBoard.elements.find((element) => element.id === operation.element.id);
          if (!currentElement) {
            continue;
          }

          const trackedKeys = resolveTrackedKeys(execution, operation.element.id, currentElement, operation.element);
          const nextElement = trackedKeys.reduce<BoardElement>((element, key) => {
            const nextValue = (operation.element as unknown as Record<string, unknown>)[key];
            return {
              ...element,
              [key]: cloneValue(nextValue),
            } as BoardElement;
          }, currentElement);

          if (trackedKeys.length === 0 || doElementKeysMatch(currentElement, nextElement, trackedKeys)) {
            continue;
          }

          const updateOperation = createElementUpdatedOperation(nextElement);
          nextBoard = applyBoardOperation(nextBoard, updateOperation);
          appliedOperations.push(updateOperation);
          break;
        }
        default:
          nextBoard = applyBoardOperation(nextBoard, operation);
          appliedOperations.push(structuredClone(operation));
          break;
      }
    }

    if (appliedOperations.length > 0) {
      const nextMap = buildElementsMap(nextBoard.elements);
      set((state) => ({
        board: nextBoard,
        _elementsMap: nextMap,
        selectedElementIds: state.selectedElementIds.filter((id) => nextMap.has(id)),
        isDirty: true,
        commandConflict: null,
      }));
    } else {
      set({ commandConflict: null });
    }

    return {
      success: true,
      operations: appliedOperations,
    };
  },

  applyRemoteOperation: (operation) =>
    set((state) => {
      if (!state.board) {
        return state;
      }

      const nextBoard = applyBoardOperation(state.board, operation);
      const nextMap = buildElementsMap(nextBoard.elements);

      return {
        board: nextBoard,
        _elementsMap: nextMap,
        selectedElementIds: state.selectedElementIds.filter((id) => nextMap.has(id)),
      };
    }),

  clearCommandConflict: () => set({ commandConflict: null }),
  setSelectedElementIds: (ids) =>
    set((state) => (
      areStringArraysEqual(state.selectedElementIds, ids)
        ? state
        : { selectedElementIds: [...ids] }
    )),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setZoom: (zoom) => set({ zoom: Math.max(0.2, Math.min(3.5, zoom)) }),
  setCamera: (x, y) => set({ cameraX: x, cameraY: y }),
  setViewportSize: (width, height) => set({ viewportWidth: width, viewportHeight: height }),
  setViewportInsets: (viewportInsets) => set({ viewportInsets }),
  setRemoteCursors: (cursors) => set({ remoteCursors: cursors }),
  setDirty: (dirty) => set({ isDirty: dirty }),
  setPendingIconName: (iconName) => set({ pendingIconName: iconName }),
  setPendingStickyNotePresetId: (presetId) => set({ pendingStickyNotePresetId: presetId }),
  setFollowingClientId: (clientId) => set({ followingClientId: clientId }),
}));
