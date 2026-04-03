import { useEffect, useRef, type CSSProperties } from 'react';
import type { BoardElement } from '../../../types/models';
import { contrastingTextColor } from '../../../utils/colorUtils';
import { resolveFontFamily, resolveLabelFontSize, resolveTextFontSize } from '../../../utils/textLayout';
import { getFrameHeaderHeight, resolveFrameTitleFontSize } from './FrameRenderer';

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
  surfaceColor: string;
  onCommit: (id: string, value: string) => void;
  onCancel: () => void;
}

export function InlineTextEditor({
  element,
  zoom,
  cameraX,
  cameraY,
  surfaceColor,
  onCommit,
  onCancel,
}: InlineTextEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ignoreBlurRef = useRef(false);

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
    ? (element.labelColor ?? contrastingTextColor(element.fillColor ?? 'rgba(37, 99, 235, 0.08)'))
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
      ? 12 * zoom
      : 4 * zoom;
  const background = element.$type === 'sticky'
    ? (element.fillColor ?? '#FDE68A')
    : element.$type === 'frame'
      ? (element.fillColor ?? 'rgba(37, 99, 235, 0.08)')
    : element.$type === 'shape'
      ? (element.fillColor ?? surfaceColor)
    : surfaceColor; // text elements: match canvas background
  const borderRadius = element.$type === 'sticky' ? 8 : element.$type === 'frame' ? 10 : 2;

  useEffect(() => {
    const ta = ref.current;
    if (ta) {
      ta.value = initialValue;
      ta.focus();
      ta.select();
    }
  }, [initialValue]);

  // Position in screen space
  const left = element.x * zoom + cameraX;
  const top = element.y * zoom + cameraY;
  const width = element.width * zoom;
  const height = element.$type === 'frame'
    ? Math.max(getFrameHeaderHeight(element.height, element.labelFontSize ?? undefined) * zoom, 24)
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
        lineHeight: 1.15,
        border: '2px solid #1976d2',
        borderRadius,
        padding,
        background,
        resize: 'none',
        outline: 'none',
        zIndex: 100,
        overflow: 'hidden',
        boxSizing: 'border-box',
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
