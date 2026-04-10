import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCanvasShortcuts, type UseCanvasShortcutsParams } from '../useCanvasShortcuts';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useCanvasShortcuts', () => {
  it('starts inline editing when typing a printable character', () => {
    const beginInlineEditingSelectionFromKeyboard = vi.fn(() => true);
    const setActiveTool = vi.fn();

    renderHarness({
      beginInlineEditingSelectionFromKeyboard,
      setActiveTool,
    });

    fireEvent.keyDown(window, { key: 'a' });

    expect(beginInlineEditingSelectionFromKeyboard).toHaveBeenCalledOnce();
    expect(beginInlineEditingSelectionFromKeyboard).toHaveBeenCalledWith('a');
    expect(setActiveTool).not.toHaveBeenCalled();
  });

  it('keeps ctrl shortcuts out of inline text entry', () => {
    const beginInlineEditingSelectionFromKeyboard = vi.fn(() => true);
    const copySelectedElementsToClipboard = vi.fn();

    renderHarness({
      beginInlineEditingSelectionFromKeyboard,
      copySelectedElementsToClipboard,
    });

    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });

    expect(beginInlineEditingSelectionFromKeyboard).not.toHaveBeenCalled();
    expect(copySelectedElementsToClipboard).toHaveBeenCalledOnce();
  });

  it('falls back to tool shortcuts when text entry does not start editing', () => {
    const beginInlineEditingSelectionFromKeyboard = vi.fn(() => false);
    const setActiveTool = vi.fn();

    renderHarness({
      beginInlineEditingSelectionFromKeyboard,
      setActiveTool,
    });

    fireEvent.keyDown(window, { key: 't' });

    expect(beginInlineEditingSelectionFromKeyboard).toHaveBeenCalledOnce();
    expect(beginInlineEditingSelectionFromKeyboard).toHaveBeenCalledWith('t');
    expect(setActiveTool).toHaveBeenCalledWith('text');
  });
});

function renderHarness(overrides: Partial<UseCanvasShortcutsParams> = {}) {
  const props: UseCanvasShortcutsParams = {
    editable: true,
    editingElement: null,
    setSpacePanActive: vi.fn(),
    setSelectedElementIds: vi.fn(),
    setActiveTool: vi.fn(),
    reorderSelectedElements: vi.fn(),
    handleUndo: vi.fn(),
    handleRedo: vi.fn(),
    selectAllElements: vi.fn(),
    copySelectedElementsToClipboard: vi.fn(),
    cutSelectedElements: vi.fn(),
    duplicateSelectedElements: vi.fn(),
    groupSelectedElements: vi.fn(),
    ungroupSelectedElements: vi.fn(),
    beginInlineEditingSelection: vi.fn(),
    beginInlineEditingSelectionFromKeyboard: vi.fn(() => false),
    deleteSelectedElements: vi.fn(),
    moveSelectedElementsBy: vi.fn(),
    toggleLockSelectedElements: vi.fn(),
    ...overrides,
  };

  render(<ShortcutHarness {...props} />);
  return props;
}

function ShortcutHarness(props: UseCanvasShortcutsParams) {
  useCanvasShortcuts(props);
  return null;
}
