import { describe, it, expect } from 'vitest';
import {
  applyBoardOperation,
  applyBoardOperations,
  deriveElementOperations,
  haveBoardElementsChanged,
  doesBoardMatchOperations,
  createElementAddedOperation,
  createElementUpdatedOperation,
  createElementDeletedOperation,
  createElementsDeletedOperation,
  createBoardMetadataUpdatedOperation,
} from '../boardOperations';
import type { Board, BoardElement, BoardOperation } from '../../../../types/models';

function createTestBoard(elements: BoardElement[] = []): Board {
  return {
    id: 'test-board-id',
    ownerId: 'test-owner-id',
    title: 'Test Board',
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

// ── applyBoardOperation ───────────────────────────────────────────────

describe('applyBoardOperation', () => {
  it('should add a new element via element.added', () => {
    const board = createTestBoard();
    const el = makeElement({ id: 'a1' });
    const result = applyBoardOperation(board, { type: 'element.added', element: el });
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].id).toBe('a1');
  });

  it('should replace existing element via element.added if id exists', () => {
    const el = makeElement({ id: 'a1', x: 10 });
    const board = createTestBoard([el]);
    const replacement = makeElement({ id: 'a1', x: 99 });
    const result = applyBoardOperation(board, { type: 'element.added', element: replacement });
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].x).toBe(99);
  });

  it('should update an element via element.updated', () => {
    const el = makeElement({ id: 'u1', x: 0 });
    const board = createTestBoard([el]);
    const updated = makeElement({ id: 'u1', x: 77 });
    const result = applyBoardOperation(board, { type: 'element.updated', element: updated });
    expect(result.elements[0].x).toBe(77);
  });

  it('should leave other elements unchanged on update', () => {
    const el1 = makeElement({ id: 'u1', x: 0 });
    const el2 = makeElement({ id: 'u2', x: 10 });
    const board = createTestBoard([el1, el2]);
    const updated = makeElement({ id: 'u1', x: 77 });
    const result = applyBoardOperation(board, { type: 'element.updated', element: updated });
    expect(result.elements[1]).toBe(el2);
  });

  it('should delete an element via element.deleted', () => {
    const el = makeElement({ id: 'd1' });
    const board = createTestBoard([el]);
    const result = applyBoardOperation(board, { type: 'element.deleted', elementId: 'd1' });
    expect(result.elements).toHaveLength(0);
  });

  it('should delete multiple elements via elements.deleted', () => {
    const els = [makeElement({ id: 'x1' }), makeElement({ id: 'x2' }), makeElement({ id: 'x3' })];
    const board = createTestBoard(els);
    const result = applyBoardOperation(board, { type: 'elements.deleted', elementIds: ['x1', 'x3'] });
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].id).toBe('x2');
  });

  it('should update board metadata via board.metadata.updated', () => {
    const board = createTestBoard();
    const result = applyBoardOperation(board, {
      type: 'board.metadata.updated',
      title: 'New Title',
      labelOutlineEnabled: false,
      arrowOutlineEnabled: false,
      surfaceColor: '#ff0000',
      themeKey: 'dark',
      customColors: ['#aaa'],
      recentColors: ['#bbb'],
      stickyNotePresets: [{ id: 'p1', label: 'Note', fillColor: '#ccc' }],
    });
    expect(result.title).toBe('New Title');
    expect(result.labelOutlineEnabled).toBe(false);
    expect(result.arrowOutlineEnabled).toBe(false);
    expect(result.surfaceColor).toBe('#ff0000');
    expect(result.themeKey).toBe('dark');
    expect(result.customColors).toEqual(['#aaa']);
    expect(result.recentColors).toEqual(['#bbb']);
    expect(result.stickyNotePresets).toEqual([{ id: 'p1', label: 'Note', fillColor: '#ccc' }]);
  });

  it('should preserve existing metadata fields when operation omits them', () => {
    const board = createTestBoard();
    board.title = 'Original';
    board.labelOutlineEnabled = true;
    const result = applyBoardOperation(board, {
      type: 'board.metadata.updated',
      title: 'Changed',
    });
    expect(result.title).toBe('Changed');
    expect(result.labelOutlineEnabled).toBe(true);
  });

  it('should return board unchanged for unknown operation type', () => {
    const board = createTestBoard();
    const result = applyBoardOperation(board, { type: 'unknown' } as unknown as BoardOperation);
    expect(result).toBe(board);
  });
});

describe('applyBoardOperations', () => {
  it('should apply multiple operations sequentially', () => {
    const board = createTestBoard();
    const el = makeElement({ id: 'seq1' });
    const operations: BoardOperation[] = [
      { type: 'element.added', element: el },
      { type: 'element.updated', element: { ...el, x: 50 } },
    ];
    const result = applyBoardOperations(board, operations);
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].x).toBe(50);
  });
});

// ── deriveElementOperations ───────────────────────────────────────────

describe('deriveElementOperations', () => {
  it('should return empty array for identical lists', () => {
    const el = makeElement({ id: 'e1' });
    expect(deriveElementOperations([el], [el])).toEqual([]);
  });

  it('should detect added elements', () => {
    const el = makeElement({ id: 'new' });
    const ops = deriveElementOperations([], [el]);
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('element.added');
  });

  it('should detect updated elements', () => {
    const el = makeElement({ id: 'e1', x: 0 });
    const updated = { ...el, x: 42 };
    const ops = deriveElementOperations([el], [updated]);
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('element.updated');
  });

  it('should detect single deleted element', () => {
    const el = makeElement({ id: 'e1' });
    const ops = deriveElementOperations([el], []);
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('element.deleted');
    expect((ops[0] as { elementId: string }).elementId).toBe('e1');
  });

  it('should detect multiple deleted elements as elements.deleted', () => {
    const el1 = makeElement({ id: 'e1' });
    const el2 = makeElement({ id: 'e2' });
    const ops = deriveElementOperations([el1, el2], []);
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('elements.deleted');
    expect((ops[0] as { elementIds: string[] }).elementIds).toEqual(['e1', 'e2']);
  });

  it('should combine add, update, and delete in one pass', () => {
    const el1 = makeElement({ id: 'e1', x: 0 });
    const el2 = makeElement({ id: 'e2' });
    const el3 = makeElement({ id: 'e3' });
    const updatedE1 = { ...el1, x: 10 };
    const ops = deriveElementOperations([el1, el2], [updatedE1, el3]);
    const types = ops.map((op) => op.type);
    expect(types).toContain('element.updated');
    expect(types).toContain('element.added');
    expect(types).toContain('element.deleted');
  });

  it('should produce structuredClone of elements', () => {
    const el = makeElement({ id: 'e1' });
    const ops = deriveElementOperations([], [el]);
    const added = ops[0] as { element: BoardElement };
    expect(added.element).not.toBe(el);
    expect(added.element.id).toBe(el.id);
  });
});

// ── haveBoardElementsChanged ──────────────────────────────────────────

describe('haveBoardElementsChanged', () => {
  it('should return false for identical arrays', () => {
    const el = makeElement({ id: 'e1' });
    expect(haveBoardElementsChanged([el], [el])).toBe(false);
  });

  it('should return true for different lengths', () => {
    const el = makeElement({ id: 'e1' });
    expect(haveBoardElementsChanged([el], [])).toBe(true);
  });

  it('should return true when element property changed', () => {
    const el = makeElement({ id: 'e1', x: 0 });
    const changed = { ...el, x: 5 };
    expect(haveBoardElementsChanged([el], [changed])).toBe(true);
  });

  it('should return true when element ids differ', () => {
    const el1 = makeElement({ id: 'e1' });
    const el2 = makeElement({ id: 'e2' });
    expect(haveBoardElementsChanged([el1], [el2])).toBe(true);
  });

  it('should return true when duplicate ids are introduced', () => {
    const el1 = makeElement({ id: 'e1' });
    const el2 = makeElement({ id: 'e1' });
    expect(haveBoardElementsChanged([el1, makeElement({ id: 'e2' })], [el1, el2])).toBe(true);
  });
});

// ── doesBoardMatchOperations ──────────────────────────────────────────

describe('doesBoardMatchOperations', () => {
  it('should return true when board already reflects element.added', () => {
    const el = makeElement({ id: 'e1' });
    const board = createTestBoard([el]);
    expect(doesBoardMatchOperations(board, [{ type: 'element.added', element: el }])).toBe(true);
  });

  it('should return false when added element is missing', () => {
    const el = makeElement({ id: 'e1' });
    const board = createTestBoard();
    expect(doesBoardMatchOperations(board, [{ type: 'element.added', element: el }])).toBe(false);
  });

  it('should return true when element.deleted is already gone', () => {
    const board = createTestBoard();
    expect(doesBoardMatchOperations(board, [{ type: 'element.deleted', elementId: 'gone' }])).toBe(true);
  });

  it('should return false when element.deleted target still exists', () => {
    const el = makeElement({ id: 'e1' });
    const board = createTestBoard([el]);
    expect(doesBoardMatchOperations(board, [{ type: 'element.deleted', elementId: 'e1' }])).toBe(false);
  });

  it('should match elements.deleted when all are gone', () => {
    const board = createTestBoard();
    expect(doesBoardMatchOperations(board, [{ type: 'elements.deleted', elementIds: ['a', 'b'] }])).toBe(true);
  });

  it('should not match elements.deleted when some remain', () => {
    const el = makeElement({ id: 'a' });
    const board = createTestBoard([el]);
    expect(doesBoardMatchOperations(board, [{ type: 'elements.deleted', elementIds: ['a', 'b'] }])).toBe(false);
  });

  it('should match metadata operation when board already has values', () => {
    const board = createTestBoard();
    board.title = 'X';
    expect(doesBoardMatchOperations(board, [{
      type: 'board.metadata.updated',
      title: 'X',
    }])).toBe(true);
  });

  it('should not match metadata when title differs', () => {
    const board = createTestBoard();
    board.title = 'Y';
    expect(doesBoardMatchOperations(board, [{
      type: 'board.metadata.updated',
      title: 'X',
    }])).toBe(false);
  });
});

// ── creation helpers ──────────────────────────────────────────────────

describe('operation creation helpers', () => {
  it('createElementAddedOperation clones element', () => {
    const el = makeElement({ id: 'h1' });
    const op = createElementAddedOperation(el);
    expect(op.type).toBe('element.added');
    expect((op as { element: BoardElement }).element).not.toBe(el);
  });

  it('createElementUpdatedOperation clones element', () => {
    const el = makeElement({ id: 'h2' });
    const op = createElementUpdatedOperation(el);
    expect(op.type).toBe('element.updated');
    expect((op as { element: BoardElement }).element).not.toBe(el);
  });

  it('createElementDeletedOperation', () => {
    const op = createElementDeletedOperation('d1');
    expect(op).toEqual({ type: 'element.deleted', elementId: 'd1' });
  });

  it('createElementsDeletedOperation singles out one id', () => {
    const op = createElementsDeletedOperation(['d1']);
    expect(op.type).toBe('element.deleted');
  });

  it('createElementsDeletedOperation for multiple ids', () => {
    const op = createElementsDeletedOperation(['d1', 'd2']);
    expect(op.type).toBe('elements.deleted');
  });

  it('createBoardMetadataUpdatedOperation clones arrays', () => {
    const colors = ['#aaa'];
    const presets = [{ id: 'p1', label: 'Note', fillColor: '#ccc' }];
    const op = createBoardMetadataUpdatedOperation({
      title: 'T',
      labelOutlineEnabled: true,
      arrowOutlineEnabled: true,
      surfaceColor: null,
      themeKey: null,
      customColors: colors,
      recentColors: [],
      stickyNotePresets: presets,
    });
    expect(op.type).toBe('board.metadata.updated');
    const meta = op as { customColors: string[]; stickyNotePresets: { id: string }[] };
    expect(meta.customColors).not.toBe(colors);
    expect(meta.stickyNotePresets).not.toBe(presets);
  });
});
