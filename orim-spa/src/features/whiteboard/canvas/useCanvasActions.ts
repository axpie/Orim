import { useCallback, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useBoardStore, type ApplyLocalCommandResult, type ToolType } from '../store/boardStore';
import type { BoardOperationPayload } from '../realtime/boardOperations';
import {
  asOperationPayload,
  createElementAddedOperation,
  createElementsDeletedOperation,
  createElementUpdatedOperation,
} from '../realtime/boardOperations';
import type { BoardCommandExecution, LocalBoardCommand } from '../realtime/localBoardCommands';
import {
  createAddElementsCommand,
  createChangedKeysByElementId,
  createDeleteElementsCommand,
  createElementUpdateCommand,
} from '../realtime/localBoardCommands';
import {
  applyZOrderAction,
  getZOrderAvailability,
  type ZOrderAction,
  type ZOrderAvailability,
} from '../zOrder';
import {
  getClipboardElements,
  setClipboardElements,
  hasClipboardElementsAvailable,
  persistClipboardPayload,
  readBrowserClipboardElements,
  readStoredClipboardElements,
  serializeClipboardElements,
} from '../clipboard/clipboardService';
import type { BoardElement } from '../../../types/models';
import type { WhiteboardContextMenuAction } from './WhiteboardContextMenu';
import {
  KEYBOARD_DUPLICATE_OFFSET,
  MOVE_TRACKED_ELEMENT_CHANGED_KEYS,
  cloneElementsForInsertion,
  isInlineEditableElement,
  translateElementsBySelection,
  type InlineEditableElement,
} from './canvasUtils';
import { areAllSelectedElementsLocked, canDeleteSelection } from '../selectionLocking';

interface UseCanvasActionsOptions {
  editable: boolean;
  elements: BoardElement[];
  selectedIds: string[];
  onBoardChanged: (changeKind: string, operation?: BoardOperationPayload) => void;
  onBoardLiveChanged?: (changeKind: string, operation?: BoardOperationPayload) => void;
  setElements: (elements: BoardElement[]) => void;
  setSelectedElementIds: (ids: string[]) => void;
  setEditingElement: (element: InlineEditableElement | null) => void;
  setActiveTool: (tool: ToolType) => void;
  applyLocalCommand: (execution: BoardCommandExecution) => ApplyLocalCommandResult;
  pushCommand: (command: LocalBoardCommand) => void;
}

export function useCanvasActions({
  editable,
  elements,
  selectedIds,
  onBoardChanged,
  onBoardLiveChanged,
  setElements,
  setSelectedElementIds,
  setEditingElement,
  setActiveTool,
  applyLocalCommand,
  pushCommand,
}: UseCanvasActionsOptions) {
  const [clipboardVersion, setClipboardVersion] = useState(0);

  const selectedElements = useMemo(
    () => elements.filter((element) => selectedIds.includes(element.id)),
    [elements, selectedIds],
  );
  const selectedGroupIds = useMemo(
    () => new Set(selectedElements.flatMap((element) => element.groupId ? [element.groupId] : [])),
    [selectedElements],
  );
  const canGroup = editable && selectedElements.length >= 2;
  const canUngroup = editable && selectedGroupIds.size > 0;
  const canInlineEditSelection = editable
    && selectedIds.length === 1
    && selectedElements.length === 1
    && isInlineEditableElement(selectedElements[0]);
  const canSelectAll = editable && elements.length > 0 && selectedIds.length !== elements.length;
  const isSelectionLocked = areAllSelectedElementsLocked(selectedElements);
  const canDeleteCurrentSelection = editable && canDeleteSelection(selectedElements);
  const canPaste = useMemo(
    () => {
      void clipboardVersion;
      return hasClipboardElementsAvailable();
    },
    [clipboardVersion],
  );
  const zOrderAvailability = useMemo<ZOrderAvailability>(
    () => getZOrderAvailability(elements, selectedIds),
    [elements, selectedIds],
  );
  const refreshClipboardAvailability = useCallback(() => {
    setClipboardVersion((value) => value + 1);
  }, []);

  const expandSelectionWithGroups = useCallback((ids: string[]): string[] => {
    if (ids.length === 0) {
      return [];
    }

    const selection = new Set(ids);
    const groupedIds = new Set(
      elements
        .filter((element) => selection.has(element.id) && element.groupId)
        .map((element) => element.groupId as string),
    );

    if (groupedIds.size === 0) {
      return [...selection];
    }

    for (const element of elements) {
      if (element.groupId && groupedIds.has(element.groupId)) {
        selection.add(element.id);
      }
    }

    return [...selection];
  }, [elements]);

  const getSelectedElements = useCallback(() => {
    const selectedIdSet = new Set(selectedIds);
    return elements
      .filter((element) => selectedIdSet.has(element.id))
      .sort((left, right) => (left.zIndex ?? 0) - (right.zIndex ?? 0));
  }, [elements, selectedIds]);

  const emitUpdatedOperations = useCallback((
    changeKind: string,
    elementIds: string[],
    emitLive = false,
  ) => {
    const currentElements = useBoardStore.getState().board?.elements ?? [];
    const idSet = new Set(elementIds);
    const payload = asOperationPayload(
      currentElements
        .filter((element) => idSet.has(element.id))
        .map((element) => createElementUpdatedOperation(element)),
    );

    if (!payload) {
      return;
    }

    if (emitLive) {
      onBoardLiveChanged?.(changeKind, payload);
      return;
    }

    onBoardChanged(changeKind, payload);
  }, [onBoardChanged, onBoardLiveChanged]);

  const applyCommandExecution = useCallback((
    execution: BoardCommandExecution | null,
    changeKind: 'undo' | 'redo',
    commit: () => void,
  ) => {
    if (!execution) {
      return;
    }

    const result = applyLocalCommand(execution);
    if (!result.success) {
      return;
    }

    commit();
    if (result.operations.length > 0) {
      onBoardChanged(changeKind, asOperationPayload(result.operations));
    }
  }, [applyLocalCommand, onBoardChanged]);

  const deleteSelectedElements = useCallback(() => {
    if (!canDeleteCurrentSelection || selectedIds.length === 0) {
      return;
    }

    const selectedIdSet = new Set(selectedIds);

    // Also include arrows docked to any selected element.
    for (const element of elements) {
      if (element.$type === 'arrow' && !selectedIdSet.has(element.id)) {
        const arrow = element as import('../../../types/models').ArrowElement;
        if (
          (arrow.sourceElementId && selectedIdSet.has(arrow.sourceElementId)) ||
          (arrow.targetElementId && selectedIdSet.has(arrow.targetElementId))
        ) {
          selectedIdSet.add(arrow.id);
        }
      }
    }

    const deletedElements = elements.filter((element) => selectedIdSet.has(element.id));
    if (deletedElements.length === 0) {
      return;
    }

    setElements(elements.filter((element) => !selectedIdSet.has(element.id)));
    pushCommand(createDeleteElementsCommand(deletedElements));
    setSelectedElementIds([]);
    onBoardChanged('delete', createElementsDeletedOperation([...selectedIdSet]));
  }, [canDeleteCurrentSelection, elements, onBoardChanged, pushCommand, selectedIds, setElements, setSelectedElementIds]);

  const copySelectedElementsToClipboard = useCallback(() => {
    const selection = getSelectedElements();
    if (selection.length === 0) {
      return false;
    }

    setClipboardElements(structuredClone(selection));
    persistClipboardPayload(serializeClipboardElements(selection));
    refreshClipboardAvailability();
    return true;
  }, [getSelectedElements, refreshClipboardAvailability]);

  const cutSelectedElements = useCallback(() => {
    if (!editable || !canDeleteCurrentSelection) {
      return;
    }

    if (copySelectedElementsToClipboard()) {
      deleteSelectedElements();
    }
  }, [canDeleteCurrentSelection, copySelectedElementsToClipboard, deleteSelectedElements, editable]);

  const pasteClipboardElements = useCallback(async () => {
    if (!editable) {
      return;
    }

    const browserClipboard = await readBrowserClipboardElements();
    const inMemory = getClipboardElements();
    const sourceElements = browserClipboard === 'unavailable'
      ? (readStoredClipboardElements() ?? (inMemory.length > 0 ? structuredClone(inMemory) : null))
      : browserClipboard;

    if (!sourceElements || sourceElements.length === 0) {
      return;
    }

    const before = [...elements];
    const pasted = cloneElementsForInsertion(
      sourceElements,
      before.length,
      KEYBOARD_DUPLICATE_OFFSET,
      KEYBOARD_DUPLICATE_OFFSET,
    );
    const after = [...before, ...pasted];

    setClipboardElements(structuredClone(sourceElements));
    refreshClipboardAvailability();
    setElements(after);
    pushCommand(createAddElementsCommand(pasted));
    setSelectedElementIds(pasted.map((element) => element.id));
    onBoardChanged('paste', asOperationPayload(pasted.map((element) => createElementAddedOperation(element))));
  }, [editable, elements, onBoardChanged, pushCommand, refreshClipboardAvailability, setElements, setSelectedElementIds]);

  const duplicateSelectedElements = useCallback(() => {
    if (!editable) {
      return;
    }

    const selection = getSelectedElements();
    if (selection.length === 0) {
      return;
    }

    const before = [...elements];
    const duplicated = cloneElementsForInsertion(
      selection,
      before.length,
      KEYBOARD_DUPLICATE_OFFSET,
      KEYBOARD_DUPLICATE_OFFSET,
    );
    const after = [...before, ...duplicated];

    setClipboardElements(structuredClone(selection));
    setElements(after);
    pushCommand(createAddElementsCommand(duplicated));
    setSelectedElementIds(duplicated.map((element) => element.id));
    onBoardChanged('duplicate', asOperationPayload(duplicated.map((element) => createElementAddedOperation(element))));
  }, [editable, elements, getSelectedElements, onBoardChanged, pushCommand, setElements, setSelectedElementIds]);

  const groupSelectedElements = useCallback(() => {
    if (!editable) {
      return;
    }

    const selection = getSelectedElements();
    if (selection.length < 2) {
      return;
    }

    const before = [...elements];
    const nextGroupId = uuidv4();
    const selectedIdSet = new Set(selection.map((element) => element.id));
    const after = elements.map((element) => (
      selectedIdSet.has(element.id)
        ? { ...element, groupId: nextGroupId }
        : element
    ));

    setElements(after);
    pushCommand(createElementUpdateCommand(
      before.filter((element) => selectedIdSet.has(element.id)),
      after.filter((element) => selectedIdSet.has(element.id)),
      createChangedKeysByElementId(selection.map((element) => element.id), ['groupId']),
    ));
    setSelectedElementIds(after.filter((element) => element.groupId === nextGroupId).map((element) => element.id));
    onBoardChanged('group', asOperationPayload(
      after
        .filter((element) => selectedIdSet.has(element.id))
        .map((element) => createElementUpdatedOperation(element)),
    ));
  }, [editable, elements, getSelectedElements, onBoardChanged, pushCommand, setElements, setSelectedElementIds]);

  const ungroupSelectedElements = useCallback(() => {
    if (!editable) {
      return;
    }

    const groupedSelection = new Set(
      getSelectedElements()
        .flatMap((element) => element.groupId ? [element.groupId] : []),
    );

    if (groupedSelection.size === 0) {
      return;
    }

    const before = [...elements];
    const affectedBefore = before.filter((element) => element.groupId && groupedSelection.has(element.groupId));
    const after = elements.map((element) => (
      element.groupId && groupedSelection.has(element.groupId)
        ? { ...element, groupId: null }
        : element
    ));
    const affectedAfter = after.filter((element) => affectedBefore.some((candidate) => candidate.id === element.id));

    setElements(after);
    pushCommand(createElementUpdateCommand(
      affectedBefore,
      affectedAfter,
      createChangedKeysByElementId(affectedBefore.map((element) => element.id), ['groupId']),
    ));
    setSelectedElementIds(selectedIds.filter((id) => after.some((element) => element.id === id)));
    onBoardChanged('ungroup', asOperationPayload(
      affectedAfter.map((element) => createElementUpdatedOperation(element)),
    ));
  }, [editable, elements, getSelectedElements, onBoardChanged, pushCommand, selectedIds, setElements, setSelectedElementIds]);

  const setSelectedElementsLocked = useCallback((locked: boolean) => {
    if (!editable) {
      return;
    }

    const selection = getSelectedElements();
    if (selection.length === 0) {
      return;
    }

    const selectedIdSet = new Set(selection.map((element) => element.id));
    const before = elements.filter((element) => selectedIdSet.has(element.id));
    const after = elements.map((element) => (
      selectedIdSet.has(element.id)
        ? { ...element, isLocked: locked }
        : element
    ));
    const updatedAfter = after.filter((element) => selectedIdSet.has(element.id));

    setElements(after);
    pushCommand(createElementUpdateCommand(
      before,
      updatedAfter,
      createChangedKeysByElementId(selection.map((element) => element.id), ['isLocked']),
    ));
    onBoardChanged('lock', asOperationPayload(
      updatedAfter.map((element) => createElementUpdatedOperation(element)),
    ));
  }, [editable, elements, getSelectedElements, onBoardChanged, pushCommand, setElements]);

  const reorderSelectedElements = useCallback((action: ZOrderAction) => {
    if (!editable) {
      return;
    }

    const result = applyZOrderAction(elements, selectedIds, action);
    if (result.changedIds.length === 0) {
      return;
    }

    const changedIdSet = new Set(result.changedIds);
    const before = elements.filter((element) => changedIdSet.has(element.id));
    const after = result.elements.filter((element) => changedIdSet.has(element.id));

    setElements(result.elements);
    pushCommand(createElementUpdateCommand(
      before,
      after,
      createChangedKeysByElementId(result.changedIds, ['zIndex']),
    ));
    setSelectedElementIds(result.effectiveSelectedIds);
    onBoardChanged('zOrder', asOperationPayload(
      after.map((element) => createElementUpdatedOperation(element)),
    ));
  }, [editable, elements, onBoardChanged, pushCommand, selectedIds, setElements, setSelectedElementIds]);

  const moveSelectedElementsBy = useCallback((deltaX: number, deltaY: number) => {
    if (!editable || selectedIds.length === 0) {
      return;
    }

    const before = [...elements];
    const { elements: after, changedIds } = translateElementsBySelection(elements, selectedIds, deltaX, deltaY);
    if (changedIds.length === 0) {
      return;
    }

    const changedIdSet = new Set(changedIds);
    const movedBefore = before.filter((element) => changedIdSet.has(element.id));
    const movedAfter = after.filter((element) => changedIdSet.has(element.id));

    setElements(after);
    pushCommand(createElementUpdateCommand(
      movedBefore,
      movedAfter,
      createChangedKeysByElementId(changedIds, MOVE_TRACKED_ELEMENT_CHANGED_KEYS),
    ));
    onBoardChanged('move', asOperationPayload(
      movedAfter.map((element) => createElementUpdatedOperation(element)),
    ));
  }, [editable, elements, onBoardChanged, pushCommand, selectedIds, setElements]);

  const beginInlineEditingSelection = useCallback(() => {
    if (selectedIds.length !== 1) {
      return;
    }

    const selected = elements.find((element) => element.id === selectedIds[0]);
    if (editable && isInlineEditableElement(selected)) {
      setEditingElement(selected);
    }
  }, [editable, elements, selectedIds, setEditingElement]);

  const selectAllElements = useCallback(() => {
    if (!editable) {
      return;
    }

    setSelectedElementIds(expandSelectionWithGroups(elements.map((element) => element.id)));
  }, [editable, elements, expandSelectionWithGroups, setSelectedElementIds]);

  const handleContextMenuAction = useCallback((action: WhiteboardContextMenuAction) => {
    switch (action) {
      case 'copy':
        copySelectedElementsToClipboard();
        return;
      case 'cut':
        cutSelectedElements();
        return;
      case 'paste':
        void pasteClipboardElements();
        return;
      case 'duplicate':
        duplicateSelectedElements();
        return;
      case 'delete':
        deleteSelectedElements();
        return;
      case 'edit-text':
        beginInlineEditingSelection();
        return;
      case 'group':
        groupSelectedElements();
        return;
      case 'ungroup':
        ungroupSelectedElements();
        return;
      case 'select-all':
        selectAllElements();
        return;
      case 'lock':
        setSelectedElementsLocked(true);
        return;
      case 'unlock':
        setSelectedElementsLocked(false);
        return;
      case 'bring-to-front':
      case 'bring-forward':
      case 'send-backward':
      case 'send-to-back':
        reorderSelectedElements(action);
        return;
      default:
        return;
    }
  }, [
    beginInlineEditingSelection,
    copySelectedElementsToClipboard,
    cutSelectedElements,
    deleteSelectedElements,
    duplicateSelectedElements,
    groupSelectedElements,
    pasteClipboardElements,
    reorderSelectedElements,
    selectAllElements,
    setSelectedElementsLocked,
    ungroupSelectedElements,
  ]);

  const selectAccessibleElement = useCallback((elementId: string) => {
    setActiveTool('select');
    setSelectedElementIds(expandSelectionWithGroups([elementId]));
  }, [expandSelectionWithGroups, setActiveTool, setSelectedElementIds]);

  const beginInlineEditingElement = useCallback((elementId: string) => {
    selectAccessibleElement(elementId);

    const selected = elements.find((element) => element.id === elementId);
    if (editable && isInlineEditableElement(selected)) {
      setEditingElement(selected);
    }
  }, [editable, elements, selectAccessibleElement, setEditingElement]);

  return {
    canGroup,
    canUngroup,
    canInlineEditSelection,
    canSelectAll,
    canPaste,
    isSelectionLocked,
    canDeleteCurrentSelection,
    zOrderAvailability,
    expandSelectionWithGroups,
    emitUpdatedOperations,
    applyCommandExecution,
    deleteSelectedElements,
    copySelectedElementsToClipboard,
    cutSelectedElements,
    pasteClipboardElements,
    duplicateSelectedElements,
    groupSelectedElements,
    ungroupSelectedElements,
    setSelectedElementsLocked,
    reorderSelectedElements,
    moveSelectedElementsBy,
    beginInlineEditingSelection,
    selectAllElements,
    handleContextMenuAction,
    selectAccessibleElement,
    beginInlineEditingElement,
    refreshClipboardAvailability,
  };
}
