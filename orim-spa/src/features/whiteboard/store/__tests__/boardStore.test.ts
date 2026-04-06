import { describe, it, expect, beforeEach } from 'vitest';
import { useBoardStore } from '../boardStore';
import type { Board, BoardElement } from '../../../../types/models';

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

function createTestElement(overrides: Partial<BoardElement> = {}): BoardElement {
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

describe('boardStore', () => {
  beforeEach(() => {
    useBoardStore.setState({
      board: null,
      _elementsMap: new Map(),
      selectedElementIds: [],
      isDirty: false,
      commandConflict: null,
    });
  });

  describe('setBoard', () => {
    it('should set board and build elements map', () => {
      const el = createTestElement({ id: 'e1' });
      const board = createTestBoard([el]);

      useBoardStore.getState().setBoard(board);

      const state = useBoardStore.getState();
      expect(state.board).toBe(board);
      expect(state._elementsMap.get('e1')).toBe(el);
      expect(state.isDirty).toBe(false);
    });

    it('should clear state when setting null', () => {
      const board = createTestBoard([createTestElement()]);
      useBoardStore.getState().setBoard(board);
      useBoardStore.getState().setBoard(null);

      const state = useBoardStore.getState();
      expect(state.board).toBeNull();
      expect(state._elementsMap.size).toBe(0);
      expect(state.selectedElementIds).toEqual([]);
    });

    it('should preserve selection for same board id', () => {
      const el = createTestElement({ id: 'e1' });
      const board = createTestBoard([el]);
      useBoardStore.getState().setBoard(board);
      useBoardStore.getState().setSelectedElementIds(['e1']);

      useBoardStore.getState().setBoard({ ...board, title: 'Updated' });
      expect(useBoardStore.getState().selectedElementIds).toEqual(['e1']);
    });

    it('should remove stale selections when element no longer exists', () => {
      const el = createTestElement({ id: 'e1' });
      const board = createTestBoard([el]);
      useBoardStore.getState().setBoard(board);
      useBoardStore.getState().setSelectedElementIds(['e1']);

      useBoardStore.getState().setBoard(createTestBoard([]));
      expect(useBoardStore.getState().selectedElementIds).toEqual([]);
    });

    it('should clear selection when setting a different board', () => {
      const el = createTestElement({ id: 'e1' });
      const board = createTestBoard([el]);
      useBoardStore.getState().setBoard(board);
      useBoardStore.getState().setSelectedElementIds(['e1']);

      const differentBoard = createTestBoard([el]);
      differentBoard.id = 'other-board-id';
      useBoardStore.getState().setBoard(differentBoard);
      expect(useBoardStore.getState().selectedElementIds).toEqual([]);
    });

    it('should clear commandConflict on setBoard', () => {
      useBoardStore.setState({
        commandConflict: { id: 1, direction: 'undo', reason: 'element-missing', elementIds: ['x'] },
      });
      useBoardStore.getState().setBoard(createTestBoard());
      expect(useBoardStore.getState().commandConflict).toBeNull();
    });
  });

  describe('addElement', () => {
    it('should add element and update map', () => {
      useBoardStore.getState().setBoard(createTestBoard());
      const el = createTestElement({ id: 'new-el' });

      useBoardStore.getState().addElement(el);

      const state = useBoardStore.getState();
      expect(state.board!.elements).toHaveLength(1);
      expect(state._elementsMap.get('new-el')).toBe(el);
      expect(state.isDirty).toBe(true);
    });

    it('should no-op when no board loaded', () => {
      const el = createTestElement({ id: 'x' });
      useBoardStore.getState().addElement(el);
      expect(useBoardStore.getState().board).toBeNull();
    });
  });

  describe('updateElement', () => {
    it('should update element by id with partial', () => {
      const el = createTestElement({ id: 'e1', x: 0 });
      useBoardStore.getState().setBoard(createTestBoard([el]));

      useBoardStore.getState().updateElement('e1', { x: 50 });

      const state = useBoardStore.getState();
      expect(state.board!.elements[0].x).toBe(50);
      expect(state._elementsMap.get('e1')!.x).toBe(50);
    });

    it('should update element by id with function', () => {
      const el = createTestElement({ id: 'e1', x: 10 });
      useBoardStore.getState().setBoard(createTestBoard([el]));

      useBoardStore.getState().updateElement('e1', (prev) => ({ ...prev, x: prev.x + 20 }));

      expect(useBoardStore.getState().board!.elements[0].x).toBe(30);
    });

    it('should no-op for missing element', () => {
      useBoardStore.getState().setBoard(createTestBoard());
      useBoardStore.getState().updateElement('nonexistent', { x: 50 });
      expect(useBoardStore.getState().isDirty).toBe(false);
    });
  });

  describe('removeElements', () => {
    it('should remove elements and clean selection', () => {
      const el1 = createTestElement({ id: 'e1' });
      const el2 = createTestElement({ id: 'e2' });
      useBoardStore.getState().setBoard(createTestBoard([el1, el2]));
      useBoardStore.getState().setSelectedElementIds(['e1', 'e2']);

      useBoardStore.getState().removeElements(['e1']);

      const state = useBoardStore.getState();
      expect(state.board!.elements).toHaveLength(1);
      expect(state.board!.elements[0].id).toBe('e2');
      expect(state._elementsMap.has('e1')).toBe(false);
      expect(state._elementsMap.has('e2')).toBe(true);
      expect(state.selectedElementIds).toEqual(['e2']);
    });

    it('should set isDirty when removing', () => {
      const el = createTestElement({ id: 'e1' });
      useBoardStore.getState().setBoard(createTestBoard([el]));

      useBoardStore.getState().removeElements(['e1']);
      expect(useBoardStore.getState().isDirty).toBe(true);
    });
  });

  describe('getElementById', () => {
    it('should return element by id in O(1)', () => {
      const el = createTestElement({ id: 'lookup-test' });
      useBoardStore.getState().setBoard(createTestBoard([el]));

      expect(useBoardStore.getState().getElementById('lookup-test')).toBe(el);
      expect(useBoardStore.getState().getElementById('nonexistent')).toBeUndefined();
    });
  });

  describe('setBoardTitle', () => {
    it('should update board title', () => {
      useBoardStore.getState().setBoard(createTestBoard());
      useBoardStore.getState().setBoardTitle('New Title');
      expect(useBoardStore.getState().board!.title).toBe('New Title');
    });

    it('should no-op when title is same', () => {
      const board = createTestBoard();
      useBoardStore.getState().setBoard(board);
      useBoardStore.getState().setBoardTitle('Test Board');
      expect(useBoardStore.getState().board).toBe(board);
    });
  });

  describe('updateBoard', () => {
    it('should update board with partial', () => {
      useBoardStore.getState().setBoard(createTestBoard());
      useBoardStore.getState().updateBoard({ title: 'Updated' });
      expect(useBoardStore.getState().board!.title).toBe('Updated');
      expect(useBoardStore.getState().isDirty).toBe(true);
    });

    it('should update board with function', () => {
      useBoardStore.getState().setBoard(createTestBoard());
      useBoardStore.getState().updateBoard((b) => ({ ...b, title: b.title + ' v2' }));
      expect(useBoardStore.getState().board!.title).toBe('Test Board v2');
    });
  });

  describe('setElements', () => {
    it('should replace elements and rebuild map', () => {
      const el1 = createTestElement({ id: 'e1' });
      useBoardStore.getState().setBoard(createTestBoard([el1]));

      const el2 = createTestElement({ id: 'e2' });
      useBoardStore.getState().setElements([el2]);

      const state = useBoardStore.getState();
      expect(state.board!.elements).toHaveLength(1);
      expect(state._elementsMap.has('e1')).toBe(false);
      expect(state._elementsMap.get('e2')).toBe(el2);
      expect(state.isDirty).toBe(true);
    });
  });

  describe('applyRemoteOperation', () => {
    it('should apply element.added operation', () => {
      useBoardStore.getState().setBoard(createTestBoard());
      const el = createTestElement({ id: 'remote-el' });

      useBoardStore.getState().applyRemoteOperation({
        type: 'element.added',
        element: el,
      });

      const state = useBoardStore.getState();
      expect(state.board!.elements).toHaveLength(1);
      expect(state._elementsMap.get('remote-el')).toBeDefined();
    });

    it('should apply element.updated operation', () => {
      const el = createTestElement({ id: 'e1', x: 0 });
      useBoardStore.getState().setBoard(createTestBoard([el]));

      const updated = createTestElement({ id: 'e1', x: 99 });
      useBoardStore.getState().applyRemoteOperation({
        type: 'element.updated',
        element: updated,
      });

      expect(useBoardStore.getState().board!.elements[0].x).toBe(99);
    });

    it('should apply element.deleted operation', () => {
      const el = createTestElement({ id: 'e1' });
      useBoardStore.getState().setBoard(createTestBoard([el]));

      useBoardStore.getState().applyRemoteOperation({
        type: 'element.deleted',
        elementId: 'e1',
      });

      const state = useBoardStore.getState();
      expect(state.board!.elements).toHaveLength(0);
      expect(state._elementsMap.has('e1')).toBe(false);
    });

    it('should clean selection for deleted elements', () => {
      const el = createTestElement({ id: 'e1' });
      useBoardStore.getState().setBoard(createTestBoard([el]));
      useBoardStore.getState().setSelectedElementIds(['e1']);

      useBoardStore.getState().applyRemoteOperation({
        type: 'element.deleted',
        elementId: 'e1',
      });

      expect(useBoardStore.getState().selectedElementIds).toEqual([]);
    });

    it('should no-op when no board loaded', () => {
      useBoardStore.getState().applyRemoteOperation({
        type: 'element.added',
        element: createTestElement(),
      });
      expect(useBoardStore.getState().board).toBeNull();
    });
  });

  describe('setSelectedElementIds', () => {
    it('should not update state when ids are equal', () => {
      useBoardStore.getState().setBoard(createTestBoard());
      useBoardStore.getState().setSelectedElementIds(['a', 'b']);
      const prev = useBoardStore.getState();
      useBoardStore.getState().setSelectedElementIds(['a', 'b']);
      expect(useBoardStore.getState()).toBe(prev);
    });
  });

  describe('setZoom', () => {
    it('should clamp zoom within bounds', () => {
      useBoardStore.getState().setZoom(0.05);
      expect(useBoardStore.getState().zoom).toBe(0.2);

      useBoardStore.getState().setZoom(10);
      expect(useBoardStore.getState().zoom).toBe(3.5);
    });
  });
});
