import type { Board, BoardOperationHistoryResponse } from '../../../types/models';
import { applyBoardOperations, doesBoardMatchOperations } from './boardOperations';
import { useOperationOutboxStore } from '../store/outboxStore';

export interface ReconnectRecoveryResult {
  board: Board;
  queuedOperationsCount: number;
  replayedQueuedOperations: boolean;
  latestSequenceNumber: number;
  usedHistory: boolean;
}

function normalizeSequenceNumber(sequenceNumber: number | null | undefined): number | null {
  if (typeof sequenceNumber !== 'number' || !Number.isFinite(sequenceNumber) || sequenceNumber < 0) {
    return null;
  }

  return Math.floor(sequenceNumber);
}

function getQueuedOperations(boardId: string) {
  return useOperationOutboxStore.getState()
    .getBoardEntries(boardId)
    .map((entry) => entry.operation);
}

async function resolveLatestSequenceNumber(fetchHistory: (since: number, limit: number) => Promise<BoardOperationHistoryResponse>) {
  const head = await fetchHistory(0, 0);
  return head.latestSequenceNumber;
}

export async function recoverBoardAfterReconnect(options: {
  boardId: string;
  currentBoard?: Board | null;
  lastKnownSequenceNumber?: number | null;
  fetchBoard: () => Promise<Board>;
  fetchHistory: (since: number, limit: number) => Promise<BoardOperationHistoryResponse>;
  historyLimit?: number;
}): Promise<ReconnectRecoveryResult> {
  const queuedOperations = getQueuedOperations(options.boardId);
  const currentBoard = options.currentBoard ?? null;
  const lastKnownSequenceNumber = normalizeSequenceNumber(options.lastKnownSequenceNumber);
  const historyLimit = options.historyLimit ?? 1000;

  let fallbackLatestSequenceNumber: number | null = null;

  if (currentBoard && queuedOperations.length === 0 && lastKnownSequenceNumber != null) {
    const history = await options.fetchHistory(lastKnownSequenceNumber, historyLimit);
    fallbackLatestSequenceNumber = history.latestSequenceNumber;

    if (!history.hasMore) {
      const missingOperations = history.operations.map((entry) => entry.operation);
      return {
        board: missingOperations.length === 0 || doesBoardMatchOperations(currentBoard, missingOperations)
          ? currentBoard
          : applyBoardOperations(currentBoard, missingOperations),
        queuedOperationsCount: 0,
        replayedQueuedOperations: false,
        latestSequenceNumber: history.latestSequenceNumber,
        usedHistory: true,
      };
    }
  }

  const board = await options.fetchBoard();
  const latestSequenceNumber = fallbackLatestSequenceNumber ?? await resolveLatestSequenceNumber(options.fetchHistory);

  if (queuedOperations.length === 0) {
    return {
      board,
      queuedOperationsCount: 0,
      replayedQueuedOperations: false,
      latestSequenceNumber,
      usedHistory: false,
    };
  }

  const replayedQueuedOperations = !doesBoardMatchOperations(board, queuedOperations);

  return {
    board: replayedQueuedOperations ? applyBoardOperations(board, queuedOperations) : board,
    queuedOperationsCount: queuedOperations.length,
    replayedQueuedOperations,
    latestSequenceNumber,
    usedHistory: false,
  };
}

export async function primeBoardHistorySequence(
  fetchHistory: (since: number, limit: number) => Promise<BoardOperationHistoryResponse>,
): Promise<number> {
  return resolveLatestSequenceNumber(fetchHistory);
}
