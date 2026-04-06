/** Parse a CSS hex/rgb/rgba color string to {r,g,b,a} (0‑255 channels, 0‑1 alpha). */
export function parseColor(raw: string): { r: number; g: number; b: number; a: number } {
  const s = raw.trim();

  // #RGB, #RGBA, #RRGGBB, #RRGGBBAA
  if (s.startsWith('#')) {
    let hex = s.slice(1);
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    else if (hex.length === 4) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }

  // rgba(r,g,b,a) or rgb(r,g,b)
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (m) {
    return {
      r: parseInt(m[1]),
      g: parseInt(m[2]),
      b: parseInt(m[3]),
      a: m[4] !== undefined ? parseFloat(m[4]) : 1,
    };
  }

  return { r: 0, g: 0, b: 0, a: 1 };
}

/** Convert {r,g,b,a} to a CSS rgba() string. */
export function toRgba(c: { r: number; g: number; b: number; a: number }): string {
  return `rgba(${c.r},${c.g},${c.b},${c.a})`;
}

/** Convert {r,g,b} to #RRGGBB hex. */
export function toHex(c: { r: number; g: number; b: number }): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/** Relative luminance per WCAG 2.0. */
export function luminance(c: { r: number; g: number; b: number }): number {
  const [rs, gs, bs] = [c.r, c.g, c.b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** Contrast ratio between two colors (1‑21). */
export function contrastRatio(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
): number {
  const la = luminance(a) + 0.05;
  const lb = luminance(b) + 0.05;
  return la > lb ? la / lb : lb / la;
}

/** Return black or white, whichever has higher contrast against the given background. */
export function contrastingTextColor(bg: string): string {
  const c = parseColor(bg);
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  return contrastRatio(c, white) > contrastRatio(c, black) ? '#ffffff' : '#000000';
}
