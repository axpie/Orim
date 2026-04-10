import {
  BorderLineStyle,
  HorizontalLabelAlignment,
  VerticalLabelAlignment,
} from '../../../types/models';
import type {
  Board,
  BoardElement,
  BoardStylePresetState,
  NamedStylePreset,
  ThemeBoardDefaultsDefinition,
  StylePresetPlacementPreference,
  StylePresetStyle,
  StylePresetStyleByType,
  StylePresetType,
} from '../../../types/models';
import { contrastingTextColor } from '../../../utils/colorUtils';
import { getDefaultFrameColors } from '../shapes/frameStyle';
import { DEFAULT_STICKY_NOTE_FILL_COLOR, getStickyNotePresetById } from '../stickyNotePresets';

export const STYLE_PRESET_TYPES: StylePresetType[] = ['shape', 'text', 'sticky', 'frame', 'icon', 'arrow', 'drawing'];

export const DEFAULT_STYLE_PRESET_PLACEMENT_PREFERENCES: Record<StylePresetType, StylePresetPlacementPreference> = {
  shape: { mode: 'theme-default', presetId: null },
  text: { mode: 'theme-default', presetId: null },
  sticky: { mode: 'theme-default', presetId: null },
  frame: { mode: 'theme-default', presetId: null },
  icon: { mode: 'theme-default', presetId: null },
  arrow: { mode: 'theme-default', presetId: null },
  drawing: { mode: 'theme-default', presetId: null },
};

function cloneStylePresetStyle<T extends StylePresetStyle>(style: T): T {
  return { ...style };
}

function cloneNamedStylePreset<T extends StylePresetType>(preset: NamedStylePreset<T>): NamedStylePreset<T> {
  return {
    ...preset,
    style: cloneStylePresetStyle(preset.style),
  };
}

export function cloneStylePresetPlacementPreferences(
  preferences: Partial<Record<StylePresetType, StylePresetPlacementPreference>> | null | undefined = null,
): Record<StylePresetType, StylePresetPlacementPreference> {
  return STYLE_PRESET_TYPES.reduce<Record<StylePresetType, StylePresetPlacementPreference>>((accumulator, type) => {
    const current = preferences?.[type];
    accumulator[type] = {
      mode: current?.mode === 'preset' || current?.mode === 'theme-default'
        ? current.mode
        : 'theme-default',
      presetId: current?.mode === 'preset' ? current.presetId ?? null : null,
    };
    return accumulator;
  }, {
    shape: { ...DEFAULT_STYLE_PRESET_PLACEMENT_PREFERENCES.shape },
    text: { ...DEFAULT_STYLE_PRESET_PLACEMENT_PREFERENCES.text },
    sticky: { ...DEFAULT_STYLE_PRESET_PLACEMENT_PREFERENCES.sticky },
    frame: { ...DEFAULT_STYLE_PRESET_PLACEMENT_PREFERENCES.frame },
    icon: { ...DEFAULT_STYLE_PRESET_PLACEMENT_PREFERENCES.icon },
    arrow: { ...DEFAULT_STYLE_PRESET_PLACEMENT_PREFERENCES.arrow },
    drawing: { ...DEFAULT_STYLE_PRESET_PLACEMENT_PREFERENCES.drawing },
  });
}

export function createDefaultStylePresetState(): BoardStylePresetState {
  return {
    presets: [],
    placementPreferences: cloneStylePresetPlacementPreferences(),
    lastUsedStyles: {},
  };
}

export function normalizeStylePresetState(state: BoardStylePresetState | null | undefined): BoardStylePresetState {
  return {
    presets: (state?.presets ?? []).map((preset) => cloneNamedStylePreset(preset)),
    placementPreferences: cloneStylePresetPlacementPreferences(state?.placementPreferences),
    lastUsedStyles: Object.fromEntries(
      Object.entries(state?.lastUsedStyles ?? {})
        .filter(([type, style]) => STYLE_PRESET_TYPES.includes(type as StylePresetType) && !!style)
        .map(([type, style]) => [type, cloneStylePresetStyle(style as StylePresetStyle)]),
    ) as Partial<Record<StylePresetType, StylePresetStyle>>,
  };
}

export function cloneStylePresetState(state: BoardStylePresetState | null | undefined): BoardStylePresetState {
  return normalizeStylePresetState(state);
}

export function resolveStylePresetPlacementStyle<T extends StylePresetType>(
  state: BoardStylePresetState | null | undefined,
  type: T,
): StylePresetStyleByType[T] | null {
  const normalized = normalizeStylePresetState(state);
  const preference = normalized.placementPreferences[type];

  if (preference.mode === 'preset' && preference.presetId) {
    const preset = normalized.presets.find((entry) => entry.id === preference.presetId && entry.type === type);
    if (preset) {
      return preset.style as StylePresetStyleByType[T];
    }
  }

  return null;
}

export function applyStylePresetToElement<T extends BoardElement>(
  element: T,
  style: StylePresetStyle,
): T {
  return {
    ...element,
    ...(style as unknown as Partial<T>),
  };
}

export function getThemeDefaultStyleForPresetType<T extends StylePresetType>(
  type: T,
  options: {
    boardDefaults: ThemeBoardDefaultsDefinition;
    board: Board | null | undefined;
    pendingStickyNotePresetId?: string | null;
  },
): StylePresetStyleByType[T] {
  const { boardDefaults, board, pendingStickyNotePresetId = null } = options;

  switch (type) {
    case 'shape':
      return {
        fillColor: boardDefaults.shapeFillColor,
        strokeColor: boardDefaults.strokeColor,
        strokeWidth: 2,
        borderLineStyle: BorderLineStyle.Solid,
        labelFontSize: null,
        labelColor: null,
        fontFamily: null,
        isBold: false,
        isItalic: false,
        isUnderline: false,
        isStrikethrough: false,
        labelHorizontalAlignment: HorizontalLabelAlignment.Center,
        labelVerticalAlignment: VerticalLabelAlignment.Middle,
      } as StylePresetStyleByType[T];
    case 'text':
      return {
        fontSize: 18,
        autoFontSize: false,
        fontFamily: null,
        color: boardDefaults.strokeColor,
        isBold: false,
        isItalic: false,
        isUnderline: false,
        isStrikethrough: false,
        labelHorizontalAlignment: HorizontalLabelAlignment.Left,
        labelVerticalAlignment: VerticalLabelAlignment.Top,
      } as StylePresetStyleByType[T];
    case 'sticky': {
      const stickyPreset = getStickyNotePresetById(board ?? null, pendingStickyNotePresetId);
      const stickyFillColor = stickyPreset?.fillColor ?? DEFAULT_STICKY_NOTE_FILL_COLOR;

      return {
        fontSize: 16,
        autoFontSize: false,
        fontFamily: null,
        fillColor: stickyFillColor,
        color: contrastingTextColor(stickyFillColor),
        isBold: false,
        isItalic: false,
        isUnderline: false,
        isStrikethrough: false,
        labelHorizontalAlignment: HorizontalLabelAlignment.Left,
        labelVerticalAlignment: VerticalLabelAlignment.Top,
      } as StylePresetStyleByType[T];
    }
    case 'frame': {
      const frameColors = getDefaultFrameColors(boardDefaults);

      return {
        fillColor: frameColors.fillColor,
        strokeColor: frameColors.strokeColor,
        strokeWidth: 2,
        labelFontSize: null,
        labelColor: null,
        fontFamily: null,
        isBold: false,
        isItalic: false,
        isUnderline: false,
        isStrikethrough: false,
        labelHorizontalAlignment: HorizontalLabelAlignment.Left,
        labelVerticalAlignment: VerticalLabelAlignment.Middle,
      } as StylePresetStyleByType[T];
    }
    case 'icon':
      return {
        color: boardDefaults.iconColor,
      } as StylePresetStyleByType[T];
    case 'arrow':
      return {
        strokeColor: boardDefaults.strokeColor,
        strokeWidth: 2,
        labelFontSize: null,
        labelColor: null,
        fontFamily: null,
      } as StylePresetStyleByType[T];
    case 'drawing':
      return {
        strokeColor: boardDefaults.strokeColor,
        strokeWidth: 2,
      } as StylePresetStyleByType[T];
  }
}

export function getStylePresetTypeForTool(tool: string | null | undefined): StylePresetType | null {
  switch (tool) {
    case 'rectangle':
    case 'ellipse':
    case 'triangle':
    case 'rhombus':
      return 'shape';
    case 'text':
      return 'text';
    case 'sticky':
      return 'sticky';
    case 'frame':
      return 'frame';
    case 'icon':
      return 'icon';
    case 'arrow':
      return 'arrow';
    case 'drawing':
      return 'drawing';
    default:
      return null;
  }
}

export function getStylePresetTypeForElement(element: BoardElement | null | undefined): StylePresetType | null {
  switch (element?.$type) {
    case 'shape':
    case 'text':
    case 'sticky':
    case 'frame':
    case 'icon':
    case 'arrow':
    case 'drawing':
      return element.$type;
    default:
      return null;
  }
}

export function extractStylePresetSourceFromElement(
  element: BoardElement | null | undefined,
): { type: StylePresetType; style: StylePresetStyle } | null {
  if (!element) {
    return null;
  }

  switch (element.$type) {
    case 'shape':
      return {
        type: 'shape',
        style: {
          fillColor: element.fillColor,
          strokeColor: element.strokeColor,
          strokeWidth: element.strokeWidth,
          borderLineStyle: element.borderLineStyle,
          labelFontSize: element.labelFontSize ?? null,
          labelColor: element.labelColor ?? null,
          fontFamily: element.fontFamily ?? null,
          isBold: element.isBold ?? false,
          isItalic: element.isItalic ?? false,
          isUnderline: element.isUnderline ?? false,
          isStrikethrough: element.isStrikethrough ?? false,
          labelHorizontalAlignment: element.labelHorizontalAlignment,
          labelVerticalAlignment: element.labelVerticalAlignment,
        },
      };
    case 'text':
      return {
        type: 'text',
        style: {
          fontSize: element.fontSize,
          autoFontSize: element.autoFontSize ?? false,
          fontFamily: element.fontFamily ?? null,
          color: element.color,
          isBold: element.isBold ?? false,
          isItalic: element.isItalic ?? false,
          isUnderline: element.isUnderline ?? false,
          isStrikethrough: element.isStrikethrough ?? false,
          labelHorizontalAlignment: element.labelHorizontalAlignment,
          labelVerticalAlignment: element.labelVerticalAlignment,
        },
      };
    case 'sticky':
      return {
        type: 'sticky',
        style: {
          fontSize: element.fontSize,
          autoFontSize: element.autoFontSize ?? false,
          fontFamily: element.fontFamily ?? null,
          fillColor: element.fillColor,
          color: element.color,
          isBold: element.isBold ?? false,
          isItalic: element.isItalic ?? false,
          isUnderline: element.isUnderline ?? false,
          isStrikethrough: element.isStrikethrough ?? false,
          labelHorizontalAlignment: element.labelHorizontalAlignment,
          labelVerticalAlignment: element.labelVerticalAlignment,
        },
      };
    case 'frame':
      return {
        type: 'frame',
        style: {
          fillColor: element.fillColor,
          strokeColor: element.strokeColor,
          strokeWidth: element.strokeWidth,
          labelFontSize: element.labelFontSize ?? null,
          labelColor: element.labelColor ?? null,
          fontFamily: element.fontFamily ?? null,
          isBold: element.isBold ?? false,
          isItalic: element.isItalic ?? false,
          isUnderline: element.isUnderline ?? false,
          isStrikethrough: element.isStrikethrough ?? false,
          labelHorizontalAlignment: element.labelHorizontalAlignment,
          labelVerticalAlignment: element.labelVerticalAlignment,
        },
      };
    case 'icon':
      return {
        type: 'icon',
        style: {
          color: element.color,
        },
      };
    case 'arrow':
      return {
        type: 'arrow',
        style: {
          strokeColor: element.strokeColor,
          strokeWidth: element.strokeWidth,
          labelFontSize: element.labelFontSize ?? null,
          labelColor: element.labelColor ?? null,
          fontFamily: element.fontFamily ?? null,
        },
      };
    case 'drawing':
      return {
        type: 'drawing',
        style: {
          strokeColor: element.strokeColor,
          strokeWidth: element.strokeWidth,
        },
      };
    default:
      return null;
  }
}

export function areStylePresetStylesEqual(
  left: StylePresetStyle | null | undefined,
  right: StylePresetStyle | null | undefined,
): boolean {
  if (!left || !right) {
    return left === right;
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
  return [...keys].every((key) => Object.is(leftRecord[key], rightRecord[key]));
}

export function createStylePresetId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `style-preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
