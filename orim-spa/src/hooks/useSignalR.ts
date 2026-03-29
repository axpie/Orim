import { useEffect, useRef, useCallback, useState } from 'react';
import * as signalR from '@microsoft/signalr';
import { API_BASE_URL } from '../api/client';
import type {
  Board,
  CursorPresence,
  BoardChangeNotification,
  BoardStateUpdateNotification,
  RealtimeConnectionState,
} from '../types/models';

interface UseSignalROptions {
  boardId: string | null;
  shareToken?: string | null;
  sharePassword?: string | null;
  displayName?: string | null;
  onBoardChanged?: (notification: BoardChangeNotification) => void;
  onBoardStateUpdated?: (notification: BoardStateUpdateNotification) => void;
  onCursorUpdated?: (cursor: CursorPresence) => void;
  onPresenceUpdated?: (cursors: CursorPresence[]) => void;
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

export function useSignalR({
  boardId,
  shareToken,
  sharePassword,
  displayName,
  onBoardChanged,
  onBoardStateUpdated,
  onCursorUpdated,
  onPresenceUpdated,
}: UseSignalROptions) {
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const liveSyncTimerRef = useRef<number | null>(null);
  const latestLiveSyncRef = useRef<{ board: Board; kind: string } | null>(null);
  const cursorTimerRef = useRef<number | null>(null);
  const latestCursorRef = useRef<{ x: number | null; y: number | null } | null>(null);
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

  useEffect(() => {
    const token = localStorage.getItem('orim_token');
    if (!boardId) {
      setConnectionId(null);
      setConnectionState('disconnected');
      setLastError(null);
      return;
    }

    const hubUrl = API_BASE_URL ? `${API_BASE_URL}/hubs/board` : '/hubs/board';

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: () => token ?? '',
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

    connection.on('CursorUpdated', (cursor: CursorPresence) => {
      onCursorUpdated?.(cursor);
    });

    connection.on('PresenceUpdated', (cursors: CursorPresence[]) => {
      onPresenceUpdated?.(cursors);
    });

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
      if (cursorTimerRef.current != null) {
        window.clearTimeout(cursorTimerRef.current);
        cursorTimerRef.current = null;
      }
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
  }, [boardId, handleInvokeError]);

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
      if (cursorTimerRef.current != null) {
        return;
      }

      cursorTimerRef.current = window.setTimeout(() => {
        cursorTimerRef.current = null;
        const pending = latestCursorRef.current;
        latestCursorRef.current = null;
        if (pending && boardIdRef.current) {
          void invokeIfConnected('UpdateCursor', boardIdRef.current, pending.x, pending.y);
        }
      }, 60);
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

  const updateDisplayName = useCallback(
    (nextDisplayName: string) => {
      const conn = connectionRef.current;
      if (conn?.state === signalR.HubConnectionState.Connected && boardIdRef.current) {
        void invokeIfConnected('UpdateDisplayName', boardIdRef.current, nextDisplayName);
      }
    },
    [invokeIfConnected],
  );

  return {
    sendBoardUpdated,
    sendCursorUpdate,
    sendBoardState,
    sendBoardStateThrottled,
    updateDisplayName,
    connectionId,
    connectionState,
    lastError,
  };
}
