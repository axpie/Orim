import { memo, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { Box } from '@mui/material';
import type { RichTextElement } from '../../../types/models';
import { FormattedTextFrame } from './FormattedTextFrame';

interface RichTextRendererProps {
  element: RichTextElement;
  domZIndex?: number;
  onViewportMount?: (elementId: string, node: HTMLDivElement | null) => void;
  interactable?: boolean;
  onNativeScroll?: (elementId: string, scrollLeft: number, scrollTop: number) => void;
  onHeightRequired?: (elementId: string, requiredHeight: number) => void;
}

function RichTextRendererInner({ element, domZIndex, onViewportMount, interactable, onNativeScroll, onHeightRequired }: RichTextRendererProps) {
  const sanitizedHtml = useMemo(
    () => DOMPurify.sanitize(element.html ?? '', {
      USE_PROFILES: { html: true },
      ADD_ATTR: ['style', 'class', 'data-type', 'data-checked'],
    }),
    [element.html],
  );

  return (
    <FormattedTextFrame element={element} domZIndex={domZIndex} onViewportMount={onViewportMount} interactable={interactable} onNativeScroll={onNativeScroll} onHeightRequired={onHeightRequired}>
      <Box
        sx={{ width: '100%', minHeight: 0 }}
        dangerouslySetInnerHTML={{ __html: sanitizedHtml || '<p></p>' }}
      />
    </FormattedTextFrame>
  );
}

export const RichTextRenderer = memo(RichTextRendererInner);
