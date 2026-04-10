import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { MarkdownElement } from '../../../types/models';
import { FormattedTextFrame } from './FormattedTextFrame';

interface MarkdownRendererProps {
  element: MarkdownElement;
  domZIndex?: number;
  onViewportMount?: (elementId: string, node: HTMLDivElement | null) => void;
  interactable?: boolean;
  onNativeScroll?: (elementId: string, scrollLeft: number, scrollTop: number) => void;
  onHeightRequired?: (elementId: string, requiredHeight: number) => void;
}

function MarkdownRendererInner({ element, domZIndex, onViewportMount, interactable, onNativeScroll, onHeightRequired }: MarkdownRendererProps) {
  return (
    <FormattedTextFrame element={element} domZIndex={domZIndex} onViewportMount={onViewportMount} interactable={interactable} onNativeScroll={onNativeScroll} onHeightRequired={onHeightRequired}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {element.markdown?.trim().length ? element.markdown : ' '}
      </ReactMarkdown>
    </FormattedTextFrame>
  );
}

export const MarkdownRenderer = memo(MarkdownRendererInner);
