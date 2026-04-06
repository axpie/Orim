import { describe, expect, it } from 'vitest';
import { normalizeRotationDegrees, snapDegreesToMagneticStep } from '../rotation';

describe('rotation utilities', () => {
  it('snaps close values to 45 degree magnetic stops', () => {
    expect(snapDegreesToMagneticStep(43, 45, 5)).toBe(45);
    expect(snapDegreesToMagneticStep(-92, 45, 5)).toBe(-90);
  });

  it('keeps values outside the magnetic threshold untouched', () => {
    expect(snapDegreesToMagneticStep(38, 45, 5)).toBe(38);
  });

  it('normalizes wrapped rotations into the expected range', () => {
    expect(normalizeRotationDegrees(270)).toBe(-90);
    expect(normalizeRotationDegrees(-225)).toBe(135);
  });
});
