import type { BoardSyncStatus, RealtimeConnectionState } from '../../types/models';

interface DeriveBoardSyncStatusOptions {
  connectionState: RealtimeConnectionState;
  lastError: string | null;
  isDirty: boolean;
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
  isSaving,
  saveError,
}: DeriveBoardSyncStatusOptions): BoardSyncStatus {
  const saveErrorMessage = getErrorMessage(saveError);
  if (saveErrorMessage) {
    return {
      kind: 'saveError',
      hasPendingChanges: isDirty,
      detail: saveErrorMessage,
    };
  }

  switch (connectionState) {
    case 'connecting':
      return {
        kind: 'connecting',
        hasPendingChanges: isDirty,
        detail: lastError,
      };
    case 'reconnecting':
      return {
        kind: 'reconnecting',
        hasPendingChanges: isDirty,
        detail: lastError,
      };
    case 'disconnected':
      return {
        kind: lastError ? 'connectionError' : 'offline',
        hasPendingChanges: isDirty,
        detail: lastError,
      };
    case 'connected':
    default:
      if (isSaving) {
        return {
          kind: 'saving',
          hasPendingChanges: isDirty,
          detail: lastError,
        };
      }

      return {
        kind: isDirty ? 'unsaved' : 'saved',
        hasPendingChanges: isDirty,
        detail: lastError,
      };
  }
}
