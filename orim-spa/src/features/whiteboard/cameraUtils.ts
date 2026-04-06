import type { BoardElement } from '../../types/models';
import { computeArrowPolyline } from '../../utils/arrowRouting';
import { getBoundingRect, type Rect } from '../../utils/geometry';

export interface ViewportInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function getCenteredCameraPosition(
  worldX: number,
  worldY: number,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  return {
    cameraX: -(worldX * zoom) + viewportWidth / 2,
    cameraY: -(worldY * zoom) + viewportHeight / 2,
  };
}

export function projectWorldToViewport(
  worldX: number,
  worldY: number,
  zoom: number,
  cameraX: number,
  cameraY: number,
) {
  return {
    x: worldX * zoom + cameraX,
    y: worldY * zoom + cameraY,
  };
}

export function getElementBounds(element: BoardElement, allElements: BoardElement[]): Rect | null {
  if (element.$type !== 'arrow') {
    return getBoundingRect([element]);
  }

  const points = computeArrowPolyline(element, allElements);
  if (points.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function getBoundsForElements(elementsToMeasure: BoardElement[], allElements: BoardElement[] = elementsToMeasure): Rect | null {
  const bounds = elementsToMeasure
    .map((element) => getElementBounds(element, allElements))
    .filter((candidate): candidate is Rect => candidate != null);

  if (bounds.length === 0) {
    return null;
  }

  return {
    x: Math.min(...bounds.map((bound) => bound.x)),
    y: Math.min(...bounds.map((bound) => bound.y)),
    width: Math.max(...bounds.map((bound) => bound.x + bound.width)) - Math.min(...bounds.map((bound) => bound.x)),
    height: Math.max(...bounds.map((bound) => bound.y + bound.height)) - Math.min(...bounds.map((bound) => bound.y)),
  };
}

export function getFitToScreenViewport({
  elementsToFit,
  allElements = elementsToFit,
  viewportWidth,
  viewportHeight,
  viewportInsets,
  margin = 64,
}: {
  elementsToFit: BoardElement[];
  allElements?: BoardElement[];
  viewportWidth: number;
  viewportHeight: number;
  viewportInsets: ViewportInsets;
  margin?: number;
}): { zoom: number; cameraX: number; cameraY: number } | null {
  if (elementsToFit.length === 0) {
    return null;
  }

  const bounds = getBoundsForElements(elementsToFit, allElements);
  if (!bounds) {
    return null;
  }

  const contentWidth = Math.max(1, bounds.width);
  const contentHeight = Math.max(1, bounds.height);
  const visibleWidth = Math.max(1, viewportWidth - viewportInsets.left - viewportInsets.right);
  const visibleHeight = Math.max(1, viewportHeight - viewportInsets.top - viewportInsets.bottom);
  const zoom = Math.max(0.2, Math.min(
    (Math.max(1, visibleWidth - margin * 2)) / contentWidth,
    (Math.max(1, visibleHeight - margin * 2)) / contentHeight,
    3.5,
  ));
  const contentCenterX = bounds.x + contentWidth / 2;
  const contentCenterY = bounds.y + contentHeight / 2;
  const visibleCenterX = viewportInsets.left + visibleWidth / 2;
  const visibleCenterY = viewportInsets.top + visibleHeight / 2;

  return {
    zoom,
    cameraX: visibleCenterX - contentCenterX * zoom,
    cameraY: visibleCenterY - contentCenterY * zoom,
  };
}
