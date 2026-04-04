import { useRef, useCallback, useState, useEffect, useId, useMemo, type FocusEvent as ReactFocusEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMediaQuery } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Stage, Layer, Rect, Line, Circle } from 'react-konva';
import type Konva from 'konva';
import { getThemes } from '../../../api/themes';
import { useThemeStore } from '../../../stores/themeStore';
import { useBoardStore } from '../store/boardStore';
import { useCommandStack } from '../store/commandStack';
import { SelectionOverlay, type ResizeHandle } from '../shapes/SelectionOverlay';
import { AlignmentGuides } from '../shapes/AlignmentGuides';
import { InlineTextEditor } from '../shapes/InlineTextEditor';
import { CanvasAccessibilityLayer } from './CanvasAccessibilityLayer';
import { CanvasGridLayer } from './CanvasGridLayer';
import { CanvasElementLayer } from './CanvasElementLayer';
import { RemoteCursorPresence } from './RemoteCursorPresence';
import { WhiteboardContextMenu } from './WhiteboardContextMenu';
import { useCanvasViewport } from './useCanvasViewport';
import { useCanvasShortcuts } from './useCanvasShortcuts';
import { useCanvasActions } from './useCanvasActions';
import { useCanvasStartInteractions } from './useCanvasStartInteractions';
import {
  FALLBACK_BOARD_DEFAULTS,
  EMPTY_ELEMENTS,
  EMPTY_COMMENTS,
  MIN_ZOOM,
  MAX_ZOOM,
  MIN_ELEMENT_SIZE,
  DOCK_SNAP_RADIUS,
  isPointInsideElementBounds,
  getResizeCursor,
  haveTrackedElementChanges,
  type DockTargetState,
  type TouchGestureState,
} from './canvasUtils';
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
  type FrameElement,
  type ArrowElement,
  type ImageElement,
  type DrawingElement,
} from '../../../types/models';
import { snapResizeRectToAlignmentGuides, snapToAlignmentGuides, type AlignmentGuide, getBoundingRect } from '../../../utils/geometry';
import {
  computeArrowPolyline,
  findNearestDockTarget,
  flattenPoints,
  getDockPosition,
  getMagneticArrowPoint,
  resolveFreeDock,
} from '../../../utils/arrowRouting';
import { v4 as uuidv4 } from 'uuid';
import type { BoardOperationPayload } from '../realtime/boardOperations';
import { describeBoardElement } from '../a11yAnnouncements';
import {
  asOperationPayload,
  createElementAddedOperation,
  createElementUpdatedOperation,
} from '../realtime/boardOperations';
import {
  ARROW_ENDPOINT_CHANGED_KEYS,
  createAddElementsCommand,
  createChangedKeysByElementId,
  createElementUpdateCommand,
} from '../realtime/localBoardCommands';

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
  onOpenSearch?: () => void;
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
  onOpenSearch,
}: WhiteboardCanvasProps) {
  const { t } = useTranslation();
  const accessibilityHelpId = useId();
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [isCanvasFocused, setIsCanvasFocused] = useState(false);

  const board = useBoardStore((s) => s.board);
  const elements = board?.elements ?? EMPTY_ELEMENTS;
  const comments = board?.comments ?? EMPTY_COMMENTS;
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
  const setFollowingClientId = useBoardStore((s) => s.setFollowingClientId);
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
  const boardSurfaceColor = board?.surfaceColor ?? null;
  // If the board has a pinned surface color, use it for all users so everyone
  // sees the same canvas background regardless of their personal theme choice.
  const boardDefaults = useMemo(() => (boardSurfaceColor
    ? { ...rawBoardDefaults, surfaceColor: boardSurfaceColor }
    : rawBoardDefaults), [boardSurfaceColor, rawBoardDefaults]);

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
  const [drawingElementId, setDrawingElementId] = useState<string | null>(null);

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
  const { getWorldPos, getScreenPos, handleWheel } = useCanvasViewport(
    stageRef, containerRef, zoom, cameraX, cameraY, setZoom, setCamera,
  );
  const {
    canGroup,
    canUngroup,
    canInlineEditSelection,
    canSelectAll,
    canPaste,
    isSelectionLocked,
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
    reorderSelectedElements,
    setSelectedElementsLocked,
    moveSelectedElementsBy,
    beginInlineEditingSelection,
    selectAllElements,
    handleContextMenuAction,
    selectAccessibleElement,
    beginInlineEditingElement,
  } = useCanvasActions({
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
  });

  const findTopmostFrameAtPoint = useCallback((point: { x: number; y: number }): FrameElement | null => (
    elements
      .filter((element): element is FrameElement => element.$type === 'frame' && isPointInsideElementBounds(point, element))
      .sort((left, right) => (right.zIndex ?? 0) - (left.zIndex ?? 0))[0]
    ?? null
  ), [elements]);
  const {
    getTouchGestureInfo,
    getResizeHandleFromTarget,
    applyDraggedArrowEndpoint,
    handleMouseDown,
    handleContextMenu,
    handleDblClick,
  } = useCanvasStartInteractions({
    editable,
    activeTool,
    elements,
    selectedIds,
    cameraX,
    cameraY,
    board,
    boardDefaults,
    pendingIconName,
    pendingStickyNotePresetId,
    spacePanActive,
    commentPlacementMode,
    canPaste,
    canSelectAll,
    dockSnapRadius,
    stageRef,
    containerRef,
    dragSnapshotRef,
    resizeSnapshotRef,
    arrowEndpointSnapshotRef,
    marqueeOriginRef,
    getWorldPos,
    getScreenPos,
    addElement,
    pushCommand,
    onBoardChanged,
    onCreateCommentAnchor,
    expandSelectionWithGroups,
    findTopmostFrameAtPoint,
    setContextMenuPosition,
    setIsPanning,
    setPanStart,
    setDrawStart,
    setDraftRect,
    setDraftArrowStart,
    setDraftArrowEnd,
    setDraftArrowHover,
    setMarquee,
    setSelectedElementIds,
    setActiveTool,
    setEditingElement,
    setHoveredResizeHandle,
    setResizeState,
    setArrowEndpointDrag,
    setIsDragging,
    setDragStart,
    setDrawingElementId,
  });

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

  const handleUndo = useCallback(() => {
    applyCommandExecution(peekUndo(), 'undo', commitUndo);
  }, [applyCommandExecution, peekUndo, commitUndo]);

  const handleRedo = useCallback(() => {
    applyCommandExecution(peekRedo(), 'redo', commitRedo);
  }, [applyCommandExecution, peekRedo, commitRedo]);

  const toggleLockSelectedElements = useCallback(() => {
    if (selectedIds.length === 0) return;
    setSelectedElementsLocked(!isSelectionLocked);
  }, [isSelectionLocked, selectedIds.length, setSelectedElementsLocked]);

  useCanvasShortcuts({
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
    toggleLockSelectedElements,
    onOpenSearch,
  });

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

      // Freehand drawing
      if (drawingElementId) {
        const el = elements.find((e) => e.id === drawingElementId) as DrawingElement | undefined;
        if (el) {
          const newPoints = [...el.points, worldPos.x, worldPos.y];
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (let i = 0; i < newPoints.length; i += 2) {
            minX = Math.min(minX, newPoints[i]);
            minY = Math.min(minY, newPoints[i + 1]);
            maxX = Math.max(maxX, newPoints[i]);
            maxY = Math.max(maxY, newPoints[i + 1]);
          }
          updateElement(drawingElementId, {
            points: newPoints,
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          });
        }
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
    [isPanning, panStart, drawingElementId, drawStart, draftRect, draftArrowStart, arrowEndpointDrag, resizeState, marquee, isDragging, dragStart, elements, selectedIds, zoom, editable, activeTool, getWorldPos, getScreenPos, getResizeHandleFromTarget, setCamera, updateElement, applyDraggedArrowEndpoint, onBoardLiveChanged, onPointerPresenceChanged, dockSnapRadius],
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

      // Commit freehand drawing
      if (drawingElementId) {
        const el = elements.find((e) => e.id === drawingElementId);
        if (el) {
          pushCommand(createAddElementsCommand([el]));
          setSelectedElementIds([drawingElementId]);
          setActiveTool('select');
          onBoardChanged('add', createElementAddedOperation(el));
        }
        setDrawingElementId(null);
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
    [isPanning, drawingElementId, drawStart, draftRect, draftArrowStart, draftArrowEnd, draftArrowHover, arrowEndpointDrag, resizeState, marquee, isDragging, elements, editable, activeTool, getResizeHandleFromTarget, addElement, pushCommand, expandSelectionWithGroups, setSelectedElementIds, setActiveTool, boardDefaults, emitUpdatedOperations, selectedIds, onBoardChanged],
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
        <CanvasGridLayer
          zoom={zoom}
          cameraX={cameraX}
          cameraY={cameraY}
          viewportWidth={stageSize.width}
          viewportHeight={stageSize.height}
          gridColor={boardDefaults.gridColor}
          surfaceColor={boardDefaults.surfaceColor}
        />

        {/* Elements layer */}
        <CanvasElementLayer elements={elements} />

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
        isLocked={isSelectionLocked}
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
