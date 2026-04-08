import { describe, it, expect, beforeEach } from 'vitest';
import { useOperationOutboxStore } from '../outboxStore';
import type { BoardOperation, BoardElement } from '../../../../types/models';

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

describe('outboxStore', () => {
  beforeEach(() => {
    useOperationOutboxStore.setState({ entries: [] });
  });

  describe('enqueueOperations', () => {
    it('should enqueue an element.added operation', () => {
      const el = makeElement({ id: 'e1' });
      useOperationOutboxStore.getState().enqueueOperations('board-1', [
        { type: 'element.added', element: el },
      ]);
      expect(useOperationOutboxStore.getState().entries).toHaveLength(1);
      expect(useOperationOutboxStore.getState().entries[0].boardId).toBe('board-1');
    });

    it('should merge element.updated into existing element.added', () => {
      const el = makeElement({ id: 'e1', x: 0 });
      useOperationOutboxStore.getState().enqueueOperations('b1', [
        { type: 'element.added', element: el },
      ]);
      const updated = { ...el, x: 50 };
      useOperationOutboxStore.getState().enqueueOperations('b1', [
        { type: 'element.updated', element: updated },
      ]);

      const entries = useOperationOutboxStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].operation.type).toBe('element.added');
      expect((entries[0].operation as { element: BoardElement }).element.x).toBe(50);
    });

    it('should merge element.updated into existing element.updated', () => {
      const el = makeElement({ id: 'e1', x: 0 });
      useOperationOutboxStore.getState().enqueueOperations('b1', [
        { type: 'element.updated', element: el },
      ]);
      const updated = { ...el, x: 99 };
      useOperationOutboxStore.getState().enqueueOperations('b1', [
        { type: 'element.updated', element: updated },
      ]);

      const entries = useOperationOutboxStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect((entries[0].operation as { element: BoardElement }).element.x).toBe(99);
    });

    it('should remove add+update entries when element.deleted is enqueued', () => {
      const el = makeElement({ id: 'e1' });
      useOperationOutboxStore.getState().enqueueOperations('b1', [
        { type: 'element.added', element: el },
      ]);
      useOperationOutboxStore.getState().enqueueOperations('b1', [
        { type: 'element.updated', element: { ...el, x: 5 } },
      ]);
      useOperationOutboxStore.getState().enqueueOperations('b1', [
        { type: 'element.deleted', elementId: 'e1' },
      ]);

      // add merged with update then deleted locally → net zero
      expect(useOperationOutboxStore.getState().entries).toHaveLength(0);
    });

    it('should add element.deleted when element was not locally added', () => {
      useOperationOutboxStore.getState().enqueueOperations('b1', [
        { type: 'element.deleted', elementId: 'e1' },
      ]);
      const entries = useOperationOutboxStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].operation.type).toBe('element.deleted');
    });

    it('should deduplicate element.deleted operations', () => {
      useOperationOutboxStore.getState().enqueueOperations('b1', [
        { type: 'element.deleted', elementId: 'e1' },
      ]);
      useOperationOutboxStore.getState().enqueueOperations('b1', [
        { type: 'element.deleted', elementId: 'e1' },
      ]);
      expect(useOperationOutboxStore.getState().entries).toHaveLength(1);
    });

    it('should expand elements.deleted into individual element.deleted entries', () => {
      useOperationOutboxStore.getState().enqueueOperations('b1', [
        { type: 'elements.deleted', elementIds: ['e1', 'e2'] },
      ]);
      const entries = useOperationOutboxStore.getState().entries;
      expect(entries).toHaveLength(2);
      expect(entries.every((e) => e.operation.type === 'element.deleted')).toBe(true);
    });

    it('should replace board.metadata.updated with latest', () => {
      useOperationOutboxStore.getState().enqueueOperations('b1', [
        { type: 'board.metadata.updated', title: 'Old' } as BoardOperation,
      ]);
      useOperationOutboxStore.getState().enqueueOperations('b1', [
        { type: 'board.metadata.updated', title: 'New' } as BoardOperation,
      ]);
      const entries = useOperationOutboxStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect((entries[0].operation as { title: string }).title).toBe('New');
    });

    it('should keep entries for different boards separate', () => {
      const el1 = makeElement({ id: 'e1' });
      const el2 = makeElement({ id: 'e2' });
      useOperationOutboxStore.getState().enqueueOperations('board-a', [
        { type: 'element.added', element: el1 },
      ]);
      useOperationOutboxStore.getState().enqueueOperations('board-b', [
        { type: 'element.added', element: el2 },
      ]);
      expect(useOperationOutboxStore.getState().entries).toHaveLength(2);
    });
  });

  describe('getBoardEntries', () => {
    it('should return only entries for a specific board', () => {
      const el = makeElement({ id: 'e1' });
      useOperationOutboxStore.getState().enqueueOperations('board-a', [
        { type: 'element.added', element: el },
      ]);
      useOperationOutboxStore.getState().enqueueOperations('board-b', [
        { type: 'element.deleted', elementId: 'e2' },
      ]);
      const boardAEntries = useOperationOutboxStore.getState().getBoardEntries('board-a');
      expect(boardAEntries).toHaveLength(1);
      expect(boardAEntries[0].boardId).toBe('board-a');
    });

    it('should return empty array for unknown board', () => {
      expect(useOperationOutboxStore.getState().getBoardEntries('unknown')).toEqual([]);
    });
  });

  describe('removeEntry', () => {
    it('should remove a specific entry by id', () => {
      const el = makeElement({ id: 'e1' });
      useOperationOutboxStore.getState().enqueueOperations('b1', [
        { type: 'element.added', element: el },
      ]);
      const entryId = useOperationOutboxStore.getState().entries[0].id;
      useOperationOutboxStore.getState().removeEntry(entryId);
      expect(useOperationOutboxStore.getState().entries).toHaveLength(0);
    });

    it('should leave other entries intact', () => {
      const el1 = makeElement({ id: 'e1' });
      const el2 = makeElement({ id: 'e2' });
      useOperationOutboxStore.getState().enqueueOperations('b1', [
        { type: 'element.added', element: el1 },
        { type: 'element.added', element: el2 },
      ]);
      const entries = useOperationOutboxStore.getState().entries;
      useOperationOutboxStore.getState().removeEntry(entries[0].id);
      expect(useOperationOutboxStore.getState().entries).toHaveLength(1);
      expect(useOperationOutboxStore.getState().entries[0].id).toBe(entries[1].id);
    });
  });

  describe('clearBoardEntries', () => {
    it('should remove all queued entries for a single board only', () => {
      const el1 = makeElement({ id: 'e1' });
      const el2 = makeElement({ id: 'e2' });

      useOperationOutboxStore.getState().enqueueOperations('board-a', [
        { type: 'element.added', element: el1 },
        { type: 'element.added', element: el2 },
      ]);
      useOperationOutboxStore.getState().enqueueOperations('board-b', [
        { type: 'element.deleted', elementId: 'remote-1' },
      ]);

      useOperationOutboxStore.getState().clearBoardEntries('board-a');

      expect(useOperationOutboxStore.getState().getBoardEntries('board-a')).toEqual([]);
      expect(useOperationOutboxStore.getState().getBoardEntries('board-b')).toHaveLength(1);
      expect(useOperationOutboxStore.getState().entries).toHaveLength(1);
    });
  });

  describe('countForBoard', () => {
    it('should return 0 for empty outbox', () => {
      expect(useOperationOutboxStore.getState().countForBoard('b1')).toBe(0);
    });

    it('should return correct count', () => {
      const el1 = makeElement({ id: 'e1' });
      const el2 = makeElement({ id: 'e2' });
      useOperationOutboxStore.getState().enqueueOperations('b1', [
        { type: 'element.added', element: el1 },
        { type: 'element.added', element: el2 },
      ]);
      useOperationOutboxStore.getState().enqueueOperations('b2', [
        { type: 'element.deleted', elementId: 'x' },
      ]);
      expect(useOperationOutboxStore.getState().countForBoard('b1')).toBe(2);
      expect(useOperationOutboxStore.getState().countForBoard('b2')).toBe(1);
    });
  });
});
