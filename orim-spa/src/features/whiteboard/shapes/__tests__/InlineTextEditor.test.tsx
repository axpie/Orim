import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HorizontalLabelAlignment,
  VerticalLabelAlignment,
  type TextElement,
} from '../../../../types/models';
import { FALLBACK_BOARD_DEFAULTS } from '../../canvas/canvasUtils';
import { InlineTextEditor } from '../InlineTextEditor';

afterEach(() => {
  cleanup();
});

describe('InlineTextEditor', () => {
  it('selects the existing text by default', async () => {
    renderEditor({ text: 'Hello' });

    const editor = screen.getByRole('textbox') as HTMLTextAreaElement;

    await waitFor(() => expect(editor).toHaveFocus());
    await waitFor(() => {
      expect(editor).toHaveValue('Hello');
      expect(editor.selectionStart).toBe(0);
      expect(editor.selectionEnd).toBe(5);
    });
  });

  it('places the caret at the end for seeded keyboard entry', async () => {
    renderEditor({ text: 'A', selectAllOnFocus: false });

    const editor = screen.getByRole('textbox') as HTMLTextAreaElement;

    await waitFor(() => expect(editor).toHaveFocus());
    await waitFor(() => {
      expect(editor).toHaveValue('A');
      expect(editor.selectionStart).toBe(1);
      expect(editor.selectionEnd).toBe(1);
    });
  });

  it('renders the textarea editor above per-element canvas layers', () => {
    renderEditor();

    const editor = screen.getByRole('textbox');

    expect(editor).toHaveStyle({ zIndex: '1300' });
  });
});

function renderEditor(options?: {
  text?: string;
  selectAllOnFocus?: boolean;
}) {
  const element: TextElement = {
    $type: 'text',
    id: 'text-1',
    x: 40,
    y: 80,
    width: 220,
    height: 56,
    zIndex: 0,
    rotation: 0,
    label: '',
    labelHorizontalAlignment: HorizontalLabelAlignment.Left,
    labelVerticalAlignment: VerticalLabelAlignment.Top,
    text: options?.text ?? 'Hello',
    fontSize: 18,
    autoFontSize: false,
    fontFamily: null,
    color: '#0F172A',
    isBold: false,
    isItalic: false,
    isUnderline: false,
    isStrikethrough: false,
  };

  return render(
    <InlineTextEditor
      element={element}
      zoom={1}
      cameraX={0}
      cameraY={0}
      boardDefaults={FALLBACK_BOARD_DEFAULTS}
      selectAllOnFocus={options?.selectAllOnFocus}
      onCommit={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
}
