import { type ArrowLineStyle, type BorderLineStyle } from '../types/models';

export function getLineDashArray(
  style: ArrowLineStyle | BorderLineStyle | string | undefined,
  strokeWidth: number,
): number[] | undefined {
  switch (style) {
    case 'Dashed':
      return [strokeWidth * 4, strokeWidth * 2];
    case 'Dotted':
      return [strokeWidth, strokeWidth * 2];
    case 'DashDot':
      return [strokeWidth * 4, strokeWidth * 2, strokeWidth, strokeWidth * 2];
    case 'LongDash':
      return [strokeWidth * 8, strokeWidth * 3];
    default:
      return undefined;
  }
}