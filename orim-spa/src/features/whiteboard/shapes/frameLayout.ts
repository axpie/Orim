import type { FrameElement } from '../../../types/models';
import { estimateTextBlockHeight } from '../../../utils/textLayout';

export const FRAME_HEADER_HORIZONTAL_PADDING = 14;
export const FRAME_HEADER_VERTICAL_PADDING = 8;
export const FRAME_TITLE_LINE_HEIGHT = 1.15;

function getBaseFrameHeaderHeight(height: number): number {
  return Math.min(height, Math.max(28, Math.min(40, height * 0.2)));
}

export function getFrameHeaderHeight(
  height: number,
  width: number,
  label: string | null | undefined,
  labelFontSize?: number,
): number {
  const base = getBaseFrameHeaderHeight(height);
  const fontSize = typeof labelFontSize === 'number' && labelFontSize > 0
    ? labelFontSize
    : Math.min(22, Math.max(12, getBaseFrameHeaderHeight(height) * 0.48));

  if (!label || label.trim().length === 0) {
    return Math.min(height, Math.max(base, Math.ceil(fontSize + FRAME_HEADER_VERTICAL_PADDING * 2)));
  }

  const availableWidth = Math.max(width - FRAME_HEADER_HORIZONTAL_PADDING * 2, 12);
  const textHeight = estimateTextBlockHeight(label, availableWidth, fontSize, FRAME_TITLE_LINE_HEIGHT);
  return Math.min(height, Math.max(base, Math.ceil(textHeight + FRAME_HEADER_VERTICAL_PADDING * 2)));
}

export function resolveFrameTitleFontSize(element: Pick<FrameElement, 'height' | 'labelFontSize'>): number {
  return typeof element.labelFontSize === 'number'
    ? Math.max(1, element.labelFontSize)
    : Math.min(22, Math.max(12, getBaseFrameHeaderHeight(element.height) * 0.48));
}
