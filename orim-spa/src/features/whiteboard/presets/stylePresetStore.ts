import type {
  BoardElement,
  NamedStylePreset,
  StylePresetPlacementPreference,
  StylePresetStyle,
  StylePresetStyleByType,
  StylePresetType,
} from '../../../types/models';
import { useBoardStore } from '../store/boardStore';
import { createDefaultStylePresetState } from './stylePresetUtils';

interface StylePresetState {
  presets: NamedStylePreset[];
  placementPreferences: Record<StylePresetType, StylePresetPlacementPreference>;
  lastUsedStyles: Partial<Record<StylePresetType, StylePresetStyle>>;
  createPresetFromElement: (element: BoardElement, name: string) => NamedStylePreset | null;
  updatePresetFromElement: (presetId: string, element: BoardElement) => boolean;
  renamePreset: (presetId: string, name: string) => void;
  deletePreset: (presetId: string) => void;
  setPlacementMode: (type: StylePresetType, mode: 'theme-default') => void;
  setDefaultPreset: (type: StylePresetType, presetId: string) => void;
  rememberStyleFromElement: (element: BoardElement) => void;
  rememberStyleSnapshot: <T extends StylePresetType>(type: T, style: StylePresetStyleByType[T]) => void;
  resolvePlacementStyle: <T extends StylePresetType>(type: T) => StylePresetStyleByType[T] | null;
}

const EMPTY_STYLE_PRESET_STATE = createDefaultStylePresetState();

function selectStylePresetState(state: ReturnType<typeof useBoardStore.getState>): StylePresetState {
  const stylePresetState = state.board?.stylePresetState ?? EMPTY_STYLE_PRESET_STATE;

  return {
    presets: stylePresetState.presets,
    placementPreferences: stylePresetState.placementPreferences,
    lastUsedStyles: stylePresetState.lastUsedStyles,
    createPresetFromElement: state.createPresetFromElement,
    updatePresetFromElement: state.updatePresetFromElement,
    renamePreset: state.renamePreset,
    deletePreset: state.deletePreset,
    setPlacementMode: state.setPlacementMode,
    setDefaultPreset: state.setDefaultPreset,
    rememberStyleFromElement: state.rememberStyleFromElement,
    rememberStyleSnapshot: state.rememberStyleSnapshot,
    resolvePlacementStyle: state.resolvePlacementStyle,
  };
}

type StylePresetSelector<T> = (state: StylePresetState) => T;

interface StylePresetHook {
  <T>(selector: StylePresetSelector<T>): T;
  getState: () => StylePresetState;
}

export const useStylePresetStore: StylePresetHook = Object.assign(
  function useStylePresetStore<T>(selector: StylePresetSelector<T>): T {
    return useBoardStore((state) => selector(selectStylePresetState(state)));
  },
  {
    getState: () => selectStylePresetState(useBoardStore.getState()),
  },
);
