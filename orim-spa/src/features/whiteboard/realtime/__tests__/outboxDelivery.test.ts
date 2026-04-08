import { describe, expect, it, vi } from 'vitest';
import type { BoardOperation } from '../../../../types/models';
import {
  createRepeatedServerCloseFailureState,
  deliverBoardOperationBatchWithRecovery,
  isInvalidBoardOperationErrorMessage,
  isServerClosedConnectionErrorMessage,
  registerRepeatedServerCloseFailure,
} from '../outboxDelivery';

function makeOperation(elementId: string): BoardOperation {
  return {
    type: 'element.deleted',
    elementId,
  };
}

describe('outboxDelivery', () => {
  it('removes all queued entries when the batch succeeds', async () => {
    const removed: string[] = [];
    const invokeBatch = vi.fn().mockResolvedValue({ sent: true, errorMessage: null });
    const invokeSingle = vi.fn();

    const delivery = await deliverBoardOperationBatchWithRecovery({
      boardId: 'board-1',
      entries: [
        { id: 'entry-1', operation: makeOperation('shape-1') },
        { id: 'entry-2', operation: makeOperation('shape-2') },
      ],
      invokeBatch,
      invokeSingle,
      removeEntry: (entryId) => {
        removed.push(entryId);
      },
    });

    expect(delivery).toEqual({
      delivered: true,
      failureKind: 'none',
      errorMessage: null,
    });
    expect(invokeBatch).toHaveBeenCalledOnce();
    expect(invokeSingle).not.toHaveBeenCalled();
    expect(removed).toEqual(['entry-1', 'entry-2']);
  });

  it('falls back to individual sends and discards only invalid queued entries', async () => {
    const removed: string[] = [];
    const invokeBatch = vi.fn().mockResolvedValue({
      sent: false,
      errorMessage: 'Invalid board operation payload at index 1.',
    });
    const invokeSingle = vi.fn()
      .mockResolvedValueOnce({ sent: true, errorMessage: null })
      .mockResolvedValueOnce({ sent: false, errorMessage: 'Invalid board operation payload.' })
      .mockResolvedValueOnce({ sent: true, errorMessage: null });

    const delivery = await deliverBoardOperationBatchWithRecovery({
      boardId: 'board-1',
      entries: [
        { id: 'entry-1', operation: makeOperation('shape-1') },
        { id: 'entry-2', operation: makeOperation('shape-2') },
        { id: 'entry-3', operation: makeOperation('shape-3') },
      ],
      invokeBatch,
      invokeSingle,
      removeEntry: (entryId) => {
        removed.push(entryId);
      },
    });

    expect(delivery).toEqual({
      delivered: true,
      failureKind: 'none',
      errorMessage: null,
    });
    expect(invokeBatch).toHaveBeenCalledOnce();
    expect(invokeSingle).toHaveBeenCalledTimes(3);
    expect(removed).toEqual(['entry-1', 'entry-2', 'entry-3']);
  });

  it('stops retrying when delivery fails for a non-payload error', async () => {
    const removed: string[] = [];
    const invokeBatch = vi.fn().mockResolvedValue({
      sent: false,
      errorMessage: 'Invalid board operation payload at index 0.',
    });
    const invokeSingle = vi.fn()
      .mockResolvedValueOnce({ sent: false, errorMessage: 'Board access denied.' });

    const delivery = await deliverBoardOperationBatchWithRecovery({
      boardId: 'board-1',
      entries: [
        { id: 'entry-1', operation: makeOperation('shape-1') },
        { id: 'entry-2', operation: makeOperation('shape-2') },
      ],
      invokeBatch,
      invokeSingle,
      removeEntry: (entryId) => {
        removed.push(entryId);
      },
    });

    expect(delivery).toEqual({
      delivered: false,
      failureKind: 'other',
      errorMessage: 'Board access denied.',
    });
    expect(invokeSingle).toHaveBeenCalledTimes(1);
    expect(removed).toEqual([]);
  });

  it('classifies server-close failures separately from other delivery errors', async () => {
    const invokeBatch = vi.fn().mockResolvedValue({
      sent: false,
      errorMessage: 'Server returned an error on close: Connection closed with an error.',
    });

    const delivery = await deliverBoardOperationBatchWithRecovery({
      boardId: 'board-1',
      entries: [
        { id: 'entry-1', operation: makeOperation('shape-1') },
        { id: 'entry-2', operation: makeOperation('shape-2') },
      ],
      invokeBatch,
      invokeSingle: vi.fn(),
      removeEntry: vi.fn(),
    });

    expect(delivery).toEqual({
      delivered: false,
      failureKind: 'server-close',
      errorMessage: 'Server returned an error on close: Connection closed with an error.',
    });
  });

  it('tracks repeated server-close failures until the discard threshold is reached', () => {
    const first = registerRepeatedServerCloseFailure(
      createRepeatedServerCloseFailureState(),
      'board-1',
      'server-close',
      3,
    );
    const second = registerRepeatedServerCloseFailure(first.nextState, 'board-1', 'server-close', 3);
    const third = registerRepeatedServerCloseFailure(second.nextState, 'board-1', 'server-close', 3);

    expect(first.shouldDiscard).toBe(false);
    expect(second.shouldDiscard).toBe(false);
    expect(third.shouldDiscard).toBe(true);
    expect(third.nextState).toEqual({
      boardId: 'board-1',
      consecutiveFailures: 3,
    });
  });

  it('detects invalid payload and server-close errors case-insensitively', () => {
    expect(isInvalidBoardOperationErrorMessage(' Invalid Board Operation Payload. ')).toBe(true);
    expect(isServerClosedConnectionErrorMessage(' Server Returned An Error On Close: Connection Closed With An Error. ')).toBe(true);
    expect(isInvalidBoardOperationErrorMessage('Board access denied.')).toBe(false);
    expect(isServerClosedConnectionErrorMessage('Board access denied.')).toBe(false);
    expect(isInvalidBoardOperationErrorMessage(null)).toBe(false);
    expect(isServerClosedConnectionErrorMessage(null)).toBe(false);
  });
});
