import { useEffect, useRef, type CSSProperties } from 'react';
import type { BoardElement } from '../../../types/models';
import { contrastingTextColor } from '../../../utils/colorUtils';
import { resolveFontFamily, resolveLabelFontSize, resolveTextFontSize } from '../../../utils/textLayout';

interface InlineTextEditorProps {
  element: BoardElement;
  zoom: number;
  cameraX: number;
  cameraY: number;
  onCommit: (id: string, value: string) => void;
  onCancel: () => void;
}

export function InlineTextEditor({
  element,
  zoom,
  cameraX,
  cameraY,
  onCommit,
  onCancel,
}: InlineTextEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ignoreBlurRef = useRef(false);

  const initialValue = element.$type === 'text' ? (element.text ?? '') : (element.label ?? '');
  const fontSize = element.$type === 'text' ? resolveTextFontSize(element) : resolveLabelFontSize(element);
  const fontFamily = resolveFontFamily(element.fontFamily);
  const textAlign = (element.labelHorizontalAlignment?.toLowerCase() ?? (element.$type === 'text' ? 'left' : 'center')) as CSSProperties['textAlign'];
  const textColor = element.$type === 'text'
    ? (element.color ?? '#333333')
    : (element.$type === 'shape'
        ? (element.labelColor ?? contrastingTextColor(element.fillColor ?? '#ffffff'))
        : '#333333');
  const fontWeight = element.isBold ? 700 : 500;
  const fontStyle = element.isItalic ? 'italic' : 'normal';
  const textDecoration = [element.isUnderline ? 'underline' : '', element.isStrikethrough ? 'line-through' : '']
    .filter(Boolean)
    .join(' ');

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
  const height = element.height * zoom;

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
        borderRadius: 2,
        padding: 4 * zoom,
        background: 'rgba(255, 255, 255, 0.96)',
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
