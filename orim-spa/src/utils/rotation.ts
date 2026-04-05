export function normalizeRotationDegrees(rotation: number): number {
  if (!Number.isFinite(rotation)) {
    return 0;
  }

  let normalized = rotation % 360;
  if (normalized <= -180) {
    normalized += 360;
  }
  if (normalized > 180) {
    normalized -= 360;
  }

  return Math.round(normalized * 100) / 100;
}
