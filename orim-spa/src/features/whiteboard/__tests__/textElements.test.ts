import { describe, expect, it } from 'vitest';
import {
  HorizontalLabelAlignment,
  VerticalLabelAlignment,
  type MarkdownElement,
  type RichTextElement,
  type TextElement,
} from '../../../types/models';
import {
  getSearchableTextContent,
  getTextContent,
  getTextContentField,
  isTextTool,
  TEXT_TOOLS,
  withTextContent,
} from '../textElements';

function createTextBase() {
  return {
    id: 'text-1',
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
    labelHorizontalAlignment: HorizontalLabelAlignment.Left,
    labelVerticalAlignment: VerticalLabelAlignment.Top,
    fontSize: 18,
    color: '#111827',
  } as const;
}

describe('textElements', () => {
  it('recognizes every configured text tool', () => {
    for (const tool of TEXT_TOOLS) {
      expect(isTextTool(tool)).toBe(true);
    }

    expect(isTextTool('sticky')).toBe(false);
  });

  it('reads and writes content for each text element type', () => {
    const plainText: TextElement = {
      ...createTextBase(),
      $type: 'text',
      text: 'Hello',
    };
    const richText: RichTextElement = {
      ...createTextBase(),
      id: 'rich-1',
      $type: 'richtext',
      html: '<p>Hello</p>',
    };
    const markdown: MarkdownElement = {
      ...createTextBase(),
      id: 'md-1',
      $type: 'markdown',
      markdown: '# Hello',
    };

    expect(getTextContentField(plainText)).toBe('text');
    expect(getTextContentField(richText)).toBe('html');
    expect(getTextContentField(markdown)).toBe('markdown');

    expect(getTextContent(withTextContent(plainText, 'Updated'))).toBe('Updated');
    expect(getTextContent(withTextContent(richText, '<p>Updated</p>'))).toBe('<p>Updated</p>');
    expect(getTextContent(withTextContent(markdown, '## Updated'))).toBe('## Updated');
  });

  it('normalizes rich-text search text by stripping markup', () => {
    const richText: RichTextElement = {
      ...createTextBase(),
      $type: 'richtext',
      html: '<p>Hello <strong>World</strong></p><script>alert(1)</script>',
    };

    expect(getSearchableTextContent(richText)).toBe('Hello World');
  });
});
