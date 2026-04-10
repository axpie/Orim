import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HorizontalLabelAlignment,
  VerticalLabelAlignment,
  type RichTextElement,
} from '../../../../types/models';
import { FALLBACK_BOARD_DEFAULTS } from '../../canvas/canvasUtils';
import { InlineTextEditor } from '../InlineTextEditor';

afterEach(() => {
  cleanup();
});

describe('Formatted text editor', () => {
  it('allows clicking the rich-text save button', async () => {
    const onCommit = vi.fn();

    render(
      <InlineTextEditor
        element={createRichTextElement()}
        zoom={1}
        cameraX={0}
        cameraY={0}
        boardDefaults={FALLBACK_BOARD_DEFAULTS}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );

    const saveButton = (await screen.findAllByLabelText('Save'))
      .find((element) => element.tagName === 'BUTTON');

    expect(saveButton).toBeDefined();
    fireEvent.click(saveButton!);

    await waitFor(() => expect(onCommit).toHaveBeenCalledWith('rich-1', '<p>Hello</p>'));
  });
});

function createRichTextElement(): RichTextElement {
  return {
    $type: 'richtext',
    id: 'rich-1',
    x: 40,
    y: 80,
    width: 220,
    height: 120,
    zIndex: 0,
    rotation: 0,
    label: '',
    labelHorizontalAlignment: HorizontalLabelAlignment.Left,
    labelVerticalAlignment: VerticalLabelAlignment.Top,
    html: '<p>Hello</p>',
    scrollLeft: 0,
    scrollTop: 0,
    fontSize: 18,
    autoFontSize: false,
    fontFamily: null,
    color: '#0F172A',
    isBold: false,
    isItalic: false,
    isUnderline: false,
    isStrikethrough: false,
  };
}
