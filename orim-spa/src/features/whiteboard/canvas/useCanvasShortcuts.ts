import { useEffect } from 'react';
import { isInteractiveTextTarget } from './canvasUtils';
import { getZOrderActionFromKeyboardEvent, type ZOrderAction } from '../zOrder';
import type { ToolType } from '../store/boardStore';

export interface UseCanvasShortcutsParams {
  editable: boolean;
  editingElement: unknown;
  setSpacePanActive: (active: boolean) => void;
  setSelectedElementIds: (ids: string[]) => void;
  setActiveTool: (tool: ToolType) => void;
  reorderSelectedElements: (action: ZOrderAction) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  selectAllElements: () => void;
  copySelectedElementsToClipboard: () => void;
  cutSelectedElements: () => void;
  pasteClipboardElements: () => Promise<void>;
  duplicateSelectedElements: () => void;
  groupSelectedElements: () => void;
  ungroupSelectedElements: () => void;
  beginInlineEditingSelection: () => void;
  deleteSelectedElements: () => void;
  moveSelectedElementsBy: (dx: number, dy: number) => void;
}

export function useCanvasShortcuts({
  editable,
  editingElement,
  setSpacePanActive,
  setSelectedElementIds,
  setActiveTool,
  reorderSelectedElements,
  handleUndo,
  handleRedo,
  selectAllElements,
  copySelectedElementsToClipboard,
  cutSelectedElements,
  pasteClipboardElements,
  duplicateSelectedElements,
  groupSelectedElements,
  ungroupSelectedElements,
  beginInlineEditingSelection,
  deleteSelectedElements,
  moveSelectedElementsBy,
}: UseCanvasShortcutsParams): void {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (isInteractiveTextTarget(e.target)) {
        return;
      }

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setSpacePanActive(true);
        return;
      }

      if (editingElement) {
        return;
      }

      const hasModifier = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

        if (hasModifier) {
          const zOrderAction = getZOrderActionFromKeyboardEvent(e);
          if (zOrderAction) {
            if (!editable) {
              return;
            }

            e.preventDefault();
            reorderSelectedElements(zOrderAction);
            return;
          }

          switch (key) {
            case 'z':
              e.preventDefault();
              if (e.shiftKey) {
                handleRedo();
              } else {
                handleUndo();
              }
              return;
            case 'y':
              e.preventDefault();
              handleRedo();
              return;
          case 'a':
            if (!editable) {
              return;
            }
            e.preventDefault();
            selectAllElements();
            return;
          case 'c':
            if (!editable) {
              return;
            }
            e.preventDefault();
            copySelectedElementsToClipboard();
            return;
          case 'x':
            if (!editable) {
              return;
            }
            e.preventDefault();
            cutSelectedElements();
            return;
          case 'v':
            if (!editable) {
              return;
            }
            e.preventDefault();
            void pasteClipboardElements();
            return;
          case 'd':
            if (!editable) {
              return;
            }
            e.preventDefault();
            duplicateSelectedElements();
            return;
          case 'g':
            if (!editable) {
              return;
            }
            e.preventDefault();
            if (e.shiftKey) {
              ungroupSelectedElements();
            } else {
              groupSelectedElements();
            }
            return;
          default:
            break;
        }
      }

      if (!editable) {
        if (e.key === 'Escape') {
          setSelectedElementIds([]);
          setActiveTool('select');
        }
        return;
      }

      switch (key) {
        case 'v':
          setActiveTool('select');
          return;
        case 'r':
          setActiveTool('rectangle');
          return;
        case 'a':
          setActiveTool('arrow');
          return;
        case 't':
          setActiveTool('text');
          return;
        case 'h':
          setActiveTool('hand');
          return;
        default:
          break;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        beginInlineEditingSelection();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelectedElements();
        return;
      }

      const keyboardStep = e.shiftKey ? 10 : 1;
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          moveSelectedElementsBy(-keyboardStep, 0);
          return;
        case 'ArrowRight':
          e.preventDefault();
          moveSelectedElementsBy(keyboardStep, 0);
          return;
        case 'ArrowUp':
          e.preventDefault();
          moveSelectedElementsBy(0, -keyboardStep);
          return;
        case 'ArrowDown':
          e.preventDefault();
          moveSelectedElementsBy(0, keyboardStep);
          return;
        default:
          break;
      }

      if (e.key === 'Escape') {
        setSelectedElementIds([]);
        setActiveTool('select');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (isInteractiveTextTarget(e.target)) {
        return;
      }

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setSpacePanActive(false);
      }
    };

    const handleWindowBlur = () => {
      setSpacePanActive(false);
    };

    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [
    beginInlineEditingSelection,
    copySelectedElementsToClipboard,
    deleteSelectedElements,
    duplicateSelectedElements,
    editable,
    editingElement,
    groupSelectedElements,
    handleRedo,
    handleUndo,
    cutSelectedElements,
    moveSelectedElementsBy,
    pasteClipboardElements,
    reorderSelectedElements,
    selectAllElements,
    setActiveTool,
    setSelectedElementIds,
    setSpacePanActive,
    ungroupSelectedElements,
  ]);
}
