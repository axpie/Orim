import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getThemes } from '../../../api/themes';
import { useThemeStore } from '../../../stores/themeStore';
import { useBoardStore } from '../store/boardStore';
import type { ThemeDefinition } from '../../../types/models';

export const DEFAULT_WHITEBOARD_REGULAR_COLORS = [
  '#000000',
  '#FFFFFF',
  '#EF4444',
  '#F59E0B',
  '#22C55E',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#6B7280',
  '#0EA5E9',
] as const;

export function normalizeColorPalette(colors: Iterable<string | null | undefined>): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const color of colors) {
    const trimmed = color?.trim();
    if (!trimmed) {
      continue;
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized;
}

export function deriveThemePriorityColors(theme: Pick<ThemeDefinition, 'palette' | 'boardDefaults'> | null | undefined): string[] {
  if (!theme) {
    return [];
  }

  if (theme.boardDefaults.themeColors.length > 0) {
    return normalizeColorPalette(theme.boardDefaults.themeColors);
  }

  return normalizeColorPalette([
    theme.palette.primary,
    theme.palette.secondary,
    theme.palette.tertiary,
    theme.boardDefaults.strokeColor,
    theme.boardDefaults.shapeFillColor,
    theme.boardDefaults.selectionColor,
    theme.palette.success ?? theme.palette.secondary,
    theme.palette.warning ?? theme.palette.tertiary,
    theme.palette.info ?? theme.palette.primary,
  ]);
}

export function buildRegularColorPalette(themeColors: readonly string[]): string[] {
  const themeColorKeys = new Set(themeColors.map((color) => color.toLowerCase()));
  return DEFAULT_WHITEBOARD_REGULAR_COLORS.filter((color) => !themeColorKeys.has(color.toLowerCase()));
}

export function useWhiteboardColorPalette() {
  const userThemeKey = useThemeStore((s) => s.themeKey);
  const boardThemeKey = useBoardStore((s) => s.board?.themeKey ?? null);
  const { data: themes = [] } = useQuery({
    queryKey: ['themes'],
    queryFn: getThemes,
    staleTime: 60_000,
  });

  const activeTheme = themes.find((theme) => theme.key === (boardThemeKey ?? userThemeKey)) ?? themes[0] ?? null;
  const themeColors = useMemo(() => deriveThemePriorityColors(activeTheme), [activeTheme]);
  const regularColors = useMemo(() => buildRegularColorPalette(themeColors), [themeColors]);

  return { activeTheme, themeColors, regularColors };
}
