import type { BoardElement } from '../types/models';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const GRID_SIZE = 24;
export const SNAP_THRESHOLD = 10; // screen-px

export interface AlignmentGuide {
  orientation: 'horizontal' | 'vertical';
  position: number; // world coord
}

/** Get the bounding rect for a set of elements. */
export function getBoundingRect(elements: BoardElement[]): Rect | null {
  if (elements.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Candidate edges & center for an element bounding box. */
function edgesOf(r: Rect) {
  return {
    left: r.x,
    right: r.x + r.width,
    top: r.y,
    bottom: r.y + r.height,
    cx: r.x + r.width / 2,
    cy: r.y + r.height / 2,
  };
}

/**
 * Given a dragging element rect and all other elements,
 * return snap deltas and guide lines to render.
 */
export function snapToAlignmentGuides(
  dragging: Rect,
  others: BoardElement[],
  zoom: number,
): { dx: number; dy: number; guides: AlignmentGuide[] } {
  const threshold = SNAP_THRESHOLD / zoom;
  const de = edgesOf(dragging);
  let bestDx = Infinity;
  let bestDy = Infinity;
  const guides: AlignmentGuide[] = [];

  for (const other of others) {
    const oe = edgesOf({ x: other.x, y: other.y, width: other.width, height: other.height });

    // Vertical guides (snap X)
    for (const [dVal, oVal] of [
      [de.left, oe.left],
      [de.left, oe.right],
      [de.right, oe.left],
      [de.right, oe.right],
      [de.cx, oe.cx],
    ] as [number, number][]) {
      const diff = oVal - dVal;
      if (Math.abs(diff) < Math.abs(bestDx) && Math.abs(diff) < threshold) {
        bestDx = diff;
      }
    }

    // Horizontal guides (snap Y)
    for (const [dVal, oVal] of [
      [de.top, oe.top],
      [de.top, oe.bottom],
      [de.bottom, oe.top],
      [de.bottom, oe.bottom],
      [de.cy, oe.cy],
    ] as [number, number][]) {
      const diff = oVal - dVal;
      if (Math.abs(diff) < Math.abs(bestDy) && Math.abs(diff) < threshold) {
        bestDy = diff;
      }
    }
  }

  const dx = Math.abs(bestDx) < threshold ? bestDx : 0;
  const dy = Math.abs(bestDy) < threshold ? bestDy : 0;

  // Build guide lines for the snapped positions
  if (dx !== 0) {
    const snappedDe = edgesOf({ ...dragging, x: dragging.x + dx });
    for (const other of others) {
      const oe = edgesOf({ x: other.x, y: other.y, width: other.width, height: other.height });
      for (const v of [snappedDe.left, snappedDe.right, snappedDe.cx]) {
        for (const ov of [oe.left, oe.right, oe.cx]) {
          if (Math.abs(v - ov) < 0.5) {
            guides.push({ orientation: 'vertical', position: v });
          }
        }
      }
    }
  }
  if (dy !== 0) {
    const snappedDe = edgesOf({ ...dragging, y: dragging.y + dy });
    for (const other of others) {
      const oe = edgesOf({ x: other.x, y: other.y, width: other.width, height: other.height });
      for (const h of [snappedDe.top, snappedDe.bottom, snappedDe.cy]) {
        for (const oh of [oe.top, oe.bottom, oe.cy]) {
          if (Math.abs(h - oh) < 0.5) {
            guides.push({ orientation: 'horizontal', position: h });
          }
        }
      }
    }
  }

  return { dx, dy, guides };
}

/** Snap a value to the nearest grid line. */
export function snapToGrid(value: number, gridSize: number = GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize;
}

/** Screen coords → world coords */
export function screenToWorld(
  screenX: number,
  screenY: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
): Point {
  return {
    x: (screenX - cameraX) / zoom,
    y: (screenY - cameraY) / zoom,
  };
}

/** World coords → screen coords */
export function worldToScreen(
  worldX: number,
  worldY: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
): Point {
  return {
    x: worldX * zoom + cameraX,
    y: worldY * zoom + cameraY,
  };
}
