import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { BoardElement, ThemeBoardDefaultsDefinition } from '../../../types/models';
import { contrastingTextColor } from '../../../utils/colorUtils';
import { resolveFontFamily, resolveLabelFontSize, resolveTextFontSize } from '../../../utils/textLayout';
import {
  FRAME_HEADER_HORIZONTAL_PADDING,
  FRAME_HEADER_VERTICAL_PADDING,
  FRAME_TITLE_LINE_HEIGHT,
  getFrameHeaderHeight,
  resolveFrameTitleFontSize,
} from './frameLayout';
import { resolveFrameColors } from './frameStyle';

function isTextContentElement(
  element: BoardElement,
): element is Extract<BoardElement, { $type: 'text' | 'sticky' }> {
  return element.$type === 'text' || element.$type === 'sticky';
}

interface InlineTextEditorProps {
  element: BoardElement;
  zoom: number;
  cameraX: number;
  cameraY: number;
  boardDefaults: ThemeBoardDefaultsDefinition;
  onCommit: (id: string, value: string) => void;
  onCancel: () => void;
}

export function InlineTextEditor({
  element,
  zoom,
  cameraX,
  cameraY,
  boardDefaults,
  onCommit,
  onCancel,
}: InlineTextEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ignoreBlurRef = useRef(false);
  const surfaceColor = boardDefaults.surfaceColor;
  const frameColors = element.$type === 'frame' ? resolveFrameColors(element, boardDefaults) : null;

  const initialValue = element.$type === 'shape' || element.$type === 'frame'
    ? (element.label ?? '')
    : (isTextContentElement(element) ? (element.text ?? '') : '');
  const fontSize = element.$type === 'frame'
    ? resolveFrameTitleFontSize(element)
    : element.$type === 'shape'
    ? resolveLabelFontSize(element)
    : (isTextContentElement(element) ? resolveTextFontSize(element) : 16);
  const fontFamily = resolveFontFamily(element.fontFamily);
  const textAlign = (
    element.labelHorizontalAlignment?.toLowerCase()
    ?? (element.$type === 'shape' ? 'center' : 'left')
  ) as CSSProperties['textAlign'];
  const textColor = element.$type === 'frame'
    ? (element.labelColor ?? contrastingTextColor(frameColors?.headerFill ?? surfaceColor))
    : element.$type === 'shape'
    ? (element.labelColor ?? contrastingTextColor(element.fillColor ?? surfaceColor))
    : (isTextContentElement(element)
        ? (element.color ?? (element.$type === 'sticky' ? contrastingTextColor(element.fillColor ?? '#FDE68A') : contrastingTextColor(surfaceColor)))
        : contrastingTextColor(surfaceColor));
  const fontWeight = element.isBold ? 700 : 500;
  const fontStyle = element.isItalic ? 'italic' : 'normal';
  const textDecoration = [element.isUnderline ? 'underline' : '', element.isStrikethrough ? 'line-through' : '']
    .filter(Boolean)
    .join(' ');
  const padding = element.$type === 'sticky'
    ? 10 * zoom
    : element.$type === 'frame'
      ? `${FRAME_HEADER_VERTICAL_PADDING * zoom}px ${FRAME_HEADER_HORIZONTAL_PADDING * zoom}px`
      : 4 * zoom;
  const background = element.$type === 'sticky'
    ? (element.fillColor ?? '#FDE68A')
    : element.$type === 'frame'
      ? (frameColors?.headerFill ?? surfaceColor)
    : element.$type === 'shape'
      ? (element.fillColor ?? surfaceColor)
    : surfaceColor; // text elements: match canvas background
  const borderRadius = element.$type === 'sticky' ? 8 : element.$type === 'frame' ? 10 : 2;
  const borderColor = element.$type === 'frame'
    ? (frameColors?.strokeColor ?? boardDefaults.strokeColor)
    : '#1976d2';

  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.value = initialValue;
    if (element.$type === 'frame') {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(
        element.height * zoom,
        Math.max(
          Math.max(getFrameHeaderHeight(element.height, element.width, ta.value, element.labelFontSize ?? undefined) * zoom, 24),
          ta.scrollHeight,
        ),
      )}px`;
    }
    const frame = requestAnimationFrame(() => {
      const el = ref.current;
      if (el) {
        el.focus();
        el.select();
        if (element.$type === 'frame') {
          el.style.height = 'auto';
          el.style.height = `${Math.min(
            element.height * zoom,
            Math.max(
              Math.max(getFrameHeaderHeight(element.height, element.width, el.value, element.labelFontSize ?? undefined) * zoom, 24),
              el.scrollHeight,
            ),
          )}px`;
        }
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [element, initialValue, zoom]);

  // Position in screen space
  const left = element.x * zoom + cameraX;
  const top = element.y * zoom + cameraY;
  const width = element.width * zoom;
  const height = element.$type === 'frame'
    ? Math.max(getFrameHeaderHeight(element.height, element.width, initialValue, element.labelFontSize ?? undefined) * zoom, 24)
    : element.height * zoom;

  return (
    <textarea
      ref={ref}
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        fontSize: fontSize * zoom,
        fontFamily,
        color: textColor,
        fontWeight,
        fontStyle,
        textDecoration: textDecoration || 'none',
        textAlign,
        lineHeight: FRAME_TITLE_LINE_HEIGHT,
        border: `2px solid ${borderColor}`,
        borderRadius,
        padding,
        background,
        resize: 'none',
        outline: 'none',
        zIndex: 100,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
      onInput={(e) => {
        if (element.$type !== 'frame') {
          return;
        }

        const target = e.currentTarget;
        target.style.height = 'auto';
        target.style.height = `${Math.min(
          element.height * zoom,
          Math.max(
            Math.max(getFrameHeaderHeight(element.height, element.width, target.value, element.labelFontSize ?? undefined) * zoom, 24),
            target.scrollHeight,
          ),
        )}px`;
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onCommit(element.id, (e.target as HTMLTextAreaElement).value);
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          ignoreBlurRef.current = true;
          onCancel();
        }
        e.nativeEvent.stopImmediatePropagation?.();
        e.stopPropagation(); // don't trigger canvas shortcuts
      }}
      onBlur={(e) => {
        if (ignoreBlurRef.current) {
          ignoreBlurRef.current = false;
          return;
        }
        onCommit(element.id, e.target.value);
      }}
    />
  );
}
