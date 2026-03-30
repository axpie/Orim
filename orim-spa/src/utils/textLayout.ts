import type { ArrowElement, BoardElementBase, StickyNoteElement, TextElement } from '../types/models';

export const MIN_AUTO_TEXT_FONT_SIZE = 8;
export const MIN_TEXT_FONT_SIZE = 10;
export const MAX_LABEL_FONT_SIZE = 48;
export const MAX_TEXT_FONT_SIZE = 72;
export const DEFAULT_TEXT_FONT_SIZE = 18;
export const DEFAULT_FONT_FAMILY = 'Inter, system-ui, -apple-system, sans-serif';

const AVERAGE_CHARACTER_WIDTH_FACTOR = 0.58;
const LINE_HEIGHT_FACTOR = 1.15;

export function doesTextFit(
  text: string,
  availableWidth: number,
  availableHeight: number,
  fontSize: number,
): boolean {
  if (availableWidth <= 0 || availableHeight <= 0 || fontSize <= 0) {
    return false;
  }

  const charactersPerLine = Math.max(
    Math.floor(availableWidth / (fontSize * AVERAGE_CHARACTER_WIDTH_FACTOR)),
    1,
  );

  let totalLines = 0;
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    if (paragraph.length === 0) {
      totalLines += 1;
      continue;
    }

    totalLines += Math.ceil(paragraph.length / charactersPerLine);
  }

  return totalLines * fontSize * LINE_HEIGHT_FACTOR <= availableHeight;
}

export function estimateFittingFontSize(
  text: string | null | undefined,
  availableWidth: number,
  availableHeight: number,
  preferredSize: number,
  maximumSize: number,
): number {
  if (!text || text.trim().length === 0) {
    return clamp(preferredSize, MIN_AUTO_TEXT_FONT_SIZE, maximumSize);
  }

  const maxSize = clamp(preferredSize, MIN_AUTO_TEXT_FONT_SIZE, maximumSize);
  const minSize = Math.min(MIN_TEXT_FONT_SIZE, maxSize);

  for (let candidate = maxSize; candidate >= MIN_AUTO_TEXT_FONT_SIZE; candidate -= 0.5) {
    if (doesTextFit(text, availableWidth, availableHeight, candidate)) {
      return candidate;
    }
  }

  return minSize;
}

export function getDefaultLabelFontSize(element: Pick<BoardElementBase, 'width' | 'height'>): number {
  const basis = Math.min(Math.max(element.width, 1), Math.max(element.height, 1));
  return clamp(basis * 0.28, MIN_TEXT_FONT_SIZE, MAX_LABEL_FONT_SIZE);
}

export function resolveLabelFontSize(
  element: Pick<BoardElementBase, 'label' | 'labelFontSize' | 'width' | 'height'>,
): number {
  if (typeof element.labelFontSize === 'number') {
    return Math.max(1, element.labelFontSize);
  }

  const availableWidth = Math.max(element.width - 16, 12);
  const availableHeight = Math.max(element.height - 16, 12);
  const basis = Math.min(Math.max(element.width, 1), Math.max(element.height, 1));
  const preferredSize = clamp(basis * 0.22, MIN_AUTO_TEXT_FONT_SIZE, MAX_LABEL_FONT_SIZE);

  return estimateFittingFontSize(
    element.label,
    availableWidth,
    availableHeight,
    preferredSize,
    MAX_LABEL_FONT_SIZE,
  );
}

export function resolveArrowLabelFontSize(
  arrow: Pick<ArrowElement, 'label' | 'labelFontSize'>,
  polylineLength: number,
): number {
  if (typeof arrow.labelFontSize === 'number') {
    return Math.max(1, arrow.labelFontSize);
  }

  const availableWidth = Math.min(Math.max(polylineLength * 0.35, 70), 220) - 16;
  const availableHeight = Math.max(Math.min(polylineLength * 0.16, 72), 28);
  const preferredSize = clamp(polylineLength * 0.07, MIN_AUTO_TEXT_FONT_SIZE, 24);

  return estimateFittingFontSize(arrow.label, availableWidth, availableHeight, preferredSize, 24);
}

export function resolveTextFontSize(
  element: Pick<TextElement | StickyNoteElement, 'text' | 'fontSize' | 'autoFontSize' | 'width' | 'height'>,
): number {
  if (!element.autoFontSize) {
    return Math.max(1, element.fontSize ?? DEFAULT_TEXT_FONT_SIZE);
  }

  const availableWidth = Math.max(element.width - 8, 12);
  const availableHeight = Math.max(element.height - 8, 12);
  const basis = Math.min(Math.max(element.width, 1), Math.max(element.height, 1));
  const preferredSize = clamp(basis * 0.26, MIN_AUTO_TEXT_FONT_SIZE, MAX_TEXT_FONT_SIZE);

  return estimateFittingFontSize(
    element.text,
    availableWidth,
    availableHeight,
    preferredSize,
    MAX_TEXT_FONT_SIZE,
  );
}

export function resolveFontFamily(fontFamily?: string | null): string {
  return fontFamily && fontFamily.trim().length > 0 ? fontFamily : DEFAULT_FONT_FAMILY;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
