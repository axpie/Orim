export interface ParsedColorValue {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_COLOR_PATTERN = /^rgba?\(([^)]+)\)$/i;

export function parseColorValue(input?: string | null): ParsedColorValue {
  if (!input) {
    return { red: 255, green: 255, blue: 255, alpha: 1 };
  }

  const value = input.trim();
  if (HEX_COLOR_PATTERN.test(value)) {
    return parseHexColor(value);
  }

  const rgbMatch = value.match(RGB_COLOR_PATTERN);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((part) => part.trim());
    if (parts.length >= 3) {
      return {
        red: clampChannel(Number(parts[0])),
        green: clampChannel(Number(parts[1])),
        blue: clampChannel(Number(parts[2])),
        alpha: clampAlpha(parts.length > 3 ? Number(parts[3]) : 1),
      };
    }
  }

  return { red: 255, green: 255, blue: 255, alpha: 1 };
}

export function toOpaqueHex(input?: string | null): string {
  const parsed = parseColorValue(input);
  return `#${toHex(parsed.red)}${toHex(parsed.green)}${toHex(parsed.blue)}`;
}

export function withUpdatedRgb(input: string | null | undefined, nextHex: string): string {
  const parsed = parseColorValue(input);
  const next = parseHexColor(nextHex);
  return formatColorValue({ ...parsed, red: next.red, green: next.green, blue: next.blue });
}

export function withUpdatedAlpha(input: string | null | undefined, alphaPercent: number): string {
  const parsed = parseColorValue(input);
  return formatColorValue({ ...parsed, alpha: clampAlpha(alphaPercent / 100) });
}

export function formatColorValue(color: ParsedColorValue): string {
  const normalized = {
    red: clampChannel(color.red),
    green: clampChannel(color.green),
    blue: clampChannel(color.blue),
    alpha: clampAlpha(color.alpha),
  };

  if (normalized.alpha >= 0.999) {
    return `#${toHex(normalized.red)}${toHex(normalized.green)}${toHex(normalized.blue)}`;
  }

  const alpha = Number(normalized.alpha.toFixed(3)).toString();
  return `rgba(${normalized.red}, ${normalized.green}, ${normalized.blue}, ${alpha})`;
}

function parseHexColor(value: string): ParsedColorValue {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 4) {
    return {
      red: parseInt(normalized[1] + normalized[1], 16),
      green: parseInt(normalized[2] + normalized[2], 16),
      blue: parseInt(normalized[3] + normalized[3], 16),
      alpha: 1,
    };
  }

  if (normalized.length === 7) {
    return {
      red: parseInt(normalized.slice(1, 3), 16),
      green: parseInt(normalized.slice(3, 5), 16),
      blue: parseInt(normalized.slice(5, 7), 16),
      alpha: 1,
    };
  }

  return {
    red: parseInt(normalized.slice(1, 3), 16),
    green: parseInt(normalized.slice(3, 5), 16),
    blue: parseInt(normalized.slice(5, 7), 16),
    alpha: parseInt(normalized.slice(7, 9), 16) / 255,
  };
}

function clampChannel(value: number): number {
  if (!Number.isFinite(value)) {
    return 255;
  }

  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampAlpha(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(0, Math.min(1, value));
}

function toHex(value: number): string {
  return clampChannel(value).toString(16).padStart(2, '0').toUpperCase();
}