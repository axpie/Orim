import { describe, expect, it } from 'vitest';
import type { ThemeDefinition } from '../../../../types/models';
import { buildRegularColorPalette, deriveThemePriorityColors } from '../useWhiteboardColorPalette';

function createTheme(overrides?: {
  palette?: Partial<ThemeDefinition['palette']>;
  boardDefaults?: Partial<ThemeDefinition['boardDefaults']>;
}): Pick<ThemeDefinition, 'palette' | 'boardDefaults'> {
  return {
    palette: {
      primary: '#112233',
      secondary: '#223344',
      tertiary: '#334455',
      appbarBackground: '#445566',
      appbarText: '#ffffff',
      background: '#f8fafc',
      surface: '#ffffff',
      drawerBackground: '#0f172a',
      drawerText: '#f8fafc',
      drawerIcon: '#f8fafc',
      textPrimary: '#0f172a',
      textSecondary: '#334155',
      linesDefault: '#cbd5e1',
      success: '#16a34a',
      warning: '#f59e0b',
      info: '#0ea5e9',
      ...overrides?.palette,
    },
    boardDefaults: {
      surfaceColor: '#ffffff',
      gridColor: '#e2e8f0',
      shapeFillColor: '#ffffff',
      strokeColor: '#0f172a',
      iconColor: '#0f172a',
      selectionColor: '#2563eb',
      selectionTintRgb: '37, 99, 235',
      handleSurfaceColor: '#ffffff',
      dockTargetColor: '#0f766e',
      themeColors: [],
      ...overrides?.boardDefaults,
    },
  };
}

describe('useWhiteboardColorPalette helpers', () => {
  it('prefers configured theme colors and removes duplicates', () => {
    const themeColors = deriveThemePriorityColors(createTheme({
      boardDefaults: {
        themeColors: ['#112233', '#112233', '  #445566  '],
      },
    }));

    expect(themeColors).toEqual(['#112233', '#445566']);
  });

  it('falls back to palette-derived colors and excludes them from regular colors', () => {
    const themeColors = deriveThemePriorityColors(createTheme());
    const regularColors = buildRegularColorPalette(themeColors);

    expect(themeColors.slice(0, 3)).toEqual(['#112233', '#223344', '#334455']);
    expect(regularColors).not.toContain('#112233');
  });
});
