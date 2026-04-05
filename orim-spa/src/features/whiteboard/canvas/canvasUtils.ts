import type { BoardComment, BoardElement, DockPoint } from '../../../types/models';
import type { ResizeHandle } from '../shapes/SelectionOverlay';
import { v4 as uuidv4 } from 'uuid';
import { translateDrawingPoints } from './drawingGeometry';

// ── Constants ──

export const GRID_SIZE = 24;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3.5;
export const MIN_ELEMENT_SIZE = 24;
export const DOCK_SNAP_RADIUS = 28;
export const KEYBOARD_DUPLICATE_OFFSET = 32;
export const TRACKPAD_DELTA_THRESHOLD = 24;
export const DEFAULT_TEXT_WIDTH = 220;
export const DEFAULT_TEXT_HEIGHT = 56;

export const FALLBACK_BOARD_DEFAULTS = {
  surfaceColor: '#FFFFFF',
  gridColor: '#EEF2F7',
  shapeFillColor: '#FFFFFF',
  strokeColor: '#0F172A',
  iconColor: '#0F172A',
  selectionColor: '#2563EB',
  selectionTintRgb: '37, 99, 235',
  handleSurfaceColor: '#FFFFFF',
  dockTargetColor: '#0F766E',
  themeColors: ['#6E40C9', '#1F8A5B', '#EA580C', '#0F172A', '#2563EB', '#FFFFFF', '#F59E0B', '#0EA5E9'],
};

export const EMPTY_ELEMENTS: BoardElement[] = [];
export const EMPTY_COMMENTS: BoardComment[] = [];

// ── Types ──

export type DockTargetState = {
  elementId: string;
  dock: DockPoint;
  point: { x: number; y: number };
};

export type ArrowEndpointHandleKind = 'source' | 'target';
export type ArrowRouteHandleKind = 'arc';

export type TouchGestureState = {
  initialDistance: number;
  initialZoom: number;
  anchorWorldX: number;
  anchorWorldY: number;
};

export type SafariGestureEvent = Event & {
  scale: number;
  clientX?: number;
  clientY?: number;
};

// ── Pure utility functions ──

export function isInteractiveTextTarget(target: EventTarget | null): boolean {
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

export function areComparedValuesEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => Object.is(value, right[index]));
  }

  return Object.is(left, right);
}

export function haveTrackedElementChanges(
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

export function isTrackpadPanWheelEvent(event: WheelEvent): boolean {
  const absDeltaX = Math.abs(event.deltaX);
  const absDeltaY = Math.abs(event.deltaY);

  return event.deltaMode === WheelEvent.DOM_DELTA_PIXEL
    && !event.ctrlKey
    && !event.metaKey
    && (absDeltaX > 0 || absDeltaY < TRACKPAD_DELTA_THRESHOLD);
}

export function cloneElementsForInsertion(
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

    if (clone.$type === 'drawing') {
      clone.points = translateDrawingPoints(clone.points, offsetX, offsetY);
    }

    return clone;
  });
}

export function isPointInsideElementBounds(
  point: { x: number; y: number },
  element: Pick<BoardElement, 'x' | 'y' | 'width' | 'height'>,
): boolean {
  return point.x >= element.x
    && point.x <= element.x + element.width
    && point.y >= element.y
    && point.y <= element.y + element.height;
}

export function getResizeCursor(handle: ResizeHandle | null | undefined): string | null {
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
