import type { DrawingElement } from '../../../types/models';

interface DrawingBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function translateDrawingPoints(points: number[], deltaX: number, deltaY: number): number[] {
  return points.map((value, index) => value + (index % 2 === 0 ? deltaX : deltaY));
}

export function translateDrawingElement(element: DrawingElement, deltaX: number, deltaY: number): DrawingElement {
  return {
    ...element,
    x: element.x + deltaX,
    y: element.y + deltaY,
    points: translateDrawingPoints(element.points, deltaX, deltaY),
  };
}

export function scaleDrawingPoints(
  points: number[],
  initialBounds: DrawingBounds,
  nextBounds: DrawingBounds,
): number[] {
  return points.map((value, index) => {
    const isX = index % 2 === 0;
    const initialOrigin = isX ? initialBounds.x : initialBounds.y;
    const initialSize = isX ? initialBounds.width : initialBounds.height;
    const nextOrigin = isX ? nextBounds.x : nextBounds.y;
    const nextSize = isX ? nextBounds.width : nextBounds.height;
    const relativePosition = initialSize === 0 ? 0.5 : (value - initialOrigin) / initialSize;
    return nextOrigin + relativePosition * nextSize;
  });
}

export function resizeDrawingElement(
  element: DrawingElement,
  initialBounds: DrawingBounds,
  nextBounds: DrawingBounds,
  initialPoints: number[],
): DrawingElement {
  return {
    ...element,
    x: nextBounds.x,
    y: nextBounds.y,
    width: nextBounds.width,
    height: nextBounds.height,
    points: scaleDrawingPoints(initialPoints, initialBounds, nextBounds),
  };
}

export function getDrawingHitStrokeWidth(strokeWidth: number): number {
  return Math.max(18, strokeWidth + 12);
}
