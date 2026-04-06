import { describe, expect, it } from 'vitest';
import {
  clampMinimapViewportPosition,
  computeMinimapLayout,
  getViewportCenterFromMinimapPosition,
  type BoundingBox,
} from '../minimapLayout';

describe('Minimap helpers', () => {
  const bounds: BoundingBox = {
    minX: 0,
    minY: 0,
    maxX: 400,
    maxY: 300,
    width: 400,
    height: 300,
  };

  it('maps the world viewport into minimap coordinates', () => {
    const layout = computeMinimapLayout(bounds, 100, 50, 200, 100);

    expect(layout.scale).toBe(0.5);
    expect(layout.padX).toBe(0);
    expect(layout.padY).toBe(0);
    expect(layout.viewportLeft).toBe(50);
    expect(layout.viewportTop).toBe(25);
    expect(layout.viewportWidth).toBe(100);
    expect(layout.viewportHeight).toBe(50);
  });

  it('clamps dragged viewport positions before converting them back to world coordinates', () => {
    const layout = computeMinimapLayout(bounds, 100, 50, 200, 100);

    expect(clampMinimapViewportPosition(-20, -10, layout)).toEqual({ left: 0, top: 0 });
    expect(clampMinimapViewportPosition(160, 140, layout)).toEqual({ left: 100, top: 100 });

    expect(getViewportCenterFromMinimapPosition(160, 140, bounds, layout)).toEqual({
      worldX: 300,
      worldY: 250,
    });
  });
});
