import type { Board, StickyNotePreset } from '../../types/models';

type Translate = (key: string, options?: Record<string, unknown>) => string;

interface DefaultStickyNotePresetDefinition {
  id: string;
  labelKey: string;
  fillColor: string;
}

const DEFAULT_STICKY_NOTE_PRESET_DEFINITIONS: readonly DefaultStickyNotePresetDefinition[] = [
  { id: 'sticky-yellow', labelKey: 'boardSettings.defaultPresetYellow', fillColor: '#FDE68A' },
  { id: 'sticky-pink', labelKey: 'boardSettings.defaultPresetPink', fillColor: '#F9A8D4' },
  { id: 'sticky-green', labelKey: 'boardSettings.defaultPresetGreen', fillColor: '#86EFAC' },
  { id: 'sticky-blue', labelKey: 'boardSettings.defaultPresetBlue', fillColor: '#93C5FD' },
];

export const DEFAULT_STICKY_NOTE_FILL_COLOR = DEFAULT_STICKY_NOTE_PRESET_DEFINITIONS[0].fillColor;

function cloneStickyNotePreset(preset: StickyNotePreset): StickyNotePreset {
  return { ...preset };
}

function getFallbackStickyNotePresets(): StickyNotePreset[] {
  return DEFAULT_STICKY_NOTE_PRESET_DEFINITIONS.map(({ id, fillColor }) => ({
    id,
    label: '',
    fillColor,
  }));
}

export function createStickyNotePresetId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `sticky-preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getDefaultStickyNotePresets(t: Translate): StickyNotePreset[] {
  return DEFAULT_STICKY_NOTE_PRESET_DEFINITIONS.map(({ id, labelKey, fillColor }) => ({
    id,
    label: t(labelKey),
    fillColor,
  }));
}

export function getEffectiveStickyNotePresets(
  board: Pick<Board, 'stickyNotePresets'> | null | undefined,
  t: Translate,
): StickyNotePreset[] {
  const presets = board?.stickyNotePresets ?? [];
  return (presets.length > 0 ? presets : getDefaultStickyNotePresets(t)).map(cloneStickyNotePreset);
}

export function getStickyNotePresetById(
  board: Pick<Board, 'stickyNotePresets'> | null | undefined,
  presetId: string | null | undefined,
): StickyNotePreset | null {
  const presets = board?.stickyNotePresets.length
    ? board.stickyNotePresets
    : getFallbackStickyNotePresets();
  if (presets.length === 0) {
    return null;
  }

  if (presetId) {
    const matchingPreset = presets.find((preset) => preset.id === presetId);
    if (matchingPreset) {
      return cloneStickyNotePreset(matchingPreset);
    }
  }

  return cloneStickyNotePreset(presets[0]);
}

export function createStickyNotePresetDraft(index: number, t: Translate): StickyNotePreset {
  const template = DEFAULT_STICKY_NOTE_PRESET_DEFINITIONS[index % DEFAULT_STICKY_NOTE_PRESET_DEFINITIONS.length];
  return {
    id: createStickyNotePresetId(),
    label: t('boardSettings.newPresetLabel', { index: index + 1 }),
    fillColor: template.fillColor,
  };
}
