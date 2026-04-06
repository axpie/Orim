import type { ResizeHandle } from '../shapes/SelectionOverlay';

type Point = {
  x: number;
  y: number;
};

type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ResizeDirection = {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
};

interface ResizeRotatedBoundsOptions {
  handle: ResizeHandle;
  pointer: Point;
  initialBounds: Bounds;
  rotation: number;
  minSize: number;
  lockedAspectRatio?: number | null;
}

interface ConstrainAxisAlignedBoundsOptions {
  handle: ResizeHandle;
  bounds: Bounds;
  minSize: number;
  lockedAspectRatio?: number | null;
}

const HANDLE_DIRECTIONS: Record<ResizeHandle, ResizeDirection> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
};

export function resizeRotatedBounds({
  handle,
  pointer,
  initialBounds,
  rotation,
  minSize,
  lockedAspectRatio,
}: ResizeRotatedBoundsOptions): Bounds {
  const direction = HANDLE_DIRECTIONS[handle];
  const minimumSize = Math.max(minSize, 1);
  const initialCenter = {
    x: initialBounds.x + initialBounds.width / 2,
    y: initialBounds.y + initialBounds.height / 2,
  };
  const initialHalfWidth = initialBounds.width / 2;
  const initialHalfHeight = initialBounds.height / 2;

  const anchorLocal = {
    x: -direction.x * initialHalfWidth,
    y: -direction.y * initialHalfHeight,
  };
  const anchorWorldOffset = rotateVector(anchorLocal, rotation);
  const anchorWorld = {
    x: initialCenter.x + anchorWorldOffset.x,
    y: initialCenter.y + anchorWorldOffset.y,
  };
  const localPointer = rotateVector(
    {
      x: pointer.x - anchorWorld.x,
      y: pointer.y - anchorWorld.y,
    },
    -rotation,
  );

  let width = direction.x === 0
    ? initialBounds.width
    : Math.max(localPointer.x * direction.x, minimumSize);
  let height = direction.y === 0
    ? initialBounds.height
    : Math.max(localPointer.y * direction.y, minimumSize);

  if (lockedAspectRatio != null && Number.isFinite(lockedAspectRatio) && lockedAspectRatio > 0) {
    if (direction.x !== 0 && direction.y !== 0) {
      const proposedWidth = Math.max(localPointer.x * direction.x, 0);
      const proposedHeight = Math.max(localPointer.y * direction.y, 0);
      const minWidth = Math.max(minimumSize, minimumSize * lockedAspectRatio);

      width = Math.max(
        proposedWidth,
        proposedHeight * lockedAspectRatio,
        minWidth,
      );
      height = width / lockedAspectRatio;
    } else if (direction.x !== 0) {
      width = Math.max(localPointer.x * direction.x, minimumSize);
      height = width / lockedAspectRatio;

      if (height < minimumSize) {
        height = minimumSize;
        width = height * lockedAspectRatio;
      }
    } else if (direction.y !== 0) {
      height = Math.max(localPointer.y * direction.y, minimumSize);
      width = height * lockedAspectRatio;

      if (width < minimumSize) {
        width = minimumSize;
        height = width / lockedAspectRatio;
      }
    }
  }

  const centerFromAnchor = {
    x: direction.x === 0 ? 0 : (direction.x * width) / 2,
    y: direction.y === 0 ? 0 : (direction.y * height) / 2,
  };
  const centerWorldOffset = rotateVector(centerFromAnchor, rotation);
  const nextCenter = {
    x: anchorWorld.x + centerWorldOffset.x,
    y: anchorWorld.y + centerWorldOffset.y,
  };

  return {
    x: nextCenter.x - width / 2,
    y: nextCenter.y - height / 2,
    width,
    height,
  };
}

export function constrainAxisAlignedBoundsToAspectRatio({
  handle,
  bounds,
  minSize,
  lockedAspectRatio,
}: ConstrainAxisAlignedBoundsOptions): Bounds {
  if (lockedAspectRatio == null || !Number.isFinite(lockedAspectRatio) || lockedAspectRatio <= 0) {
    return bounds;
  }

  const minimumSize = Math.max(minSize, 1);
  const nextLeft = bounds.x;
  let nextTop = bounds.y;
  let nextRight = bounds.x + bounds.width;
  let nextBottom = bounds.y + bounds.height;
  const movesVertical = handle.includes('n') || handle.includes('s');
  const movesHorizontal = handle.includes('e') || handle.includes('w');
  const newWidth = nextRight - nextLeft;
  const newHeight = nextBottom - nextTop;

  if (movesVertical && !movesHorizontal) {
    const constrainedWidth = Math.max(newHeight * lockedAspectRatio, minimumSize);
    nextRight = nextLeft + constrainedWidth;
  } else {
    const constrainedHeight = Math.max(newWidth / lockedAspectRatio, minimumSize);
    if (handle.includes('n')) {
      nextTop = nextBottom - constrainedHeight;
    } else {
      nextBottom = nextTop + constrainedHeight;
    }
  }

  if (nextRight - nextLeft < minimumSize) {
    nextRight = nextLeft + minimumSize;
    nextBottom = nextTop + minimumSize / lockedAspectRatio;
  }

  if (nextBottom - nextTop < minimumSize) {
    nextBottom = nextTop + minimumSize;
    nextRight = nextLeft + minimumSize * lockedAspectRatio;
  }

  return {
    x: nextLeft,
    y: nextTop,
    width: nextRight - nextLeft,
    height: nextBottom - nextTop,
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
