import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Box, IconButton, Paper, Tooltip, Typography } from '@mui/material';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined';
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS';
import LooksOneIcon from '@mui/icons-material/LooksOne';
import LooksTwoIcon from '@mui/icons-material/LooksTwo';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import ChecklistIcon from '@mui/icons-material/Checklist';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import CodeIcon from '@mui/icons-material/Code';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import TableChartIcon from '@mui/icons-material/TableChart';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { useTranslation } from 'react-i18next';
import type {
  BoardElement,
  MarkdownElement,
  RichTextElement,
  ThemeBoardDefaultsDefinition,
} from '../../../types/models';
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

type TranslateCommit = (id: string, value: string) => void;
const INLINE_EDITOR_Z_INDEX = 1300;

type TextAreaEditableElement = Extract<BoardElement, { $type: 'text' | 'sticky' | 'shape' | 'frame' }>;

interface InlineTextEditorProps {
  element: BoardElement;
  zoom: number;
  cameraX: number;
  cameraY: number;
  boardDefaults: ThemeBoardDefaultsDefinition;
  selectAllOnFocus?: boolean;
  onCommit: TranslateCommit;
  onCancel: () => void;
}

function isTextAreaEditableElement(element: BoardElement): element is TextAreaEditableElement {
  return element.$type === 'text'
    || element.$type === 'sticky'
    || element.$type === 'shape'
    || element.$type === 'frame';
}

function useOutsideCommit(
  rootRef: RefObject<HTMLElement | null>,
  onCommit: () => void,
) {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root || !(event.target instanceof Node) || root.contains(event.target)) {
        return;
      }

      onCommit();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [onCommit, rootRef]);
}

function getBaseEditorScreenRect(
  element: BoardElement,
  zoom: number,
  cameraX: number,
  cameraY: number,
) {
  return {
    left: element.x * zoom + cameraX,
    top: element.y * zoom + cameraY,
    width: element.width * zoom,
    height: element.height * zoom,
  };
}

function getEditorToolbarTop(top: number, height: number) {
  return top > 52 ? top - 44 : top + height + 8;
}

function RichTextToolbarButton({
  active = false,
  disabled = false,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip title={label}>
      <span>
        <IconButton
          size="small"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
          aria-label={label}
          color={active ? 'primary' : 'default'}
        >
          {children}
        </IconButton>
      </span>
    </Tooltip>
  );
}

function RichTextEditFloatingToolbar({
  editor,
  left,
  top,
  onCommit,
  onCancel,
}: {
  editor: Editor | null;
  left: number;
  top: number;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Paper
      onPointerDown={(event) => event.stopPropagation()}
      sx={{
        position: 'absolute',
        left,
        top,
        zIndex: INLINE_EDITOR_Z_INDEX + 1,
        display: 'flex',
        alignItems: 'center',
        gap: 0.25,
        px: 0.5,
        py: 0.25,
        maxWidth: 'min(90vw, 960px)',
        overflowX: 'auto',
        borderRadius: 2,
        boxShadow: 4,
        pointerEvents: 'auto',
      }}
    >
      <RichTextToolbarButton label={t('richTextEditor.heading1', 'Heading 1')} active={!!editor?.isActive('heading', { level: 1 })} disabled={!editor} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>
        <LooksOneIcon fontSize="small" />
      </RichTextToolbarButton>
      <RichTextToolbarButton label={t('richTextEditor.heading2', 'Heading 2')} active={!!editor?.isActive('heading', { level: 2 })} disabled={!editor} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
        <LooksTwoIcon fontSize="small" />
      </RichTextToolbarButton>
      <RichTextToolbarButton label={t('richTextEditor.bold', 'Bold')} active={!!editor?.isActive('bold')} disabled={!editor} onClick={() => editor?.chain().focus().toggleBold().run()}>
        <FormatBoldIcon fontSize="small" />
      </RichTextToolbarButton>
      <RichTextToolbarButton label={t('richTextEditor.italic', 'Italic')} active={!!editor?.isActive('italic')} disabled={!editor} onClick={() => editor?.chain().focus().toggleItalic().run()}>
        <FormatItalicIcon fontSize="small" />
      </RichTextToolbarButton>
      <RichTextToolbarButton label={t('richTextEditor.underline', 'Underline')} active={!!editor?.isActive('underline')} disabled={!editor} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
        <FormatUnderlinedIcon fontSize="small" />
      </RichTextToolbarButton>
      <RichTextToolbarButton label={t('richTextEditor.strike', 'Strike')} active={!!editor?.isActive('strike')} disabled={!editor} onClick={() => editor?.chain().focus().toggleStrike().run()}>
        <StrikethroughSIcon fontSize="small" />
      </RichTextToolbarButton>
      <RichTextToolbarButton label={t('richTextEditor.bulletedList', 'Bulleted list')} active={!!editor?.isActive('bulletList')} disabled={!editor} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
        <FormatListBulletedIcon fontSize="small" />
      </RichTextToolbarButton>
      <RichTextToolbarButton label={t('richTextEditor.numberedList', 'Numbered list')} active={!!editor?.isActive('orderedList')} disabled={!editor} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
        <FormatListNumberedIcon fontSize="small" />
      </RichTextToolbarButton>
      <RichTextToolbarButton label={t('richTextEditor.taskList', 'Task list')} active={!!editor?.isActive('taskList')} disabled={!editor} onClick={() => editor?.chain().focus().toggleTaskList().run()}>
        <ChecklistIcon fontSize="small" />
      </RichTextToolbarButton>
      <RichTextToolbarButton label={t('richTextEditor.quote', 'Quote')} active={!!editor?.isActive('blockquote')} disabled={!editor} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
        <FormatQuoteIcon fontSize="small" />
      </RichTextToolbarButton>
      <RichTextToolbarButton label={t('richTextEditor.codeBlock', 'Code block')} active={!!editor?.isActive('codeBlock')} disabled={!editor} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>
        <CodeIcon fontSize="small" />
      </RichTextToolbarButton>
      <RichTextToolbarButton label={t('richTextEditor.alignLeft', 'Align left')} active={!!editor?.isActive({ textAlign: 'left' })} disabled={!editor} onClick={() => editor?.chain().focus().setTextAlign('left').run()}>
        <FormatAlignLeftIcon fontSize="small" />
      </RichTextToolbarButton>
      <RichTextToolbarButton label={t('richTextEditor.alignCenter', 'Align center')} active={!!editor?.isActive({ textAlign: 'center' })} disabled={!editor} onClick={() => editor?.chain().focus().setTextAlign('center').run()}>
        <FormatAlignCenterIcon fontSize="small" />
      </RichTextToolbarButton>
      <RichTextToolbarButton label={t('richTextEditor.alignRight', 'Align right')} active={!!editor?.isActive({ textAlign: 'right' })} disabled={!editor} onClick={() => editor?.chain().focus().setTextAlign('right').run()}>
        <FormatAlignRightIcon fontSize="small" />
      </RichTextToolbarButton>
      <RichTextToolbarButton label={t('richTextEditor.insertTable', 'Insert table')} disabled={!editor} onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <TableChartIcon fontSize="small" />
      </RichTextToolbarButton>
      <RichTextToolbarButton label={t('richTextEditor.addRow', 'Add row')} disabled={!editor} onClick={() => editor?.chain().focus().addRowAfter().run()}>
        <AddIcon fontSize="small" />
      </RichTextToolbarButton>
      <RichTextToolbarButton label={t('richTextEditor.addColumn', 'Add column')} disabled={!editor} onClick={() => editor?.chain().focus().addColumnAfter().run()}>
        <AddIcon fontSize="small" />
      </RichTextToolbarButton>
      <RichTextToolbarButton label={t('richTextEditor.removeRow', 'Remove row')} disabled={!editor} onClick={() => editor?.chain().focus().deleteRow().run()}>
        <RemoveIcon fontSize="small" />
      </RichTextToolbarButton>
      <RichTextToolbarButton label={t('richTextEditor.removeColumn', 'Remove column')} disabled={!editor} onClick={() => editor?.chain().focus().deleteColumn().run()}>
        <RemoveIcon fontSize="small" />
      </RichTextToolbarButton>
      <RichTextToolbarButton label={t('richTextEditor.deleteTable', 'Delete table')} disabled={!editor} onClick={() => editor?.chain().focus().deleteTable().run()}>
        <DeleteIcon fontSize="small" />
      </RichTextToolbarButton>
      <Box sx={{ flex: 1 }} />
      <RichTextToolbarButton label={t('board.save', 'Save')} disabled={!editor} onClick={onCommit}>
        <CheckIcon fontSize="small" />
      </RichTextToolbarButton>
      <RichTextToolbarButton label={t('common.cancel', 'Cancel')} onClick={onCancel}>
        <CloseIcon fontSize="small" />
      </RichTextToolbarButton>
    </Paper>
  );
}

function RichTextInlineEditor({
  element,
  zoom,
  cameraX,
  cameraY,
  boardDefaults,
  selectAllOnFocus,
  onCommit,
  onCancel,
}: {
  element: RichTextElement;
  zoom: number;
  cameraX: number;
  cameraY: number;
  boardDefaults: ThemeBoardDefaultsDefinition;
  selectAllOnFocus: boolean;
  onCommit: TranslateCommit;
  onCancel: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { left, top, width, height } = getBaseEditorScreenRect(element, zoom, cameraX, cameraY);
  const toolbarTop = getEditorToolbarTop(top, height);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: element.html,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        style: [
          `min-height:${Math.max(height - 12, 32)}px`,
          'outline:none',
        ].join(';'),
      },
      handleKeyDown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          onCommit(element.id, editor?.getHTML() ?? element.html);
          return true;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
          return true;
        }

        return false;
      },
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const handle = window.requestAnimationFrame(() => {
      if (selectAllOnFocus) {
        editor.chain().focus().selectAll().run();
      } else {
        editor.chain().focus('end').run();
      }
    });

    return () => window.cancelAnimationFrame(handle);
  }, [editor, selectAllOnFocus]);

  const commit = useCallback(
    () => onCommit(element.id, editor?.getHTML() ?? element.html),
    [editor, element.html, element.id, onCommit],
  );

  useOutsideCommit(rootRef, commit);

  return (
    <Box ref={rootRef} sx={{ position: 'absolute', inset: 0, zIndex: INLINE_EDITOR_Z_INDEX, pointerEvents: 'none' }}>
      <RichTextEditFloatingToolbar
        editor={editor}
        left={left}
        top={toolbarTop}
        onCommit={commit}
        onCancel={onCancel}
      />
      <Box
        sx={{
          position: 'absolute',
          left,
          top,
          width,
          height,
          zIndex: INLINE_EDITOR_Z_INDEX,
          border: `2px solid ${boardDefaults.selectionColor}`,
          borderRadius: 1.5,
          backgroundColor: boardDefaults.surfaceColor,
          boxShadow: 4,
          overflow: 'hidden',
          pointerEvents: 'auto',
          '& .ProseMirror': {
            height: '100%',
            overflow: 'auto',
            px: 1,
            py: 0.75,
            color: element.color ?? '#333333',
            fontFamily: resolveFontFamily(element.fontFamily),
            fontSize: `${Math.max(1, element.fontSize ?? 18) * zoom}px`,
            fontWeight: element.isBold ? 700 : 500,
            fontStyle: element.isItalic ? 'italic' : 'normal',
            textDecoration: [element.isUnderline ? 'underline' : '', element.isStrikethrough ? 'line-through' : ''].filter(Boolean).join(' ') || 'none',
            lineHeight: 1.2,
            '& > *:first-of-type': { mt: 0 },
            '& > *:last-child': { mb: 0 },
            '& p, & ul, & ol, & pre, & blockquote, & table, & h1, & h2': { my: 0.75 },
            '& ul, & ol': { pl: 3 },
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
            '& pre': {
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
            '& blockquote': {
              m: 0,
              pl: 1.25,
              borderLeft: '3px solid rgba(37, 99, 235, 0.35)',
            },
            '& a': {
              color: 'inherit',
            },
          },
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <EditorContent editor={editor} />
      </Box>
    </Box>
  );
}

function MarkdownInlineEditor({
  element,
  zoom,
  cameraX,
  cameraY,
  boardDefaults,
  selectAllOnFocus,
  onCommit,
  onCancel,
}: {
  element: MarkdownElement;
  zoom: number;
  cameraX: number;
  cameraY: number;
  boardDefaults: ThemeBoardDefaultsDefinition;
  selectAllOnFocus: boolean;
  onCommit: TranslateCommit;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(element.markdown ?? '');
  const { left, top, width, height } = getBaseEditorScreenRect(element, zoom, cameraX, cameraY);
  const toolbarTop = getEditorToolbarTop(top, height);

  useOutsideCommit(rootRef, () => onCommit(element.id, value));

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      textarea.focus();
      if (selectAllOnFocus) {
        textarea.select();
      } else {
        const caretPosition = textarea.value.length;
        textarea.setSelectionRange(caretPosition, caretPosition);
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [selectAllOnFocus]);

  return (
    <Box ref={rootRef} sx={{ position: 'absolute', inset: 0, zIndex: INLINE_EDITOR_Z_INDEX, pointerEvents: 'none' }}>
      <Paper
        onPointerDown={(event) => event.stopPropagation()}
        sx={{
          position: 'absolute',
          left,
          top: toolbarTop,
          zIndex: INLINE_EDITOR_Z_INDEX + 1,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 0.75,
          py: 0.25,
          borderRadius: 2,
          boxShadow: 4,
          pointerEvents: 'auto',
        }}
      >
        <Typography variant="caption" fontWeight={700} sx={{ px: 0.5 }}>
          {t('tools.markdown', 'Markdown')}
        </Typography>
        <Tooltip title={t('board.save', 'Save')}>
          <IconButton size="small" onMouseDown={(event) => event.preventDefault()} onClick={() => onCommit(element.id, value)}>
            <CheckIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('common.cancel', 'Cancel')}>
          <IconButton size="small" onMouseDown={(event) => event.preventDefault()} onClick={onCancel}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Paper>
      <textarea
        ref={textareaRef}
        value={value}
        style={{
          position: 'absolute',
          left,
          top,
          width,
          height,
          fontSize: Math.max(1, element.fontSize ?? 18) * zoom,
          fontFamily: resolveFontFamily(element.fontFamily),
          color: element.color ?? '#333333',
          fontWeight: element.isBold ? 700 : 500,
          fontStyle: element.isItalic ? 'italic' : 'normal',
          textDecoration: [element.isUnderline ? 'underline' : '', element.isStrikethrough ? 'line-through' : ''].filter(Boolean).join(' ') || 'none',
          lineHeight: '1.3',
          border: `2px solid ${boardDefaults.selectionColor}`,
          borderRadius: 8,
          padding: `${8 * zoom}px`,
          background: boardDefaults.surfaceColor,
          resize: 'none',
          outline: 'none',
          zIndex: INLINE_EDITOR_Z_INDEX,
          overflow: 'auto',
          boxSizing: 'border-box',
          pointerEvents: 'auto',
        }}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            onCommit(element.id, value);
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
          event.nativeEvent.stopImmediatePropagation?.();
          event.stopPropagation();
        }}
      />
    </Box>
  );
}

function TextAreaInlineEditor({
  element,
  zoom,
  cameraX,
  cameraY,
  boardDefaults,
  selectAllOnFocus,
  onCommit,
  onCancel,
}: {
  element: TextAreaEditableElement;
  zoom: number;
  cameraX: number;
  cameraY: number;
  boardDefaults: ThemeBoardDefaultsDefinition;
  selectAllOnFocus: boolean;
  onCommit: TranslateCommit;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ignoreBlurRef = useRef(false);
  const surfaceColor = boardDefaults.surfaceColor;
  const frameColors = element.$type === 'frame' ? resolveFrameColors(element, boardDefaults) : null;

  const initialValue = element.$type === 'shape' || element.$type === 'frame'
    ? (element.label ?? '')
    : (element.text ?? '');
  const fontSize = element.$type === 'frame'
    ? resolveFrameTitleFontSize(element)
    : element.$type === 'shape'
      ? resolveLabelFontSize(element)
      : resolveTextFontSize(element);
  const fontFamily = resolveFontFamily(element.fontFamily);
  const textAlign = (
    element.labelHorizontalAlignment?.toLowerCase()
    ?? (element.$type === 'shape' ? 'center' : 'left')
  ) as CSSProperties['textAlign'];
  const textColor = element.$type === 'frame'
    ? (element.labelColor ?? contrastingTextColor(frameColors?.headerFill ?? surfaceColor))
    : element.$type === 'shape'
      ? (element.labelColor ?? contrastingTextColor(element.fillColor ?? surfaceColor))
      : (element.color ?? (element.$type === 'sticky' ? contrastingTextColor(element.fillColor ?? '#FDE68A') : contrastingTextColor(surfaceColor)));
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
        : surfaceColor;
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
      const editor = ref.current;
      if (editor) {
        editor.focus();
        if (selectAllOnFocus) {
          editor.select();
        } else {
          const caretPosition = editor.value.length;
          editor.setSelectionRange(caretPosition, caretPosition);
        }
        if (element.$type === 'frame') {
          editor.style.height = 'auto';
          editor.style.height = `${Math.min(
            element.height * zoom,
            Math.max(
              Math.max(getFrameHeaderHeight(element.height, element.width, editor.value, element.labelFontSize ?? undefined) * zoom, 24),
              editor.scrollHeight,
            ),
          )}px`;
        }
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [element, initialValue, selectAllOnFocus, zoom]);

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
        zIndex: INLINE_EDITOR_Z_INDEX,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
      onInput={(event) => {
        if (element.$type !== 'frame') {
          return;
        }

        const target = event.currentTarget;
        target.style.height = 'auto';
        target.style.height = `${Math.min(
          element.height * zoom,
          Math.max(
            Math.max(getFrameHeaderHeight(element.height, element.width, target.value, element.labelFontSize ?? undefined) * zoom, 24),
            target.scrollHeight,
          ),
        )}px`;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          onCommit(element.id, (event.target as HTMLTextAreaElement).value);
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          ignoreBlurRef.current = true;
          onCancel();
        }
        event.nativeEvent.stopImmediatePropagation?.();
        event.stopPropagation();
      }}
      onBlur={(event) => {
        if (ignoreBlurRef.current) {
          ignoreBlurRef.current = false;
          return;
        }
        onCommit(element.id, event.target.value);
      }}
    />
  );
}

export function InlineTextEditor({
  element,
  zoom,
  cameraX,
  cameraY,
  boardDefaults,
  selectAllOnFocus = true,
  onCommit,
  onCancel,
}: InlineTextEditorProps) {
  if (element.$type === 'richtext') {
    return (
      <RichTextInlineEditor
        element={element}
        zoom={zoom}
        cameraX={cameraX}
        cameraY={cameraY}
        boardDefaults={boardDefaults}
        selectAllOnFocus={selectAllOnFocus}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );
  }

  if (element.$type === 'markdown') {
    return (
      <MarkdownInlineEditor
        element={element}
        zoom={zoom}
        cameraX={cameraX}
        cameraY={cameraY}
        boardDefaults={boardDefaults}
        selectAllOnFocus={selectAllOnFocus}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );
  }

  if (!isTextAreaEditableElement(element)) {
    return null;
  }

  return (
    <TextAreaInlineEditor
      element={element}
      zoom={zoom}
      cameraX={cameraX}
      cameraY={cameraY}
      boardDefaults={boardDefaults}
      selectAllOnFocus={selectAllOnFocus}
      onCommit={onCommit}
      onCancel={onCancel}
    />
  );
}
