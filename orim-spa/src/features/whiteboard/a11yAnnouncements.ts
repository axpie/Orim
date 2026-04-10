import type { BoardElement, BoardSyncStatus } from '../../types/models';
import type { ToolType } from './store/boardStore';
import { getShapeToolLabelKey, getShapeTypeForTool, isShapeTool } from './shapeTools';
import { getSearchableTextContent, getTextToolLabelKey, isTextContentElement, isTextTool } from './textElements';

type Translate = (key: string, options?: Record<string, unknown>) => string;

function trimLabel(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return normalized.length > 48 ? `${normalized.slice(0, 45)}...` : normalized;
}

export function getToolLabel(tool: ToolType, t: Translate) {
  if (isShapeTool(tool)) {
    return t(getShapeToolLabelKey(getShapeTypeForTool(tool)));
  }

  if (isTextTool(tool)) {
    return t(getTextToolLabelKey(tool));
  }

  switch (tool) {
    case 'hand':
      return t('tools.hand');
    case 'sticky':
      return t('tools.stickyNote');
    case 'frame':
      return t('tools.frame');
    case 'icon':
      return t('tools.icon');
    case 'arrow':
      return t('tools.arrow');
    case 'select':
    default:
      return t('tools.select');
  }
}

export function describeBoardElement(element: BoardElement, t: Translate) {
  const typeLabel = (() => {
    switch (element.$type) {
      case 'shape':
        return t(getShapeToolLabelKey(element.shapeType));
      case 'text':
        return t('tools.text');
      case 'richtext':
        return t('tools.richText');
      case 'markdown':
        return t('tools.markdown');
      case 'sticky':
        return t('tools.stickyNote');
      case 'frame':
        return t('tools.frame');
      case 'icon':
        return t('tools.icon');
      case 'arrow':
      default:
        return t('tools.arrow');
    }
  })();

  const detail = trimLabel(
    isTextContentElement(element)
      ? getSearchableTextContent(element)
      : element.$type === 'sticky'
        ? element.text
        : element.label,
  );

  return detail ? `${typeLabel}: ${detail}` : typeLabel;
}

export function getSelectionAnnouncement(selectedIds: string[], elements: BoardElement[], t: Translate) {
  if (selectedIds.length === 0) {
    return t('a11y.selectionNone');
  }

  const selectedElements = elements.filter((element) => selectedIds.includes(element.id));
  if (selectedElements.length === 1) {
    return t('a11y.selectionSingle', { element: describeBoardElement(selectedElements[0], t) });
  }

  return t('a11y.selectionMultiple', { count: selectedElements.length });
}

export function getToolAnnouncement(tool: ToolType, t: Translate) {
  return t('a11y.toolActive', { tool: getToolLabel(tool, t) });
}

export function getBoardSyncAnnouncement(syncStatus: BoardSyncStatus, t: Translate) {
  const base = (() => {
    switch (syncStatus.kind) {
      case 'saving':
        return t('board.saving');
      case 'unsaved':
        return t('board.statusUnsaved');
      case 'unsyncedChanges':
        return syncStatus.queuedChangesCount && syncStatus.queuedChangesCount > 0
          ? t('board.unsyncedChangesCount', { count: syncStatus.queuedChangesCount })
          : t('board.statusUnsyncedChanges');
      case 'connecting':
        return t('board.statusConnecting');
      case 'reconnecting':
        return t('board.statusReconnecting');
      case 'offline':
        return t('board.statusOffline');
      case 'saveError':
        return t('board.statusSaveError');
      case 'connectionError':
        return t('board.statusConnectionError');
      case 'saved':
      default:
        return t('board.saved');
    }
  })();

  return syncStatus.detail ? `${base}. ${syncStatus.detail}` : base;
}
