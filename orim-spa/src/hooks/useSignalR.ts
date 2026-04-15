import { useEffect, useRef, useCallback, useState } from 'react';
import * as signalR from '@microsoft/signalr';
import { API_BASE_URL } from '../api/client';
import type {
  Board,
  BoardOperation,
  CursorPresence,
  BoardChangeNotification,
  BoardOperationNotification,
  BoardStateUpdateNotification,
  RealtimeConnectionState,
  FollowMeSessionStartedNotification,
  BringToViewportNotification,
} from '../types/models';
import type { BoardOperationPayload } from '../features/whiteboard/realtime/boardOperations';
import {
  createRepeatedServerCloseFailureState,
  deliverBoardOperationBatchWithRecovery,
  registerRepeatedServerCloseFailure,
  type BoardOperationInvokeResult,
} from '../features/whiteboard/realtime/outboxDelivery';
import { useOperationOutboxStore } from '../features/whiteboard/store/outboxStore';
import { useAuthStore } from '../stores/authStore';

interface UseSignalROptions {
  boardId: string | null;
  shareToken?: string | null;
  sharePassword?: string | null;
  displayName?: string | null;
  syncProfileDisplayNameChanges?: boolean;
  beforeOutboxFlush?: (context: {
    boardId: string;
    isReconnect: boolean;
    lastKnownSequenceNumber: number | null;
    updateLastKnownSequenceNumber: (sequenceNumber: number | null) => void;
  }) => Promise<void> | void;
  onBoardChanged?: (notification: BoardChangeNotification) => void;
  onBoardOperationApplied?: (notification: BoardOperationNotification) => void;
  onBoardStateUpdated?: (notification: BoardStateUpdateNotification) => void;
  onCursorUpdated?: (cursor: CursorPresence) => void;
  onPresenceUpdated?: (cursors: CursorPresence[]) => void;
  onFollowMeSessionStarted?: (notification: FollowMeSessionStartedNotification) => void;
  onFollowMeSessionEnded?: (clientId: string) => void;
  onBringToViewport?: (notification: BringToViewportNotification) => void;
  onOutboxDiscarded?: (context: {
    boardId: string;
    discardedEntriesCount: number;
    errorMessage: string | null;
  }) => Promise<void> | void;
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

const NEGOTIATION_STOPPED_MESSAGE = 'stopped during negotiation';
const MAX_SERVER_CLOSE_OUTBOX_FAILURES = 3;
const REPEATED_OUTBOX_FAILURE_MESSAGE = 'Discarded unsent board changes after repeated sync failures and restored the latest server version.';

function isNegotiationStoppedError(error: unknown): boolean {
  return getErrorMessage(error).toLowerCase().includes(NEGOTIATION_STOPPED_MESSAGE);
}

const CURSOR_UPDATE_INTERVAL_MS = 40;
const OUTBOX_FLUSH_BATCH_SIZE = 25;
const signalRLogger: signalR.ILogger = {
  log(logLevel, message) {
    const normalizedMessage = String(message ?? '').toLowerCase();
    if (normalizedMessage.includes(NEGOTIATION_STOPPED_MESSAGE)) {
      return;
    }

    if (logLevel === signalR.LogLevel.Error) {
      console.error(message);
      return;
    }

    if (logLevel === signalR.LogLevel.Warning) {
      console.warn(message);
    }
  },
};

export function useSignalR({
  boardId,
  shareToken,
  sharePassword,
  displayName,
  syncProfileDisplayNameChanges = false,
  beforeOutboxFlush,
  onBoardChanged,
  onBoardOperationApplied,
  onBoardStateUpdated,
  onCursorUpdated,
  onPresenceUpdated,
  onFollowMeSessionStarted,
  onFollowMeSessionEnded,
  onBringToViewport,
  onOutboxDiscarded,
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
  const lastKnownSequenceNumberRef = useRef<number | null>(null);
  const boardIdRef = useRef(boardId);
  const shareTokenRef = useRef(shareToken ?? null);
  const sharePasswordRef = useRef(sharePassword ?? null);
  const displayNameRef = useRef(displayName ?? null);
  const beforeOutboxFlushRef = useRef(beforeOutboxFlush);
  const onBoardChangedRef = useRef(onBoardChanged);
  const onBoardOperationAppliedRef = useRef(onBoardOperationApplied);
  const onBoardStateUpdatedRef = useRef(onBoardStateUpdated);
  const onCursorUpdatedRef = useRef(onCursorUpdated);
  const onPresenceUpdatedRef = useRef(onPresenceUpdated);
  const onFollowMeSessionStartedRef = useRef(onFollowMeSessionStarted);
  const onFollowMeSessionEndedRef = useRef(onFollowMeSessionEnded);
  const onBringToViewportRef = useRef(onBringToViewport);
  const onOutboxDiscardedRef = useRef(onOutboxDiscarded);
  const repeatedServerCloseFailureRef = useRef(createRepeatedServerCloseFailureState());
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>('disconnected');
  const [lastError, setLastError] = useState<string | null>(null);
  boardIdRef.current = boardId;
  shareTokenRef.current = shareToken ?? null;
  sharePasswordRef.current = sharePassword ?? null;
  displayNameRef.current = displayName ?? null;
  beforeOutboxFlushRef.current = beforeOutboxFlush;
  onBoardChangedRef.current = onBoardChanged;
  onBoardOperationAppliedRef.current = onBoardOperationApplied;
  onBoardStateUpdatedRef.current = onBoardStateUpdated;
  onCursorUpdatedRef.current = onCursorUpdated;
  onPresenceUpdatedRef.current = onPresenceUpdated;
  onFollowMeSessionStartedRef.current = onFollowMeSessionStarted;
  onFollowMeSessionEndedRef.current = onFollowMeSessionEnded;
  onBringToViewportRef.current = onBringToViewport;
  onOutboxDiscardedRef.current = onOutboxDiscarded;

  const handleInvokeError = useCallback((error: unknown) => {
    const errorMessage = getErrorMessage(error);
    setLastError(errorMessage);
    console.error(error);
    return errorMessage;
  }, []);

  const invokeIfConnectedDetailed = useCallback(
    async (methodName: string, ...args: unknown[]): Promise<BoardOperationInvokeResult> => {
      const conn = connectionRef.current;
      if (conn?.state !== signalR.HubConnectionState.Connected) {
        return { sent: false, errorMessage: null };
      }

      try {
        await conn.invoke(methodName, ...args);
        setLastError(null);
        return { sent: true, errorMessage: null };
      } catch (error) {
        return {
          sent: false,
          errorMessage: handleInvokeError(error),
        };
      }
    },
    [handleInvokeError],
  );

  const updateLastKnownSequenceNumber = useCallback((sequenceNumber: number | null) => {
    if (typeof sequenceNumber !== 'number' || !Number.isFinite(sequenceNumber) || sequenceNumber < 0) {
      lastKnownSequenceNumberRef.current = null;
      return;
    }

    const normalized = Math.floor(sequenceNumber);
    lastKnownSequenceNumberRef.current = lastKnownSequenceNumberRef.current == null
      ? normalized
      : Math.max(lastKnownSequenceNumberRef.current, normalized);
  }, []);

  const invalidateSequenceTracking = useCallback(() => {
    lastKnownSequenceNumberRef.current = null;
  }, []);

  const resetRepeatedServerCloseFailures = useCallback((targetBoardId?: string | null) => {
    const current = repeatedServerCloseFailureRef.current;
    if (targetBoardId != null && current.boardId !== targetBoardId) {
      return;
    }

    repeatedServerCloseFailureRef.current = createRepeatedServerCloseFailureState();
  }, []);

  const invokeIfConnected = useCallback(
    async (methodName: string, ...args: unknown[]) => {
      const result = await invokeIfConnectedDetailed(methodName, ...args);
      return result.sent;
    },
    [invokeIfConnectedDetailed],
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

  const prepareOutboxFlush = useCallback(
    async (isReconnect: boolean) => {
      const currentBoardId = boardIdRef.current;
      const callback = beforeOutboxFlushRef.current;
      if (!currentBoardId || !callback) {
        return;
      }

      try {
        await callback({
          boardId: currentBoardId,
          isReconnect,
          lastKnownSequenceNumber: lastKnownSequenceNumberRef.current,
          updateLastKnownSequenceNumber,
        });
      } catch (error) {
        handleInvokeError(error);
      }
    },
    [handleInvokeError, updateLastKnownSequenceNumber],
  );

  const discardBoardOutbox = useCallback(async (
    currentBoardId: string,
    errorMessage: string | null,
  ) => {
    const discardedEntriesCount = useOperationOutboxStore.getState().countForBoard(currentBoardId);
    if (discardedEntriesCount === 0) {
      resetRepeatedServerCloseFailures(currentBoardId);
      return;
    }

    useOperationOutboxStore.getState().clearBoardEntries(currentBoardId);

    try {
      await onOutboxDiscardedRef.current?.({
        boardId: currentBoardId,
        discardedEntriesCount,
        errorMessage,
      });
    } catch (error) {
      console.error(error);
    }

    setLastError(REPEATED_OUTBOX_FAILURE_MESSAGE);
    resetRepeatedServerCloseFailures(currentBoardId);
  }, [resetRepeatedServerCloseFailures]);

  const flushOutbox = useCallback(async () => {
    const currentBoardId = boardIdRef.current;
    if (!currentBoardId || isFlushingOutboxRef.current) {
      return;
    }

    isFlushingOutboxRef.current = true;

    try {
      while (true) {
        const entries = useOperationOutboxStore.getState().getBoardEntries(currentBoardId);
        if (entries.length === 0) {
          resetRepeatedServerCloseFailures(currentBoardId);
          break;
        }

        const batchEntries = entries.slice(0, OUTBOX_FLUSH_BATCH_SIZE);
        const delivery = await deliverBoardOperationBatchWithRecovery({
          boardId: currentBoardId,
          entries: batchEntries,
          invokeBatch: (boardId, operations) => invokeIfConnectedDetailed('ApplyBoardOperations', boardId, operations),
          invokeSingle: (boardId, operation) => invokeIfConnectedDetailed('ApplyBoardOperation', boardId, operation),
          removeEntry: (entryId) => {
            useOperationOutboxStore.getState().removeEntry(entryId);
          },
        });

        if (delivery.delivered) {
          resetRepeatedServerCloseFailures(currentBoardId);
          continue;
        }

        const failureRegistration = registerRepeatedServerCloseFailure(
          repeatedServerCloseFailureRef.current,
          currentBoardId,
          delivery.failureKind,
          MAX_SERVER_CLOSE_OUTBOX_FAILURES,
        );
        repeatedServerCloseFailureRef.current = failureRegistration.nextState;

        if (failureRegistration.shouldDiscard) {
          await discardBoardOutbox(currentBoardId, delivery.errorMessage);
        }

        if (delivery.failureKind !== 'server-close') {
          resetRepeatedServerCloseFailures(currentBoardId);
        }

        if (!delivery.delivered) {
          break;
        }
      }
    } finally {
      isFlushingOutboxRef.current = false;
    }
  }, [discardBoardOutbox, invokeIfConnectedDetailed, resetRepeatedServerCloseFailures]);

  useEffect(() => {
    if (!boardId) {
      invalidateSequenceTracking();
      resetRepeatedServerCloseFailures();
      setConnectionId(null);
      setConnectionState('disconnected');
      setLastError(null);
      return;
    }

    const hubUrl = API_BASE_URL ? `${API_BASE_URL}/hubs/board` : '/hubs/board';

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        withCredentials: true,
      })
      .withAutomaticReconnect()
      .configureLogging(signalRLogger)
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
      invalidateSequenceTracking();
      onBoardChangedRef.current?.(notification);
    });

    connection.on('BoardStateUpdated', (notification: BoardStateUpdateNotification) => {
      invalidateSequenceTracking();
      onBoardStateUpdatedRef.current?.(notification);
    });

    connection.on('BoardOperationApplied', (notification: BoardOperationNotification) => {
      updateLastKnownSequenceNumber(notification.sequenceNumber);
      onBoardOperationAppliedRef.current?.(notification);
    });

    connection.on('CursorUpdated', (cursor: CursorPresence) => {
      onCursorUpdatedRef.current?.(cursor);
    });

    connection.on('PresenceUpdated', (cursors: CursorPresence[]) => {
      onPresenceUpdatedRef.current?.(cursors);
    });

    connection.on('FollowMeSessionStarted', (notification: FollowMeSessionStartedNotification) => {
      onFollowMeSessionStartedRef.current?.(notification);
    });

    connection.on('FollowMeSessionEnded', (data: { clientId: string }) => {
      onFollowMeSessionEndedRef.current?.(data.clientId);
    });

    connection.on('BringToViewport', (notification: BringToViewportNotification) => {
      onBringToViewportRef.current?.(notification);
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

          await prepareOutboxFlush(false);
          if (isDisposed) {
            return;
          }

          setConnectionId(connection.connectionId ?? null);
          setConnectionState('connected');
          setLastError(null);
          void flushOutbox();
      })
      .catch((error) => {
        if (isDisposed || isIntentionalClose || isNegotiationStoppedError(error)) {
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

        await prepareOutboxFlush(true);
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
      invalidateSequenceTracking();
      resetRepeatedServerCloseFailures();
    };
  }, [boardId, flushOutbox, handleInvokeError, invalidateSequenceTracking, prepareOutboxFlush, resetRepeatedServerCloseFailures, syncDisplayName, syncProfileDisplayNameChanges, updateLastKnownSequenceNumber]);

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
        void (async () => {
          const sent = await invokeIfConnected('BoardUpdated', boardIdRef.current, sourceClientId, changeKind);
          if (sent) {
            invalidateSequenceTracking();
          }
        })();
      }
    },
    [invalidateSequenceTracking, invokeIfConnected],
  );

  const sendCursorUpdate = useCallback(
    (
      worldX: number | null,
      worldY: number | null,
      selectedElementIds?: string[],
      viewportCameraX?: number | null,
      viewportCameraY?: number | null,
      viewportZoom?: number | null,
    ) => {
      latestCursorRef.current = { x: worldX, y: worldY };
      const flushPendingCursor = () => {
        const pending = latestCursorRef.current;
        latestCursorRef.current = null;
        if (pending && boardIdRef.current) {
          lastCursorSentAtRef.current = performance.now();
          void invokeIfConnected(
            'UpdateCursor',
            boardIdRef.current,
            pending.x,
            pending.y,
            selectedElementIds ?? null,
            viewportCameraX ?? null,
            viewportCameraY ?? null,
            viewportZoom ?? null,
          );
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
        void (async () => {
          const sent = await invokeIfConnected('SyncBoardState', boardIdRef.current, board, changeKind);
          if (sent) {
            invalidateSequenceTracking();
          }
        })();
      }
    },
    [invalidateSequenceTracking, invokeIfConnected],
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
        const sent = operations.length === 1
          ? await invokeIfConnected('ApplyBoardOperation', currentBoardId, operations[0])
          : await invokeIfConnected('ApplyBoardOperations', currentBoardId, operations);
        if (!sent) {
          enqueueOperations(operations);
          void flushOutbox();
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

  const startFollowMeSession = useCallback(async () => {
    const currentBoardId = boardIdRef.current;
    if (!currentBoardId) {
      return false;
    }

    return invokeIfConnected('StartFollowMeSession', currentBoardId);
  }, [invokeIfConnected]);

  const stopFollowMeSession = useCallback(async () => {
    const currentBoardId = boardIdRef.current;
    if (!currentBoardId) {
      return false;
    }

    return invokeIfConnected('StopFollowMeSession', currentBoardId);
  }, [invokeIfConnected]);

  const bringEveryoneToMe = useCallback(
    async (cameraX: number, cameraY: number, zoom: number) => {
      const currentBoardId = boardIdRef.current;
      if (!currentBoardId) {
        return false;
      }

      return invokeIfConnected('BringEveryoneToMe', currentBoardId, cameraX, cameraY, zoom);
    },
    [invokeIfConnected],
  );

  return {
    sendBoardUpdated,
    sendCursorUpdate,
    sendBoardState,
    sendBoardStateThrottled,
    sendOperation,
    sendOperationThrottled,
    updateDisplayName,
    startFollowMeSession,
    stopFollowMeSession,
    bringEveryoneToMe,
    connectionId,
    connectionState,
    lastError,
  };
}
