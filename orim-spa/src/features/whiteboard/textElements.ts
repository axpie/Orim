import type {
  BoardElement,
  MarkdownElement,
  RichTextElement,
  TextContentElement,
  TextElement,
} from '../../types/models';

export const TEXT_TOOLS = ['text', 'richtext', 'markdown'] as const;

export type TextTool = (typeof TEXT_TOOLS)[number];

const textToolSet = new Set<string>(TEXT_TOOLS);

export function isTextTool(tool: string | null | undefined): tool is TextTool {
  return tool != null && textToolSet.has(tool);
}

export function getTextToolLabelKey(tool: TextTool): string {
  switch (tool) {
    case 'richtext':
      return 'tools.richText';
    case 'markdown':
      return 'tools.markdown';
    case 'text':
    default:
      return 'tools.text';
  }
}

export function isTextContentElement(
  element: BoardElement | null | undefined,
): element is TextContentElement {
  return !!element
    && (element.$type === 'text'
      || element.$type === 'richtext'
      || element.$type === 'markdown');
}

export function getTextContent(element: TextContentElement): string {
  switch (element.$type) {
    case 'text':
      return element.text ?? '';
    case 'richtext':
      return element.html ?? '';
    case 'markdown':
      return element.markdown ?? '';
  }
}

export function getTextContentField(
  element: TextContentElement,
): 'text' | 'html' | 'markdown' {
  switch (element.$type) {
    case 'text':
      return 'text';
    case 'richtext':
      return 'html';
    case 'markdown':
      return 'markdown';
  }
}

export function withTextContent(element: TextElement, value: string): TextElement;
export function withTextContent(element: RichTextElement, value: string): RichTextElement;
export function withTextContent(element: MarkdownElement, value: string): MarkdownElement;
export function withTextContent(element: TextContentElement, value: string): TextContentElement;
export function withTextContent(element: TextContentElement, value: string): TextContentElement {
  switch (element.$type) {
    case 'text':
      return { ...element, text: value };
    case 'richtext':
      return { ...element, html: value };
    case 'markdown':
      return { ...element, markdown: value };
  }
}

export function stripHtmlTags(html: string | null | undefined): string {
  return (html ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getSearchableTextContent(element: TextContentElement): string {
  return element.$type === 'richtext'
    ? stripHtmlTags(element.html)
    : getTextContent(element);
}
