import type { BoardElement } from '../types/models';

export type AlignAction = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type DistributeAction = 'horizontal' | 'vertical';

function filterAlignableElements(elements: BoardElement[]): BoardElement[] {
  return elements.filter((el) => el.$type !== 'arrow');
}

export function computeAlignment(
  elements: BoardElement[],
  action: AlignAction,
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  const alignable = filterAlignableElements(elements);
  if (alignable.length < 2) return result;

  switch (action) {
    case 'left': {
      const minX = Math.min(...alignable.map((el) => el.x));
      for (const el of alignable) {
        if (el.x !== minX) {
          result.set(el.id, { x: minX, y: el.y });
        }
      }
      break;
    }
    case 'center': {
      const avgCenterX = alignable.reduce((sum, el) => sum + el.x + el.width / 2, 0) / alignable.length;
      for (const el of alignable) {
        const newX = avgCenterX - el.width / 2;
        if (newX !== el.x) {
          result.set(el.id, { x: newX, y: el.y });
        }
      }
      break;
    }
    case 'right': {
      const maxRight = Math.max(...alignable.map((el) => el.x + el.width));
      for (const el of alignable) {
        const newX = maxRight - el.width;
        if (newX !== el.x) {
          result.set(el.id, { x: newX, y: el.y });
        }
      }
      break;
    }
    case 'top': {
      const minY = Math.min(...alignable.map((el) => el.y));
      for (const el of alignable) {
        if (el.y !== minY) {
          result.set(el.id, { x: el.x, y: minY });
        }
      }
      break;
    }
    case 'middle': {
      const avgCenterY = alignable.reduce((sum, el) => sum + el.y + el.height / 2, 0) / alignable.length;
      for (const el of alignable) {
        const newY = avgCenterY - el.height / 2;
        if (newY !== el.y) {
          result.set(el.id, { x: el.x, y: newY });
        }
      }
      break;
    }
    case 'bottom': {
      const maxBottom = Math.max(...alignable.map((el) => el.y + el.height));
      for (const el of alignable) {
        const newY = maxBottom - el.height;
        if (newY !== el.y) {
          result.set(el.id, { x: el.x, y: newY });
        }
      }
      break;
    }
  }

  return result;
}

export function computeDistribution(
  elements: BoardElement[],
  action: DistributeAction,
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  const alignable = filterAlignableElements(elements);
  if (alignable.length < 3) return result;

  if (action === 'horizontal') {
    const sorted = [...alignable].sort((a, b) => (a.x + a.width / 2) - (b.x + b.width / 2));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalWidth = sorted.reduce((sum, el) => sum + el.width, 0);
    const availableSpace = (last.x + last.width) - first.x - totalWidth;
    const gap = availableSpace / (sorted.length - 1);

    let currentX = first.x + first.width + gap;
    for (let i = 1; i < sorted.length - 1; i++) {
      const el = sorted[i];
      if (el.x !== currentX) {
        result.set(el.id, { x: currentX, y: el.y });
      }
      currentX += el.width + gap;
    }
  } else {
    const sorted = [...alignable].sort((a, b) => (a.y + a.height / 2) - (b.y + b.height / 2));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalHeight = sorted.reduce((sum, el) => sum + el.height, 0);
    const availableSpace = (last.y + last.height) - first.y - totalHeight;
    const gap = availableSpace / (sorted.length - 1);

    let currentY = first.y + first.height + gap;
    for (let i = 1; i < sorted.length - 1; i++) {
      const el = sorted[i];
      if (el.y !== currentY) {
        result.set(el.id, { x: el.x, y: currentY });
      }
      currentY += el.height + gap;
    }
  }

  return result;
}
