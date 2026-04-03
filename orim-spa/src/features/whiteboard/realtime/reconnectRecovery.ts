import type { Board } from '../../../types/models';
import { applyBoardOperations, doesBoardMatchOperations } from './boardOperations';
import { useOperationOutboxStore } from '../store/outboxStore';

export interface ReconnectRecoveryResult {
  board: Board;
  queuedOperationsCount: number;
  replayedQueuedOperations: boolean;
}

export async function recoverBoardWithQueuedOperations(options: {
  boardId: string;
  fetchBoard: () => Promise<Board>;
}): Promise<ReconnectRecoveryResult> {
  const board = await options.fetchBoard();
  const queuedOperations = useOperationOutboxStore.getState()
    .getBoardEntries(options.boardId)
    .map((entry) => entry.operation);

  if (queuedOperations.length === 0) {
    return {
      board,
      queuedOperationsCount: 0,
      replayedQueuedOperations: false,
    };
  }

  return {
    board: applyBoardOperations(board, queuedOperations),
    queuedOperationsCount: queuedOperations.length,
    replayedQueuedOperations: !doesBoardMatchOperations(board, queuedOperations),
  };
}
