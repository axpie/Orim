import { describe, expect, it } from 'vitest';
import {
  HorizontalLabelAlignment,
  VerticalLabelAlignment,
  type BoardElement,
} from '../../../types/models';
import {
  ensureBoardElementTypeDiscriminator,
  inferBoardElementType,
} from '../boardElementTransport';

function createElementBase() {
  return {
    id: 'element-1',
    x: 0,
    y: 0,
    width: 160,
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
    isLocked: false,
    labelHorizontalAlignment: HorizontalLabelAlignment.Left,
    labelVerticalAlignment: VerticalLabelAlignment.Top,
  } as const;
}

describe('boardElementTransport', () => {
  it('infers missing discriminators for new text element types', () => {
    expect(inferBoardElementType({
      ...createElementBase(),
      html: '<p>Hello</p>',
      fontSize: 18,
      color: '#111827',
    })).toBe('richtext');

    expect(inferBoardElementType({
      ...createElementBase(),
      markdown: '# Hello',
      fontSize: 18,
      color: '#111827',
    })).toBe('markdown');
  });

  it('reapplies a missing discriminator before transport', () => {
    const richTextWithoutType = {
      ...createElementBase(),
      html: '<p>Hello</p>',
      fontSize: 18,
      color: '#111827',
    } as unknown as BoardElement;

    expect(ensureBoardElementTypeDiscriminator(richTextWithoutType).$type).toBe('richtext');
  });
});
