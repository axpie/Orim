import type { BoardOperation } from '../../../types/models';

export interface QueuedBoardOperationEntry {
  id: string;
  operation: BoardOperation;
}

export interface BoardOperationInvokeResult {
  sent: boolean;
  errorMessage: string | null;
}

interface DeliverBoardOperationBatchOptions {
  boardId: string;
  entries: readonly QueuedBoardOperationEntry[];
  invokeBatch: (boardId: string, operations: readonly BoardOperation[]) => Promise<BoardOperationInvokeResult>;
  invokeSingle: (boardId: string, operation: BoardOperation) => Promise<BoardOperationInvokeResult>;
  removeEntry: (entryId: string) => void;
}

const INVALID_BOARD_OPERATION_ERROR_PREFIX = 'invalid board operation payload';

export function isInvalidBoardOperationErrorMessage(errorMessage: string | null | undefined): boolean {
  const normalized = errorMessage?.trim().toLowerCase();
  return normalized?.startsWith(INVALID_BOARD_OPERATION_ERROR_PREFIX) ?? false;
}

async function deliverSingleEntry(
  boardId: string,
  entry: QueuedBoardOperationEntry,
  invokeSingle: DeliverBoardOperationBatchOptions['invokeSingle'],
  removeEntry: DeliverBoardOperationBatchOptions['removeEntry'],
) {
  const result = await invokeSingle(boardId, entry.operation);
  if (result.sent || isInvalidBoardOperationErrorMessage(result.errorMessage)) {
    removeEntry(entry.id);
    return true;
  }

  return false;
}

export async function deliverBoardOperationBatchWithRecovery({
  boardId,
  entries,
  invokeBatch,
  invokeSingle,
  removeEntry,
}: DeliverBoardOperationBatchOptions): Promise<boolean> {
  if (entries.length === 0) {
    return true;
  }

  if (entries.length === 1) {
    return deliverSingleEntry(boardId, entries[0]!, invokeSingle, removeEntry);
  }

  const batchResult = await invokeBatch(boardId, entries.map((entry) => entry.operation));
  if (batchResult.sent) {
    for (const entry of entries) {
      removeEntry(entry.id);
    }

    return true;
  }

  if (!isInvalidBoardOperationErrorMessage(batchResult.errorMessage)) {
    return false;
  }

  for (const entry of entries) {
    const delivered = await deliverSingleEntry(boardId, entry, invokeSingle, removeEntry);
    if (!delivered) {
      return false;
    }
  }

  return true;
}
