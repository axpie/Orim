import type { ReactNode, UIEvent } from 'react';
import { memo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { Rect } from 'react-konva';
import { Html } from 'react-konva-utils';
import type { MarkdownElement, RichTextElement } from '../../../types/models';
import { resolveFontFamily } from '../../../utils/textLayout';

type FormattedTextElement = RichTextElement | MarkdownElement;

interface FormattedTextFrameProps {
  element: FormattedTextElement;
  children: ReactNode;
  domZIndex?: number;
  onViewportMount?: (elementId: string, node: HTMLDivElement | null) => void;
  /** When true, pointer events are enabled so the native scrollbar can be dragged. */
  interactable?: boolean;
  /** Called when the user scrolls the element natively (not programmatically). */
  onNativeScroll?: (elementId: string, scrollLeft: number, scrollTop: number) => void;
  /** Called when the content requires more vertical space than the element currently provides. */
  onHeightRequired?: (elementId: string, requiredHeight: number) => void;
}

function FormattedTextFrameInner({
  element,
  children,
  domZIndex,
  onViewportMount,
  interactable,
  onNativeScroll,
  onHeightRequired,
}: FormattedTextFrameProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  // Track whether the next scroll event is programmatic (from useLayoutEffect below).
  const programmaticScrollRef = useRef(false);

  const textDecoration = [element.isUnderline ? 'underline' : '', element.isStrikethrough ? 'line-through' : '']
    .filter(Boolean)
    .join(' ');
  const justifyContent = element.labelVerticalAlignment === 'Bottom'
    ? 'flex-end'
    : element.labelVerticalAlignment === 'Middle'
      ? 'center'
      : 'flex-start';

  useEffect(() => {
    onViewportMount?.(element.id, viewportRef.current);
    return () => onViewportMount?.(element.id, null);
  }, [element.id, onViewportMount]);

  useLayoutEffect(() => {
    if (!viewportRef.current) {
      return;
    }

    const targetLeft = element.scrollLeft ?? 0;
    const targetTop = element.scrollTop ?? 0;

    if (viewportRef.current.scrollLeft !== targetLeft || viewportRef.current.scrollTop !== targetTop) {
      programmaticScrollRef.current = true;
    }

    viewportRef.current.scrollLeft = targetLeft;
    viewportRef.current.scrollTop = targetTop;
  }, [element.scrollLeft, element.scrollTop]);

  const checkRequiredHeight = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !onHeightRequired) {
      return;
    }

    const overflowY = viewport.scrollHeight - viewport.clientHeight;
    if (overflowY > 0) {
      onHeightRequired(element.id, Math.ceil(viewport.scrollHeight));
    }
  }, [element.id, onHeightRequired]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    const viewport = viewportRef.current;
    if (!content || !viewport || !onHeightRequired) {
      return;
    }

    const resizeObserver = new ResizeObserver(checkRequiredHeight);
    resizeObserver.observe(content);
    resizeObserver.observe(viewport);

    const mutationObserver = new MutationObserver(checkRequiredHeight);
    mutationObserver.observe(content, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });

    const rafId = window.requestAnimationFrame(checkRequiredHeight);

    return () => {
      window.cancelAnimationFrame(rafId);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, [checkRequiredHeight, onHeightRequired]);

  useLayoutEffect(() => {
    if (!onHeightRequired) {
      return;
    }
    const rafId = window.requestAnimationFrame(checkRequiredHeight);
    return () => window.cancelAnimationFrame(rafId);
  }, [
    checkRequiredHeight,
    children,
    element.width,
    element.height,
    element.fontSize,
    element.fontFamily,
    element.isBold,
    element.isItalic,
    element.isUnderline,
    element.isStrikethrough,
    element.labelHorizontalAlignment,
    element.labelVerticalAlignment,
    onHeightRequired,
  ]);

  const handleScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    if (programmaticScrollRef.current) {
      programmaticScrollRef.current = false;
      return;
    }

    const target = e.currentTarget;
    onNativeScroll?.(element.id, target.scrollLeft, target.scrollTop);
  }, [element.id, onNativeScroll]);

  return (
    <>
      <Rect
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        fill="rgba(0,0,0,0.001)"
        strokeEnabled={false}
        data-element-id={element.id}
      />
      <Html
        groupProps={{
          x: element.x,
          y: element.y,
          dataElementId: element.id,
        }}
        divProps={{
          style: {
            pointerEvents: interactable ? 'auto' : 'none',
            zIndex: domZIndex ?? 0,
          },
        }}
        >
          <Box
            ref={viewportRef}
            data-element-id={element.id}
            onPointerDown={interactable ? (e) => e.stopPropagation() : undefined}
            onScroll={interactable ? handleScroll : undefined}
            sx={{
            width: `${element.width}px`,
            height: `${element.height}px`,
            px: 0.75,
            py: 0.5,
            boxSizing: 'border-box',
            overflow: 'auto',
            pointerEvents: interactable ? 'auto' : 'none',
            userSelect: 'none',
            scrollbarGutter: 'stable',
            color: element.color ?? '#333333',
            fontFamily: resolveFontFamily(element.fontFamily),
            fontSize: Math.max(1, element.fontSize ?? 18),
            fontWeight: element.isBold ? 700 : 500,
            fontStyle: element.isItalic ? 'italic' : 'normal',
            textDecoration: textDecoration || 'none',
            textAlign: element.labelHorizontalAlignment?.toLowerCase() ?? 'left',
            lineHeight: 1.15,
            display: 'flex',
            flexDirection: 'column',
            justifyContent,
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
            '& > *': {
              minWidth: 0,
            },
              '& p, & ul, & ol, & pre, & blockquote, & table, & h1, & h2, & h3, & h4, & h5, & h6': {
                my: 0.5,
              },
              '& p': {
                whiteSpace: 'pre-wrap',
              },
              '& p:empty::before': {
                content: '"\\00a0"',
              },
              '& > :first-of-type': {
                mt: 0,
              },
            '& > :last-child': {
              mb: 0,
            },
              '& ul, & ol': {
                pl: 2.5,
              },
              '& li > p': {
                m: 0,
              },
              '& a': {
                color: 'inherit',
              },
            '& blockquote': {
              m: 0,
              pl: 1.25,
              borderLeft: '3px solid rgba(37, 99, 235, 0.35)',
            },
            '& pre': {
              m: 0,
              p: 1,
              borderRadius: 1,
              backgroundColor: 'rgba(15, 23, 42, 0.06)',
              whiteSpace: 'pre-wrap',
            },
            '& code': {
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: '0.92em',
              backgroundColor: 'rgba(15, 23, 42, 0.06)',
              px: 0.5,
              borderRadius: 0.5,
            },
            '& table': {
              width: '100%',
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
            },
            '& th, & td': {
              border: '1px solid rgba(15, 23, 42, 0.18)',
              px: 0.75,
              py: 0.5,
              verticalAlign: 'top',
            },
          }}
        >
          <div ref={contentRef} style={{ width: '100%' }}>
            {children}
          </div>
        </Box>
      </Html>
    </>
  );
}

export const FormattedTextFrame = memo(FormattedTextFrameInner);
