import { create } from 'zustand';
import type { Board, BoardElement, CursorPresence } from '../../../types/models';

export type ToolType = 'select' | 'hand' | 'rectangle' | 'ellipse' | 'triangle' | 'text' | 'icon' | 'arrow';

interface ViewportInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface BoardState {
  board: Board | null;
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

  setBoard: (board: Board | null) => void;
  updateBoard: (updater: ((board: Board) => Board) | Partial<Board>) => void;
  setElements: (elements: BoardElement[]) => void;
  addElement: (element: BoardElement) => void;
  updateElement: (id: string, updater: ((el: BoardElement) => BoardElement) | Partial<BoardElement>) => void;
  removeElements: (ids: string[]) => void;
  setSelectedElementIds: (ids: string[]) => void;
  setActiveTool: (tool: ToolType) => void;
  setZoom: (zoom: number) => void;
  setCamera: (x: number, y: number) => void;
  setViewportSize: (width: number, height: number) => void;
  setViewportInsets: (insets: ViewportInsets) => void;
  setRemoteCursors: (cursors: CursorPresence[]) => void;
  setDirty: (dirty: boolean) => void;
  setPendingIconName: (iconName: string | null) => void;
}

export const useBoardStore = create<BoardState>((set) => ({
  board: null,
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

  setBoard: (board) =>
    set((state) => {
      if (!board) {
        return { board: null, isDirty: false, selectedElementIds: [] };
      }

      const preserveSelection = state.board?.id === board.id;
      const availableIds = new Set(board.elements.map((element) => element.id));

      return {
        board,
        isDirty: false,
        selectedElementIds: preserveSelection
          ? state.selectedElementIds.filter((id) => availableIds.has(id))
          : [],
      };
    }),

  updateBoard: (updater) =>
    set((state) => {
      if (!state.board) return state;

      const nextBoard = typeof updater === 'function'
        ? updater(state.board)
        : { ...state.board, ...updater };

      return { board: nextBoard, isDirty: true };
    }),

  setElements: (elements) =>
    set((state) => {
      if (!state.board) return state;
      return { board: { ...state.board, elements }, isDirty: true };
    }),

  addElement: (element) =>
    set((state) => {
      if (!state.board) return state;
      return {
        board: { ...state.board, elements: [...state.board.elements, element] },
        isDirty: true,
      };
    }),

  updateElement: (id, updater) =>
    set((state) => {
      if (!state.board) return state;
      return {
        board: {
          ...state.board,
          elements: state.board.elements.map((el: BoardElement) => {
            if (el.id !== id) {
              return el;
            }

            return (typeof updater === 'function'
              ? updater(el)
              : { ...el, ...updater }) as BoardElement;
          }),
        },
        isDirty: true,
      };
    }),

  removeElements: (ids) =>
    set((state) => {
      if (!state.board) return state;
      const idSet = new Set(ids);
      return {
        board: {
          ...state.board,
          elements: state.board.elements.filter((el: BoardElement) => !idSet.has(el.id)),
        },
        selectedElementIds: state.selectedElementIds.filter((sid) => !idSet.has(sid)),
        isDirty: true,
      };
    }),

  setSelectedElementIds: (ids) => set({ selectedElementIds: ids }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setZoom: (zoom) => set({ zoom: Math.max(0.2, Math.min(3.5, zoom)) }),
  setCamera: (x, y) => set({ cameraX: x, cameraY: y }),
  setViewportSize: (width, height) => set({ viewportWidth: width, viewportHeight: height }),
  setViewportInsets: (viewportInsets) => set({ viewportInsets }),
  setRemoteCursors: (cursors) => set({ remoteCursors: cursors }),
  setDirty: (dirty) => set({ isDirty: dirty }),
  setPendingIconName: (iconName) => set({ pendingIconName: iconName }),
}));
