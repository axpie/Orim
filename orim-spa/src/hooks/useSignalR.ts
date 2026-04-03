import { useEffect, useRef, useCallback, useState } from 'react';
import * as signalR from '@microsoft/signalr';
import { API_BASE_URL } from '../api/client';
import type {
  Board,
  BoardCommentDeletedNotification,
  BoardCommentNotification,
  BoardOperation,
  CursorPresence,
  BoardChangeNotification,
  BoardOperationNotification,
  BoardStateUpdateNotification,
  RealtimeConnectionState,
} from '../types/models';
import type { BoardOperationPayload } from '../features/whiteboard/realtime/boardOperations';
import { useOperationOutboxStore } from '../features/whiteboard/store/outboxStore';
import { useAuthStore } from '../stores/authStore';

interface UseSignalROptions {
  boardId: string | null;
  shareToken?: string | null;
  sharePassword?: string | null;
  displayName?: string | null;
  syncProfileDisplayNameChanges?: boolean;
  onBoardChanged?: (notification: BoardChangeNotification) => void;
  onBoardOperationApplied?: (notification: BoardOperationNotification) => void;
  onBoardStateUpdated?: (notification: BoardStateUpdateNotification) => void;
  onCommentUpserted?: (notification: BoardCommentNotification) => void;
  onCommentDeleted?: (notification: BoardCommentDeletedNotification) => void;
  onCursorUpdated?: (cursor: CursorPresence) => void;
  onPresenceUpdated?: (cursors: CursorPresence[]) => void;
}

function cloneOperationPayload(payload: BoardOperationPayload): BoardOperationPayload {
  return structuredClone(payload);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return 'SignalR connection error';
}

const CURSOR_UPDATE_INTERVAL_MS = 40;

export function useSignalR({
  boardId,
  shareToken,
  sharePassword,
  displayName,
  syncProfileDisplayNameChanges = false,
  onBoardChanged,
  onBoardOperationApplied,
  onBoardStateUpdated,
  onCommentUpserted,
  onCommentDeleted,
  onCursorUpdated,
  onPresenceUpdated,
}: UseSignalROptions) {
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const liveSyncTimerRef = useRef<number | null>(null);
  const latestLiveSyncRef = useRef<{ board: Board; kind: string } | null>(null);
  const liveOperationTimerRef = useRef<number | null>(null);
  const latestLiveOperationRef = useRef<BoardOperationPayload | null>(null);
  const cursorTimerRef = useRef<number | null>(null);
  const latestCursorRef = useRef<{ x: number | null; y: number | null } | null>(null);
  const lastCursorSentAtRef = useRef(0);
  const isFlushingOutboxRef = useRef(false);
  const lastSyncedDisplayNameRef = useRef<string | null>(displayName?.trim() || null);
  const boardIdRef = useRef(boardId);
  const shareTokenRef = useRef(shareToken ?? null);
  const sharePasswordRef = useRef(sharePassword ?? null);
  const displayNameRef = useRef(displayName ?? null);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>('disconnected');
  const [lastError, setLastError] = useState<string | null>(null);
  boardIdRef.current = boardId;
  shareTokenRef.current = shareToken ?? null;
  sharePasswordRef.current = sharePassword ?? null;
  displayNameRef.current = displayName ?? null;

  const handleInvokeError = useCallback((error: unknown) => {
    setLastError(getErrorMessage(error));
    console.error(error);
  }, []);

  const invokeIfConnected = useCallback(
    async (methodName: string, ...args: unknown[]) => {
      const conn = connectionRef.current;
      if (conn?.state !== signalR.HubConnectionState.Connected) {
        return false;
      }

      try {
        await conn.invoke(methodName, ...args);
        setLastError(null);
        return true;
      } catch (error) {
        handleInvokeError(error);
        return false;
      }
    },
    [handleInvokeError],
  );

  const syncDisplayName = useCallback(
    async (nextDisplayName: string | null | undefined) => {
      const normalizedDisplayName = nextDisplayName?.trim() || null;
      if (!normalizedDisplayName) {
        return false;
      }

      displayNameRef.current = normalizedDisplayName;
      lastSyncedDisplayNameRef.current = normalizedDisplayName;
      const currentBoardId = boardIdRef.current;
      if (!currentBoardId) {
        return false;
      }

      return invokeIfConnected('UpdateDisplayName', currentBoardId, normalizedDisplayName);
    },
    [invokeIfConnected],
  );

  const enqueueOperations = useCallback((operations: BoardOperation[]) => {
    const currentBoardId = boardIdRef.current;
    if (!currentBoardId || operations.length === 0) {
      return;
    }

    useOperationOutboxStore.getState().enqueueOperations(currentBoardId, operations);
  }, []);

  const flushOutbox = useCallback(async () => {
    const currentBoardId = boardIdRef.current;
    if (!currentBoardId || isFlushingOutboxRef.current) {
      return;
    }

    isFlushingOutboxRef.current = true;

    try {
      while (true) {
        const [entry] = useOperationOutboxStore.getState().getBoardEntries(currentBoardId);
        if (!entry) {
          break;
        }

        const sent = await invokeIfConnected('ApplyBoardOperation', currentBoardId, entry.operation);
        if (!sent) {
          break;
        }

        useOperationOutboxStore.getState().removeEntry(entry.id);
      }
    } finally {
      isFlushingOutboxRef.current = false;
    }
  }, [invokeIfConnected]);

  useEffect(() => {
    if (!boardId) {
      setConnectionId(null);
      setConnectionState('disconnected');
      setLastError(null);
      return;
    }

    const hubUrl = API_BASE_URL ? `${API_BASE_URL}/hubs/board` : '/hubs/board';

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: () => localStorage.getItem('orim_token') ?? '',
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    connectionRef.current = connection;
    setConnectionState('connecting');
    setLastError(null);
    let isDisposed = false;
    let isIntentionalClose = false;

    const joinCurrentBoard = async () => {
      if (!boardIdRef.current) {
        return;
      }

      await connection.invoke(
        'JoinBoard',
        boardIdRef.current,
        shareTokenRef.current,
        sharePasswordRef.current,
        displayNameRef.current,
      );
    };

    connection.on('BoardChanged', (notification: BoardChangeNotification) => {
      onBoardChanged?.(notification);
    });

    connection.on('BoardStateUpdated', (notification: BoardStateUpdateNotification) => {
      onBoardStateUpdated?.(notification);
    });

    connection.on('BoardOperationApplied', (notification: BoardOperationNotification) => {
      onBoardOperationApplied?.(notification);
    });

    connection.on('CommentUpserted', (notification: BoardCommentNotification) => {
      onCommentUpserted?.(notification);
    });

    connection.on('CommentDeleted', (notification: BoardCommentDeletedNotification) => {
      onCommentDeleted?.(notification);
    });

    connection.on('CursorUpdated', (cursor: CursorPresence) => {
      onCursorUpdated?.(cursor);
    });

    connection.on('PresenceUpdated', (cursors: CursorPresence[]) => {
      onPresenceUpdated?.(cursors);
    });

    if (syncProfileDisplayNameChanges) {
      connection.on('ProfileDisplayNameChanged', (nextDisplayName: string) => {
        const normalizedDisplayName = nextDisplayName.trim();
        if (!normalizedDisplayName) {
          return;
        }

        const currentUser = useAuthStore.getState().user;
        if (currentUser && currentUser.displayName !== normalizedDisplayName) {
          useAuthStore.getState().setUser({
            ...currentUser,
            displayName: normalizedDisplayName,
          });
        }

        void syncDisplayName(normalizedDisplayName);
      });
    }

    connection
      .start()
      .then(async () => {
        await joinCurrentBoard();
        if (isDisposed) {
          return;
        }

        setConnectionId(connection.connectionId ?? null);
        setConnectionState('connected');
        setLastError(null);
        void flushOutbox();
      })
      .catch((error) => {
        if (isDisposed) {
          return;
        }

        setConnectionId(null);
        setConnectionState('disconnected');
        handleInvokeError(error);
      });

    connection.onreconnecting((error) => {
      if (isDisposed) {
        return;
      }

      setConnectionId(null);
      setConnectionState('reconnecting');
      setLastError(error ? getErrorMessage(error) : null);
    });

    connection.onreconnected(async () => {
      if (isDisposed) {
        return;
      }

      try {
        await joinCurrentBoard();
        if (isDisposed) {
          return;
        }

        setConnectionId(connection.connectionId ?? null);
        setConnectionState('connected');
        setLastError(null);
        void flushOutbox();
      } catch (error) {
        if (isDisposed) {
          return;
        }

        setConnectionId(null);
        setConnectionState('disconnected');
        handleInvokeError(error);
        isIntentionalClose = true;
        void connection.stop().catch(() => {});
      }
    });

    connection.onclose((error) => {
      if (isDisposed || isIntentionalClose) {
        return;
      }

      setConnectionId(null);
      setConnectionState('disconnected');
      setLastError(error ? getErrorMessage(error) : null);
    });

    return () => {
      isDisposed = true;
      isIntentionalClose = true;
      if (liveSyncTimerRef.current != null) {
        window.clearTimeout(liveSyncTimerRef.current);
        liveSyncTimerRef.current = null;
      }
      if (liveOperationTimerRef.current != null) {
        window.clearTimeout(liveOperationTimerRef.current);
        liveOperationTimerRef.current = null;
      }
      if (cursorTimerRef.current != null) {
        window.clearTimeout(cursorTimerRef.current);
        cursorTimerRef.current = null;
      }
      latestCursorRef.current = null;
      lastCursorSentAtRef.current = 0;
      if (connection.state === signalR.HubConnectionState.Connected) {
        connection.invoke('LeaveBoard', boardId).catch(() => {});
      }
      void connection.stop().catch(() => {});
      connectionRef.current = null;
      setConnectionId(null);
      setConnectionState('disconnected');
      setLastError(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, flushOutbox, handleInvokeError, syncDisplayName, syncProfileDisplayNameChanges]);

  useEffect(() => {
    const normalizedDisplayName = displayName?.trim() || null;
    if (
      !boardId
      || normalizedDisplayName == null
      || normalizedDisplayName === lastSyncedDisplayNameRef.current
    ) {
      return;
    }

    void syncDisplayName(normalizedDisplayName);
  }, [boardId, displayName, syncDisplayName]);

  const sendBoardUpdated = useCallback(
    (sourceClientId?: string, changeKind = 'Content') => {
      const conn = connectionRef.current;
      if (conn?.state === signalR.HubConnectionState.Connected && boardIdRef.current) {
        void invokeIfConnected('BoardUpdated', boardIdRef.current, sourceClientId, changeKind);
      }
    },
    [invokeIfConnected],
  );

  const sendCursorUpdate = useCallback(
    (worldX: number | null, worldY: number | null) => {
      latestCursorRef.current = { x: worldX, y: worldY };
      const flushPendingCursor = () => {
        const pending = latestCursorRef.current;
        latestCursorRef.current = null;
        if (pending && boardIdRef.current) {
          lastCursorSentAtRef.current = performance.now();
          void invokeIfConnected('UpdateCursor', boardIdRef.current, pending.x, pending.y);
        }
      };

      if (worldX == null || worldY == null) {
        if (cursorTimerRef.current != null) {
          window.clearTimeout(cursorTimerRef.current);
          cursorTimerRef.current = null;
        }
        flushPendingCursor();
        return;
      }

      const now = performance.now();
      const elapsedSinceLastSend = now - lastCursorSentAtRef.current;

      if (cursorTimerRef.current == null && elapsedSinceLastSend >= CURSOR_UPDATE_INTERVAL_MS) {
        flushPendingCursor();
        return;
      }

      if (cursorTimerRef.current != null) {
        return;
      }

      cursorTimerRef.current = window.setTimeout(() => {
        cursorTimerRef.current = null;
        flushPendingCursor();
      }, Math.max(0, CURSOR_UPDATE_INTERVAL_MS - elapsedSinceLastSend));
    },
    [invokeIfConnected],
  );

  const sendBoardState = useCallback(
    (board: Board, changeKind = 'Content') => {
      const conn = connectionRef.current;
      if (conn?.state === signalR.HubConnectionState.Connected && boardIdRef.current) {
        void invokeIfConnected('SyncBoardState', boardIdRef.current, board, changeKind);
      }
    },
    [invokeIfConnected],
  );

  const sendBoardStateThrottled = useCallback(
    (board: Board, changeKind = 'Content') => {
      latestLiveSyncRef.current = { board, kind: changeKind };
      if (liveSyncTimerRef.current != null) {
        return;
      }

      liveSyncTimerRef.current = window.setTimeout(() => {
        liveSyncTimerRef.current = null;
        const pending = latestLiveSyncRef.current;
        latestLiveSyncRef.current = null;
        if (pending) {
          sendBoardState(pending.board, pending.kind);
        }
      }, 80);
    },
    [sendBoardState],
  );

  const sendOperation = useCallback(
    (operation: BoardOperationPayload) => {
      const currentBoardId = boardIdRef.current;
      if (!currentBoardId) {
        return;
      }

      const operations = Array.isArray(operation) ? operation : [operation];
      if (useOperationOutboxStore.getState().countForBoard(currentBoardId) > 0 || isFlushingOutboxRef.current) {
        enqueueOperations(operations);
        void flushOutbox();
        return;
      }

      void (async () => {
        for (let index = 0; index < operations.length; index += 1) {
          const sent = await invokeIfConnected('ApplyBoardOperation', currentBoardId, operations[index]);
          if (!sent) {
            enqueueOperations(operations.slice(index));
            void flushOutbox();
            break;
          }
        }
      })();
    },
    [enqueueOperations, flushOutbox, invokeIfConnected],
  );

  const sendOperationThrottled = useCallback(
    (operation: BoardOperationPayload) => {
      latestLiveOperationRef.current = cloneOperationPayload(operation);
      if (liveOperationTimerRef.current != null) {
        return;
      }

      liveOperationTimerRef.current = window.setTimeout(() => {
        liveOperationTimerRef.current = null;
        const pending = latestLiveOperationRef.current;
        latestLiveOperationRef.current = null;
        if (pending) {
          sendOperation(pending);
        }
      }, 80);
    },
    [sendOperation],
  );

  const updateDisplayName = useCallback(
    (nextDisplayName: string) => {
      void syncDisplayName(nextDisplayName);
    },
    [syncDisplayName],
  );

  return {
    sendBoardUpdated,
    sendCursorUpdate,
    sendBoardState,
    sendBoardStateThrottled,
    sendOperation,
    sendOperationThrottled,
    updateDisplayName,
    connectionId,
    connectionState,
    lastError,
  };
}
