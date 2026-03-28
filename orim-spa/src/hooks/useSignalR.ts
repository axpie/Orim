import { useEffect, useRef, useCallback } from 'react';
import { useState } from 'react';
import * as signalR from '@microsoft/signalr';
import { API_BASE_URL } from '../api/client';
import type { Board, CursorPresence, BoardChangeNotification, BoardStateUpdateNotification } from '../types/models';

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
  boardIdRef.current = boardId;
  shareTokenRef.current = shareToken ?? null;
  sharePasswordRef.current = sharePassword ?? null;
  displayNameRef.current = displayName ?? null;

  useEffect(() => {
    const token = localStorage.getItem('orim_token');
    if (!boardId) return;

    const hubUrl = API_BASE_URL ? `${API_BASE_URL}/hubs/board` : '/hubs/board';

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: () => token ?? '',
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    connectionRef.current = connection;

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
        setConnectionId(connection.connectionId ?? null);
        await connection.invoke('JoinBoard', boardId, shareTokenRef.current, sharePasswordRef.current, displayNameRef.current);
      })
      .catch(console.error);

    connection.onreconnected(() => {
      setConnectionId(connection.connectionId ?? null);
      if (boardIdRef.current) {
        connection.invoke('JoinBoard', boardIdRef.current, shareTokenRef.current, sharePasswordRef.current, displayNameRef.current).catch(console.error);
      }
    });

    return () => {
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
      connection.stop();
      connectionRef.current = null;
      setConnectionId(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  const sendBoardUpdated = useCallback(
    (sourceClientId?: string, changeKind = 'Content') => {
      const conn = connectionRef.current;
      if (conn?.state === signalR.HubConnectionState.Connected && boardIdRef.current) {
        conn.invoke('BoardUpdated', boardIdRef.current, sourceClientId, changeKind).catch(console.error);
      }
    },
    []
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
        const conn = connectionRef.current;
        if (pending && conn?.state === signalR.HubConnectionState.Connected && boardIdRef.current) {
          conn.invoke('UpdateCursor', boardIdRef.current, pending.x, pending.y).catch(console.error);
        }
      }, 60);
    },
    [],
  );

  const sendBoardState = useCallback(
    (board: Board, changeKind = 'Content') => {
      const conn = connectionRef.current;
      if (conn?.state === signalR.HubConnectionState.Connected && boardIdRef.current) {
        conn.invoke('SyncBoardState', boardIdRef.current, board, changeKind).catch(console.error);
      }
    },
    [],
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
        conn.invoke('UpdateDisplayName', boardIdRef.current, nextDisplayName).catch(console.error);
      }
    },
    [],
  );

  return { sendBoardUpdated, sendCursorUpdate, sendBoardState, sendBoardStateThrottled, updateDisplayName, connectionId };
}
