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
export const SNAP_THRESHOLD = 4; // screen-px

export interface AlignmentGuide {
  orientation: 'horizontal' | 'vertical';
  position: number; // world coord
}

interface AxisSnapCandidate {
  diff: number;
  priority: number;
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

function rectOf(element: Pick<BoardElement, 'x' | 'y' | 'width' | 'height'>): Rect {
  return {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  };
}

function isPointInsideRect(point: Point, rect: Rect): boolean {
  return point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height;
}

function rangesOverlapOrNear(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
  threshold: number,
): boolean {
  return endA >= startB - threshold && endB >= startA - threshold;
}

function chooseAxisCandidate(
  current: AxisSnapCandidate | null,
  candidate: AxisSnapCandidate | null,
  threshold: number,
): AxisSnapCandidate | null {
  if (!candidate || Math.abs(candidate.diff) >= threshold) {
    return current;
  }

  if (!current) {
    return candidate;
  }

  const currentDistance = Math.abs(current.diff);
  const candidateDistance = Math.abs(candidate.diff);
  if (candidateDistance < currentDistance) {
    return candidate;
  }

  if (Math.abs(candidateDistance - currentDistance) < 0.0001 && candidate.priority < current.priority) {
    return candidate;
  }

  return current;
}

function getEqualSpacingHorizontalCandidate(
  dragging: Rect,
  others: BoardElement[],
  threshold: number,
): AxisSnapCandidate | null {
  const relevant = others
    .map(rectOf)
    .filter((other) => rangesOverlapOrNear(
      dragging.y,
      dragging.y + dragging.height,
      other.y,
      other.y + other.height,
      threshold,
    ))
    .sort((left, right) => left.x - right.x || left.y - right.y);

  let best: AxisSnapCandidate | null = null;

  for (let index = 0; index < relevant.length - 1; index += 1) {
    const left = relevant[index];
    const right = relevant[index + 1];

    if (!rangesOverlapOrNear(left.y, left.y + left.height, right.y, right.y + right.height, threshold)) {
      continue;
    }

    const leftEnd = left.x + left.width;
    const rightStart = right.x;
    const gap = rightStart - leftEnd;
    if (gap < 0) {
      continue;
    }

    best = chooseAxisCandidate(best, {
      diff: left.x - gap - dragging.width - dragging.x,
      priority: 2,
    }, threshold);

    if (gap >= dragging.width) {
      best = chooseAxisCandidate(best, {
        diff: (leftEnd + rightStart - dragging.width) / 2 - dragging.x,
        priority: 2,
      }, threshold);
    }

    best = chooseAxisCandidate(best, {
      diff: right.x + right.width + gap - dragging.x,
      priority: 2,
    }, threshold);
  }

  return best;
}

function getEqualSpacingVerticalCandidate(
  dragging: Rect,
  others: BoardElement[],
  threshold: number,
): AxisSnapCandidate | null {
  const relevant = others
    .map(rectOf)
    .filter((other) => rangesOverlapOrNear(
      dragging.x,
      dragging.x + dragging.width,
      other.x,
      other.x + other.width,
      threshold,
    ))
    .sort((top, bottom) => top.y - bottom.y || top.x - bottom.x);

  let best: AxisSnapCandidate | null = null;

  for (let index = 0; index < relevant.length - 1; index += 1) {
    const top = relevant[index];
    const bottom = relevant[index + 1];

    if (!rangesOverlapOrNear(top.x, top.x + top.width, bottom.x, bottom.x + bottom.width, threshold)) {
      continue;
    }

    const topEnd = top.y + top.height;
    const bottomStart = bottom.y;
    const gap = bottomStart - topEnd;
    if (gap < 0) {
      continue;
    }

    best = chooseAxisCandidate(best, {
      diff: top.y - gap - dragging.height - dragging.y,
      priority: 2,
    }, threshold);

    if (gap >= dragging.height) {
      best = chooseAxisCandidate(best, {
        diff: (topEnd + bottomStart - dragging.height) / 2 - dragging.y,
        priority: 2,
      }, threshold);
    }

    best = chooseAxisCandidate(best, {
      diff: bottom.y + bottom.height + gap - dragging.y,
      priority: 2,
    }, threshold);
  }

  return best;
}

function collectMatchingGuides(
  snapped: Rect,
  others: BoardElement[],
  includeVertical: boolean,
  includeHorizontal: boolean,
): AlignmentGuide[] {
  const snappedEdges = edgesOf(snapped);
  const guides: AlignmentGuide[] = [];

  for (const other of others) {
    const otherEdges = edgesOf(rectOf(other));

    if (includeVertical) {
      for (const vertical of [snappedEdges.left, snappedEdges.right, snappedEdges.cx]) {
        for (const otherVertical of [otherEdges.left, otherEdges.right, otherEdges.cx]) {
          if (Math.abs(vertical - otherVertical) < 0.5) {
            guides.push({ orientation: 'vertical', position: vertical });
          }
        }
      }
    }

    if (includeHorizontal) {
      for (const horizontal of [snappedEdges.top, snappedEdges.bottom, snappedEdges.cy]) {
        for (const otherHorizontal of [otherEdges.top, otherEdges.bottom, otherEdges.cy]) {
          if (Math.abs(horizontal - otherHorizontal) < 0.5) {
            guides.push({ orientation: 'horizontal', position: horizontal });
          }
        }
      }
    }
  }

  return guides;
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
  let bestDx: AxisSnapCandidate | null = null;
  let bestDy: AxisSnapCandidate | null = null;

  for (const other of others) {
    const otherRect = rectOf(other);
    const oe = edgesOf(otherRect);

    if (isPointInsideRect({ x: de.cx, y: de.cy }, otherRect)) {
      bestDx = chooseAxisCandidate(bestDx, { diff: oe.cx - de.cx, priority: 0 }, threshold);
      bestDy = chooseAxisCandidate(bestDy, { diff: oe.cy - de.cy, priority: 0 }, threshold);
    }

    // Vertical guides (snap X)
    for (const [dVal, oVal] of [
      [de.left, oe.left],
      [de.left, oe.right],
      [de.right, oe.left],
      [de.right, oe.right],
      [de.cx, oe.cx],
    ] as [number, number][]) {
      bestDx = chooseAxisCandidate(bestDx, { diff: oVal - dVal, priority: 1 }, threshold);
    }

    // Horizontal guides (snap Y)
    for (const [dVal, oVal] of [
      [de.top, oe.top],
      [de.top, oe.bottom],
      [de.bottom, oe.top],
      [de.bottom, oe.bottom],
      [de.cy, oe.cy],
    ] as [number, number][]) {
      bestDy = chooseAxisCandidate(bestDy, { diff: oVal - dVal, priority: 1 }, threshold);
    }
  }

  bestDx = chooseAxisCandidate(bestDx, getEqualSpacingHorizontalCandidate(dragging, others, threshold), threshold);
  bestDy = chooseAxisCandidate(bestDy, getEqualSpacingVerticalCandidate(dragging, others, threshold), threshold);

  const dx = bestDx?.diff ?? 0;
  const dy = bestDy?.diff ?? 0;
  const guides = collectMatchingGuides(
    { ...dragging, x: dragging.x + dx, y: dragging.y + dy },
    others,
    !Object.is(dx, 0),
    !Object.is(dy, 0),
  );

  return { dx, dy, guides };
}

export function snapResizeRectToAlignmentGuides(
  resizing: Rect,
  others: BoardElement[],
  zoom: number,
  handle: string,
): { rect: Rect; guides: AlignmentGuide[] } {
  const threshold = SNAP_THRESHOLD / zoom;
  const right = resizing.x + resizing.width;
  const bottom = resizing.y + resizing.height;
  let nextLeft = resizing.x;
  let nextRight = right;
  let nextTop = resizing.y;
  let nextBottom = bottom;
  const guides: AlignmentGuide[] = [];

  if (handle.includes('w') || handle.includes('e')) {
    const movingX = handle.includes('w') ? resizing.x : right;
    let bestDiff = Infinity;
    let bestGuidePosition: number | null = null;

    for (const other of others) {
      const oe = edgesOf({ x: other.x, y: other.y, width: other.width, height: other.height });
      for (const candidate of [oe.left, oe.right, oe.cx]) {
        const diff = candidate - movingX;
        if (Math.abs(diff) < Math.abs(bestDiff) && Math.abs(diff) < threshold) {
          bestDiff = diff;
          bestGuidePosition = candidate;
        }
      }
    }

    if (bestGuidePosition != null) {
      if (handle.includes('w')) {
        nextLeft += bestDiff;
      } else {
        nextRight += bestDiff;
      }
      guides.push({ orientation: 'vertical', position: bestGuidePosition });
    }
  }

  if (handle.includes('n') || handle.includes('s')) {
    const movingY = handle.includes('n') ? resizing.y : bottom;
    let bestDiff = Infinity;
    let bestGuidePosition: number | null = null;

    for (const other of others) {
      const oe = edgesOf({ x: other.x, y: other.y, width: other.width, height: other.height });
      for (const candidate of [oe.top, oe.bottom, oe.cy]) {
        const diff = candidate - movingY;
        if (Math.abs(diff) < Math.abs(bestDiff) && Math.abs(diff) < threshold) {
          bestDiff = diff;
          bestGuidePosition = candidate;
        }
      }
    }

    if (bestGuidePosition != null) {
      if (handle.includes('n')) {
        nextTop += bestDiff;
      } else {
        nextBottom += bestDiff;
      }
      guides.push({ orientation: 'horizontal', position: bestGuidePosition });
    }
  }

  return {
    rect: {
      x: nextLeft,
      y: nextTop,
      width: nextRight - nextLeft,
      height: nextBottom - nextTop,
    },
    guides,
  };
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
