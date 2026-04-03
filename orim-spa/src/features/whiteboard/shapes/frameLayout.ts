import type { FrameElement } from '../../../types/models';

export function getFrameHeaderHeight(height: number, labelFontSize?: number): number {
  const base = Math.min(40, Math.max(24, height * 0.2), Math.max(height - 16, 14));
  if (typeof labelFontSize === 'number' && labelFontSize > 0) {
    return Math.min(height, Math.max(base, Math.ceil(labelFontSize * 1.6)));
  }

  return base;
}

export function resolveFrameTitleFontSize(element: Pick<FrameElement, 'height' | 'labelFontSize'>): number {
  return typeof element.labelFontSize === 'number'
    ? Math.max(1, element.labelFontSize)
    : Math.min(22, Math.max(12, getFrameHeaderHeight(element.height) * 0.48));
}
