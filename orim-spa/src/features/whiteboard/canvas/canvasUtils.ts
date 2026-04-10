import {
  DockPoint,
  HorizontalLabelAlignment,
  VerticalLabelAlignment,
  type ArrowElement,
  type BoardElement,
  type FrameElement,
  type IconElement,
  type MarkdownElement,
  type RichTextElement,
  type ShapeElement,
  type StickyNoteElement,
} from '../../../types/models';
import type { ResizeHandle } from '../shapes/SelectionOverlay';
import { v4 as uuidv4 } from 'uuid';
import { translateDrawingElement } from './drawingGeometry';
import { getTextContent, isTextContentElement, withTextContent } from '../textElements';

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
export const DEFAULT_ICON_SIZE = 56;
export const MOVE_TRACKED_ELEMENT_CHANGED_KEYS = [
  'x',
  'y',
  'points',
  'sourceX',
  'sourceY',
  'targetX',
  'targetY',
  'orthogonalMiddleCoordinate',
  'arcMidX',
  'arcMidY',
] as const;

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

// ── Types ──

export type InlineEditableElement = RichTextElement | MarkdownElement | StickyNoteElement | ShapeElement | FrameElement | Extract<BoardElement, { $type: 'text' }>;

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

export function isInlineEditableElement(
  element: BoardElement | undefined | null,
): element is InlineEditableElement {
  return !!element
    && (element.$type === 'text'
      || element.$type === 'richtext'
      || element.$type === 'markdown'
      || element.$type === 'sticky'
      || element.$type === 'shape'
      || element.$type === 'frame');
}

export function appendInlineEditingText(
  element: InlineEditableElement,
  appendedText: string,
): InlineEditableElement {
  if (isTextContentElement(element)) {
    return withTextContent(element, `${getTextContent(element)}${appendedText}`);
  }

  switch (element.$type) {
    case 'sticky':
      return { ...element, text: `${element.text ?? ''}${appendedText}` };
    case 'shape':
    case 'frame':
      return { ...element, label: `${element.label ?? ''}${appendedText}` };
  }
}

export function getIconPlacementBounds(
  origin: { x: number; y: number },
  draftRect: { x: number; y: number; w: number; h: number } | null,
): { x: number; y: number; width: number; height: number } {
  if (draftRect && draftRect.w >= 12 && draftRect.h >= 12) {
    return {
      x: draftRect.x,
      y: draftRect.y,
      width: draftRect.w,
      height: draftRect.h,
    };
  }

  return {
    x: origin.x - DEFAULT_ICON_SIZE / 2,
    y: origin.y - DEFAULT_ICON_SIZE / 2,
    width: DEFAULT_ICON_SIZE,
    height: DEFAULT_ICON_SIZE,
  };
}

export function createIconPlacementElement(options: {
  id: string;
  iconName: string;
  color: string;
  zIndex: number;
  origin: { x: number; y: number };
  draftRect: { x: number; y: number; w: number; h: number } | null;
}): IconElement {
  const bounds = getIconPlacementBounds(options.origin, options.draftRect);

  return {
    $type: 'icon',
    id: options.id,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    zIndex: options.zIndex,
    rotation: 0,
    label: '',
    labelHorizontalAlignment: HorizontalLabelAlignment.Center,
    labelVerticalAlignment: VerticalLabelAlignment.Middle,
    iconName: options.iconName,
    color: options.color,
  };
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
    let clone = structuredClone(element) as BoardElement;
    clone.id = idMap.get(element.id) ?? uuidv4();
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
      clone = translateArrowElement(clone, offsetX, offsetY);
    }

    if (clone.$type === 'drawing') {
      clone = translateDrawingElement(clone, offsetX, offsetY);
    } else if (clone.$type !== 'arrow') {
      clone.x += offsetX;
      clone.y += offsetY;
    }

    return clone;
  });
}

function isHorizontalDock(dock: DockPoint | null | undefined): boolean {
  return dock === DockPoint.Left || dock === DockPoint.Right;
}

export function translateArrowElement(
  element: ArrowElement,
  deltaX: number,
  deltaY: number,
): ArrowElement {
  const translated: ArrowElement = {
    ...element,
    x: element.x + deltaX,
    y: element.y + deltaY,
    sourceX: element.sourceX == null ? element.sourceX : element.sourceX + deltaX,
    sourceY: element.sourceY == null ? element.sourceY : element.sourceY + deltaY,
    targetX: element.targetX == null ? element.targetX : element.targetX + deltaX,
    targetY: element.targetY == null ? element.targetY : element.targetY + deltaY,
    arcMidX: element.arcMidX == null ? element.arcMidX : element.arcMidX + deltaX,
    arcMidY: element.arcMidY == null ? element.arcMidY : element.arcMidY + deltaY,
  };

  if (translated.orthogonalMiddleCoordinate != null) {
    if (isHorizontalDock(translated.sourceDock) && isHorizontalDock(translated.targetDock)) {
      translated.orthogonalMiddleCoordinate += deltaX;
    } else if (!isHorizontalDock(translated.sourceDock) && !isHorizontalDock(translated.targetDock)) {
      translated.orthogonalMiddleCoordinate += deltaY;
    }
  }

  return translated;
}

function shouldTranslateConnectedArrow(
  element: ArrowElement,
  movedElementIds: ReadonlySet<string>,
): boolean {
  if (movedElementIds.has(element.id)) {
    return true;
  }

  return !!element.sourceElementId
    && movedElementIds.has(element.sourceElementId)
    && !!element.targetElementId
    && movedElementIds.has(element.targetElementId);
}

export function getMoveAffectedElementIds(
  elements: BoardElement[],
  selectedIds: readonly string[],
): string[] {
  const movedElementIds = new Set(selectedIds);
  const affectedIds = new Set(selectedIds);

  for (const element of elements) {
    if (element.$type === 'arrow' && shouldTranslateConnectedArrow(element, movedElementIds)) {
      affectedIds.add(element.id);
    }
  }

  return [...affectedIds];
}

export function translateElementsBySelection(
  elements: BoardElement[],
  selectedIds: readonly string[],
  deltaX: number,
  deltaY: number,
): { elements: BoardElement[]; changedIds: string[] } {
  if (selectedIds.length === 0 || (Object.is(deltaX, 0) && Object.is(deltaY, 0))) {
    return { elements, changedIds: [] };
  }

  const movedElementIds = new Set(selectedIds);
  const changedIds: string[] = [];

  const translatedElements = elements.map((element) => {
    if (movedElementIds.has(element.id)) {
      changedIds.push(element.id);
      if (element.$type === 'drawing') {
        return translateDrawingElement(element, deltaX, deltaY);
      }

      if (element.$type === 'arrow') {
        return translateArrowElement(element, deltaX, deltaY);
      }

      return {
        ...element,
        x: element.x + deltaX,
        y: element.y + deltaY,
      };
    }

    if (element.$type === 'arrow' && shouldTranslateConnectedArrow(element, movedElementIds)) {
      changedIds.push(element.id);
      return translateArrowElement(element, deltaX, deltaY);
    }

    return element;
  });

  return { elements: translatedElements, changedIds };
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

export function getDraftRectFromDrag(
  start: { x: number; y: number },
  pointer: { x: number; y: number },
  lockAspectRatio = false,
): { x: number; y: number; w: number; h: number } {
  const deltaX = pointer.x - start.x;
  const deltaY = pointer.y - start.y;

  if (!lockAspectRatio) {
    return {
      x: Math.min(start.x, pointer.x),
      y: Math.min(start.y, pointer.y),
      w: Math.abs(deltaX),
      h: Math.abs(deltaY),
    };
  }

  const size = Math.max(Math.abs(deltaX), Math.abs(deltaY));

  return {
    x: start.x + (deltaX < 0 ? -size : 0),
    y: start.y + (deltaY < 0 ? -size : 0),
    w: size,
    h: size,
  };
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
