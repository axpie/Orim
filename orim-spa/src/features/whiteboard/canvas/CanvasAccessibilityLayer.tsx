import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { BoardElement } from '../../../types/models';
import type { ToolType } from '../store/boardStore';
import { getSelectionAnnouncement, getToolAnnouncement } from '../a11yAnnouncements';

interface CanvasAccessibilityLayerProps {
  helpTextId: string;
  elements: BoardElement[];
  selectedIds: string[];
  activeTool: ToolType;
  commentPlacementMode?: boolean;
  externalAnnouncement?: { id: number; text: string } | null;
}

const visuallyHiddenStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export function CanvasAccessibilityLayer({
  helpTextId,
  elements,
  selectedIds,
  activeTool,
  commentPlacementMode = false,
  externalAnnouncement = null,
}: CanvasAccessibilityLayerProps) {
  const { t } = useTranslation();
  const [announcement, setAnnouncement] = useState('');
  const timeoutRef = useRef<number | null>(null);
  const selectionInitializedRef = useRef(false);
  const toolInitializedRef = useRef(false);
  const commentPlacementInitializedRef = useRef(false);
  const lastSelectionAnnouncementRef = useRef<string | null>(null);
  const lastToolAnnouncementRef = useRef<string | null>(null);
  const selectionAnnouncement = useMemo(
    () => getSelectionAnnouncement(selectedIds, elements, t),
    [elements, selectedIds, t],
  );
  const toolAnnouncement = useMemo(
    () => getToolAnnouncement(activeTool, t),
    [activeTool, t],
  );

  const announce = useCallback((message: string | null | undefined) => {
    const normalized = message?.trim();
    if (!normalized) {
      return;
    }

    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
    }

    setAnnouncement('');
    timeoutRef.current = window.setTimeout(() => {
      setAnnouncement(normalized);
      timeoutRef.current = null;
    }, 30);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!selectionInitializedRef.current) {
      selectionInitializedRef.current = true;
      lastSelectionAnnouncementRef.current = selectionAnnouncement;
      return;
    }

    if (selectionAnnouncement !== lastSelectionAnnouncementRef.current) {
      lastSelectionAnnouncementRef.current = selectionAnnouncement;
      const timeoutId = window.setTimeout(() => {
        announce(selectionAnnouncement);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, [announce, selectionAnnouncement]);

  useEffect(() => {
    if (!toolInitializedRef.current) {
      toolInitializedRef.current = true;
      lastToolAnnouncementRef.current = toolAnnouncement;
      return;
    }

    if (toolAnnouncement !== lastToolAnnouncementRef.current) {
      lastToolAnnouncementRef.current = toolAnnouncement;
      const timeoutId = window.setTimeout(() => {
        announce(toolAnnouncement);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, [announce, toolAnnouncement]);

  useEffect(() => {
    if (!commentPlacementInitializedRef.current) {
      commentPlacementInitializedRef.current = true;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      announce(
        commentPlacementMode
          ? t('a11y.commentPlacementActive')
          : t('a11y.commentPlacementCancelled'),
      );
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [announce, commentPlacementMode, t]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      announce(externalAnnouncement?.text);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [announce, externalAnnouncement]);

  return (
    <>
      <div id={helpTextId} style={visuallyHiddenStyle}>
        {t('a11y.canvasKeyboardHint')}
      </div>
      <div role="status" aria-live="polite" aria-atomic="true" style={visuallyHiddenStyle}>
        {announcement}
      </div>
    </>
  );
}
