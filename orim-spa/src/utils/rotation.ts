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

export function snapDegreesToMagneticStep(
  value: number,
  stepDegrees: number,
  thresholdDegrees: number,
): number {
  if (!Number.isFinite(value) || !Number.isFinite(stepDegrees) || !Number.isFinite(thresholdDegrees) || stepDegrees <= 0 || thresholdDegrees < 0) {
    return value;
  }

  const snapped = Math.round(value / stepDegrees) * stepDegrees;
  const delta = Math.abs(normalizeRotationDegrees(value - snapped));
  return delta <= thresholdDegrees ? snapped : value;
}
