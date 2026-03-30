import type { BoardSyncStatus, RealtimeConnectionState } from '../../types/models';

interface DeriveBoardSyncStatusOptions {
  connectionState: RealtimeConnectionState;
  lastError: string | null;
  isDirty: boolean;
  outboxCount: number;
  isSaving: boolean;
  saveError: unknown;
}

function getErrorMessage(error: unknown): string | null {
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      response?: { data?: unknown };
      message?: string;
    };

    if (typeof candidate.response?.data === 'string' && candidate.response.data.trim().length > 0) {
      return candidate.response.data;
    }

    if (typeof candidate.response?.data === 'object' && candidate.response.data !== null) {
      const payload = candidate.response.data as {
        error?: unknown;
        message?: unknown;
        title?: unknown;
      };

      if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
        return payload.error;
      }

      if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
        return payload.message;
      }

      if (typeof payload.title === 'string' && payload.title.trim().length > 0) {
        return payload.title;
      }
    }

    if (typeof candidate.message === 'string' && candidate.message.trim().length > 0) {
      return candidate.message;
    }
  }

  return null;
}

export function deriveBoardSyncStatus({
  connectionState,
  lastError,
  isDirty,
  outboxCount,
  isSaving,
  saveError,
}: DeriveBoardSyncStatusOptions): BoardSyncStatus {
  const hasPendingChanges = isDirty || outboxCount > 0;
  const saveErrorMessage = getErrorMessage(saveError);
  if (saveErrorMessage) {
    return {
      kind: 'saveError',
      hasPendingChanges,
      queuedChangesCount: outboxCount,
      detail: saveErrorMessage,
    };
  }

  switch (connectionState) {
    case 'connecting':
      return {
        kind: 'connecting',
        hasPendingChanges,
        queuedChangesCount: outboxCount,
        detail: lastError,
      };
    case 'reconnecting':
      return {
        kind: 'reconnecting',
        hasPendingChanges,
        queuedChangesCount: outboxCount,
        detail: lastError,
      };
    case 'disconnected':
      return {
        kind: lastError ? 'connectionError' : 'offline',
        hasPendingChanges,
        queuedChangesCount: outboxCount,
        detail: lastError,
      };
    case 'connected':
    default:
      if (isSaving) {
        return {
          kind: 'saving',
          hasPendingChanges,
          queuedChangesCount: outboxCount,
          detail: lastError,
        };
      }

      return {
        kind: outboxCount > 0 ? 'unsyncedChanges' : isDirty ? 'unsaved' : 'saved',
        hasPendingChanges,
        queuedChangesCount: outboxCount,
        detail: lastError,
      };
  }
}
