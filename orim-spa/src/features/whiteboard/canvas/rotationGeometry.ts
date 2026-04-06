import type { BoardElement, DrawingElement } from '../../../types/models';
import { normalizeRotationDegrees } from '../../../utils/rotation';
import { translateDrawingPoints } from './drawingGeometry';

type Point = {
  x: number;
  y: number;
};

export function rotateElementAroundPivot(
  element: BoardElement,
  pivot: Point,
  rotationDelta: number,
): BoardElement {
  if (element.$type === 'arrow' || Object.is(rotationDelta, 0)) {
    return element;
  }

  const currentCenter = {
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
  };
  const nextCenter = rotatePointAroundPivot(currentCenter, pivot, rotationDelta);
  const deltaX = nextCenter.x - currentCenter.x;
  const deltaY = nextCenter.y - currentCenter.y;

  if (element.$type === 'drawing') {
    const nextDrawing: DrawingElement = {
      ...element,
      x: element.x + deltaX,
      y: element.y + deltaY,
      rotation: normalizeRotationDegrees(element.rotation + rotationDelta),
      points: translateDrawingPoints(element.points, deltaX, deltaY),
    };
    return nextDrawing;
  }

  return {
    ...element,
    x: element.x + deltaX,
    y: element.y + deltaY,
    rotation: normalizeRotationDegrees(element.rotation + rotationDelta),
  };
}

function rotatePointAroundPivot(point: Point, pivot: Point, rotationDegrees: number): Point {
  const rotatedOffset = rotateVector(
    {
      x: point.x - pivot.x,
      y: point.y - pivot.y,
    },
    rotationDegrees,
  );

  return {
    x: pivot.x + rotatedOffset.x,
    y: pivot.y + rotatedOffset.y,
  };
}

function rotateVector(point: Point, rotationDegrees: number): Point {
  const rotationRadians = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(rotationRadians);
  const sin = Math.sin(rotationRadians);

  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}
