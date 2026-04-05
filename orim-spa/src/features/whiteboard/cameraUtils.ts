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
