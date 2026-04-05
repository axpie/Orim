import { useCallback, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type Konva from 'konva';
import { createAddElementsCommand, type LocalBoardCommand } from '../realtime/localBoardCommands';
import { createElementAddedOperation, type BoardOperationPayload } from '../realtime/boardOperations';
import { DEFAULT_STICKY_NOTE_FILL_COLOR, getStickyNotePresetById } from '../stickyNotePresets';
import { contrastingTextColor } from '../../../utils/colorUtils';
import {
  findNearestDockTarget,
  getDockPosition,
  nearestDock,
  resolveFreeDock,
} from '../../../utils/arrowRouting';
import {
  DEFAULT_TEXT_HEIGHT,
  DEFAULT_TEXT_WIDTH,
  isPointInsideElementBounds,
  type ArrowEndpointHandleKind,
  type ArrowRouteHandleKind,
  type DockTargetState,
} from './canvasUtils';
import type { ResizeHandle } from '../shapes/SelectionOverlay';
import {
  HorizontalLabelAlignment,
  ArrowRouteStyle,
  VerticalLabelAlignment,
} from '../../../types/models';
import type {
  ArrowElement,
  Board,
  BoardElement,
  DockPoint,
  DrawingElement,
  FrameElement,
  IconElement,
  ShapeElement,
  StickyNoteElement,
  TextElement,
  ThemeBoardDefaultsDefinition,
} from '../../../types/models';
import type { ToolType } from '../store/boardStore';

type Point = { x: number; y: number };
type PanStartState = { x: number; y: number; cx: number; cy: number } | null;
type DraftRectState = { x: number; y: number; w: number; h: number } | null;
type DraftArrowStartState = { x: number; y: number; elementId?: string; dock?: DockPoint } | null;
type MarqueeState = { x: number; y: number; w: number; h: number } | null;
type ArrowEndpointDragState = {
  arrowId: string;
  isSource: boolean;
  fixedPoint: Point;
  fixedDock: DockPoint;
  hoverElementId: string | null;
  hoverDock: DockPoint | null;
  pointer: Point;
} | null;
type ArrowRouteHandleDragState = {
  arrowId: string;
} | null;
type ResizeState = {
  elementId: string;
  handle: ResizeHandle;
  initialX: number;
  initialY: number;
  initialWidth: number;
  initialHeight: number;
  initialDrawingPoints?: number[];
} | null;

export type RotationState = {
  elementIds: string[];
  centerX: number;
  centerY: number;
  startAngle: number;
  initialRotations: Map<string, number>;
} | null;

interface UseCanvasStartInteractionsOptions {
  editable: boolean;
  activeTool: ToolType;
  elements: BoardElement[];
  selectedIds: string[];
  cameraX: number;
  cameraY: number;
  board: Board | null;
  boardDefaults: ThemeBoardDefaultsDefinition;
  pendingIconName: string | null;
  pendingStickyNotePresetId: string | null;
  spacePanActive: boolean;
  commentPlacementMode: boolean;
  canPaste: boolean;
  canSelectAll: boolean;
  dockSnapRadius: number;
  stageRef: RefObject<Konva.Stage | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  dragSnapshotRef: MutableRefObject<BoardElement[] | null>;
  resizeSnapshotRef: MutableRefObject<BoardElement[] | null>;
  arrowEndpointSnapshotRef: MutableRefObject<BoardElement[] | null>;
  arrowRouteHandleSnapshotRef: MutableRefObject<BoardElement[] | null>;
  marqueeOriginRef: MutableRefObject<Point | null>;
  getWorldPos: () => Point;
  getScreenPos: () => Point | null;
  addElement: (element: BoardElement) => void;
  pushCommand: (command: LocalBoardCommand) => void;
  onBoardChanged: (changeKind: string, operation?: BoardOperationPayload) => void;
  onCreateCommentAnchor?: (position: Point) => void;
  expandSelectionWithGroups: (ids: string[]) => string[];
  findTopmostFrameAtPoint: (point: Point) => FrameElement | null;
  setContextMenuPosition: Dispatch<SetStateAction<{ left: number; top: number } | null>>;
  setIsPanning: Dispatch<SetStateAction<boolean>>;
  setPanStart: Dispatch<SetStateAction<PanStartState>>;
  setDrawStart: Dispatch<SetStateAction<Point | null>>;
  setDraftRect: Dispatch<SetStateAction<DraftRectState>>;
  setDraftArrowStart: Dispatch<SetStateAction<DraftArrowStartState>>;
  setDraftArrowEnd: Dispatch<SetStateAction<Point | null>>;
  setDraftArrowHover: Dispatch<SetStateAction<DockTargetState | null>>;
  setMarquee: Dispatch<SetStateAction<MarqueeState>>;
  setSelectedElementIds: (ids: string[]) => void;
  setActiveTool: (tool: ToolType) => void;
  setEditingElement: Dispatch<SetStateAction<BoardElement | null>>;
  setHoveredResizeHandle: Dispatch<SetStateAction<ResizeHandle | null>>;
  setResizeState: Dispatch<SetStateAction<ResizeState>>;
  setArrowEndpointDrag: Dispatch<SetStateAction<ArrowEndpointDragState>>;
  setArrowRouteHandleDrag: Dispatch<SetStateAction<ArrowRouteHandleDragState>>;
  setIsDragging: Dispatch<SetStateAction<boolean>>;
  setDragStart: Dispatch<SetStateAction<Point | null>>;
  setDrawingElementId: Dispatch<SetStateAction<string | null>>;
  rotationSnapshotRef: MutableRefObject<BoardElement[] | null>;
  setRotationState: Dispatch<SetStateAction<RotationState>>;
  setHoveredRotationHandle: Dispatch<SetStateAction<boolean>>;
}

function isInlineEditableElement(element: BoardElement | undefined | null): element is TextElement | StickyNoteElement | ShapeElement | FrameElement {
  return !!element
    && (element.$type === 'text'
      || element.$type === 'sticky'
      || element.$type === 'shape'
      || element.$type === 'frame');
}

export function useCanvasStartInteractions({
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
  arrowRouteHandleSnapshotRef,
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
  setArrowRouteHandleDrag,
  setIsDragging,
  setDragStart,
  setDrawingElementId,
  rotationSnapshotRef,
  setRotationState,
}: UseCanvasStartInteractionsOptions) {
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
  }, [containerRef]);

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

  const getArrowRouteHandleFromTarget = useCallback((target: Konva.Node | null): ArrowRouteHandleKind | null => {
    let current: Konva.Node | null = target;
    while (current) {
      const candidate = current.getAttr?.('data-arrow-route-handle');
      if (candidate === 'arc') {
        return candidate;
      }
      current = current.getParent();
    }
    return null;
  }, []);

  const getRotationHandleFromTarget = useCallback((target: Konva.Node | null): boolean => {
    let current: Konva.Node | null = target;
    while (current) {
      const candidate = current.getAttr?.('data-rotation-handle');
      if (candidate === 'true' || candidate === true) {
        return true;
      }
      current = current.getParent();
    }
    return false;
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

  const applyDraggedArrowEndpoint = useCallback((
    arrow: ArrowElement,
    isSource: boolean,
    drag: {
      fixedPoint: Point;
      hoverElementId: string | null;
      hoverDock: DockPoint | null;
      pointer: Point;
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
  }, [elements]);

  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
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

    if (e.evt.button === 1 || activeTool === 'hand' || spacePanActive) {
      setIsPanning(true);
      setPanStart({ x: screenPos.x, y: screenPos.y, cx: cameraX, cy: cameraY });
      return;
    }

    if (editable && activeTool === 'drawing') {
      const newDrawing: DrawingElement = {
        $type: 'drawing',
        id: uuidv4(),
        x: worldPos.x,
        y: worldPos.y,
        width: 0,
        height: 0,
        zIndex: elements.length,
        rotation: 0,
        label: '',
        labelHorizontalAlignment: HorizontalLabelAlignment.Center,
        labelVerticalAlignment: VerticalLabelAlignment.Middle,
        points: [worldPos.x, worldPos.y],
        strokeColor: boardDefaults.strokeColor,
        strokeWidth: 2,
      };
      addElement(newDrawing);
      setDrawingElementId(newDrawing.id);
      return;
    }

    if (editable && (activeTool === 'rectangle' || activeTool === 'ellipse' || activeTool === 'triangle' || activeTool === 'rhombus' || activeTool === 'frame')) {
      setDrawStart(worldPos);
      setDraftRect({ x: worldPos.x, y: worldPos.y, w: 0, h: 0 });
      return;
    }

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

    if (editable && activeTool === 'arrow') {
      const startDockTarget = findNearestDockTarget(elements, worldPos, undefined, dockSnapRadius);
      const hitEl = startDockTarget
        ? elements.find((element) => element.id === startDockTarget.elementId && element.$type !== 'arrow' && element.$type !== 'frame')
        : elements.find(
          (element) => element.$type !== 'arrow' && element.$type !== 'frame' && isPointInsideElementBounds(worldPos, element),
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

    if (activeTool === 'select') {
      const target = e.target;

      if (editable && getRotationHandleFromTarget(target)) {
        setHoveredResizeHandle(null);
        const rotatableSelected = elements.filter(
          (el) => selectedIds.includes(el.id) && el.$type !== 'arrow' && el.isLocked !== true,
        );
        if (rotatableSelected.length > 0) {
          rotationSnapshotRef.current = [...elements];
          let cx: number, cy: number;
          if (rotatableSelected.length === 1) {
            const el = rotatableSelected[0];
            cx = el.x + el.width / 2;
            cy = el.y + el.height / 2;
          } else {
            let rMinX = Infinity, rMinY = Infinity, rMaxX = -Infinity, rMaxY = -Infinity;
            for (const el of rotatableSelected) {
              rMinX = Math.min(rMinX, el.x);
              rMinY = Math.min(rMinY, el.y);
              rMaxX = Math.max(rMaxX, el.x + el.width);
              rMaxY = Math.max(rMaxY, el.y + el.height);
            }
            cx = (rMinX + rMaxX) / 2;
            cy = (rMinY + rMaxY) / 2;
          }
          const startAngle = Math.atan2(worldPos.y - cy, worldPos.x - cx) * (180 / Math.PI);
          const initialRotations = new Map<string, number>();
          for (const el of rotatableSelected) {
            initialRotations.set(el.id, el.rotation);
          }
          setRotationState({
            elementIds: rotatableSelected.map((el) => el.id),
            centerX: cx,
            centerY: cy,
            startAngle,
            initialRotations,
          });
          return;
        }
      }

      const resizeHandle = getResizeHandleFromTarget(target);
      setHoveredResizeHandle(resizeHandle);
      if (editable && resizeHandle) {
        const elementId = getElementIdFromTarget(target);
        const element = elementId
          ? elements.find((candidate) => candidate.id === elementId)
          : null;

        if (element && element.$type !== 'arrow') {
          if (element.isLocked === true) {
            setSelectedElementIds([element.id]);
            return;
          }
          resizeSnapshotRef.current = [...elements];
          setSelectedElementIds([element.id]);
          setResizeState({
            elementId: element.id,
            handle: resizeHandle,
            initialX: element.x,
            initialY: element.y,
            initialWidth: element.width,
            initialHeight: element.height,
            initialDrawingPoints: element.$type === 'drawing' ? [...element.points] : undefined,
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
          if (arrow.isLocked === true) {
            setSelectedElementIds([arrow.id]);
            return;
          }

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

      const arrowRouteHandle = editable ? getArrowRouteHandleFromTarget(target) : null;
      if (arrowRouteHandle) {
        const arrowId = getElementIdFromTarget(target);
        const arrow = arrowId
          ? elements.find((candidate): candidate is ArrowElement => candidate.id === arrowId && candidate.$type === 'arrow')
          : null;

        if (arrow?.routeStyle === ArrowRouteStyle.Arc) {
          if (arrow.isLocked === true) {
            setSelectedElementIds([arrow.id]);
            return;
          }

          arrowRouteHandleSnapshotRef.current = [...elements];
          setSelectedElementIds([arrow.id]);
          setArrowRouteHandleDrag({ arrowId: arrow.id });
          return;
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
          setSelectedElementIds(groupedSelectionIds);
        }

        if (editable && frameAtPoint.isLocked !== true) {
          dragSnapshotRef.current = [...elements];
          setIsDragging(true);
          setDragStart(worldPos);
        }
        return;
      }

      if (target === stageRef.current) {
        if (!e.evt.shiftKey) {
          setSelectedElementIds([]);
        }
        marqueeOriginRef.current = { x: worldPos.x, y: worldPos.y };
        setMarquee({ x: worldPos.x, y: worldPos.y, w: 0, h: 0 });
        return;
      }

      const elementId = getElementIdFromTarget(target);
      if (elementId) {
        const clickedElement = elements.find((candidate) => candidate.id === elementId);
        const groupedSelectionIds = expandSelectionWithGroups([elementId]);

        if (e.evt.shiftKey) {
          const hasGroupedSelection = groupedSelectionIds.some((id) => selectedIds.includes(id));
          setSelectedElementIds(
            hasGroupedSelection
              ? selectedIds.filter((id) => !groupedSelectionIds.includes(id))
              : [...selectedIds, ...groupedSelectionIds.filter((id) => !selectedIds.includes(id))],
          );
        } else if (groupedSelectionIds.some((id) => !selectedIds.includes(id))) {
          setSelectedElementIds(groupedSelectionIds);
        }

        if (editable && clickedElement?.isLocked !== true) {
          dragSnapshotRef.current = [...elements];
          setIsDragging(true);
          setDragStart(worldPos);
        }
      }
    }
  }, [
    activeTool,
    addElement,
    arrowEndpointSnapshotRef,
    arrowRouteHandleSnapshotRef,
    board,
    boardDefaults,
    cameraX,
    cameraY,
    commentPlacementMode,
    containerRef,
    dockSnapRadius,
    dragSnapshotRef,
    editable,
    elements,
    expandSelectionWithGroups,
    findTopmostFrameAtPoint,
    getArrowEndpointHandleFromTarget,
    getArrowRouteHandleFromTarget,
    getElementIdFromTarget,
    getResizeHandleFromTarget,
    getScreenPos,
    getWorldPos,
    onBoardChanged,
    onCreateCommentAnchor,
    marqueeOriginRef,
    pendingIconName,
    pendingStickyNotePresetId,
    pushCommand,
    resizeSnapshotRef,
    resolveArrowEndpoint,
    selectedIds,
    setActiveTool,
    setArrowEndpointDrag,
    setArrowRouteHandleDrag,
    setContextMenuPosition,
    setDraftArrowEnd,
    setDraftArrowHover,
    setDraftArrowStart,
    setDraftRect,
    setDrawStart,
    setDrawingElementId,
    setDragStart,
    setEditingElement,
    setHoveredResizeHandle,
    setIsDragging,
    setIsPanning,
    setMarquee,
    setPanStart,
    setResizeState,
    setRotationState,
    setSelectedElementIds,
    spacePanActive,
    stageRef,
    getRotationHandleFromTarget,
    rotationSnapshotRef,
  ]);

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
    containerRef,
    editable,
    expandSelectionWithGroups,
    findTopmostFrameAtPoint,
    getElementIdFromTarget,
    getWorldPos,
    selectedIds,
    setContextMenuPosition,
    setSelectedElementIds,
    stageRef,
  ]);

  const handleDblClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
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

    const element = elements.find((candidate) => candidate.id === elementId);
    if (editable && isInlineEditableElement(element)) {
      setSelectedElementIds([element.id]);
      setEditingElement(element);
    }
  }, [editable, elements, findTopmostFrameAtPoint, getElementIdFromTarget, getWorldPos, setEditingElement, setSelectedElementIds]);

  return {
    getTouchGestureInfo,
    getResizeHandleFromTarget,
    getRotationHandleFromTarget,
    applyDraggedArrowEndpoint,
    handleMouseDown,
    handleContextMenu,
    handleDblClick,
  };
}
