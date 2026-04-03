import { useRef, useCallback, useState, useEffect, useId, useMemo, type FocusEvent as ReactFocusEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMediaQuery } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Stage, Layer, Rect, Line, Circle } from 'react-konva';
import type Konva from 'konva';
import { getThemes } from '../../../api/themes';
import { useThemeStore } from '../../../stores/themeStore';
import { useBoardStore } from '../store/boardStore';
import { useCommandStack } from '../store/commandStack';
import { ShapeRenderer } from '../shapes/ShapeRenderer';
import { TextRenderer } from '../shapes/TextRenderer';
import { StickyNoteRenderer } from '../shapes/StickyNoteRenderer';
import { FrameRenderer } from '../shapes/FrameRenderer';
import { ArrowRenderer } from '../shapes/ArrowRenderer';
import { IconRenderer } from '../shapes/IconRenderer';
import { ImageRenderer } from '../shapes/ImageRenderer';
import { SelectionOverlay, type ResizeHandle } from '../shapes/SelectionOverlay';
import { AlignmentGuides } from '../shapes/AlignmentGuides';
import { InlineTextEditor } from '../shapes/InlineTextEditor';
import { CanvasAccessibilityLayer } from './CanvasAccessibilityLayer';
import { RemoteCursorPresence } from './RemoteCursorPresence';
import { WhiteboardContextMenu, type WhiteboardContextMenuAction } from './WhiteboardContextMenu';
import {
  ArrowHeadStyle,
  ArrowLineStyle,
  ArrowRouteStyle,
  BorderLineStyle,
  DockPoint,
  HorizontalLabelAlignment,
  ShapeType,
  VerticalLabelAlignment,
  type BoardElement,
  type ShapeElement,
  type TextElement,
  type StickyNoteElement,
  type FrameElement,
  type ArrowElement,
  type IconElement,
  type ImageElement,
} from '../../../types/models';
import { contrastingTextColor } from '../../../utils/colorUtils';
import { snapResizeRectToAlignmentGuides, snapToAlignmentGuides, type AlignmentGuide, getBoundingRect } from '../../../utils/geometry';
import {
  computeArrowPolyline,
  findNearestDockTarget,
  flattenPoints,
  getDockPosition,
  getMagneticArrowPoint,
  nearestDock,
  resolveFreeDock,
} from '../../../utils/arrowRouting';
import { v4 as uuidv4 } from 'uuid';
import type { BoardOperationPayload } from '../realtime/boardOperations';
import { describeBoardElement } from '../a11yAnnouncements';
import {
  asOperationPayload,
  createElementAddedOperation,
  createElementsDeletedOperation,
  createElementUpdatedOperation,
} from '../realtime/boardOperations';
import {
  ARROW_ENDPOINT_CHANGED_KEYS,
  createAddElementsCommand,
  createChangedKeysByElementId,
  createDeleteElementsCommand,
  createElementUpdateCommand,
} from '../realtime/localBoardCommands';
import { DEFAULT_STICKY_NOTE_FILL_COLOR, getStickyNotePresetById } from '../stickyNotePresets';
import {
  applyZOrderAction,
  getZOrderActionFromKeyboardEvent,
  getZOrderAvailability,
  type ZOrderAction,
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

const GRID_SIZE = 24;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3.5;
const MIN_ELEMENT_SIZE = 24;
const DOCK_SNAP_RADIUS = 28;
const KEYBOARD_DUPLICATE_OFFSET = 32;
const TRACKPAD_DELTA_THRESHOLD = 24;
const DEFAULT_TEXT_WIDTH = 220;
const DEFAULT_TEXT_HEIGHT = 56;
const FALLBACK_BOARD_DEFAULTS = {
  surfaceColor: '#FFFFFF',
  gridColor: '#EEF2F7',
  shapeFillColor: '#FFFFFF',
  strokeColor: '#0F172A',
  iconColor: '#0F172A',
  selectionColor: '#2563EB',
  selectionTintRgb: '37, 99, 235',
  handleSurfaceColor: '#FFFFFF',
  dockTargetColor: '#0F766E',
};

interface WhiteboardCanvasProps {
  editable?: boolean;
  onBoardChanged: (changeKind: string, operation?: BoardOperationPayload) => void;
  onBoardLiveChanged?: (changeKind: string, operation?: BoardOperationPayload) => void;
  onPointerPresenceChanged?: (worldX: number | null, worldY: number | null) => void;
  localPresenceClientId?: string | null;
  onStageReady?: (stage: Konva.Stage | null) => void;
  selectedCommentId?: string | null;
  commentPlacementMode?: boolean;
  onSelectComment?: (commentId: string) => void;
  onCreateCommentAnchor?: (position: { x: number; y: number }) => void;
  liveAnnouncement?: { id: number; text: string } | null;
}

type DockTargetState = {
  elementId: string;
  dock: DockPoint;
  point: { x: number; y: number };
};

type ArrowEndpointHandleKind = 'source' | 'target';

type TouchGestureState = {
  initialDistance: number;
  initialZoom: number;
  anchorWorldX: number;
  anchorWorldY: number;
};

type SafariGestureEvent = Event & {
  scale: number;
  clientX?: number;
  clientY?: number;
};

function isInteractiveTextTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement) {
    return true;
  }

  if (target instanceof HTMLElement) {
    if (target.dataset.whiteboardShortcutTarget === 'true') {
      return false;
    }

    return target.isContentEditable
      || target instanceof HTMLButtonElement
      || target instanceof HTMLAnchorElement
      || target.getAttribute('role') === 'button';
  }

  return false;
}

function areComparedValuesEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => Object.is(value, right[index]));
  }

  return Object.is(left, right);
}

function haveTrackedElementChanges(
  before: BoardElement[],
  after: BoardElement[],
  elementIds: readonly string[],
  keys: readonly string[],
): boolean {
  if (elementIds.length === 0 || keys.length === 0) {
    return false;
  }

  const beforeById = new Map(before.map((element) => [element.id, element]));
  const afterById = new Map(after.map((element) => [element.id, element]));

  return [...new Set(elementIds)].some((elementId) => {
    const beforeElement = beforeById.get(elementId);
    const afterElement = afterById.get(elementId);
    if (!beforeElement || !afterElement) {
      return beforeElement !== afterElement;
    }

    const beforeRecord = beforeElement as unknown as Record<string, unknown>;
    const afterRecord = afterElement as unknown as Record<string, unknown>;
    return keys.some((key) => !areComparedValuesEqual(beforeRecord[key], afterRecord[key]));
  });
}

function isTrackpadPanWheelEvent(event: WheelEvent): boolean {
  const absDeltaX = Math.abs(event.deltaX);
  const absDeltaY = Math.abs(event.deltaY);

  return event.deltaMode === WheelEvent.DOM_DELTA_PIXEL
    && !event.ctrlKey
    && !event.metaKey
    && (absDeltaX > 0 || absDeltaY < TRACKPAD_DELTA_THRESHOLD);
}

function cloneElementsForInsertion(
  sourceElements: BoardElement[],
  baseZIndex: number,
  offsetX: number,
  offsetY: number,
): BoardElement[] {
  const idMap = new Map<string, string>();
  const groupMap = new Map<string, string>();

  for (const element of sourceElements) {
    idMap.set(element.id, uuidv4());
    if (element.groupId && !groupMap.has(element.groupId)) {
      groupMap.set(element.groupId, uuidv4());
    }
  }

  return sourceElements.map((element, index) => {
    const clone = structuredClone(element) as BoardElement;
    clone.id = idMap.get(element.id) ?? uuidv4();
    clone.x += offsetX;
    clone.y += offsetY;
    clone.zIndex = baseZIndex + index;

    if (clone.groupId) {
      clone.groupId = groupMap.get(clone.groupId) ?? clone.groupId;
    }

    if (clone.$type === 'arrow') {
      if (clone.sourceElementId && idMap.has(clone.sourceElementId)) {
        clone.sourceElementId = idMap.get(clone.sourceElementId) ?? clone.sourceElementId;
      }
      if (clone.targetElementId && idMap.has(clone.targetElementId)) {
        clone.targetElementId = idMap.get(clone.targetElementId) ?? clone.targetElementId;
      }
      if (clone.sourceX != null) {
        clone.sourceX += offsetX;
      }
      if (clone.sourceY != null) {
        clone.sourceY += offsetY;
      }
      if (clone.targetX != null) {
        clone.targetX += offsetX;
      }
      if (clone.targetY != null) {
        clone.targetY += offsetY;
      }
    }

    return clone;
  });
}

function isPointInsideElementBounds(
  point: { x: number; y: number },
  element: Pick<BoardElement, 'x' | 'y' | 'width' | 'height'>,
): boolean {
  return point.x >= element.x
    && point.x <= element.x + element.width
    && point.y >= element.y
    && point.y <= element.y + element.height;
}

function getResizeCursor(handle: ResizeHandle | null | undefined): string | null {
  switch (handle) {
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'nw':
    case 'se':
      return 'nwse-resize';
    default:
      return null;
  }
}

export function WhiteboardCanvas({
  editable = true,
  onBoardChanged,
  onBoardLiveChanged,
  onPointerPresenceChanged,
  localPresenceClientId = null,
  onStageReady,
  selectedCommentId = null,
  commentPlacementMode = false,
  onSelectComment,
  onCreateCommentAnchor,
  liveAnnouncement = null,
}: WhiteboardCanvasProps) {
  const { t } = useTranslation();
  const accessibilityHelpId = useId();
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [isCanvasFocused, setIsCanvasFocused] = useState(false);

  const board = useBoardStore((s) => s.board);
  const elements = board?.elements ?? [];
  const comments = board?.comments ?? [];
  const selectedIds = useBoardStore((s) => s.selectedElementIds);
  const activeTool = useBoardStore((s) => s.activeTool);
  const zoom = useBoardStore((s) => s.zoom);
  const cameraX = useBoardStore((s) => s.cameraX);
  const cameraY = useBoardStore((s) => s.cameraY);
  const setViewportSize = useBoardStore((s) => s.setViewportSize);
  const setSelectedElementIds = useBoardStore((s) => s.setSelectedElementIds);
  const setActiveTool = useBoardStore((s) => s.setActiveTool);
  const setZoom = useBoardStore((s) => s.setZoom);
  const setCamera = useBoardStore((s) => s.setCamera);
  const addElement = useBoardStore((s) => s.addElement);
  const updateElement = useBoardStore((s) => s.updateElement);
  const setElements = useBoardStore((s) => s.setElements);
  const applyLocalCommand = useBoardStore((s) => s.applyLocalCommand);
  const pendingIconName = useBoardStore((s) => s.pendingIconName);
  const pendingStickyNotePresetId = useBoardStore((s) => s.pendingStickyNotePresetId);
  const userThemeKey = useThemeStore((s) => s.themeKey);
  const isCoarsePointer = useMediaQuery('(pointer: coarse)');
  const dockSnapRadius = isCoarsePointer ? DOCK_SNAP_RADIUS * 1.6 : DOCK_SNAP_RADIUS;
  const keyboardNavigableElements = useMemo(
    () => [...elements].sort((left, right) => {
      const zOrder = left.zIndex - right.zIndex;
      return zOrder !== 0 ? zOrder : left.id.localeCompare(right.id);
    }),
    [elements],
  );

  const { data: themes = [] } = useQuery({
    queryKey: ['themes'],
    queryFn: getThemes,
    staleTime: 60_000,
  });
  const activeTheme = themes.find((theme) => theme.key === (board?.themeKey ?? userThemeKey)) ?? themes[0] ?? null;
  const rawBoardDefaults = activeTheme?.boardDefaults ?? FALLBACK_BOARD_DEFAULTS;
  // If the board has a pinned surface color, use it for all users so everyone
  // sees the same canvas background regardless of their personal theme choice.
  const boardDefaults = board?.surfaceColor
    ? { ...rawBoardDefaults, surfaceColor: board.surfaceColor }
    : rawBoardDefaults;

  const pushCommand = useCommandStack((s) => s.push);
  const peekUndo = useCommandStack((s) => s.peekUndo);
  const commitUndo = useCommandStack((s) => s.commitUndo);
  const peekRedo = useCommandStack((s) => s.peekRedo);
  const commitRedo = useCommandStack((s) => s.commitRedo);

  useEffect(() => {
    onStageReady?.(stageRef.current);

    return () => {
      onStageReady?.(null);
    };
  }, [onStageReady]);

  // Dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [guides, setGuides] = useState<AlignmentGuide[]>([]);
  const dragSnapshotRef = useRef<BoardElement[] | null>(null);
  const resizeSnapshotRef = useRef<BoardElement[] | null>(null);
  const touchGestureRef = useRef<TouchGestureState | null>(null);
  const marqueeOriginRef = useRef<{ x: number; y: number } | null>(null);

  // Drawing state
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [draftRect, setDraftRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Arrow drawing state
  const [draftArrowStart, setDraftArrowStart] = useState<{ x: number; y: number; elementId?: string; dock?: DockPoint } | null>(null);
  const [draftArrowEnd, setDraftArrowEnd] = useState<{ x: number; y: number } | null>(null);
  const [draftArrowHover, setDraftArrowHover] = useState<DockTargetState | null>(null);
  const arrowEndpointSnapshotRef = useRef<BoardElement[] | null>(null);
  const [arrowEndpointDrag, setArrowEndpointDrag] = useState<{
    arrowId: string;
    isSource: boolean;
    fixedPoint: { x: number; y: number };
    fixedDock: DockPoint;
    hoverElementId: string | null;
    hoverDock: DockPoint | null;
    pointer: { x: number; y: number };
  } | null>(null);
  const [resizeState, setResizeState] = useState<{
    elementId: string;
    handle: ResizeHandle;
    initialX: number;
    initialY: number;
    initialWidth: number;
    initialHeight: number;
  } | null>(null);
  const [hoveredResizeHandle, setHoveredResizeHandle] = useState<ResizeHandle | null>(null);

  // Marquee select state
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Inline text editing
  const [editingElement, setEditingElement] = useState<BoardElement | null>(null);

  // Panning
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [spacePanActive, setSpacePanActive] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [clipboardVersion, setClipboardVersion] = useState(0);
  const viewportStateRef = useRef({ zoom, cameraX, cameraY });
  const safariGestureRef = useRef<{ initialZoom: number; anchorWorldX: number; anchorWorldY: number } | null>(null);
  const lastSafariGestureAtRef = useRef(0);
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
    && (selectedElements[0].$type === 'text'
      || selectedElements[0].$type === 'sticky'
      || selectedElements[0].$type === 'shape'
      || selectedElements[0].$type === 'frame');
  const canSelectAll = editable && elements.length > 0 && selectedIds.length !== elements.length;
  const canPaste = useMemo(
    () => hasClipboardElementsAvailable(),
    [clipboardVersion],
  );
  const zOrderAvailability = useMemo(
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

  const findTopmostFrameAtPoint = useCallback((point: { x: number; y: number }): FrameElement | null => (
    elements
      .filter((element): element is FrameElement => element.$type === 'frame' && isPointInsideElementBounds(point, element))
      .sort((left, right) => (right.zIndex ?? 0) - (left.zIndex ?? 0))[0]
    ?? null
  ), [elements]);

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
    execution: ReturnType<typeof peekUndo>,
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
    if (!editable || selectedIds.length === 0) {
      return;
    }

    const selectedIdSet = new Set(selectedIds);
    const deletedElements = elements.filter((element) => selectedIdSet.has(element.id));
    if (deletedElements.length === 0) {
      return;
    }

    setElements(elements.filter((element) => !selectedIdSet.has(element.id)));
    pushCommand(createDeleteElementsCommand(deletedElements));
    setSelectedElementIds([]);
    onBoardChanged('delete', createElementsDeletedOperation([...selectedIdSet]));
  }, [editable, elements, onBoardChanged, pushCommand, selectedIds, setElements, setSelectedElementIds]);

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
    if (!editable) {
      return;
    }

    if (copySelectedElementsToClipboard()) {
      deleteSelectedElements();
    }
  }, [copySelectedElementsToClipboard, deleteSelectedElements, editable]);

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

    const selectedIdSet = new Set(selectedIds);
    const movable = elements.filter((element) => selectedIdSet.has(element.id) && element.$type !== 'arrow');
    if (movable.length === 0) {
      return;
    }

    const before = [...elements];
    const after = elements.map((element) => (
      selectedIdSet.has(element.id) && element.$type !== 'arrow'
        ? { ...element, x: element.x + deltaX, y: element.y + deltaY }
        : element
    ));
    const movedBefore = before.filter((element) => selectedIdSet.has(element.id) && element.$type !== 'arrow');
    const movedAfter = after.filter((element) => selectedIdSet.has(element.id) && element.$type !== 'arrow');

    setElements(after);
    pushCommand(createElementUpdateCommand(
      movedBefore,
      movedAfter,
      createChangedKeysByElementId(movedBefore.map((element) => element.id), ['x', 'y']),
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
    if (editable && selected && (selected.$type === 'text' || selected.$type === 'sticky' || selected.$type === 'shape' || selected.$type === 'frame')) {
      setEditingElement(selected);
    }
  }, [editable, elements, selectedIds]);

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
    ungroupSelectedElements,
  ]);

  const selectAccessibleElement = useCallback((elementId: string) => {
    setActiveTool('select');
    setSelectedElementIds(expandSelectionWithGroups([elementId]));
  }, [expandSelectionWithGroups, setActiveTool, setSelectedElementIds]);

  const beginInlineEditingElement = useCallback((elementId: string) => {
    selectAccessibleElement(elementId);

    const selected = elements.find((element) => element.id === elementId);
    if (editable && selected && (selected.$type === 'text' || selected.$type === 'sticky' || selected.$type === 'shape' || selected.$type === 'frame')) {
      setEditingElement(selected);
    }
  }, [editable, elements, selectAccessibleElement]);

  const handleContainerFocus = useCallback(() => {
    setIsCanvasFocused(true);
  }, []);

  const handleContainerBlur = useCallback((event: ReactFocusEvent<HTMLDivElement>) => {
    const nextFocusedNode = event.relatedTarget;
    if (nextFocusedNode instanceof Node && containerRef.current?.contains(nextFocusedNode)) {
      return;
    }

    setIsCanvasFocused(false);
  }, []);

  useEffect(() => {
    viewportStateRef.current = { zoom, cameraX, cameraY };
  }, [zoom, cameraX, cameraY]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateViewportSize = (width: number, height: number) => {
      const nextWidth = Math.max(1, Math.round(width));
      const nextHeight = Math.max(1, Math.round(height));
      setStageSize({ width: nextWidth, height: nextHeight });
      setViewportSize(nextWidth, nextHeight);
    };

    updateViewportSize(container.clientWidth, container.clientHeight);

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      updateViewportSize(width, height);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [setViewportSize]);

  // Keyboard shortcuts
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
                applyCommandExecution(peekRedo(), 'redo', commitRedo);
              } else {
                applyCommandExecution(peekUndo(), 'undo', commitUndo);
              }
              return;
            case 'y':
              e.preventDefault();
              applyCommandExecution(peekRedo(), 'redo', commitRedo);
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
    elements,
    expandSelectionWithGroups,
    groupSelectedElements,
    applyCommandExecution,
    commitRedo,
    commitUndo,
    cutSelectedElements,
    moveSelectedElementsBy,
    pasteClipboardElements,
    peekRedo,
    peekUndo,
    reorderSelectedElements,
    selectAllElements,
    selectedIds.length,
    beginInlineEditingElement,
    selectAccessibleElement,
    setActiveTool,
    ungroupSelectedElements,
  ]);

  useEffect(() => {
    if (!spacePanActive || activeTool === 'hand' || isPanning) {
      return;
    }

    const clearPanState = () => {
      setIsPanning(false);
      setPanStart(null);
    };

    window.addEventListener('mouseup', clearPanState);
    return () => window.removeEventListener('mouseup', clearPanState);
  }, [activeTool, isPanning, spacePanActive]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const getGestureCenter = (event: SafariGestureEvent) => {
      const bounds = container.getBoundingClientRect();
      const centerX = typeof event.clientX === 'number' ? event.clientX - bounds.left : bounds.width / 2;
      const centerY = typeof event.clientY === 'number' ? event.clientY - bounds.top : bounds.height / 2;
      return { centerX, centerY };
    };

    const handleGestureStart = (event: Event) => {
      const gestureEvent = event as SafariGestureEvent;
      gestureEvent.preventDefault();
      lastSafariGestureAtRef.current = Date.now();
      const { zoom: currentZoom, cameraX: currentCameraX, cameraY: currentCameraY } = viewportStateRef.current;
      const { centerX, centerY } = getGestureCenter(gestureEvent);

      safariGestureRef.current = {
        initialZoom: currentZoom,
        anchorWorldX: (centerX - currentCameraX) / currentZoom,
        anchorWorldY: (centerY - currentCameraY) / currentZoom,
      };
    };

    const handleGestureChange = (event: Event) => {
      const gestureEvent = event as SafariGestureEvent;
      const activeGesture = safariGestureRef.current;
      if (!activeGesture) {
        return;
      }

      gestureEvent.preventDefault();
      lastSafariGestureAtRef.current = Date.now();
      const { centerX, centerY } = getGestureCenter(gestureEvent);
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, activeGesture.initialZoom * gestureEvent.scale));
      const nextCameraX = centerX - activeGesture.anchorWorldX * nextZoom;
      const nextCameraY = centerY - activeGesture.anchorWorldY * nextZoom;

      setZoom(nextZoom);
      setCamera(nextCameraX, nextCameraY);
    };

    const handleGestureEnd = (event: Event) => {
      (event as SafariGestureEvent).preventDefault();
      lastSafariGestureAtRef.current = Date.now();
      safariGestureRef.current = null;
    };

    container.addEventListener('gesturestart', handleGestureStart as EventListener, { passive: false });
    container.addEventListener('gesturechange', handleGestureChange as EventListener, { passive: false });
    container.addEventListener('gestureend', handleGestureEnd as EventListener, { passive: false });

    return () => {
      container.removeEventListener('gesturestart', handleGestureStart as EventListener);
      container.removeEventListener('gesturechange', handleGestureChange as EventListener);
      container.removeEventListener('gestureend', handleGestureEnd as EventListener);
    };
  }, [setCamera, setZoom]);

  /** Convert stage pointer event position to world coords. */
  const getWorldPos = useCallback(
    (): { x: number; y: number } => {
      const stage = stageRef.current;
      if (!stage) return { x: 0, y: 0 };
      const pos = stage.getPointerPosition();
      if (!pos) return { x: 0, y: 0 };
      return {
        x: (pos.x - cameraX) / zoom,
        y: (pos.y - cameraY) / zoom,
      };
    },
    [cameraX, cameraY, zoom],
  );

  const getScreenPos = useCallback((): { x: number; y: number } | null => {
    const stage = stageRef.current;
    return stage?.getPointerPosition() ?? null;
  }, []);

  const getTouchGestureInfo = useCallback((touches: TouchList) => {
    if (touches.length < 2 || !containerRef.current) {
      return null;
    }

    const bounds = containerRef.current.getBoundingClientRect();
    const firstTouch = touches[0];
    const secondTouch = touches[1];
    const centerX = ((firstTouch.clientX + secondTouch.clientX) / 2) - bounds.left;
    const centerY = ((firstTouch.clientY + secondTouch.clientY) / 2) - bounds.top;
    const distance = Math.hypot(
      firstTouch.clientX - secondTouch.clientX,
      firstTouch.clientY - secondTouch.clientY,
    );

    return { centerX, centerY, distance };
  }, []);

  const getElementIdFromTarget = useCallback((target: Konva.Node | null): string | null => {
    let current: Konva.Node | null = target;
    while (current) {
      const candidate = current.getAttr?.('data-element-id');
      if (typeof candidate === 'string' && candidate.length > 0) {
        return candidate;
      }
      current = current.getParent();
    }
    return null;
  }, []);

  const getResizeHandleFromTarget = useCallback((target: Konva.Node | null): ResizeHandle | null => {
    let current: Konva.Node | null = target;
    while (current) {
      const candidate = current.getAttr?.('data-resize-handle');
      if (typeof candidate === 'string' && candidate.length > 0) {
        return candidate as ResizeHandle;
      }
      current = current.getParent();
    }
    return null;
  }, []);

  const getArrowEndpointHandleFromTarget = useCallback((target: Konva.Node | null): ArrowEndpointHandleKind | null => {
    let current: Konva.Node | null = target;
    while (current) {
      const candidate = current.getAttr?.('data-arrow-endpoint-handle');
      if (candidate === 'source' || candidate === 'target') {
        return candidate;
      }
      current = current.getParent();
    }
    return null;
  }, []);

  const resolveArrowEndpoint = useCallback((arrow: ArrowElement, isSource: boolean) => {
    const elementId = isSource ? arrow.sourceElementId : arrow.targetElementId;
    const dock = isSource ? arrow.sourceDock : arrow.targetDock;

    if (elementId) {
      const connectedElement = elements.find((element) => element.id === elementId && element.$type !== 'arrow' && element.$type !== 'frame');
      if (connectedElement) {
        return {
          elementId,
          point: getDockPosition(connectedElement, dock),
          dock,
        };
      }
    }

    const x = isSource ? arrow.sourceX : arrow.targetX;
    const y = isSource ? arrow.sourceY : arrow.targetY;
    if (x == null || y == null) {
      return null;
    }

    return {
      elementId: elementId ?? null,
      point: { x, y },
      dock,
    };
  }, [elements]);

  const applyDraggedArrowEndpoint = useCallback(
    (
      arrow: ArrowElement,
      isSource: boolean,
      drag: {
        fixedPoint: { x: number; y: number };
        hoverElementId: string | null;
        hoverDock: DockPoint | null;
        pointer: { x: number; y: number };
      },
    ): ArrowElement => {
      if (drag.hoverElementId && drag.hoverDock != null) {
        const hoverElement = elements.find((element) => element.id === drag.hoverElementId && element.$type !== 'arrow' && element.$type !== 'frame');
        const hoverPoint = hoverElement ? getDockPosition(hoverElement, drag.hoverDock) : drag.pointer;

        return isSource
          ? {
              ...arrow,
              sourceElementId: drag.hoverElementId,
              sourceDock: drag.hoverDock,
              sourceX: hoverPoint.x,
              sourceY: hoverPoint.y,
            }
          : {
              ...arrow,
              targetElementId: drag.hoverElementId,
              targetDock: drag.hoverDock,
              targetX: hoverPoint.x,
              targetY: hoverPoint.y,
            };
      }

      const freeDock = resolveFreeDock(drag.fixedPoint, drag.pointer);
      return isSource
        ? {
            ...arrow,
            sourceElementId: null,
            sourceDock: freeDock,
            sourceX: drag.pointer.x,
            sourceY: drag.pointer.y,
          }
        : {
            ...arrow,
            targetElementId: null,
            targetDock: freeDock,
            targetX: drag.pointer.x,
            targetY: drag.pointer.y,
          };
    },
    [elements],
  );

  // ── Mouse Down ──
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      containerRef.current?.focus({ preventScroll: true });
      setContextMenuPosition(null);
      const worldPos = getWorldPos();
      const screenPos = getScreenPos();
      if (!screenPos) return;

      if (commentPlacementMode && e.evt.button !== 1) {
        onCreateCommentAnchor?.(worldPos);
        return;
      }

      if (e.evt.button === 2) {
        return;
      }

      // Middle mouse or hand tool → pan
      if (e.evt.button === 1 || activeTool === 'hand' || spacePanActive) {
        setIsPanning(true);
        setPanStart({ x: screenPos.x, y: screenPos.y, cx: cameraX, cy: cameraY });
        return;
      }

      // Drawing tools
      if (editable && (activeTool === 'rectangle' || activeTool === 'ellipse' || activeTool === 'triangle' || activeTool === 'frame')) {
        setDrawStart(worldPos);
        setDraftRect({ x: worldPos.x, y: worldPos.y, w: 0, h: 0 });
        return;
      }

      // Text tool — place immediately
      if (editable && activeTool === 'text') {
        const newText: TextElement = {
          $type: 'text',
          id: uuidv4(),
          x: worldPos.x - DEFAULT_TEXT_WIDTH / 2,
          y: worldPos.y - DEFAULT_TEXT_HEIGHT / 2,
          width: DEFAULT_TEXT_WIDTH,
          height: DEFAULT_TEXT_HEIGHT,
          zIndex: elements.length,
          rotation: 0,
          label: '',
          labelHorizontalAlignment: HorizontalLabelAlignment.Left,
          labelVerticalAlignment: VerticalLabelAlignment.Top,
          text: '',
          fontSize: 18,
          autoFontSize: false,
          fontFamily: null,
          color: boardDefaults.strokeColor,
          isBold: false,
          isItalic: false,
          isUnderline: false,
          isStrikethrough: false,
        };
        addElement(newText);
        pushCommand(createAddElementsCommand([newText]));
        setSelectedElementIds([newText.id]);
        setActiveTool('select');
        setEditingElement(newText);
        onBoardChanged('add', createElementAddedOperation(newText));
        return;
      }

      if (editable && activeTool === 'sticky') {
        const stickyPreset = getStickyNotePresetById(board, pendingStickyNotePresetId);
        const stickyFillColor = stickyPreset?.fillColor ?? DEFAULT_STICKY_NOTE_FILL_COLOR;
        const newSticky: StickyNoteElement = {
          $type: 'sticky',
          id: uuidv4(),
          x: worldPos.x - 110,
          y: worldPos.y - 80,
          width: 220,
          height: 160,
          zIndex: elements.length,
          rotation: 0,
          label: '',
          labelHorizontalAlignment: HorizontalLabelAlignment.Left,
          labelVerticalAlignment: VerticalLabelAlignment.Top,
          text: '',
          fontSize: 16,
          autoFontSize: false,
          fontFamily: null,
          fillColor: stickyFillColor,
          color: contrastingTextColor(stickyFillColor),
          isBold: false,
          isItalic: false,
          isUnderline: false,
          isStrikethrough: false,
        };
        addElement(newSticky);
        pushCommand(createAddElementsCommand([newSticky]));
        setSelectedElementIds([newSticky.id]);
        setActiveTool('select');
        setEditingElement(newSticky);
        onBoardChanged('add', createElementAddedOperation(newSticky));
        return;
      }

      if (editable && activeTool === 'icon' && pendingIconName) {
        const newIcon: IconElement = {
          $type: 'icon',
          id: uuidv4(),
          x: worldPos.x - 28,
          y: worldPos.y - 28,
          width: 56,
          height: 56,
          zIndex: elements.length,
          rotation: 0,
          label: '',
          labelHorizontalAlignment: HorizontalLabelAlignment.Center,
          labelVerticalAlignment: VerticalLabelAlignment.Middle,
          iconName: pendingIconName,
          color: boardDefaults.iconColor,
        };
        addElement(newIcon);
        pushCommand(createAddElementsCommand([newIcon]));
        setSelectedElementIds([newIcon.id]);
        setActiveTool('select');
        onBoardChanged('add', createElementAddedOperation(newIcon));
        return;
      }

      // Arrow tool
      if (editable && activeTool === 'arrow') {
        const startDockTarget = findNearestDockTarget(elements, worldPos, undefined, dockSnapRadius);
        const hitEl = startDockTarget
          ? elements.find((element) => element.id === startDockTarget.elementId && element.$type !== 'arrow' && element.$type !== 'frame')
          : elements.find(
            (el: BoardElement) =>
              el.$type !== 'arrow' &&
              el.$type !== 'frame' &&
              isPointInsideElementBounds(worldPos, el),
          );

        if (startDockTarget) {
          setDraftArrowStart({
            x: startDockTarget.point.x,
            y: startDockTarget.point.y,
            elementId: startDockTarget.elementId,
            dock: startDockTarget.dock,
          });
        } else if (hitEl) {
          const dock = nearestDock(hitEl, worldPos);
          const dockPos = getDockPosition(hitEl, dock);
          setDraftArrowStart({ x: dockPos.x, y: dockPos.y, elementId: hitEl.id, dock });
        } else {
          setDraftArrowStart({ x: worldPos.x, y: worldPos.y });
        }
        setDraftArrowEnd(startDockTarget?.point ?? worldPos);
        setDraftArrowHover(null);
        return;
      }

      // Select tool — check if clicking on an element
      if (activeTool === 'select') {
        const target = e.target;
        const resizeHandle = getResizeHandleFromTarget(target);
        setHoveredResizeHandle(resizeHandle);
        if (editable && resizeHandle) {
          const elementId = getElementIdFromTarget(target);
          const element = elementId
            ? elements.find((candidate) => candidate.id === elementId)
            : null;

          if (element && element.$type !== 'arrow') {
            resizeSnapshotRef.current = [...elements];
            setSelectedElementIds([element.id]);
            setResizeState({
              elementId: element.id,
              handle: resizeHandle,
              initialX: element.x,
              initialY: element.y,
              initialWidth: element.width,
              initialHeight: element.height,
            });
            return;
          }
        }

        const arrowEndpointHandle = editable ? getArrowEndpointHandleFromTarget(target) : null;
        if (arrowEndpointHandle) {
          const arrowId = getElementIdFromTarget(target);
          const arrow = arrowId
            ? elements.find((candidate): candidate is ArrowElement => candidate.id === arrowId && candidate.$type === 'arrow')
            : null;

          if (arrow) {
            const movingIsSource = arrowEndpointHandle === 'source';
            const movingEndpoint = resolveArrowEndpoint(arrow, movingIsSource);
            const fixedEndpoint = resolveArrowEndpoint(arrow, !movingIsSource);

            if (movingEndpoint && fixedEndpoint) {
              arrowEndpointSnapshotRef.current = [...elements];
              setSelectedElementIds([arrow.id]);
              setArrowEndpointDrag({
                arrowId: arrow.id,
                isSource: movingIsSource,
                fixedPoint: fixedEndpoint.point,
                fixedDock: fixedEndpoint.dock,
                hoverElementId: movingEndpoint.elementId,
                hoverDock: movingEndpoint.elementId ? movingEndpoint.dock : null,
                pointer: movingEndpoint.point,
              });
              return;
            }
          }
        }

        const frameAtPoint = target === stageRef.current
          ? findTopmostFrameAtPoint(worldPos)
          : null;
        if (frameAtPoint) {
          const groupedSelectionIds = expandSelectionWithGroups([frameAtPoint.id]);

          if (e.evt.shiftKey) {
            const hasGroupedSelection = groupedSelectionIds.some((id) => selectedIds.includes(id));
            setSelectedElementIds(
              hasGroupedSelection
                ? selectedIds.filter((id) => !groupedSelectionIds.includes(id))
                : [...selectedIds, ...groupedSelectionIds.filter((id) => !selectedIds.includes(id))],
            );
          } else if (groupedSelectionIds.some((id) => !selectedIds.includes(id))) {
            // Only replace selection when clicking an element not already selected.
            // If the element is already part of a multi-selection, keep all selected
            // elements so dragging moves the whole selection.
            setSelectedElementIds(groupedSelectionIds);
          }

          if (editable) {
            dragSnapshotRef.current = [...elements];
            setIsDragging(true);
            setDragStart(worldPos);
          }
          return;
        }

        // Clicked on stage background
        if (target === stageRef.current) {
          if (!e.evt.shiftKey) {
            setSelectedElementIds([]);
          }
          // Start marquee
          marqueeOriginRef.current = { x: worldPos.x, y: worldPos.y };
          setMarquee({ x: worldPos.x, y: worldPos.y, w: 0, h: 0 });
          return;
        }

        // Find the element id from the target
        const elementId = getElementIdFromTarget(target);
        if (elementId) {
          const groupedSelectionIds = expandSelectionWithGroups([elementId]);

          if (e.evt.shiftKey) {
            const hasGroupedSelection = groupedSelectionIds.some((id) => selectedIds.includes(id));
            setSelectedElementIds(
              hasGroupedSelection
                ? selectedIds.filter((id) => !groupedSelectionIds.includes(id))
                : [...selectedIds, ...groupedSelectionIds.filter((id) => !selectedIds.includes(id))],
            );
          } else if (groupedSelectionIds.some((id) => !selectedIds.includes(id))) {
            // Only replace selection when clicking an element not already selected.
            // If the element is already part of a multi-selection, keep all selected
            // elements so dragging moves the whole selection.
            setSelectedElementIds(groupedSelectionIds);
          }
          // Start drag
          if (editable) {
            dragSnapshotRef.current = [...elements];
            setIsDragging(true);
            setDragStart(worldPos);
          }
        }
      }
    },
    [editable, activeTool, elements, selectedIds, cameraX, cameraY, zoom, getWorldPos, getScreenPos, getElementIdFromTarget, getResizeHandleFromTarget, getArrowEndpointHandleFromTarget, resolveArrowEndpoint, expandSelectionWithGroups, findTopmostFrameAtPoint, setSelectedElementIds, setActiveTool, addElement, pendingIconName, pendingStickyNotePresetId, pushCommand, onBoardChanged, board, boardDefaults, spacePanActive, commentPlacementMode, onCreateCommentAnchor],
  );

  const handleContextMenu = useCallback((e: Konva.KonvaEventObject<PointerEvent>) => {
    if (!editable) {
      return;
    }

    e.evt.preventDefault();
    containerRef.current?.focus({ preventScroll: true });

    const worldPos = getWorldPos();
    const target = e.target;
    const frameAtPoint = target === stageRef.current
      ? findTopmostFrameAtPoint(worldPos)
      : null;
    const elementId = frameAtPoint?.id ?? getElementIdFromTarget(target);

    if (elementId) {
      const groupedSelectionIds = expandSelectionWithGroups([elementId]);
      const selectionChanged = groupedSelectionIds.length !== selectedIds.length
        || groupedSelectionIds.some((id) => !selectedIds.includes(id));

      if (selectionChanged) {
        setSelectedElementIds(groupedSelectionIds);
      }
    } else if (selectedIds.length === 0 && !canPaste && !canSelectAll) {
      setContextMenuPosition(null);
      return;
    }

    setContextMenuPosition({
      left: e.evt.clientX + 2,
      top: e.evt.clientY - 6,
    });
  }, [
    canPaste,
    canSelectAll,
    editable,
    expandSelectionWithGroups,
    findTopmostFrameAtPoint,
    getElementIdFromTarget,
    getWorldPos,
    selectedIds,
    setSelectedElementIds,
  ]);

  // ── Mouse Move ──
  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const worldPos = getWorldPos();
      const screenPos = getScreenPos();
      if (!screenPos) return;
      const snapTemporarilyDisabled = e.evt.ctrlKey;
      const nextHoveredResizeHandle = resizeState?.handle
        ?? (editable && activeTool === 'select' ? getResizeHandleFromTarget(e.target) : null);
      setHoveredResizeHandle((current) => (current === nextHoveredResizeHandle ? current : nextHoveredResizeHandle));
      onPointerPresenceChanged?.(worldPos.x, worldPos.y);

      // Panning
      if (isPanning && panStart) {
        setCamera(
          panStart.cx + (screenPos.x - panStart.x),
          panStart.cy + (screenPos.y - panStart.y),
        );
        return;
      }

      // Drawing shape
      if (drawStart && draftRect) {
        setDraftRect({
          x: Math.min(drawStart.x, worldPos.x),
          y: Math.min(drawStart.y, worldPos.y),
          w: Math.abs(worldPos.x - drawStart.x),
          h: Math.abs(worldPos.y - drawStart.y),
        });
        return;
      }

      // Drawing arrow
      if (draftArrowStart) {
        const hoverTarget = findNearestDockTarget(elements, worldPos, draftArrowStart.elementId, dockSnapRadius);
        const nextPointer = hoverTarget?.point ?? getMagneticArrowPoint(
          { x: draftArrowStart.x, y: draftArrowStart.y },
          worldPos,
          ArrowRouteStyle.Orthogonal,
        );

        setDraftArrowHover(hoverTarget);
        setDraftArrowEnd(nextPointer);
        return;
      }

      if (arrowEndpointDrag) {
        const arrow = elements.find((candidate): candidate is ArrowElement => candidate.id === arrowEndpointDrag.arrowId && candidate.$type === 'arrow');
        if (!arrow) {
          return;
        }
        const hoverTarget = findNearestDockTarget(elements, worldPos, undefined, dockSnapRadius);
        const nextPointer = hoverTarget?.point ?? getMagneticArrowPoint(
          arrowEndpointDrag.fixedPoint,
          worldPos,
          arrow.routeStyle,
        );
        const nextDrag = {
          ...arrowEndpointDrag,
          hoverElementId: hoverTarget?.elementId ?? null,
          hoverDock: hoverTarget?.dock ?? null,
          pointer: nextPointer,
        };

        setArrowEndpointDrag(nextDrag);
        const nextArrow = applyDraggedArrowEndpoint(arrow, arrowEndpointDrag.isSource, nextDrag);
        updateElement(arrowEndpointDrag.arrowId, nextArrow);
        onBoardLiveChanged?.('edit', createElementUpdatedOperation(nextArrow));
        return;
      }

      if (resizeState) {
        const currentElement = elements.find((element) => element.id === resizeState.elementId && element.$type !== 'arrow');
        if (!currentElement) {
          return;
        }

        const right = resizeState.initialX + resizeState.initialWidth;
        const bottom = resizeState.initialY + resizeState.initialHeight;
        let nextLeft = resizeState.initialX;
        let nextTop = resizeState.initialY;
        let nextRight = right;
        let nextBottom = bottom;

        if (resizeState.handle.includes('w')) {
          nextLeft = Math.min(worldPos.x, right - MIN_ELEMENT_SIZE);
        }
        if (resizeState.handle.includes('e')) {
          nextRight = Math.max(worldPos.x, resizeState.initialX + MIN_ELEMENT_SIZE);
        }
        if (resizeState.handle.includes('n')) {
          nextTop = Math.min(worldPos.y, bottom - MIN_ELEMENT_SIZE);
        }
        if (resizeState.handle.includes('s')) {
          nextBottom = Math.max(worldPos.y, resizeState.initialY + MIN_ELEMENT_SIZE);
        }

        if (snapTemporarilyDisabled) {
          setGuides([]);
        } else {
          const otherEls = elements.filter((element: BoardElement) => element.id !== resizeState.elementId);
          const snappedResize = snapResizeRectToAlignmentGuides(
            {
              x: nextLeft,
              y: nextTop,
              width: nextRight - nextLeft,
              height: nextBottom - nextTop,
            },
            otherEls,
            zoom,
            resizeState.handle,
          );

          const snappedRight = snappedResize.rect.x + snappedResize.rect.width;
          const snappedBottom = snappedResize.rect.y + snappedResize.rect.height;

          nextLeft = resizeState.handle.includes('w')
            ? Math.min(snappedResize.rect.x, nextRight - MIN_ELEMENT_SIZE)
            : nextLeft;
          nextRight = resizeState.handle.includes('e')
            ? Math.max(snappedRight, nextLeft + MIN_ELEMENT_SIZE)
            : nextRight;
          nextTop = resizeState.handle.includes('n')
            ? Math.min(snappedResize.rect.y, nextBottom - MIN_ELEMENT_SIZE)
            : nextTop;
          nextBottom = resizeState.handle.includes('s')
            ? Math.max(snappedBottom, nextTop + MIN_ELEMENT_SIZE)
            : nextBottom;

          setGuides(snappedResize.guides);
        }

        // Aspect ratio constraint for image elements
        if (currentElement.$type === 'image' && (currentElement as ImageElement).imageFit !== 'Fill') {
          const aspectRatio = resizeState.initialWidth / resizeState.initialHeight;
          const newWidth = nextRight - nextLeft;
          const newHeight = nextBottom - nextTop;
          const handle = resizeState.handle;
          const movesVertical = handle.includes('n') || handle.includes('s');
          const movesHorizontal = handle.includes('e') || handle.includes('w');

          if (movesVertical && !movesHorizontal) {
            // Pure vertical: derive width from new height
            const constrainedWidth = newHeight * aspectRatio;
            nextRight = nextLeft + constrainedWidth;
          } else {
            // Horizontal or corner: derive height from new width
            const constrainedHeight = newWidth / aspectRatio;
            if (handle.includes('n')) {
              nextTop = nextBottom - constrainedHeight;
            } else {
              nextBottom = nextTop + constrainedHeight;
            }
          }
          // Enforce minimum size after constraint
          if (nextRight - nextLeft < MIN_ELEMENT_SIZE) {
            nextRight = nextLeft + MIN_ELEMENT_SIZE;
            nextBottom = nextTop + MIN_ELEMENT_SIZE / aspectRatio;
          }
          if (nextBottom - nextTop < MIN_ELEMENT_SIZE) {
            nextBottom = nextTop + MIN_ELEMENT_SIZE;
            nextRight = nextLeft + MIN_ELEMENT_SIZE * aspectRatio;
          }
        }

        const nextElement = {
          ...currentElement,
          x: nextLeft,
          y: nextTop,
          width: nextRight - nextLeft,
          height: nextBottom - nextTop,
        } as BoardElement;
        updateElement(resizeState.elementId, nextElement);
        onBoardLiveChanged?.('resize', createElementUpdatedOperation(nextElement));
        return;
      }

      // Marquee
      if (marquee) {
        const ox = marqueeOriginRef.current?.x ?? marquee.x;
        const oy = marqueeOriginRef.current?.y ?? marquee.y;
        const mx = Math.min(ox, worldPos.x);
        const my = Math.min(oy, worldPos.y);
        const mw = Math.abs(worldPos.x - ox);
        const mh = Math.abs(worldPos.y - oy);
        setMarquee({ x: mx, y: my, w: mw, h: mh });
        return;
      }

      // Dragging selected elements
      if (isDragging && dragStart) {
        const dx = worldPos.x - dragStart.x;
        const dy = worldPos.y - dragStart.y;

        const selectedEls = elements.filter((el: BoardElement) => selectedIds.includes(el.id));
        const otherEls = elements.filter((el: BoardElement) => !selectedIds.includes(el.id));
        const selBounds = getBoundingRect(selectedEls);
        if (selBounds) {
          let snapDx = 0;
          let snapDy = 0;

          if (snapTemporarilyDisabled) {
            setGuides([]);
          } else {
            const moved = { ...selBounds, x: selBounds.x + dx, y: selBounds.y + dy };
            const snap = snapToAlignmentGuides(moved, otherEls, zoom);
            snapDx = snap.dx;
            snapDy = snap.dy;
            setGuides(snap.guides);
          }

          const payload = asOperationPayload(selectedEls.map((el) => {
            const nextElement = {
              ...el,
              x: el.x + dx + snapDx,
              y: el.y + dy + snapDy,
            } as BoardElement;
            updateElement(el.id, nextElement);
            return createElementUpdatedOperation(nextElement);
          }));
          if (payload) {
            onBoardLiveChanged?.('move', payload);
          }
        }
        setDragStart(worldPos);
      }
    },
    [isPanning, panStart, drawStart, draftRect, draftArrowStart, arrowEndpointDrag, resizeState, marquee, isDragging, dragStart, elements, selectedIds, zoom, editable, activeTool, getWorldPos, getScreenPos, getResizeHandleFromTarget, setCamera, updateElement, applyDraggedArrowEndpoint, onBoardLiveChanged, onPointerPresenceChanged, dockSnapRadius],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredResizeHandle(null);
    onPointerPresenceChanged?.(null, null);
  }, [onPointerPresenceChanged]);

  // ── Mouse Up ──
  const handleMouseUp = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const nextHoveredResizeHandle = editable && activeTool === 'select'
        ? getResizeHandleFromTarget(e.target)
        : null;
      setHoveredResizeHandle(nextHoveredResizeHandle);

      // End panning
      if (isPanning) {
        setIsPanning(false);
        setPanStart(null);
        return;
      }

      // Commit drawn shape
      if (drawStart && draftRect && draftRect.w >= 12 && draftRect.h >= 12) {
        if (activeTool === 'frame') {
          const newFrame: FrameElement = {
            $type: 'frame',
            id: uuidv4(),
            x: draftRect.x,
            y: draftRect.y,
            width: draftRect.w,
            height: draftRect.h,
            zIndex: elements.length > 0 ? Math.min(...elements.map((element) => element.zIndex ?? 0)) - 1 : 0,
            rotation: 0,
            label: '',
            labelFontSize: null,
            labelColor: null,
            fontFamily: null,
            isBold: false,
            isItalic: false,
            isUnderline: false,
            isStrikethrough: false,
            labelHorizontalAlignment: HorizontalLabelAlignment.Left,
            labelVerticalAlignment: VerticalLabelAlignment.Top,
            fillColor: 'rgba(37, 99, 235, 0.08)',
            strokeColor: 'rgba(37, 99, 235, 0.48)',
            strokeWidth: 2,
          };
          addElement(newFrame);
          pushCommand(createAddElementsCommand([newFrame]));
          setSelectedElementIds([newFrame.id]);
          setActiveTool('select');
          setEditingElement(newFrame);
          onBoardChanged('add', createElementAddedOperation(newFrame));
        } else {
          const shapeType =
            activeTool === 'ellipse' ? ShapeType.Ellipse :
            activeTool === 'triangle' ? ShapeType.Triangle :
            ShapeType.Rectangle;

          const newShape: ShapeElement = {
            $type: 'shape',
            id: uuidv4(),
            x: draftRect.x,
            y: draftRect.y,
            width: draftRect.w,
            height: draftRect.h,
            zIndex: elements.length,
            rotation: 0,
            label: '',
            labelFontSize: null,
            labelColor: null,
            fontFamily: null,
            isBold: false,
            isItalic: false,
            isUnderline: false,
            isStrikethrough: false,
            labelHorizontalAlignment: HorizontalLabelAlignment.Center,
            labelVerticalAlignment: VerticalLabelAlignment.Middle,
            shapeType,
            fillColor: boardDefaults.shapeFillColor,
            strokeColor: boardDefaults.strokeColor,
            strokeWidth: 2,
            borderLineStyle: BorderLineStyle.Solid,
          };
          addElement(newShape);
          pushCommand(createAddElementsCommand([newShape]));
          setSelectedElementIds([newShape.id]);
          setActiveTool('select');
          onBoardChanged('add', createElementAddedOperation(newShape));
        }
      }
      setDrawStart(null);
      setDraftRect(null);

      // Commit arrow
      if (draftArrowStart && draftArrowEnd) {
        const dist = Math.hypot(draftArrowEnd.x - draftArrowStart.x, draftArrowEnd.y - draftArrowStart.y);
        if (dist > 10) {
          const targetEl = draftArrowHover
            ? elements.find((el: BoardElement) => el.id === draftArrowHover.elementId && el.$type !== 'arrow' && el.$type !== 'frame')
            : null;
          const targetDock = draftArrowHover?.dock;
          const targetDockPos = draftArrowHover?.point ?? draftArrowEnd;

          const newArrow: ArrowElement = {
            $type: 'arrow',
            id: uuidv4(),
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            zIndex: elements.length,
            rotation: 0,
            label: '',
            labelColor: null,
            fontFamily: null,
            labelHorizontalAlignment: HorizontalLabelAlignment.Center,
            labelVerticalAlignment: VerticalLabelAlignment.Middle,
            sourceElementId: draftArrowStart.elementId,
            targetElementId: targetEl?.id,
            sourceX: draftArrowStart.x,
            sourceY: draftArrowStart.y,
            targetX: targetDockPos.x,
            targetY: targetDockPos.y,
            sourceDock: draftArrowStart.dock ?? resolveFreeDock(targetDockPos, { x: draftArrowStart.x, y: draftArrowStart.y }),
            targetDock: targetDock ?? resolveFreeDock({ x: draftArrowStart.x, y: draftArrowStart.y }, targetDockPos),
            strokeColor: boardDefaults.strokeColor,
            strokeWidth: 2,
            lineStyle: ArrowLineStyle.Solid,
            sourceHeadStyle: ArrowHeadStyle.None,
            targetHeadStyle: ArrowHeadStyle.FilledTriangle,
            routeStyle: ArrowRouteStyle.Orthogonal,
          };
          addElement(newArrow);
          pushCommand(createAddElementsCommand([newArrow]));
          setSelectedElementIds([newArrow.id]);
          setActiveTool('select');
          onBoardChanged('add', createElementAddedOperation(newArrow));
        }
      }
      setDraftArrowStart(null);
      setDraftArrowEnd(null);
      setDraftArrowHover(null);

      if (arrowEndpointDrag) {
        const before = arrowEndpointSnapshotRef.current;
        const after = [...useBoardStore.getState().board?.elements ?? []];
        setArrowEndpointDrag(null);
        arrowEndpointSnapshotRef.current = null;

        if (before && haveTrackedElementChanges(before, after, [arrowEndpointDrag.arrowId], ARROW_ENDPOINT_CHANGED_KEYS)) {
          const beforeArrow = before.filter((element) => element.id === arrowEndpointDrag.arrowId);
          const afterArrow = after.filter((element) => element.id === arrowEndpointDrag.arrowId);
          pushCommand(createElementUpdateCommand(
            beforeArrow,
            afterArrow,
            createChangedKeysByElementId([arrowEndpointDrag.arrowId], ARROW_ENDPOINT_CHANGED_KEYS),
          ));
          emitUpdatedOperations('edit', [arrowEndpointDrag.arrowId]);
        }

        return;
      }

      if (resizeState) {
        const before = resizeSnapshotRef.current;
        const after = [...useBoardStore.getState().board?.elements ?? []];
        setResizeState(null);
        setGuides([]);
        resizeSnapshotRef.current = null;

        if (before && haveTrackedElementChanges(before, after, [resizeState.elementId], ['x', 'y', 'width', 'height'])) {
          pushCommand(createElementUpdateCommand(
            before.filter((element) => element.id === resizeState.elementId),
            after.filter((element) => element.id === resizeState.elementId),
            createChangedKeysByElementId([resizeState.elementId], ['x', 'y', 'width', 'height']),
          ));
          emitUpdatedOperations('resize', [resizeState.elementId]);
        }

        return;
      }

      // End marquee
      if (marquee && marquee.w >= 4 && marquee.h >= 4) {
        const mx = marquee.x;
        const my = marquee.y;
        const mx2 = mx + marquee.w;
        const my2 = my + marquee.h;
        const enclosed = elements.filter((el: BoardElement) => {
          if (el.$type === 'arrow') return false;
          return el.x >= mx && el.y >= my && el.x + el.width <= mx2 && el.y + el.height <= my2;
        });
        setSelectedElementIds(expandSelectionWithGroups(enclosed.map((el: BoardElement) => el.id)));
      }
      marqueeOriginRef.current = null;
      setMarquee(null);

      // End drag
      if (isDragging) {
        const before = dragSnapshotRef.current;
        const after = [...useBoardStore.getState().board?.elements ?? []];
        setIsDragging(false);
        setDragStart(null);
        setGuides([]);

        if (before && haveTrackedElementChanges(before, after, selectedIds, ['x', 'y'])) {
          pushCommand(createElementUpdateCommand(
            before.filter((element) => selectedIds.includes(element.id)),
            after.filter((element) => selectedIds.includes(element.id)),
            createChangedKeysByElementId(selectedIds, ['x', 'y']),
          ));
          emitUpdatedOperations('move', selectedIds);
        }

        dragSnapshotRef.current = null;
      }
    },
    [isPanning, drawStart, draftRect, draftArrowStart, draftArrowEnd, draftArrowHover, arrowEndpointDrag, resizeState, marquee, isDragging, elements, editable, activeTool, zoom, getResizeHandleFromTarget, getWorldPos, setCamera, addElement, pushCommand, expandSelectionWithGroups, setSelectedElementIds, setActiveTool, updateElement, boardDefaults, emitUpdatedOperations, selectedIds],
  );

  const handleTouchStart = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      if (e.evt.touches.length >= 2) {
        e.evt.preventDefault();
        const gesture = getTouchGestureInfo(e.evt.touches);
        if (!gesture) {
          return;
        }

        touchGestureRef.current = {
          initialDistance: Math.max(gesture.distance, 1),
          initialZoom: zoom,
          anchorWorldX: (gesture.centerX - cameraX) / zoom,
          anchorWorldY: (gesture.centerY - cameraY) / zoom,
        };

        setIsPanning(false);
        setPanStart(null);
        setGuides([]);
        return;
      }

      handleMouseDown(e as unknown as Konva.KonvaEventObject<MouseEvent>);
    },
    [cameraX, cameraY, getTouchGestureInfo, handleMouseDown, zoom],
  );

  const handleTouchMove = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      const gestureState = touchGestureRef.current;
      if (gestureState && e.evt.touches.length >= 2) {
        e.evt.preventDefault();
        const gesture = getTouchGestureInfo(e.evt.touches);
        if (!gesture) {
          return;
        }

        const scaleFactor = gesture.distance / gestureState.initialDistance;
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, gestureState.initialZoom * scaleFactor));
        const nextCameraX = gesture.centerX - gestureState.anchorWorldX * nextZoom;
        const nextCameraY = gesture.centerY - gestureState.anchorWorldY * nextZoom;

        setZoom(nextZoom);
        setCamera(nextCameraX, nextCameraY);
        return;
      }

      e.evt.preventDefault();
      handleMouseMove(e as unknown as Konva.KonvaEventObject<MouseEvent>);
    },
    [getTouchGestureInfo, handleMouseMove, setCamera, setZoom],
  );

  const handleTouchEnd = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      if (touchGestureRef.current) {
        e.evt.preventDefault();
        if (e.evt.touches.length >= 2) {
          const gesture = getTouchGestureInfo(e.evt.touches);
          if (gesture) {
            touchGestureRef.current = {
              initialDistance: Math.max(gesture.distance, 1),
              initialZoom: zoom,
              anchorWorldX: (gesture.centerX - cameraX) / zoom,
              anchorWorldY: (gesture.centerY - cameraY) / zoom,
            };
          }
          return;
        }

        touchGestureRef.current = null;
      }

      if (e.evt.touches.length === 0) {
        handleMouseUp(e as unknown as Konva.KonvaEventObject<MouseEvent>);
      }
    },
    [cameraX, cameraY, getTouchGestureInfo, handleMouseUp, zoom],
  );

  // ── Wheel (zoom) ──
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();

      if (safariGestureRef.current || Date.now() - lastSafariGestureAtRef.current < 80) {
        return;
      }

      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      if (isTrackpadPanWheelEvent(e.evt)) {
        setCamera(cameraX - e.evt.deltaX, cameraY - e.evt.deltaY);
        return;
      }

      const newZoom = e.evt.ctrlKey || e.evt.metaKey
        ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * Math.exp(-e.evt.deltaY * 0.0025)))
        : Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (e.evt.deltaY < 0 ? 1.1 : 1 / 1.1)));

      // Anchor zoom at pointer position
      const newCameraX = pointer.x - ((pointer.x - cameraX) / zoom) * newZoom;
      const newCameraY = pointer.y - ((pointer.y - cameraY) / zoom) * newZoom;

      setZoom(newZoom);
      setCamera(newCameraX, newCameraY);
    },
    [zoom, cameraX, cameraY, setZoom, setCamera],
  );

  // Double click → inline text editing
  const handleDblClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const target = e.target;
      const elementId = getElementIdFromTarget(target);
      if (!elementId) {
        const frame = findTopmostFrameAtPoint(getWorldPos());
        if (editable && frame) {
          setSelectedElementIds([frame.id]);
          setEditingElement(frame);
        }
        return;
      }
      const el = elements.find((el: BoardElement) => el.id === elementId);
      if (editable && el && (el.$type === 'text' || el.$type === 'sticky' || el.$type === 'shape' || el.$type === 'frame')) {
        setSelectedElementIds([el.id]);
        setEditingElement(el);
      }
    },
    [editable, elements, findTopmostFrameAtPoint, getElementIdFromTarget, getWorldPos, setSelectedElementIds],
  );

  // Inline editor callbacks
  const handleTextCommit = useCallback(
    (id: string, value: string) => {
      const el = elements.find((element: BoardElement) => element.id === id);
      if (!el) return;
      let nextElement: BoardElement;
      let changedKeys: string[];

      switch (el.$type) {
        case 'text':
        case 'sticky':
          nextElement = { ...el, text: value };
          changedKeys = ['text'];
          break;
        case 'shape':
        case 'frame':
          nextElement = { ...el, label: value };
          changedKeys = ['label'];
          break;
        default:
          setEditingElement(null);
          return;
      }

      const hasMeaningfulChange = changedKeys.some((key) => {
        const currentValue = (el as unknown as Record<string, unknown>)[key];
        const nextValue = (nextElement as unknown as Record<string, unknown>)[key];
        return !Object.is(currentValue, nextValue);
      });

      if (!hasMeaningfulChange) {
        setEditingElement(null);
        return;
      }

      if (el.$type === 'text' || el.$type === 'sticky') {
        updateElement(id, { text: value });
      } else if (el.$type === 'shape' || el.$type === 'frame') {
        updateElement(id, { label: value });
      }
      pushCommand(createElementUpdateCommand(
        [el],
        [nextElement],
        createChangedKeysByElementId([id], changedKeys),
      ));
      setEditingElement(null);
      onBoardChanged('edit', createElementUpdatedOperation(nextElement));
    },
    [elements, updateElement, pushCommand, onBoardChanged],
  );

  const handleTextCancel = useCallback(() => {
    setEditingElement(null);
  }, []);

  // Sorted elements by zIndex
  const sorted = [...elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const resizeCursor = getResizeCursor(resizeState?.handle ?? hoveredResizeHandle);
  const draftArrowPreview = draftArrowStart && draftArrowEnd
    ? flattenPoints(
        computeArrowPolyline(
          {
            $type: 'arrow',
            id: '__draft-arrow__',
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            zIndex: 0,
            rotation: 0,
            label: '',
            labelColor: null,
            fontFamily: null,
            labelHorizontalAlignment: HorizontalLabelAlignment.Center,
            labelVerticalAlignment: VerticalLabelAlignment.Middle,
            sourceElementId: draftArrowStart.elementId,
            targetElementId: draftArrowHover?.elementId ?? null,
            sourceX: draftArrowStart.x,
            sourceY: draftArrowStart.y,
            targetX: draftArrowEnd.x,
            targetY: draftArrowEnd.y,
            sourceDock: draftArrowStart.dock ?? resolveFreeDock(draftArrowEnd, { x: draftArrowStart.x, y: draftArrowStart.y }),
            targetDock: draftArrowHover?.dock ?? resolveFreeDock({ x: draftArrowStart.x, y: draftArrowStart.y }, draftArrowEnd),
            strokeColor: boardDefaults.selectionColor,
            strokeWidth: 2,
            lineStyle: ArrowLineStyle.Solid,
            sourceHeadStyle: ArrowHeadStyle.None,
            targetHeadStyle: ArrowHeadStyle.FilledTriangle,
            routeStyle: ArrowRouteStyle.Orthogonal,
          },
          elements,
        ),
      )
    : null;
  const showDockHandles = activeTool === 'arrow' || arrowEndpointDrag !== null;
  const activeDraftDockKey = draftArrowStart?.elementId && draftArrowStart.dock
    ? `${draftArrowStart.elementId}:${draftArrowStart.dock}`
    : null;
  const hoverDockKey = draftArrowHover
    ? `${draftArrowHover.elementId}:${draftArrowHover.dock}`
    : arrowEndpointDrag?.hoverElementId && arrowEndpointDrag.hoverDock
      ? `${arrowEndpointDrag.hoverElementId}:${arrowEndpointDrag.hoverDock}`
      : null;
  const worldLeft = -cameraX / zoom;
  const worldTop = -cameraY / zoom;
  const worldRight = worldLeft + stageSize.width / zoom;
  const worldBottom = worldTop + stageSize.height / zoom;

  // Grid pattern
  const gridLines: ReactNode[] = [];
  if (zoom > 0.3) {
    const step = GRID_SIZE;
    const startX = Math.floor(worldLeft / step) * step;
    const startY = Math.floor(worldTop / step) * step;

    for (let x = startX; x <= worldRight; x += step) {
      gridLines.push(
        <Line
          key={`gv${x}`}
          points={[x, worldTop, x, worldBottom]}
          stroke={boardDefaults.gridColor}
          strokeWidth={0.5 / zoom}
          listening={false}
        />,
      );
    }
    for (let y = startY; y <= worldBottom; y += step) {
      gridLines.push(
        <Line
          key={`gh${y}`}
          points={[worldLeft, y, worldRight, y]}
          stroke={boardDefaults.gridColor}
          strokeWidth={0.5 / zoom}
          listening={false}
        />,
      );
    }
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label={t('a11y.canvasRegionLabel')}
      aria-describedby={accessibilityHelpId}
      aria-keyshortcuts="Tab, Shift+Tab, Enter, Escape"
      onFocus={handleContainerFocus}
      onBlur={handleContainerBlur}
      style={{
        width: '100%',
        height: '100%',
        background: boardDefaults.surfaceColor,
        position: 'relative',
        outline: isCanvasFocused ? `3px solid ${boardDefaults.selectionColor}` : 'none',
        outlineOffset: -3,
        touchAction: 'none',
        overscrollBehavior: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        cursor:
          resizeCursor
            ? resizeCursor
            : isPanning
              ? 'grabbing'
              : commentPlacementMode
                ? 'crosshair'
              : activeTool === 'hand' || spacePanActive
                ? 'grab'
                : activeTool === 'arrow'
                  ? 'crosshair'
                  : activeTool !== 'select'
                    ? 'crosshair'
                    : 'default',
      }}
    >
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        x={cameraX}
        y={cameraY}
        scaleX={zoom}
        scaleY={zoom}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onDblClick={handleDblClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* Grid layer */}
        <Layer listening={false}>
          <Rect
            x={worldLeft}
            y={worldTop}
            width={worldRight - worldLeft}
            height={worldBottom - worldTop}
            fill={boardDefaults.surfaceColor}
            listening={false}
          />
          {gridLines}
        </Layer>

        {/* Elements layer */}
        <Layer>
          {sorted.map((el) => {
            switch (el.$type) {
              case 'shape':
                return <ShapeRenderer key={el.id} element={el} />;
              case 'text':
                return <TextRenderer key={el.id} element={el} />;
              case 'sticky':
                return <StickyNoteRenderer key={el.id} element={el} />;
              case 'frame':
                return <FrameRenderer key={el.id} element={el} />;
              case 'arrow':
                return <ArrowRenderer key={el.id} element={el} elements={elements} />;
              case 'icon':
                return <IconRenderer key={el.id} element={el} />;
              case 'image':
                return <ImageRenderer key={el.id} element={el as ImageElement} />;
              default:
                return null;
            }
          })}
        </Layer>

        <Layer name="whiteboard-export-hidden">
          {/* Draft shape */}
          {draftRect && (
            <Rect
              x={draftRect.x}
              y={draftRect.y}
              width={draftRect.w}
              height={draftRect.h}
              stroke={boardDefaults.selectionColor}
              strokeWidth={2 / zoom}
              dash={[6 / zoom, 4 / zoom]}
              fill={`rgba(${boardDefaults.selectionTintRgb},0.1)`}
              listening={false}
            />
          )}

          {/* Draft arrow */}
          {draftArrowPreview && (
            <Line
              points={draftArrowPreview}
              stroke={boardDefaults.selectionColor}
              strokeWidth={2 / zoom}
              dash={[6 / zoom, 4 / zoom]}
              opacity={0.6}
              listening={false}
            />
          )}

          {showDockHandles && elements.filter((element) => element.$type !== 'arrow' && element.$type !== 'frame').flatMap((element) => [
            DockPoint.Top,
            DockPoint.Right,
            DockPoint.Bottom,
            DockPoint.Left,
          ].map((dockPoint) => {
            const point = getDockPosition(element, dockPoint);
            const key = `${element.id}:${dockPoint}`;
            const isHover = hoverDockKey === key;
            const isStart = activeDraftDockKey === key;

            return (
              <Circle
                key={key}
                x={point.x}
                y={point.y}
                radius={(isHover ? (isCoarsePointer ? 10 : 6) : (isCoarsePointer ? 7 : 4)) / zoom}
                fill={isHover ? boardDefaults.dockTargetColor : boardDefaults.handleSurfaceColor}
                stroke={isStart ? boardDefaults.selectionColor : boardDefaults.dockTargetColor}
                strokeWidth={(isHover ? 2 : 1.5) / zoom}
                opacity={isHover || isStart ? 0.95 : 0.55}
                listening={false}
              />
            );
          }))}

          {/* Marquee selection */}
          {marquee && (
            <Rect
              x={marquee.x}
              y={marquee.y}
              width={marquee.w}
              height={marquee.h}
              stroke={boardDefaults.selectionColor}
              strokeWidth={1 / zoom}
              dash={[4 / zoom, 4 / zoom]}
              fill={`rgba(${boardDefaults.selectionTintRgb},0.08)`}
              listening={false}
            />
          )}

          {/* Selection overlay */}
          <SelectionOverlay
            elements={elements}
            selectedIds={selectedIds}
            zoom={zoom}
            handleSurfaceColor={boardDefaults.handleSurfaceColor}
            selectionColor={boardDefaults.selectionColor}
            touchMode={isCoarsePointer}
          />

          <RemoteCursorPresence localPresenceClientId={localPresenceClientId} zoom={zoom} />

          {/* Alignment guides */}
          <AlignmentGuides guides={guides} zoom={zoom} stageSize={stageSize} cameraX={cameraX} cameraY={cameraY} />
        </Layer>
      </Stage>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
        }}
      >
        {comments.map((comment) => {
          const left = comment.x * zoom + cameraX;
          const top = comment.y * zoom + cameraY;

          if (left < -36 || top < -36 || left > stageSize.width + 36 || top > stageSize.height + 36) {
            return null;
          }

          const isActive = comment.id === selectedCommentId;
          return (
            <button
              key={comment.id}
              type="button"
              tabIndex={-1}
              onClick={() => onSelectComment?.(comment.id)}
              title={comment.text}
              aria-label={`${comment.replies.length + 1} comment${comment.replies.length !== 0 ? 's' : ''}`}
              style={{
                position: 'absolute',
                left,
                top,
                width: 28,
                height: 28,
                transform: 'translate(-50%, -50%)',
                borderRadius: '999px',
                border: `2px solid ${isActive ? boardDefaults.selectionColor : 'rgba(255,255,255,0.92)'}`,
                background: boardDefaults.selectionColor,
                color: '#FFFFFF',
                fontSize: 12,
                fontWeight: 700,
                boxShadow: isActive ? '0 0 0 3px rgba(37, 99, 235, 0.22)' : '0 8px 18px rgba(15, 23, 42, 0.18)',
                cursor: 'pointer',
                pointerEvents: 'auto',
              }}
            >
              {Math.min(comment.replies.length + 1, 99)}
            </button>
          );
        })}
      </div>

      <CanvasAccessibilityLayer
        helpTextId={accessibilityHelpId}
        elements={elements}
        selectedIds={selectedIds}
        activeTool={activeTool}
        commentPlacementMode={commentPlacementMode}
        externalAnnouncement={liveAnnouncement}
      />

      <WhiteboardContextMenu
        position={contextMenuPosition}
        hasSelection={selectedIds.length > 0}
        canPaste={canPaste}
        canInlineEditSelection={canInlineEditSelection}
        canGroup={canGroup}
        canUngroup={canUngroup}
        canSelectAll={canSelectAll}
        zOrderAvailability={zOrderAvailability}
        onClose={() => setContextMenuPosition(null)}
        onAction={handleContextMenuAction}
      />

      <div
        role="group"
        aria-label={t('a11y.elementNavigatorLabel')}
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {keyboardNavigableElements.map((element) => (
          <button
            key={`a11y-element-${element.id}`}
            type="button"
            data-whiteboard-shortcut-target="true"
            data-element-id={element.id}
            aria-label={describeBoardElement(element, t)}
            aria-pressed={selectedIds.includes(element.id)}
            onClick={() => selectAccessibleElement(element.id)}
            onFocus={() => selectAccessibleElement(element.id)}
            onKeyDown={(event) => {
              if (event.key === ' ' || event.code === 'Space') {
                event.preventDefault();
                event.stopPropagation();
                selectAccessibleElement(element.id);
                return;
              }

              if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                beginInlineEditingElement(element.id);
              }
            }}
          >
            {describeBoardElement(element, t)}
          </button>
        ))}
      </div>

      {/* Inline text editor (DOM overlay) */}
      {editingElement && (
        <InlineTextEditor
          element={editingElement}
          zoom={zoom}
          cameraX={cameraX}
          cameraY={cameraY}
          surfaceColor={boardDefaults.surfaceColor}
          onCommit={handleTextCommit}
          onCancel={handleTextCancel}
        />
      )}
    </div>
  );
}
