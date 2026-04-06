const MINIMAP_WIDTH = 200;
const MINIMAP_HEIGHT = 150;

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface MinimapLayout {
  scale: number;
  padX: number;
  padY: number;
  drawWidth: number;
  drawHeight: number;
  viewportLeft: number;
  viewportTop: number;
  viewportWidth: number;
  viewportHeight: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function computeMinimapLayout(
  bounds: BoundingBox,
  viewportMinX: number,
  viewportMinY: number,
  viewportWidth: number,
  viewportHeight: number,
): MinimapLayout {
  const scaleX = MINIMAP_WIDTH / bounds.width;
  const scaleY = MINIMAP_HEIGHT / bounds.height;
  const scale = Math.min(scaleX, scaleY);
  const drawWidth = bounds.width * scale;
  const drawHeight = bounds.height * scale;
  const padX = (MINIMAP_WIDTH - drawWidth) / 2;
  const padY = (MINIMAP_HEIGHT - drawHeight) / 2;

  return {
    scale,
    padX,
    padY,
    drawWidth,
    drawHeight,
    viewportLeft: padX + (viewportMinX - bounds.minX) * scale,
    viewportTop: padY + (viewportMinY - bounds.minY) * scale,
    viewportWidth: viewportWidth * scale,
    viewportHeight: viewportHeight * scale,
  };
}

export function clampMinimapViewportPosition(left: number, top: number, layout: MinimapLayout): { left: number; top: number } {
  const minLeft = layout.padX;
  const minTop = layout.padY;
  const maxLeft = layout.padX + Math.max(0, layout.drawWidth - layout.viewportWidth);
  const maxTop = layout.padY + Math.max(0, layout.drawHeight - layout.viewportHeight);

  return {
    left: clamp(left, minLeft, maxLeft),
    top: clamp(top, minTop, maxTop),
  };
}

export function getViewportCenterFromMinimapPosition(
  left: number,
  top: number,
  bounds: BoundingBox,
  layout: MinimapLayout,
): { worldX: number; worldY: number } {
  const clamped = clampMinimapViewportPosition(left, top, layout);

  return {
    worldX: bounds.minX + (clamped.left - layout.padX + layout.viewportWidth / 2) / layout.scale,
    worldY: bounds.minY + (clamped.top - layout.padY + layout.viewportHeight / 2) / layout.scale,
  };
}

export { MINIMAP_HEIGHT, MINIMAP_WIDTH };
