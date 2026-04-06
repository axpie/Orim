import { describe, expect, it } from 'vitest';
import type { ResizeHandle } from '../../shapes/SelectionOverlay';
import { constrainAxisAlignedBoundsToAspectRatio, resizeRotatedBounds } from '../resizeGeometry';

describe('resizeRotatedBounds', () => {
  it('keeps the opposite edge fixed when resizing a rotated east handle', () => {
    const initialBounds = { x: 100, y: 100, width: 200, height: 100 };
    const rotation = 45;
    const fixedHandle = getHandleWorld(initialBounds, rotation, 'w');
    const pointer = addPoints(fixedHandle, rotateVector({ x: 240, y: 0 }, rotation));

    const nextBounds = resizeRotatedBounds({
      handle: 'e',
      pointer,
      initialBounds,
      rotation,
      minSize: 24,
    });

    expect(nextBounds.width).toBeCloseTo(240, 4);
    expect(nextBounds.height).toBeCloseTo(100, 4);
    expectPointClose(getHandleWorld(nextBounds, rotation, 'w'), fixedHandle);
    expectPointClose(getHandleWorld(nextBounds, rotation, 'e'), pointer);
  });

  it('keeps the opposite edge fixed when resizing a rotated north handle', () => {
    const initialBounds = { x: 100, y: 100, width: 200, height: 100 };
    const rotation = 30;
    const fixedHandle = getHandleWorld(initialBounds, rotation, 's');
    const pointer = addPoints(fixedHandle, rotateVector({ x: 0, y: -160 }, rotation));

    const nextBounds = resizeRotatedBounds({
      handle: 'n',
      pointer,
      initialBounds,
      rotation,
      minSize: 24,
    });

    expect(nextBounds.width).toBeCloseTo(200, 4);
    expect(nextBounds.height).toBeCloseTo(160, 4);
    expectPointClose(getHandleWorld(nextBounds, rotation, 's'), fixedHandle);
    expectPointClose(getHandleWorld(nextBounds, rotation, 'n'), pointer);
  });

  it('resizes rotated corners along both local axes', () => {
    const initialBounds = { x: 80, y: 120, width: 180, height: 120 };
    const rotation = -35;
    const fixedHandle = getHandleWorld(initialBounds, rotation, 'nw');
    const pointer = addPoints(fixedHandle, rotateVector({ x: 240, y: 180 }, rotation));

    const nextBounds = resizeRotatedBounds({
      handle: 'se',
      pointer,
      initialBounds,
      rotation,
      minSize: 24,
    });

    expect(nextBounds.width).toBeCloseTo(240, 4);
    expect(nextBounds.height).toBeCloseTo(180, 4);
    expectPointClose(getHandleWorld(nextBounds, rotation, 'nw'), fixedHandle);
    expectPointClose(getHandleWorld(nextBounds, rotation, 'se'), pointer);
  });

  it('locks axis-aligned resizes to a square when the aspect ratio is constrained', () => {
    const nextBounds = constrainAxisAlignedBoundsToAspectRatio({
      handle: 'e',
      bounds: {
        x: 100,
        y: 120,
        width: 140,
        height: 60,
      },
      minSize: 24,
      lockedAspectRatio: 1,
    });

    expect(nextBounds).toEqual({
      x: 100,
      y: 120,
      width: 140,
      height: 140,
    });
  });

  it('locks rotated corner resizes to the requested aspect ratio', () => {
    const initialBounds = { x: 80, y: 120, width: 180, height: 120 };
    const rotation = -35;
    const fixedHandle = getHandleWorld(initialBounds, rotation, 'nw');
    const pointer = addPoints(fixedHandle, rotateVector({ x: 240, y: 180 }, rotation));

    const nextBounds = resizeRotatedBounds({
      handle: 'se',
      pointer,
      initialBounds,
      rotation,
      minSize: 24,
      lockedAspectRatio: 1,
    });

    expect(nextBounds.width).toBeCloseTo(nextBounds.height, 4);
    expectPointClose(getHandleWorld(nextBounds, rotation, 'nw'), fixedHandle);
  });
});

function getHandleWorld(
  bounds: { x: number; y: number; width: number; height: number },
  rotation: number,
  handle: ResizeHandle,
) {
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const halfWidth = bounds.width / 2;
  const halfHeight = bounds.height / 2;

  const local = (() => {
    switch (handle) {
      case 'nw':
        return { x: -halfWidth, y: -halfHeight };
      case 'n':
        return { x: 0, y: -halfHeight };
      case 'ne':
        return { x: halfWidth, y: -halfHeight };
      case 'e':
        return { x: halfWidth, y: 0 };
      case 'se':
        return { x: halfWidth, y: halfHeight };
      case 's':
        return { x: 0, y: halfHeight };
      case 'sw':
        return { x: -halfWidth, y: halfHeight };
      case 'w':
        return { x: -halfWidth, y: 0 };
    }
  })();

  return addPoints(center, rotateVector(local, rotation));
}

function rotateVector(point: { x: number; y: number }, rotation: number) {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

function addPoints(left: { x: number; y: number }, right: { x: number; y: number }) {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
  };
}

function expectPointClose(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 4);
  expect(actual.y).toBeCloseTo(expected.y, 4);
}
