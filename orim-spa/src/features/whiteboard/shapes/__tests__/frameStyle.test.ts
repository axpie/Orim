import { describe, expect, it } from 'vitest';
import { getDefaultFrameColors, resolveFrameColors } from '../frameStyle';

describe('frameStyle', () => {
  it('derives frame colors from the active board theme', () => {
    const colors = getDefaultFrameColors({
      strokeColor: '#0F172A',
      surfaceColor: '#FFFFFF',
    });

    expect(colors.fillColor).toContain('15, 23, 42');
    expect(colors.headerFill).not.toBe(colors.fillColor);
    expect(colors.strokeColor).toContain('15, 23, 42');
  });

  it('maps legacy default frame colors to the active theme colors', () => {
    const resolved = resolveFrameColors({
      fillColor: 'rgba(37, 99, 235, 0.08)',
      strokeColor: 'rgba(37, 99, 235, 0.48)',
    }, {
      strokeColor: '#D946EF',
      surfaceColor: '#0F172A',
    });

    expect(resolved.fillColor).toContain('217, 70, 239');
    expect(resolved.headerFill).toContain('217, 70, 239');
    expect(resolved.strokeColor).toContain('217, 70, 239');
  });

  it('preserves explicit custom frame colors', () => {
    const resolved = resolveFrameColors({
      fillColor: '#123456',
      strokeColor: '#654321',
    }, {
      strokeColor: '#0F172A',
      surfaceColor: '#FFFFFF',
    });

    expect(resolved.fillColor).toBe('#123456');
    expect(resolved.strokeColor).toBe('#654321');
  });
});
