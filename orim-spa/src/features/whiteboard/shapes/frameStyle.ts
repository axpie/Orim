import type { FrameElement, ThemeBoardDefaultsDefinition } from '../../../types/models';
import { luminance, parseColor } from '../../../utils/colorUtils';
import { formatColorValue, parseColorValue } from '../../../utils/colorValue';

export const LEGACY_FRAME_FILL_COLOR = 'rgba(37, 99, 235, 0.08)';
export const LEGACY_FRAME_STROKE_COLOR = 'rgba(37, 99, 235, 0.48)';

export interface ResolvedFrameColors {
  fillColor: string;
  headerFill: string;
  strokeColor: string;
}

export function getDefaultFrameColors(
  boardDefaults: Pick<ThemeBoardDefaultsDefinition, 'strokeColor' | 'surfaceColor'>,
): ResolvedFrameColors {
  const accent = parseColorValue(boardDefaults.strokeColor);
  const surface = parseColor(boardDefaults.surfaceColor);
  const isDarkSurface = luminance({ r: surface.r, g: surface.g, b: surface.b }) < 0.3;

  return {
    fillColor: formatColorValue({ ...accent, alpha: isDarkSurface ? 0.18 : 0.08 }),
    headerFill: formatColorValue({ ...accent, alpha: isDarkSurface ? 0.28 : 0.14 }),
    strokeColor: formatColorValue({ ...accent, alpha: isDarkSurface ? 0.72 : 0.48 }),
  };
}

export function resolveFrameColors(
  element: Pick<FrameElement, 'fillColor' | 'strokeColor'>,
  boardDefaults: Pick<ThemeBoardDefaultsDefinition, 'strokeColor' | 'surfaceColor'>,
): ResolvedFrameColors {
  const defaults = getDefaultFrameColors(boardDefaults);
  const usesThemeFill = !element.fillColor || element.fillColor === LEGACY_FRAME_FILL_COLOR;
  const usesThemeStroke = !element.strokeColor || element.strokeColor === LEGACY_FRAME_STROKE_COLOR;
  const fillColor = usesThemeFill ? defaults.fillColor : element.fillColor;
  const strokeColor = usesThemeStroke ? defaults.strokeColor : element.strokeColor;

  if (usesThemeFill) {
    return {
      fillColor,
      headerFill: defaults.headerFill,
      strokeColor,
    };
  }

  const parsedFill = parseColorValue(fillColor);
  return {
    fillColor,
    headerFill: formatColorValue({
      ...parsedFill,
      alpha: Math.min(1, Math.max(parsedFill.alpha + 0.08, 0.16)),
    }),
    strokeColor,
  };
}
