import { useRef, useCallback, useState, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMediaQuery } from '@mui/material';
import { Stage, Layer, Rect, Line, Circle, Group, Text } from 'react-konva';
import type Konva from 'konva';
import { getThemes } from '../../../api/themes';
import { useThemeStore } from '../../../stores/themeStore';
import { useBoardStore } from '../store/boardStore';
import { useCommandStack } from '../store/commandStack';
import { ShapeRenderer } from '../shapes/ShapeRenderer';
import { TextRenderer } from '../shapes/TextRenderer';
import { ArrowRenderer } from '../shapes/ArrowRenderer';
import { IconRenderer } from '../shapes/IconRenderer';
import { SelectionOverlay, type ResizeHandle } from '../shapes/SelectionOverlay';
import { AlignmentGuides } from '../shapes/AlignmentGuides';
import { InlineTextEditor } from '../shapes/InlineTextEditor';
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
  type ArrowElement,
  type IconElement,
} from '../../../types/models';
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

const GRID_SIZE = 24;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3.5;
const MIN_ELEMENT_SIZE = 24;
const DOCK_SNAP_RADIUS = 28;
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
  onBoardChanged: (changeKind: string) => void;
  onBoardLiveChanged?: (changeKind: string) => void;
  onPointerPresenceChanged?: (worldX: number | null, worldY: number | null) => void;
  localPresenceClientId?: string | null;
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
}: WhiteboardCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });

  const board = useBoardStore((s) => s.board);
  const elements = board?.elements ?? [];
  const selectedIds = useBoardStore((s) => s.selectedElementIds);
  const activeTool = useBoardStore((s) => s.activeTool);
  const zoom = useBoardStore((s) => s.zoom);
  const cameraX = useBoardStore((s) => s.cameraX);
  const cameraY = useBoardStore((s) => s.cameraY);
  const setSelectedElementIds = useBoardStore((s) => s.setSelectedElementIds);
  const setActiveTool = useBoardStore((s) => s.setActiveTool);
  const setZoom = useBoardStore((s) => s.setZoom);
  const setCamera = useBoardStore((s) => s.setCamera);
  const addElement = useBoardStore((s) => s.addElement);
  const updateElement = useBoardStore((s) => s.updateElement);
  const removeElements = useBoardStore((s) => s.removeElements);
  const setElements = useBoardStore((s) => s.setElements);
  const remoteCursors = useBoardStore((s) => s.remoteCursors);
  const pendingIconName = useBoardStore((s) => s.pendingIconName);
  const themeKey = useThemeStore((s) => s.themeKey);
  const isCoarsePointer = useMediaQuery('(pointer: coarse)');
  const dockSnapRadius = isCoarsePointer ? DOCK_SNAP_RADIUS * 1.6 : DOCK_SNAP_RADIUS;

  const { data: themes = [] } = useQuery({
    queryKey: ['themes'],
    queryFn: getThemes,
    staleTime: 60_000,
  });
  const activeTheme = themes.find((theme) => theme.key === themeKey) ?? themes[0] ?? null;
  const boardDefaults = activeTheme?.boardDefaults ?? FALLBACK_BOARD_DEFAULTS;

  const pushCommand = useCommandStack((s) => s.push);
  const undo = useCommandStack((s) => s.undo);
  const redo = useCommandStack((s) => s.redo);

  // Dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [guides, setGuides] = useState<AlignmentGuide[]>([]);
  const dragSnapshotRef = useRef<BoardElement[] | null>(null);
  const resizeSnapshotRef = useRef<BoardElement[] | null>(null);
  const touchGestureRef = useRef<TouchGestureState | null>(null);

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

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setStageSize({ width, height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (editingElement) return; // don't intercept while editing text
      if (!editable) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length > 0) {
          const before = [...elements];
          removeElements(selectedIds);
          pushCommand(before, elements.filter((el: BoardElement) => !selectedIds.includes(el.id)));
          setSelectedElementIds([]);
          onBoardChanged('delete');
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const result = undo();
        if (result) {
          setElements(result);
          onBoardChanged('undo');
        }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        const result = redo();
        if (result) {
          setElements(result);
          onBoardChanged('redo');
        }
      }
      if (e.key === 'Escape') {
        setSelectedElementIds([]);
        setActiveTool('select');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [editable, selectedIds, elements, editingElement, removeElements, setSelectedElementIds, setActiveTool, pushCommand, undo, redo, setElements, onBoardChanged]);

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
      const connectedElement = elements.find((element) => element.id === elementId && element.$type !== 'arrow');
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
        const hoverElement = elements.find((element) => element.id === drag.hoverElementId && element.$type !== 'arrow');
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
      const worldPos = getWorldPos();
      const screenPos = getScreenPos();
      if (!screenPos) return;

      // Middle mouse or hand tool → pan
      if (e.evt.button === 1 || activeTool === 'hand') {
        setIsPanning(true);
        setPanStart({ x: screenPos.x, y: screenPos.y, cx: cameraX, cy: cameraY });
        return;
      }

      // Drawing tools
      if (editable && (activeTool === 'rectangle' || activeTool === 'ellipse' || activeTool === 'triangle')) {
        setDrawStart(worldPos);
        setDraftRect({ x: worldPos.x, y: worldPos.y, w: 0, h: 0 });
        return;
      }

      // Text tool — place immediately
      if (editable && activeTool === 'text') {
        const before = [...elements];
        const newText: TextElement = {
          $type: 'text',
          id: uuidv4(),
          x: worldPos.x - 110,
          y: worldPos.y - 28,
          width: 220,
          height: 56,
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
        pushCommand(before, [...elements, newText]);
        setSelectedElementIds([newText.id]);
        setActiveTool('select');
        setEditingElement(newText);
        onBoardChanged('add');
        return;
      }

      if (editable && activeTool === 'icon' && pendingIconName) {
        const before = [...elements];
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
        pushCommand(before, [...elements, newIcon]);
        setSelectedElementIds([newIcon.id]);
        setActiveTool('select');
        onBoardChanged('add');
        return;
      }

      // Arrow tool
      if (editable && activeTool === 'arrow') {
        // Find nearest dock
        const hitEl = elements.find(
          (el: BoardElement) =>
            el.$type !== 'arrow' &&
            worldPos.x >= el.x &&
            worldPos.x <= el.x + el.width &&
            worldPos.y >= el.y &&
            worldPos.y <= el.y + el.height,
        );
        if (hitEl) {
          const dock = nearestDock(hitEl, worldPos);
          const dockPos = getDockPosition(hitEl, dock);
          setDraftArrowStart({ x: dockPos.x, y: dockPos.y, elementId: hitEl.id, dock });
        } else {
          setDraftArrowStart({ x: worldPos.x, y: worldPos.y });
        }
        setDraftArrowEnd(worldPos);
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

        // Clicked on stage background
        if (target === stageRef.current) {
          if (!e.evt.shiftKey) {
            setSelectedElementIds([]);
          }
          // Start marquee
          setMarquee({ x: worldPos.x, y: worldPos.y, w: 0, h: 0 });
          return;
        }

        // Find the element id from the target
        const elementId = getElementIdFromTarget(target);
        if (elementId) {
          if (e.evt.shiftKey) {
            // Toggle in selection
            setSelectedElementIds(
              selectedIds.includes(elementId)
                ? selectedIds.filter((id) => id !== elementId)
                : [...selectedIds, elementId],
            );
          } else if (!selectedIds.includes(elementId)) {
            setSelectedElementIds([elementId]);
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
    [editable, activeTool, elements, selectedIds, cameraX, cameraY, zoom, getWorldPos, getScreenPos, getElementIdFromTarget, getResizeHandleFromTarget, getArrowEndpointHandleFromTarget, resolveArrowEndpoint, setSelectedElementIds, setActiveTool, addElement, pendingIconName, pushCommand, onBoardChanged, boardDefaults],
  );

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
        const hoverTarget = findNearestDockTarget(elements, worldPos, undefined, dockSnapRadius);
        const nextPointer = hoverTarget?.point ?? getMagneticArrowPoint(
          arrowEndpointDrag.fixedPoint,
          worldPos,
          arrow?.routeStyle ?? ArrowRouteStyle.Orthogonal,
        );
        const nextDrag = {
          ...arrowEndpointDrag,
          hoverElementId: hoverTarget?.elementId ?? null,
          hoverDock: hoverTarget?.dock ?? null,
          pointer: nextPointer,
        };

        setArrowEndpointDrag(nextDrag);
        updateElement(arrowEndpointDrag.arrowId, (element) => {
          if (element.$type !== 'arrow') {
            return element;
          }

          return applyDraggedArrowEndpoint(element, arrowEndpointDrag.isSource, nextDrag);
        });
        onBoardLiveChanged?.('edit');
        return;
      }

      if (resizeState) {
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

        updateElement(resizeState.elementId, {
          x: nextLeft,
          y: nextTop,
          width: nextRight - nextLeft,
          height: nextBottom - nextTop,
        });
        onBoardLiveChanged?.('resize');
        return;
      }

      // Marquee
      if (marquee) {
        const mx = Math.min(marquee.x, worldPos.x);
        const my = Math.min(marquee.y, worldPos.y);
        const mw = Math.abs(worldPos.x - marquee.x);
        const mh = Math.abs(worldPos.y - marquee.y);
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

          for (const el of selectedEls) {
            updateElement(el.id, {
              x: el.x + dx + snapDx,
              y: el.y + dy + snapDy,
            });
          }
          onBoardLiveChanged?.('move');
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
        const before = [...elements];
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
        pushCommand(before, [...elements, newShape]);
        setSelectedElementIds([newShape.id]);
        setActiveTool('select');
        onBoardChanged('add');
      }
      setDrawStart(null);
      setDraftRect(null);

      // Commit arrow
      if (draftArrowStart && draftArrowEnd) {
        const dist = Math.hypot(draftArrowEnd.x - draftArrowStart.x, draftArrowEnd.y - draftArrowStart.y);
        if (dist > 10) {
          const before = [...elements];
          const targetEl = draftArrowHover
            ? elements.find((el: BoardElement) => el.id === draftArrowHover.elementId && el.$type !== 'arrow')
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
          pushCommand(before, [...elements, newArrow]);
          setSelectedElementIds([newArrow.id]);
          setActiveTool('select');
          onBoardChanged('add');
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

        if (before && JSON.stringify(before) !== JSON.stringify(after)) {
          pushCommand(before, after);
          onBoardChanged('edit');
        }

        return;
      }

      if (resizeState) {
        const before = resizeSnapshotRef.current;
        const after = [...useBoardStore.getState().board?.elements ?? []];
        setResizeState(null);
        setGuides([]);
        resizeSnapshotRef.current = null;

        if (before && JSON.stringify(before) !== JSON.stringify(after)) {
          pushCommand(before, after);
          onBoardChanged('resize');
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
        setSelectedElementIds(enclosed.map((el: BoardElement) => el.id));
      }
      setMarquee(null);

      // End drag
      if (isDragging) {
        const before = dragSnapshotRef.current;
        const after = [...useBoardStore.getState().board?.elements ?? []];
        setIsDragging(false);
        setDragStart(null);
        setGuides([]);

        if (before && JSON.stringify(before) !== JSON.stringify(after)) {
          pushCommand(before, after);
          onBoardChanged('move');
        }

        dragSnapshotRef.current = null;
      }
    },
    [isPanning, drawStart, draftRect, draftArrowStart, draftArrowEnd, draftArrowHover, arrowEndpointDrag, resizeState, marquee, isDragging, elements, editable, activeTool, zoom, getResizeHandleFromTarget, getWorldPos, setCamera, addElement, pushCommand, setSelectedElementIds, setActiveTool, onBoardChanged, updateElement, boardDefaults],
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
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const direction = e.evt.deltaY < 0 ? 1 : -1;
      const factor = 1.1;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (direction > 0 ? factor : 1 / factor)));

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
      if (!elementId) return;
      const el = elements.find((el: BoardElement) => el.id === elementId);
      if (editable && el && (el.$type === 'text' || el.$type === 'shape')) {
        setSelectedElementIds([el.id]);
        setEditingElement(el);
      }
    },
    [editable, elements, getElementIdFromTarget, setSelectedElementIds],
  );

  // Inline editor callbacks
  const handleTextCommit = useCallback(
    (id: string, value: string) => {
      const el = elements.find((element: BoardElement) => element.id === id);
      if (!el) return;
      const before = [...elements];
      const after = elements.map((element: BoardElement) => {
        if (element.id !== id) {
          return element;
        }

        return element.$type === 'text'
          ? { ...element, text: value }
          : { ...element, label: value };
      });

      if (el.$type === 'text') {
        updateElement(id, { text: value });
      } else if (el.$type === 'shape') {
        updateElement(id, { label: value });
      }
      pushCommand(before, after);
      setEditingElement(null);
      onBoardChanged('edit');
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

  // Grid pattern
  const gridLines: ReactNode[] = [];
  if (zoom > 0.3) {
    const step = GRID_SIZE;
    const worldLeft = -cameraX / zoom;
    const worldTop = -cameraY / zoom;
    const worldRight = worldLeft + stageSize.width / zoom;
    const worldBottom = worldTop + stageSize.height / zoom;
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
      style={{
        width: '100%',
        height: '100%',
        background: boardDefaults.surfaceColor,
        touchAction: 'none',
        overscrollBehavior: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        cursor:
          resizeCursor
            ? resizeCursor
            : isPanning
              ? 'grabbing'
              : activeTool === 'hand'
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
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* Grid layer */}
        <Layer listening={false}>
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
              case 'arrow':
                return <ArrowRenderer key={el.id} element={el} elements={elements} />;
              case 'icon':
                return <IconRenderer key={el.id} element={el} />;
              default:
                return null;
            }
          })}

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

          {showDockHandles && elements.filter((element) => element.$type !== 'arrow').flatMap((element) => [
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

          {remoteCursors
            .filter((cursor) => cursor.clientId !== localPresenceClientId && cursor.worldX != null && cursor.worldY != null)
            .map((cursor) => (
              <Group key={cursor.clientId} x={cursor.worldX ?? 0} y={cursor.worldY ?? 0} listening={false}>
                <Line
                  points={[0, 0, 0, 24 / zoom, 5 / zoom, 18 / zoom, 8 / zoom, 28 / zoom, 12 / zoom, 26 / zoom, 9 / zoom, 16 / zoom, 18 / zoom, 16 / zoom]}
                  closed
                  fill="#111827"
                  opacity={0.22}
                  strokeEnabled={false}
                  x={1.5 / zoom}
                  y={2 / zoom}
                />
                <Line
                  points={[0, 0, 0, 24 / zoom, 5 / zoom, 18 / zoom, 8 / zoom, 28 / zoom, 12 / zoom, 26 / zoom, 9 / zoom, 16 / zoom, 18 / zoom, 16 / zoom]}
                  closed
                  fill="#FFFFFF"
                  stroke="#111827"
                  strokeWidth={1.6 / zoom}
                  lineJoin="round"
                />
                <Circle x={13 / zoom} y={24 / zoom} radius={4 / zoom} fill={cursor.colorHex} stroke="#FFFFFF" strokeWidth={1 / zoom} />
                <Rect
                  x={20 / zoom}
                  y={10 / zoom}
                  width={(cursor.displayName.length * 7 + 16) / zoom}
                  height={22 / zoom}
                  fill={cursor.colorHex}
                  cornerRadius={6 / zoom}
                  opacity={0.92}
                />
                <Text
                  x={28 / zoom}
                  y={14 / zoom}
                  text={cursor.displayName}
                  fontSize={12 / zoom}
                  fill="#ffffff"
                />
              </Group>
            ))}

          {/* Alignment guides */}
          <AlignmentGuides guides={guides} zoom={zoom} stageSize={stageSize} cameraX={cameraX} cameraY={cameraY} />
        </Layer>
      </Stage>

      {/* Inline text editor (DOM overlay) */}
      {editingElement && stageRef.current && (
        <InlineTextEditor
          element={editingElement}
          zoom={zoom}
          cameraX={cameraX}
          cameraY={cameraY}
          onCommit={handleTextCommit}
          onCancel={handleTextCancel}
        />
      )}
    </div>
  );
}
