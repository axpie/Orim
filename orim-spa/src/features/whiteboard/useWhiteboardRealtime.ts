import { useEffect, useMemo, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { getBoard, getBoardHistory } from '../../api/boards';
import { useSignalR } from '../../hooks/useSignalR';
import type {
  Board,
  BoardOperation,
  CursorPresence,
} from '../../types/models';
import { getBoardSyncAnnouncement } from './a11yAnnouncements';
import { deriveBoardSyncStatus } from './boardSyncStatus';
import { mergeCursorPresence } from './realtime/mergeCursorPresence';
import { primeBoardHistorySequence, recoverBoardAfterReconnect } from './realtime/reconnectRecovery';
import { useOperationOutboxStore } from './store/outboxStore';
import { useBoardStore } from './store/boardStore';

interface UseWhiteboardRealtimeOptions {
  boardId: string | null;
  displayName: string | null;
  canEdit: boolean;
  board: Board | null;
  isDirty: boolean;
  outboxCount: number;
  isSaving: boolean;
  saveError: unknown;
  queryClient: QueryClient;
  setBoard: (board: Board | null, options?: { preserveSelection?: boolean; resetTool?: boolean }) => void;
  clearCommandStack: () => void;
  applyRemoteOperation: (operation: BoardOperation) => void;
  setRemoteCursors: (cursors: CursorPresence[]) => void;
  announceLive: (message: string) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  scheduleSave: () => void;
}

export function useWhiteboardRealtime({
  boardId,
  displayName,
  canEdit,
  board,
  isDirty,
  outboxCount,
  isSaving,
  saveError,
  queryClient,
  setBoard,
  clearCommandStack,
  applyRemoteOperation,
  setRemoteCursors,
  announceLive,
  t,
  scheduleSave,
}: UseWhiteboardRealtimeOptions) {
  const connectionIdRef = useRef<string | null>(null);
  const lastSyncAnnouncementRef = useRef<string | null>(null);

  const {
    sendBoardState,
    sendOperation,
    sendOperationThrottled,
    sendCursorUpdate,
    connectionId,
    connectionState,
    lastError,
  } = useSignalR({
    boardId,
    displayName,
    syncProfileDisplayNameChanges: true,
    onBoardChanged: (notification) => {
      if (
        notification.sourceClientId === connectionIdRef.current
        || useBoardStore.getState().isDirty
        || !boardId
      ) {
        return;
      }

      void queryClient.invalidateQueries({ queryKey: ['board', boardId] });
    },
    beforeOutboxFlush: async ({ isReconnect, lastKnownSequenceNumber, updateLastKnownSequenceNumber }) => {
      if (!boardId) {
        return;
      }

      const queuedOperationsCount = useOperationOutboxStore.getState().countForBoard(boardId);
      if (!isReconnect && queuedOperationsCount === 0) {
        if (lastKnownSequenceNumber != null) {
          return;
        }

        updateLastKnownSequenceNumber(await primeBoardHistorySequence((since, limit) => getBoardHistory(boardId, since, limit)));
        return;
      }

      const currentBoard = useBoardStore.getState().board;
      if (currentBoard?.id === boardId && useBoardStore.getState().isDirty && queuedOperationsCount === 0) {
        return;
      }

      const recovery = await recoverBoardAfterReconnect({
        boardId,
        currentBoard,
        lastKnownSequenceNumber,
        fetchBoard: () => getBoard(boardId),
        fetchHistory: (since, limit) => getBoardHistory(boardId, since, limit),
      });

      setBoard(recovery.board, { preserveSelection: true });
      clearCommandStack();
      queryClient.setQueryData(['board', boardId], recovery.board);
      updateLastKnownSequenceNumber(recovery.latestSequenceNumber);
    },
    onBoardOperationApplied: (notification) => {
      applyRemoteOperation(notification.operation);
      const nextBoard = useBoardStore.getState().board;
      if (boardId && nextBoard) {
        queryClient.setQueryData(['board', boardId], nextBoard);
      }
    },
    onBoardStateUpdated: (notification) => {
      setBoard(notification.board, { preserveSelection: true });
      clearCommandStack();
      if (boardId) {
        queryClient.setQueryData(['board', boardId], notification.board);
      }
    },
    onPresenceUpdated: (cursors) => {
      setRemoteCursors(mergeCursorPresence(useBoardStore.getState().remoteCursors, cursors));
    },
    onCursorUpdated: (cursor) => {
      const current = useBoardStore.getState().remoteCursors;
      const others = current.filter((entry) => entry.clientId !== cursor.clientId);
      setRemoteCursors(mergeCursorPresence(current, [...others, cursor]));
    },
  });

  useEffect(() => {
    connectionIdRef.current = connectionId;
  }, [connectionId]);

  const boardSyncStatus = useMemo(() => deriveBoardSyncStatus({
    connectionState,
    lastError,
    isDirty,
    outboxCount,
    isSaving,
    saveError,
  }), [connectionState, isDirty, isSaving, lastError, outboxCount, saveError]);

  useEffect(() => {
    if (connectionState === 'connected' && canEdit && isDirty && board) {
      scheduleSave();
    }
  }, [board, canEdit, connectionState, isDirty, scheduleSave]);

  useEffect(() => {
    const nextAnnouncement = getBoardSyncAnnouncement(boardSyncStatus, t);
    if (lastSyncAnnouncementRef.current == null) {
      lastSyncAnnouncementRef.current = nextAnnouncement;
      return;
    }

    if (nextAnnouncement !== lastSyncAnnouncementRef.current) {
      lastSyncAnnouncementRef.current = nextAnnouncement;
      announceLive(nextAnnouncement);
    }
  }, [announceLive, boardSyncStatus, t]);

  return {
    sendBoardState,
    sendOperation,
    sendOperationThrottled,
    sendCursorUpdate,
    connectionId,
    connectionState,
    boardSyncStatus,
  };
}
