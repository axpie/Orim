import { beforeEach, describe, expect, it, vi } from 'vitest';
import { primeBoardHistorySequence, recoverBoardAfterReconnect } from '../reconnectRecovery';
import { useOperationOutboxStore } from '../../store/outboxStore';
import type { Board, BoardElement, BoardOperationHistoryResponse } from '../../../../types/models';

function makeElement(overrides: Partial<BoardElement> = {}): BoardElement {
  return {
    $type: 'shape',
    id: `el-${Math.random().toString(36).slice(2, 8)}`,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    zIndex: 0,
    rotation: 0,
    shapeType: 'Rectangle',
    fillColor: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 1,
    borderLineStyle: 'Solid',
    label: '',
    labelHorizontalAlignment: 'Center',
    labelVerticalAlignment: 'Middle',
    ...overrides,
  } as BoardElement;
}

function makeBoard(elements: BoardElement[] = []): Board {
  return {
    id: 'board-1',
    ownerId: 'owner-1',
    title: 'Board',
    elements,
    comments: [],
    snapshots: [],
    members: [],
    visibility: 'Private',
    shareLinkToken: null,
    sharedAllowAnonymousEditing: false,
    sharePasswordHash: null,
    customColors: [],
    recentColors: [],
    stickyNotePresets: [],
    surfaceColor: null,
    themeKey: null,
    labelOutlineEnabled: true,
    arrowOutlineEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as Board;
}

function makeHistoryResponse(overrides: Partial<BoardOperationHistoryResponse> = {}): BoardOperationHistoryResponse {
  return {
    latestSequenceNumber: 0,
    hasMore: false,
    operations: [],
    ...overrides,
  };
}

describe('reconnectRecovery', () => {
  beforeEach(() => {
    localStorage.clear();
    useOperationOutboxStore.setState({ entries: [] });
  });

  it('applies missing history operations without refetching the full board', async () => {
    const currentBoard = makeBoard([makeElement({ id: 'shape-1', x: 10 })]);
    const fetchBoard = vi.fn<() => Promise<Board>>();
    const fetchHistory = vi.fn<(since: number, limit: number) => Promise<BoardOperationHistoryResponse>>()
      .mockResolvedValue(makeHistoryResponse({
        latestSequenceNumber: 6,
        operations: [
          {
            sequenceNumber: 6,
            changedAtUtc: new Date().toISOString(),
            operation: { type: 'element.updated', element: makeElement({ id: 'shape-1', x: 40 }) },
          },
        ],
      }));

    const result = await recoverBoardAfterReconnect({
      boardId: 'board-1',
      currentBoard,
      lastKnownSequenceNumber: 5,
      fetchBoard,
      fetchHistory,
    });

    expect(fetchBoard).not.toHaveBeenCalled();
    expect(fetchHistory).toHaveBeenCalledWith(5, 1000);
    expect(result.usedHistory).toBe(true);
    expect(result.latestSequenceNumber).toBe(6);
    expect(result.board.elements[0].x).toBe(40);
  });

  it('falls back to a full board fetch when incremental history is incomplete', async () => {
    const fullBoard = makeBoard([makeElement({ id: 'shape-1', x: 55 })]);
    const fetchBoard = vi.fn<() => Promise<Board>>().mockResolvedValue(fullBoard);
    const fetchHistory = vi.fn<(since: number, limit: number) => Promise<BoardOperationHistoryResponse>>()
      .mockResolvedValue(makeHistoryResponse({
        latestSequenceNumber: 8,
        hasMore: true,
      }));

    const result = await recoverBoardAfterReconnect({
      boardId: 'board-1',
      currentBoard: makeBoard([makeElement({ id: 'shape-1', x: 10 })]),
      lastKnownSequenceNumber: 4,
      fetchBoard,
      fetchHistory,
    });

    expect(fetchBoard).toHaveBeenCalledOnce();
    expect(fetchHistory).toHaveBeenCalledWith(4, 1000);
    expect(result.usedHistory).toBe(false);
    expect(result.latestSequenceNumber).toBe(8);
    expect(result.board).toBe(fullBoard);
  });

  it('replays queued operations on top of the recovered board snapshot', async () => {
    useOperationOutboxStore.getState().enqueueOperations('board-1', [
      { type: 'element.updated', element: makeElement({ id: 'shape-1', x: 80 }) },
    ]);

    const fetchBoard = vi.fn<() => Promise<Board>>().mockResolvedValue(
      makeBoard([makeElement({ id: 'shape-1', x: 10 })]),
    );
    const fetchHistory = vi.fn<(since: number, limit: number) => Promise<BoardOperationHistoryResponse>>()
      .mockResolvedValue(makeHistoryResponse({
        latestSequenceNumber: 3,
      }));

    const result = await recoverBoardAfterReconnect({
      boardId: 'board-1',
      fetchBoard,
      fetchHistory,
    });

    expect(fetchBoard).toHaveBeenCalledOnce();
    expect(fetchHistory).toHaveBeenCalledWith(0, 0);
    expect(result.queuedOperationsCount).toBe(1);
    expect(result.replayedQueuedOperations).toBe(true);
    expect(result.board.elements[0].x).toBe(80);
  });

  it('primes the latest known sequence number from history head metadata', async () => {
    const fetchHistory = vi.fn<(since: number, limit: number) => Promise<BoardOperationHistoryResponse>>()
      .mockResolvedValue(makeHistoryResponse({
        latestSequenceNumber: 12,
      }));

    await expect(primeBoardHistorySequence(fetchHistory)).resolves.toBe(12);
    expect(fetchHistory).toHaveBeenCalledWith(0, 0);
  });
});
