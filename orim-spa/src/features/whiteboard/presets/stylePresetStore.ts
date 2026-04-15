import { useMemo } from 'react';
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
    const presets = useBoardStore((state) => state.board?.stylePresetState?.presets ?? EMPTY_STYLE_PRESET_STATE.presets);
    const placementPreferences = useBoardStore(
      (state) => state.board?.stylePresetState?.placementPreferences ?? EMPTY_STYLE_PRESET_STATE.placementPreferences,
    );
    const lastUsedStyles = useBoardStore(
      (state) => state.board?.stylePresetState?.lastUsedStyles ?? EMPTY_STYLE_PRESET_STATE.lastUsedStyles,
    );
    const createPresetFromElement = useBoardStore((state) => state.createPresetFromElement);
    const updatePresetFromElement = useBoardStore((state) => state.updatePresetFromElement);
    const renamePreset = useBoardStore((state) => state.renamePreset);
    const deletePreset = useBoardStore((state) => state.deletePreset);
    const setPlacementMode = useBoardStore((state) => state.setPlacementMode);
    const setDefaultPreset = useBoardStore((state) => state.setDefaultPreset);
    const rememberStyleFromElement = useBoardStore((state) => state.rememberStyleFromElement);
    const rememberStyleSnapshot = useBoardStore((state) => state.rememberStyleSnapshot);
    const resolvePlacementStyle = useBoardStore((state) => state.resolvePlacementStyle);

    const stylePresetState = useMemo(
      () => ({
        presets,
        placementPreferences,
        lastUsedStyles,
        createPresetFromElement,
        updatePresetFromElement,
        renamePreset,
        deletePreset,
        setPlacementMode,
        setDefaultPreset,
        rememberStyleFromElement,
        rememberStyleSnapshot,
        resolvePlacementStyle,
      }),
      [
        presets,
        placementPreferences,
        lastUsedStyles,
        createPresetFromElement,
        updatePresetFromElement,
        renamePreset,
        deletePreset,
        setPlacementMode,
        setDefaultPreset,
        rememberStyleFromElement,
        rememberStyleSnapshot,
        resolvePlacementStyle,
      ],
    );

    return selector(stylePresetState);
  },
  {
    getState: () => selectStylePresetState(useBoardStore.getState()),
  },
);
