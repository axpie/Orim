import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BorderLineStyle,
  BoardVisibility,
  HorizontalLabelAlignment,
  ShapeType,
  VerticalLabelAlignment,
  type Board,
  type NamedStylePreset,
  type ShapeElement,
} from '../../../../types/models';
import { useBoardStore } from '../../store/boardStore';
import { StylePresetDialog } from '../StylePresetDialog';
import { createDefaultStylePresetState } from '../stylePresetUtils';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, optionsOrDefault?: unknown, maybeDefault?: string) => {
      if (typeof optionsOrDefault === 'string') {
        return optionsOrDefault;
      }

      if (typeof maybeDefault === 'string') {
        return maybeDefault;
      }

      if (optionsOrDefault && typeof optionsOrDefault === 'object' && 'defaultValue' in optionsOrDefault) {
        const defaultValue = (optionsOrDefault as { defaultValue?: unknown }).defaultValue;
        if (typeof defaultValue === 'string') {
          if ('name' in optionsOrDefault && typeof (optionsOrDefault as { name?: unknown }).name === 'string') {
            return defaultValue.replace('{{name}}', (optionsOrDefault as { name: string }).name);
          }

          if ('type' in optionsOrDefault && typeof (optionsOrDefault as { type?: unknown }).type === 'string') {
            return defaultValue.replace('{{type}}', (optionsOrDefault as { type: string }).type);
          }

          return defaultValue;
        }
      }

      return key;
    },
  }),
}));

vi.mock('../../controls/useWhiteboardColorPalette', () => ({
  useWhiteboardColorPalette: () => ({
    activeTheme: null,
    themeColors: [],
    regularColors: [],
  }),
}));

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

function createPreset(): NamedStylePreset<'shape'> {
  return {
    id: 'shape-preset-1',
    type: 'shape',
    name: 'Warnung',
    style: {
      fillColor: '#f59e0b',
      strokeColor: '#7c2d12',
      strokeWidth: 4,
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
    },
    createdAt: '2026-04-10T00:00:00.000Z',
    updatedAt: '2026-04-10T00:00:00.000Z',
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
    stylePresetState: {
      ...createDefaultStylePresetState(),
      presets: [createPreset()],
    },
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

describe('StylePresetDialog', () => {
  beforeEach(() => {
    useBoardStore.getState().setBoard(createBoard());
  });

  it('shows Theme-Standard as the first preset row and keeps derive disabled there', () => {
    render(
      <StylePresetDialog
        open
        onClose={vi.fn()}
        elementType="shape"
        sourceElement={createShape()}
      />,
    );

    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    expect(inputs[0]?.value).toBe('Theme-Standard');
    expect(inputs[1]?.value).toBe('Warnung');

    const deriveButtons = screen.getAllByRole('button', { name: 'Aus aktuellem Element ableiten' });
    expect(deriveButtons[0]).toBeDisabled();
    expect(deriveButtons[1]).not.toBeDisabled();
  });

  it('applies the theme default preset directly to the current element', () => {
    const onApplyPresetToSource = vi.fn();

    render(
      <StylePresetDialog
        open
        onClose={vi.fn()}
        elementType="shape"
        sourceElement={createShape()}
        onApplyPresetToSource={onApplyPresetToSource}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Für aktuelles Element übernehmen' })[0]!);

    expect(onApplyPresetToSource).toHaveBeenCalledWith(expect.objectContaining({
      fillColor: '#FFFFFF',
      strokeColor: '#0F172A',
      strokeWidth: 2,
    }));
  });

  it('applies a saved preset directly to the current element', () => {
    const onApplyPresetToSource = vi.fn();

    render(
      <StylePresetDialog
        open
        onClose={vi.fn()}
        elementType="shape"
        sourceElement={createShape()}
        onApplyPresetToSource={onApplyPresetToSource}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Für aktuelles Element übernehmen' })[1]!);

    expect(onApplyPresetToSource).toHaveBeenCalledWith(expect.objectContaining({
      fillColor: '#f59e0b',
      strokeColor: '#7c2d12',
      strokeWidth: 4,
    }));
  });

  it('keeps preset names read-only until edit mode is activated', () => {
    render(
      <StylePresetDialog
        open
        onClose={vi.fn()}
        elementType="shape"
        sourceElement={createShape()}
      />,
    );

    const input = screen.getByDisplayValue('Warnung') as HTMLInputElement;
    expect(input.readOnly).toBe(true);

    fireEvent.click(screen.getByLabelText('Preset umbenennen'));

    expect(input.readOnly).toBe(false);

    fireEvent.change(input, { target: { value: 'Alarm' } });
    fireEvent.blur(input);

    expect(useBoardStore.getState().board?.stylePresetState?.presets[0]?.name).toBe('Alarm');
  });

  it('asks for confirmation before deleting a preset', () => {
    render(
      <StylePresetDialog
        open
        onClose={vi.fn()}
        elementType="shape"
        sourceElement={createShape()}
      />,
    );

    fireEvent.click(screen.getByLabelText('Preset löschen'));

    expect(screen.getByText('Preset löschen?')).toBeInTheDocument();
    expect(useBoardStore.getState().board?.stylePresetState?.presets).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));

    expect(useBoardStore.getState().board?.stylePresetState?.presets).toHaveLength(0);
  });

  it('asks for confirmation before overwriting a preset from the current selection', () => {
    render(
      <StylePresetDialog
        open
        onClose={vi.fn()}
        elementType="shape"
        sourceElement={createShape({
          fillColor: '#22c55e',
          strokeColor: '#166534',
          strokeWidth: 6,
        })}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Aus aktuellem Element ableiten' })[1]!);

    expect(screen.getByText('Preset überschreiben?')).toBeInTheDocument();
    expect(useBoardStore.getState().board?.stylePresetState?.presets[0]?.style).toMatchObject({
      fillColor: '#f59e0b',
      strokeColor: '#7c2d12',
      strokeWidth: 4,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Überschreiben' }));

    expect(useBoardStore.getState().board?.stylePresetState?.presets[0]?.style).toMatchObject({
      fillColor: '#22c55e',
      strokeColor: '#166534',
      strokeWidth: 6,
    });
  });

  it('creates new presets via a button instead of a separate name input', () => {
    render(
      <StylePresetDialog
        open
        onClose={vi.fn()}
        elementType="shape"
        sourceElement={createShape({
          fillColor: '#22c55e',
          strokeColor: '#166534',
          strokeWidth: 6,
        })}
      />,
    );

    expect(screen.queryByLabelText('Preset-Name')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Neues Preset anlegen' }));

    expect(useBoardStore.getState().board?.stylePresetState?.presets).toHaveLength(2);
    expect(useBoardStore.getState().board?.stylePresetState?.presets[1]).toMatchObject({
      name: 'Formen 2',
      style: {
        fillColor: '#22c55e',
        strokeColor: '#166534',
        strokeWidth: 6,
      },
    });
  });
});
