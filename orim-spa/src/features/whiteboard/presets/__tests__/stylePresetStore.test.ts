import { beforeEach, describe, expect, it } from 'vitest';
import {
  BorderLineStyle,
  BoardVisibility,
  HorizontalLabelAlignment,
  ShapeType,
  VerticalLabelAlignment,
  type Board,
  type ShapeElement,
} from '../../../../types/models';
import { useBoardStore } from '../../store/boardStore';
import { useStylePresetStore } from '../stylePresetStore';
import {
  createDefaultStylePresetState,
  DEFAULT_STYLE_PRESET_PLACEMENT_PREFERENCES,
  getStylePresetTypeForTool,
} from '../stylePresetUtils';

function clonePlacementPreferences() {
  return {
    shape: { ...DEFAULT_STYLE_PRESET_PLACEMENT_PREFERENCES.shape },
    text: { ...DEFAULT_STYLE_PRESET_PLACEMENT_PREFERENCES.text },
    sticky: { ...DEFAULT_STYLE_PRESET_PLACEMENT_PREFERENCES.sticky },
    frame: { ...DEFAULT_STYLE_PRESET_PLACEMENT_PREFERENCES.frame },
    icon: { ...DEFAULT_STYLE_PRESET_PLACEMENT_PREFERENCES.icon },
    arrow: { ...DEFAULT_STYLE_PRESET_PLACEMENT_PREFERENCES.arrow },
    drawing: { ...DEFAULT_STYLE_PRESET_PLACEMENT_PREFERENCES.drawing },
  };
}

function createShape(overrides: Partial<ShapeElement> = {}): ShapeElement {
  return {
    $type: 'shape',
    id: 'shape-1',
    x: 0,
    y: 0,
    width: 120,
    height: 80,
    zIndex: 0,
    rotation: 0,
    label: '',
    labelFontSize: null,
    labelColor: null,
    fontFamily: null,
    isBold: false,
    isItalic: false,
    isUnderline: false,
    isStrikethrough: false,
    labelHorizontalAlignment: HorizontalLabelAlignment.Center,
    labelVerticalAlignment: VerticalLabelAlignment.Middle,
    shapeType: ShapeType.Rectangle,
    fillColor: '#ffffff',
    strokeColor: '#0f172a',
    strokeWidth: 2,
    borderLineStyle: BorderLineStyle.Solid,
    ...overrides,
  };
}

function createBoard(): Board {
  return {
    id: 'board-1',
    title: 'Preset Board',
    labelOutlineEnabled: true,
    arrowOutlineEnabled: true,
    surfaceColor: null,
    themeKey: null,
    enabledIconGroups: [],
    customColors: [],
    recentColors: [],
    stickyNotePresets: [],
    stylePresetState: createDefaultStylePresetState(),
    ownerId: 'owner-1',
    visibility: BoardVisibility.Private,
    sharedAllowAnonymousEditing: false,
    members: [],
    elements: [],
    comments: [],
    snapshots: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('stylePresetStore', () => {
  beforeEach(() => {
    useBoardStore.getState().setBoard({
      ...createBoard(),
      stylePresetState: {
        presets: [],
        placementPreferences: clonePlacementPreferences(),
        lastUsedStyles: {},
      },
    });
  });

  it('maps shape tools to the shared shape preset type', () => {
    expect(getStylePresetTypeForTool('rectangle')).toBe('shape');
    expect(getStylePresetTypeForTool('triangle')).toBe('shape');
    expect(getStylePresetTypeForTool('select')).toBeNull();
  });

  it('creates a named preset from an element and can use it as default', () => {
    const preset = useStylePresetStore.getState().createPresetFromElement(
      createShape({
        fillColor: '#f59e0b',
        strokeColor: '#7c2d12',
        strokeWidth: 4,
      }),
      'Warnkarte',
    );

    expect(preset).not.toBeNull();
    expect(preset?.name).toBe('Warnkarte');

    useStylePresetStore.getState().setDefaultPreset('shape', preset!.id);

    expect(useStylePresetStore.getState().resolvePlacementStyle('shape')).toMatchObject({
      fillColor: '#f59e0b',
      strokeColor: '#7c2d12',
      strokeWidth: 4,
    });
  });

  it('normalizes legacy last-used placement preferences back to theme defaults', () => {
    useBoardStore.getState().setBoard({
      ...createBoard(),
      stylePresetState: {
        presets: [],
        placementPreferences: {
          ...clonePlacementPreferences(),
          text: {
            mode: 'last-used',
            presetId: null,
          },
        },
        lastUsedStyles: {
          text: {
            color: '#2563eb',
            fontSize: 24,
            isBold: true,
          },
        },
      },
    });

    expect(useStylePresetStore.getState().placementPreferences.text).toEqual({
      mode: 'theme-default',
      presetId: null,
    });
    expect(useStylePresetStore.getState().resolvePlacementStyle('text')).toBeNull();
  });

  it('falls back from a deleted default preset to theme defaults', () => {
    const preset = useStylePresetStore.getState().createPresetFromElement(
      createShape({ fillColor: '#0ea5e9' }),
      'Blau',
    );

    useStylePresetStore.getState().setDefaultPreset('shape', preset!.id);
    useStylePresetStore.getState().deletePreset(preset!.id);

    expect(useStylePresetStore.getState().placementPreferences.shape).toEqual({
      mode: 'theme-default',
      presetId: null,
    });
    expect(useStylePresetStore.getState().resolvePlacementStyle('shape')).toBeNull();
  });
});
