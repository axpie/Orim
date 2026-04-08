import type { BoardOperation } from '../../../types/models';

export interface QueuedBoardOperationEntry {
  id: string;
  operation: BoardOperation;
}

export interface BoardOperationInvokeResult {
  sent: boolean;
  errorMessage: string | null;
}

export type BoardOperationDeliveryFailureKind = 'none' | 'server-close' | 'other';

export interface BoardOperationBatchDeliveryResult {
  delivered: boolean;
  failureKind: BoardOperationDeliveryFailureKind;
  errorMessage: string | null;
}

export interface RepeatedServerCloseFailureState {
  boardId: string | null;
  consecutiveFailures: number;
}

interface DeliverBoardOperationBatchOptions {
  boardId: string;
  entries: readonly QueuedBoardOperationEntry[];
  invokeBatch: (boardId: string, operations: readonly BoardOperation[]) => Promise<BoardOperationInvokeResult>;
  invokeSingle: (boardId: string, operation: BoardOperation) => Promise<BoardOperationInvokeResult>;
  removeEntry: (entryId: string) => void;
}

const INVALID_BOARD_OPERATION_ERROR_PREFIX = 'invalid board operation payload';
const SERVER_CLOSE_ERROR_PATTERNS = ['server returned an error on close', 'connection closed with an error'];

export function isInvalidBoardOperationErrorMessage(errorMessage: string | null | undefined): boolean {
  const normalized = errorMessage?.trim().toLowerCase();
  return normalized?.startsWith(INVALID_BOARD_OPERATION_ERROR_PREFIX) ?? false;
}

export function isServerClosedConnectionErrorMessage(errorMessage: string | null | undefined): boolean {
  const normalized = errorMessage?.trim().toLowerCase();
  return normalized != null && SERVER_CLOSE_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function createRepeatedServerCloseFailureState(): RepeatedServerCloseFailureState {
  return {
    boardId: null,
    consecutiveFailures: 0,
  };
}

export function registerRepeatedServerCloseFailure(
  state: RepeatedServerCloseFailureState,
  boardId: string,
  failureKind: BoardOperationDeliveryFailureKind,
  threshold: number,
) {
  if (failureKind !== 'server-close') {
    return {
      nextState: createRepeatedServerCloseFailureState(),
      shouldDiscard: false,
    };
  }

  const consecutiveFailures = state.boardId === boardId
    ? state.consecutiveFailures + 1
    : 1;

  return {
    nextState: {
      boardId,
      consecutiveFailures,
    },
    shouldDiscard: consecutiveFailures >= threshold,
  };
}

async function deliverSingleEntry(
  boardId: string,
  entry: QueuedBoardOperationEntry,
  invokeSingle: DeliverBoardOperationBatchOptions['invokeSingle'],
  removeEntry: DeliverBoardOperationBatchOptions['removeEntry'],
): Promise<BoardOperationBatchDeliveryResult> {
  const result = await invokeSingle(boardId, entry.operation);
  if (result.sent || isInvalidBoardOperationErrorMessage(result.errorMessage)) {
    removeEntry(entry.id);
    return {
      delivered: true,
      failureKind: 'none',
      errorMessage: null,
    };
  }

  return {
    delivered: false,
    failureKind: isServerClosedConnectionErrorMessage(result.errorMessage) ? 'server-close' : 'other',
    errorMessage: result.errorMessage,
  };
}

export async function deliverBoardOperationBatchWithRecovery({
  boardId,
  entries,
  invokeBatch,
  invokeSingle,
  removeEntry,
}: DeliverBoardOperationBatchOptions): Promise<BoardOperationBatchDeliveryResult> {
  if (entries.length === 0) {
    return {
      delivered: true,
      failureKind: 'none',
      errorMessage: null,
    };
  }

  if (entries.length === 1) {
    return deliverSingleEntry(boardId, entries[0]!, invokeSingle, removeEntry);
  }

  const batchResult = await invokeBatch(boardId, entries.map((entry) => entry.operation));
  if (batchResult.sent) {
    for (const entry of entries) {
      removeEntry(entry.id);
    }

    return {
      delivered: true,
      failureKind: 'none',
      errorMessage: null,
    };
  }

  if (!isInvalidBoardOperationErrorMessage(batchResult.errorMessage)) {
    return {
      delivered: false,
      failureKind: isServerClosedConnectionErrorMessage(batchResult.errorMessage) ? 'server-close' : 'other',
      errorMessage: batchResult.errorMessage,
    };
  }

  for (const entry of entries) {
    const delivery = await deliverSingleEntry(boardId, entry, invokeSingle, removeEntry);
    if (!delivery.delivered) {
      return delivery;
    }
  }

  return {
    delivered: true,
    failureKind: 'none',
    errorMessage: null,
  };
}
