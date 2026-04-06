import type { ArrowElement, BoardElement } from '../types/models';
import { ArrowRouteStyle, DockPoint } from '../types/models';
import type { Point } from './geometry';

const ORTHOGONAL_DOCK_STUB_LENGTH = 40;
const ORTHOGONAL_BEND_PENALTY = 40;
const ORTHOGONAL_MAX_BENDS = 12;
const ORTHOGONAL_SOLVER_TIME_BUDGET_MS = 8;
const ARC_SEGMENT_COUNT = 24;
const ARC_MIN_MIDPOINT_OFFSET = 48;
const ARC_MAX_MIDPOINT_OFFSET = 160;

const EDGE_DOCKS = [DockPoint.Top, DockPoint.Right, DockPoint.Bottom, DockPoint.Left] as const;
type DockTargetElement = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number | null;
};

/** Get the world-space dock point on an element. */
export function getDockPosition(
  el: DockTargetElement,
  dock: DockPoint,
): Point {
  const center = getElementCenter(el);
  const offset = rotateVector(getLocalDockOffset(el, dock), el.rotation ?? 0);

  return {
    x: center.x + offset.x,
    y: center.y + offset.y,
  };
}

/** Compute the polyline points for an arrow. */
export function computeArrowPolyline(
  arrow: ArrowElement,
  elements: BoardElement[],
): Point[] {
  const {
    start,
    end,
    sourceEl,
    targetEl,
  } = resolveArrowEndpoints(arrow, elements);

  if (arrow.routeStyle === ArrowRouteStyle.Straight) {
    return [start, end];
  }

  if (arrow.routeStyle === ArrowRouteStyle.Arc) {
    return computeArcRoute(start, end, arrow.arcMidX ?? null, arrow.arcMidY ?? null);
  }

  const obstacles = elements
    .filter((element) => element.$type !== 'arrow' && element.$type !== 'frame')
    .map((element) => ({ x: element.x, y: element.y, width: element.width, height: element.height }));

  return computeOrthogonalRoute(
    start,
    end,
    arrow.sourceDock,
    arrow.targetDock,
    arrow.orthogonalMiddleCoordinate ?? null,
    obstacles,
    sourceEl,
    targetEl,
  );
}

export function getArrowArcMidpoint(
  arrow: ArrowElement,
  elements: BoardElement[],
): Point | null {
  if (arrow.routeStyle !== ArrowRouteStyle.Arc) {
    return null;
  }

  const { start, end } = resolveArrowEndpoints(arrow, elements);
  return resolveArcMidpoint(start, end, arrow.arcMidX ?? null, arrow.arcMidY ?? null);
}

function computeOrthogonalRoute(
  start: Point,
  end: Point,
  sourceDock: DockPoint | undefined,
  targetDock: DockPoint | undefined,
  orthogonalMiddleCoordinate: number | null,
  obstacles: Array<{ x: number; y: number; width: number; height: number }>,
  sourceElement?: DockTargetElement | null,
  targetElement?: DockTargetElement | null,
): Point[] {
  const sourceDirection = getDockDirectionVector(sourceElement, sourceDock);
  const targetDirection = getDockDirectionVector(targetElement, targetDock);
  const startStub = offsetPoint(start, sourceDirection, ORTHOGONAL_DOCK_STUB_LENGTH);
  const endStub = offsetPoint(end, targetDirection, ORTHOGONAL_DOCK_STUB_LENGTH);

  const obstaclePath = findOrthogonalPathAvoidingObstacles(
    start,
    startStub,
    sourceDirection,
    end,
    endStub,
    targetDirection,
    obstacles,
  );
  if (obstaclePath) {
    return obstaclePath;
  }

  const isHorizontalSource = isHorizontalDockDirection(sourceDirection);
  const isHorizontalTarget = isHorizontalDockDirection(targetDirection);
  const points: Point[] = [start, startStub];

  if (isHorizontalSource && isHorizontalTarget) {
    const midX = orthogonalMiddleCoordinate ?? (startStub.x + endStub.x) / 2;
    points.push({ x: midX, y: startStub.y }, { x: midX, y: endStub.y });
  } else if (!isHorizontalSource && !isHorizontalTarget) {
    const midY = orthogonalMiddleCoordinate ?? (startStub.y + endStub.y) / 2;
    points.push({ x: startStub.x, y: midY }, { x: endStub.x, y: midY });
  } else if (isHorizontalSource) {
    points.push({ x: endStub.x, y: startStub.y });
  } else {
    points.push({ x: startStub.x, y: endStub.y });
  }

  points.push(endStub, end);
  return simplifyPoints(points);
}

function computeArcRoute(
  start: Point,
  end: Point,
  arcMidX: number | null,
  arcMidY: number | null,
): Point[] {
  const midpoint = resolveArcMidpoint(start, end, arcMidX, arcMidY);
  const controlPoint = computeQuadraticControlPointThroughMidpoint(start, end, midpoint);
  return sampleQuadraticBezier(start, controlPoint, end, ARC_SEGMENT_COUNT);
}

function resolveArrowEndpoints(
  arrow: ArrowElement,
  elements: BoardElement[],
): { start: Point; end: Point; sourceEl: BoardElement | null; targetEl: BoardElement | null } {
  const sourceEl = arrow.sourceElementId
    ? elements.find((e) => e.id === arrow.sourceElementId) ?? null
    : null;
  const targetEl = arrow.targetElementId
    ? elements.find((e) => e.id === arrow.targetElementId) ?? null
    : null;

  const start: Point = sourceEl && arrow.sourceDock != null
    ? getDockPosition(sourceEl, arrow.sourceDock)
    : { x: arrow.sourceX ?? 0, y: arrow.sourceY ?? 0 };

  const end: Point = targetEl && arrow.targetDock != null
    ? getDockPosition(targetEl, arrow.targetDock)
    : { x: arrow.targetX ?? 0, y: arrow.targetY ?? 0 };

  return { start, end, sourceEl, targetEl };
}

function resolveArcMidpoint(
  start: Point,
  end: Point,
  arcMidX: number | null,
  arcMidY: number | null,
): Point {
  if (typeof arcMidX === 'number' && Number.isFinite(arcMidX)
    && typeof arcMidY === 'number' && Number.isFinite(arcMidY)) {
    return { x: arcMidX, y: arcMidY };
  }

  return getDefaultArcMidpoint(start, end);
}

function getDefaultArcMidpoint(start: Point, end: Point): Point {
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);

  if (length < 0.001) {
    return { x: midX, y: midY };
  }

  const offset = Math.max(ARC_MIN_MIDPOINT_OFFSET, Math.min(length * 0.35, ARC_MAX_MIDPOINT_OFFSET));
  return {
    x: midX + (-dy / length) * offset,
    y: midY + (dx / length) * offset,
  };
}

function computeQuadraticControlPointThroughMidpoint(start: Point, end: Point, midpoint: Point): Point {
  return {
    x: midpoint.x * 2 - (start.x + end.x) / 2,
    y: midpoint.y * 2 - (start.y + end.y) / 2,
  };
}

function sampleQuadraticBezier(
  start: Point,
  controlPoint: Point,
  end: Point,
  segmentCount: number,
): Point[] {
  const count = Math.max(2, segmentCount);
  const points: Point[] = [];

  for (let index = 0; index <= count; index++) {
    const t = index / count;
    const oneMinusT = 1 - t;
    points.push({
      x: oneMinusT * oneMinusT * start.x + 2 * oneMinusT * t * controlPoint.x + t * t * end.x,
      y: oneMinusT * oneMinusT * start.y + 2 * oneMinusT * t * controlPoint.y + t * t * end.y,
    });
  }

  return simplifyPoints(points);
}

/** Get the nearest dock point on an element to a given world position. */
export function nearestDock(
  el: { x: number; y: number; width: number; height: number },
  pos: Point,
  options?: { includeCenter?: boolean },
): DockPoint {
  const docks = options?.includeCenter ? [...EDGE_DOCKS, DockPoint.Center] : EDGE_DOCKS;
  let best = docks[0];
  let bestDist = Infinity;
  for (const d of docks) {
    const p = getDockPosition(el, d);
    const dist = Math.hypot(p.x - pos.x, p.y - pos.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

export function findNearestDockTarget(
  elements: BoardElement[],
  pos: Point,
  excludedElementId?: string,
  maxDistance: number = 28,
): { elementId: string; dock: DockPoint; point: Point } | null {
  let nearest: { elementId: string; dock: DockPoint; point: Point } | null = null;
  let nearestDistance = maxDistance;

  for (const element of elements) {
    if (element.$type === 'arrow' || element.$type === 'frame' || element.id === excludedElementId) {
      continue;
    }

    for (const dock of EDGE_DOCKS) {
      const point = getDockPosition(element, dock);
      const distance = Math.hypot(pos.x - point.x, pos.y - point.y);
      if (distance <= nearestDistance) {
        nearestDistance = distance;
        nearest = { elementId: element.id, dock, point };
      }
    }
  }

  return nearest;
}

export function resolveFreeDock(start: Point, end: Point): DockPoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return Math.abs(dx) >= Math.abs(dy)
    ? dx >= 0 ? DockPoint.Right : DockPoint.Left
    : dy >= 0 ? DockPoint.Bottom : DockPoint.Top;
}

export function getMagneticArrowPoint(
  origin: Point,
  point: Point,
  routeStyle: ArrowRouteStyle,
): Point {
  if (routeStyle !== ArrowRouteStyle.Straight) {
    return point;
  }

  return snapPointToMagneticAngle(origin, point, 45, 5);
}

/** Flatten polyline points to number[] for Konva Line. */
export function flattenPoints(points: Point[]): number[] {
  const result: number[] = [];
  for (const p of points) {
    result.push(p.x, p.y);
  }
  return result;
}

/** Compute arrowhead polygon points (for a triangle) at end of line segment. */
export function arrowheadPoints(
  tip: Point,
  from: Point,
  size: number = 12,
): number[] {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const spread = Math.PI / 6; // 30 degrees
  return [
    tip.x, tip.y,
    tip.x - size * Math.cos(angle - spread), tip.y - size * Math.sin(angle - spread),
    tip.x - size * Math.cos(angle + spread), tip.y - size * Math.sin(angle + spread),
  ];
}

function offsetPoint(
  point: Point,
  direction: Point,
  distance: number,
): Point {
  const length = Math.hypot(direction.x, direction.y);
  if (length < 0.001) {
    return point;
  }

  return {
    x: point.x + (direction.x / length) * distance,
    y: point.y + (direction.y / length) * distance,
  };
}

function getElementCenter(el: DockTargetElement): Point {
  return {
    x: el.x + el.width / 2,
    y: el.y + el.height / 2,
  };
}

function getLocalDockOffset(el: DockTargetElement, dock: DockPoint): Point {
  switch (dock) {
    case DockPoint.Top:
      return { x: 0, y: -el.height / 2 };
    case DockPoint.Bottom:
      return { x: 0, y: el.height / 2 };
    case DockPoint.Left:
      return { x: -el.width / 2, y: 0 };
    case DockPoint.Right:
      return { x: el.width / 2, y: 0 };
    case DockPoint.Center:
      return { x: 0, y: 0 };
  }
}

function getDockDirectionVector(el: DockTargetElement | null | undefined, dock: DockPoint | undefined): Point {
  const localDirection = getLocalDockDirection(dock);
  return rotateVector(localDirection, el?.rotation ?? 0);
}

function getLocalDockDirection(dock: DockPoint | undefined): Point {
  switch (dock) {
    case DockPoint.Top:
      return { x: 0, y: -1 };
    case DockPoint.Right:
      return { x: 1, y: 0 };
    case DockPoint.Bottom:
      return { x: 0, y: 1 };
    case DockPoint.Left:
      return { x: -1, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

function isHorizontalDockDirection(direction: Point): boolean {
  return Math.abs(direction.x) >= Math.abs(direction.y);
}

function rotateVector(point: Point, rotationDegrees: number): Point {
  if (Math.abs(rotationDegrees) < 0.001) {
    return point;
  }

  const rotationRadians = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(rotationRadians);
  const sin = Math.sin(rotationRadians);

  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

function simplifyPoints(points: Point[]): Point[] {
  const simplified: Point[] = [];

  for (const point of points) {
    if (simplified.length === 0) {
      simplified.push(point);
      continue;
    }

    const previous = simplified[simplified.length - 1];
    if (Math.abs(previous.x - point.x) < 0.1 && Math.abs(previous.y - point.y) < 0.1) {
      continue;
    }

    simplified.push(point);

    while (simplified.length >= 3) {
      const a = simplified[simplified.length - 3];
      const b = simplified[simplified.length - 2];
      const c = simplified[simplified.length - 1];
      const sameX = Math.abs(a.x - b.x) < 0.1 && Math.abs(b.x - c.x) < 0.1;
      const sameY = Math.abs(a.y - b.y) < 0.1 && Math.abs(b.y - c.y) < 0.1;

      if (!sameX && !sameY) {
        break;
      }

      const keepsDirection = sameX
        ? (b.y - a.y) * (c.y - b.y) >= 0
        : (b.x - a.x) * (c.x - b.x) >= 0;
      if (!keepsDirection) {
        break;
      }

      simplified.splice(simplified.length - 2, 1);
    }
  }

  return simplified;
}

function snapPointToMagneticAngle(
  origin: Point,
  point: Point,
  stepDegrees: number,
  thresholdDegrees: number,
): Point {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.001) {
    return point;
  }

  const angle = Math.atan2(dy, dx);
  const stepRadians = (Math.PI * stepDegrees) / 180;
  const thresholdRadians = (Math.PI * thresholdDegrees) / 180;
  const snappedAngle = Math.round(angle / stepRadians) * stepRadians;
  const delta = Math.abs(normalizeAngle(angle - snappedAngle));
  if (delta > thresholdRadians) {
    return point;
  }

  return {
    x: origin.x + Math.cos(snappedAngle) * distance,
    y: origin.y + Math.sin(snappedAngle) * distance,
  };
}

function normalizeAngle(angle: number): number {
  let result = angle;
  while (result <= -Math.PI) {
    result += Math.PI * 2;
  }
  while (result > Math.PI) {
    result -= Math.PI * 2;
  }
  return result;
}

function findOrthogonalPathAvoidingObstacles(
  start: Point,
  startStub: Point,
  sourceDirection: Point,
  end: Point,
  endStub: Point,
  targetDirection: Point,
  obstacles: Array<{ x: number; y: number; width: number; height: number }>,
): Point[] | null {
  if (obstacles.length === 0) {
    return null;
  }

  const rects = obstacles.map((obstacle) => ({
    left: obstacle.x - ORTHOGONAL_DOCK_STUB_LENGTH,
    top: obstacle.y - ORTHOGONAL_DOCK_STUB_LENGTH,
    right: obstacle.x + obstacle.width + ORTHOGONAL_DOCK_STUB_LENGTH,
    bottom: obstacle.y + obstacle.height + ORTHOGONAL_DOCK_STUB_LENGTH,
  }));

  const xSet = new Set<number>([startStub.x, endStub.x]);
  const ySet = new Set<number>([startStub.y, endStub.y]);

  let globalLeft = startStub.x;
  let globalTop = startStub.y;
  let globalRight = startStub.x;
  let globalBottom = startStub.y;

  for (const rect of rects) {
    xSet.add(rect.left);
    xSet.add(rect.right);
    ySet.add(rect.top);
    ySet.add(rect.bottom);
    globalLeft = Math.min(globalLeft, rect.left);
    globalTop = Math.min(globalTop, rect.top);
    globalRight = Math.max(globalRight, rect.right);
    globalBottom = Math.max(globalBottom, rect.bottom);
  }

  globalLeft = Math.min(globalLeft, startStub.x, endStub.x) - ORTHOGONAL_DOCK_STUB_LENGTH;
  globalTop = Math.min(globalTop, startStub.y, endStub.y) - ORTHOGONAL_DOCK_STUB_LENGTH;
  globalRight = Math.max(globalRight, startStub.x, endStub.x) + ORTHOGONAL_DOCK_STUB_LENGTH;
  globalBottom = Math.max(globalBottom, startStub.y, endStub.y) + ORTHOGONAL_DOCK_STUB_LENGTH;
  xSet.add(globalLeft);
  xSet.add(globalRight);
  ySet.add(globalTop);
  ySet.add(globalBottom);

  const xs = Array.from(xSet).sort((left, right) => left - right);
  const ys = Array.from(ySet).sort((left, right) => left - right);
  const nx = xs.length;
  const ny = ys.length;

  const startXi = xs.indexOf(startStub.x);
  const startYi = ys.indexOf(startStub.y);
  const endXi = xs.indexOf(endStub.x);
  const endYi = ys.indexOf(endStub.y);
  if (startXi < 0 || startYi < 0 || endXi < 0 || endYi < 0) {
    return null;
  }

  const sourceHorizontal = isHorizontalDockDirection(sourceDirection);
  const targetHorizontal = isHorizontalDockDirection(targetDirection);
  const startDir = sourceHorizontal ? 0 : 1;
  const endDir = targetHorizontal ? 0 : 1;
  const endKey = ((endXi * ny) + endYi) * 2 + endDir;
  const stateCount = nx * ny * 2;
  const gScore = new Array<number>(stateCount).fill(Number.POSITIVE_INFINITY);
  const cameFrom = new Array<number>(stateCount).fill(-1);
  const bendCount = new Array<number>(stateCount).fill(0);
  const queue: Array<{ key: number; priority: number }> = [];

  const startKey = ((startXi * ny) + startYi) * 2 + startDir;
  gScore[startKey] = 0;
  queue.push({ key: startKey, priority: heuristic(startXi, startYi) });

  let bestPath: Point[] | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  const deadline = nowMs() + ORTHOGONAL_SOLVER_TIME_BUDGET_MS;

  while (queue.length > 0) {
    queue.sort((left, right) => left.priority - right.priority);
    const next = queue.shift();
    if (!next) {
      break;
    }

    if (nowMs() > deadline) {
      break;
    }

    const key = next.key;
    const g = gScore[key];
    if (g >= bestCost) {
      continue;
    }

    const dir = key & 1;
    const pos = key >> 1;
    const yi = pos % ny;
    const xi = Math.floor(pos / ny);
    const bends = bendCount[key];

    if (key === endKey) {
      bestCost = g;
      bestPath = reconstructOrthogonalPath(cameFrom, key, xs, ys, ny, start, end);
      continue;
    }

    if (dir === 0) {
      for (let nxi = xi - 1; nxi >= 0; nxi -= 1) {
        if (isHorizontalSegmentBlocked(ys[yi], xs[nxi], xs[nxi + 1], rects)) {
          break;
        }

        tryAdd(((nxi * ny) + yi) * 2, g + (xs[xi] - xs[nxi]), key, bends);
      }

      for (let nxi = xi + 1; nxi < nx; nxi += 1) {
        if (isHorizontalSegmentBlocked(ys[yi], xs[nxi - 1], xs[nxi], rects)) {
          break;
        }

        tryAdd(((nxi * ny) + yi) * 2, g + (xs[nxi] - xs[xi]), key, bends);
      }
    } else {
      for (let nyi = yi - 1; nyi >= 0; nyi -= 1) {
        if (isVerticalSegmentBlocked(xs[xi], ys[nyi], ys[nyi + 1], rects)) {
          break;
        }

        tryAdd(((xi * ny) + nyi) * 2 + 1, g + (ys[yi] - ys[nyi]), key, bends);
      }

      for (let nyi = yi + 1; nyi < ny; nyi += 1) {
        if (isVerticalSegmentBlocked(xs[xi], ys[nyi - 1], ys[nyi], rects)) {
          break;
        }

        tryAdd(((xi * ny) + nyi) * 2 + 1, g + (ys[nyi] - ys[yi]), key, bends);
      }
    }

    if (bends < ORTHOGONAL_MAX_BENDS) {
      const newDir = 1 - dir;
      const turnKey = ((xi * ny) + yi) * 2 + newDir;
      const nextCost = g + ORTHOGONAL_BEND_PENALTY;
      if (nextCost < gScore[turnKey] && nextCost < bestCost) {
        gScore[turnKey] = nextCost;
        cameFrom[turnKey] = key;
        bendCount[turnKey] = bends + 1;
        queue.push({ key: turnKey, priority: nextCost + heuristic(xi, yi) });
      }
    }
  }

  return bestPath;

  function tryAdd(nextKey: number, nextCost: number, fromKey: number, bends: number) {
    if (nextCost < gScore[nextKey] && nextCost < bestCost) {
      gScore[nextKey] = nextCost;
      cameFrom[nextKey] = fromKey;
      bendCount[nextKey] = bends;
      const position = nextKey >> 1;
      const nextYi = position % ny;
      const nextXi = Math.floor(position / ny);
      queue.push({ key: nextKey, priority: nextCost + heuristic(nextXi, nextYi) });
    }
  }

  function heuristic(xi: number, yi: number): number {
    return Math.abs(xs[xi] - xs[endXi]) + Math.abs(ys[yi] - ys[endYi]);
  }
}

function isHorizontalSegmentBlocked(
  y: number,
  x1: number,
  x2: number,
  rects: Array<{ left: number; top: number; right: number; bottom: number }>,
): boolean {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  return rects.some((rect) => y > rect.top && y < rect.bottom && maxX > rect.left && minX < rect.right);
}

function isVerticalSegmentBlocked(
  x: number,
  y1: number,
  y2: number,
  rects: Array<{ left: number; top: number; right: number; bottom: number }>,
): boolean {
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  return rects.some((rect) => x > rect.left && x < rect.right && maxY > rect.top && minY < rect.bottom);
}

function reconstructOrthogonalPath(
  cameFrom: number[],
  endKey: number,
  xs: number[],
  ys: number[],
  ny: number,
  start: Point,
  end: Point,
): Point[] {
  const keys: number[] = [];
  let current = endKey;
  while (current >= 0) {
    keys.push(current);
    current = cameFrom[current];
  }

  keys.reverse();

  const path: Point[] = [start];
  let lastPoint: Point | null = null;
  for (const key of keys) {
    const position = key >> 1;
    const yi = position % ny;
    const xi = Math.floor(position / ny);
    const point = { x: xs[xi], y: ys[yi] };

    if (!lastPoint || Math.abs(lastPoint.x - point.x) > 0.1 || Math.abs(lastPoint.y - point.y) > 0.1) {
      path.push(point);
      lastPoint = point;
    }
  }

  path.push(end);
  return simplifyPoints(path);
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
