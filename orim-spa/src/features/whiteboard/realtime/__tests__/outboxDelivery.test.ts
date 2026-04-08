import { describe, expect, it, vi } from 'vitest';
import type { BoardOperation } from '../../../../types/models';
import {
  deliverBoardOperationBatchWithRecovery,
  isInvalidBoardOperationErrorMessage,
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

    const delivered = await deliverBoardOperationBatchWithRecovery({
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

    expect(delivered).toBe(true);
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

    const delivered = await deliverBoardOperationBatchWithRecovery({
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

    expect(delivered).toBe(true);
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

    const delivered = await deliverBoardOperationBatchWithRecovery({
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

    expect(delivered).toBe(false);
    expect(invokeSingle).toHaveBeenCalledTimes(1);
    expect(removed).toEqual([]);
  });

  it('detects invalid payload errors case-insensitively', () => {
    expect(isInvalidBoardOperationErrorMessage(' Invalid Board Operation Payload. ')).toBe(true);
    expect(isInvalidBoardOperationErrorMessage('Board access denied.')).toBe(false);
    expect(isInvalidBoardOperationErrorMessage(null)).toBe(false);
  });
});
