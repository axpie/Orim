import type { BoardElement, BoardOperation } from '../../../types/models';
import {
  createElementAddedOperation,
  createElementUpdatedOperation,
  createElementsDeletedOperation,
} from './boardOperations';

export interface LocalBoardCommand {
  forward: BoardOperation[];
  inverse: BoardOperation[];
  changedKeysByElementId?: Record<string, string[]>;
}

export interface BoardCommandExecution {
  direction: 'undo' | 'redo';
  operations: BoardOperation[];
  counterpartOperations: BoardOperation[];
  changedKeysByElementId: Record<string, string[]>;
}

export type BoardCommandConflictReason =
  | 'element-missing'
  | 'element-exists'
  | 'element-changed'
  | 'element-type-mismatch';

export interface BoardCommandConflict {
  id: number;
  direction: 'undo' | 'redo';
  reason: BoardCommandConflictReason;
  elementIds: string[];
}

export const ARROW_ENDPOINT_CHANGED_KEYS = [
  'sourceElementId',
  'sourceX',
  'sourceY',
  'sourceDock',
  'targetElementId',
  'targetX',
  'targetY',
  'targetDock',
  'orthogonalMiddleCoordinate',
] as const;

export const ARROW_ROUTE_HANDLE_CHANGED_KEYS = [
  'arcMidX',
  'arcMidY',
] as const;

function areValuesEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => Object.is(value, right[index]));
  }

  return Object.is(left, right);
}

function normalizeChangedKeysByElementId(
  changedKeysByElementId?: Record<string, readonly string[]>,
): Record<string, string[]> {
  if (!changedKeysByElementId) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(changedKeysByElementId).map(([elementId, changedKeys]) => [
      elementId,
      [...new Set(changedKeys)],
    ]),
  );
}

function hasTrackedChanges(
  beforeElement: BoardElement,
  afterElement: BoardElement,
  changedKeys: readonly string[],
): boolean {
  return changedKeys.some((key) => {
    const beforeValue = (beforeElement as unknown as Record<string, unknown>)[key];
    const afterValue = (afterElement as unknown as Record<string, unknown>)[key];
    return !areValuesEqual(beforeValue, afterValue);
  });
}

function normalizeOperations(operations: BoardOperation | BoardOperation[]): BoardOperation[] {
  return Array.isArray(operations) ? [...operations] : [operations];
}

export function createLocalBoardCommand(options: {
  forward: BoardOperation | BoardOperation[];
  inverse: BoardOperation | BoardOperation[];
  changedKeysByElementId?: Record<string, readonly string[]>;
}): LocalBoardCommand {
  return {
    forward: normalizeOperations(options.forward),
    inverse: normalizeOperations(options.inverse),
    changedKeysByElementId: normalizeChangedKeysByElementId(options.changedKeysByElementId),
  };
}

export function createChangedKeysByElementId(
  elementIds: Iterable<string>,
  changedKeys: readonly string[],
): Record<string, string[]> {
  const normalizedKeys = [...new Set(changedKeys)];
  return Object.fromEntries(
    [...new Set(elementIds)].map((elementId) => [elementId, normalizedKeys]),
  );
}

export function createAddElementsCommand(elements: BoardElement[]): LocalBoardCommand {
  if (elements.length === 0) {
    return { forward: [], inverse: [], changedKeysByElementId: {} };
  }

  return createLocalBoardCommand({
    forward: elements.map((element) => createElementAddedOperation(element)),
    inverse: createElementsDeletedOperation(elements.map((element) => element.id)),
  });
}

export function createDeleteElementsCommand(elements: BoardElement[]): LocalBoardCommand {
  if (elements.length === 0) {
    return { forward: [], inverse: [], changedKeysByElementId: {} };
  }

  return createLocalBoardCommand({
    forward: createElementsDeletedOperation(elements.map((element) => element.id)),
    inverse: elements.map((element) => createElementAddedOperation(element)),
  });
}

export function createElementUpdateCommand(
  beforeElements: BoardElement[],
  afterElements: BoardElement[],
  changedKeysByElementId?: Record<string, readonly string[]>,
): LocalBoardCommand {
  const normalizedChangedKeys = normalizeChangedKeysByElementId(changedKeysByElementId);
  const beforeById = new Map(beforeElements.map((element) => [element.id, element]));
  const afterById = new Map(afterElements.map((element) => [element.id, element]));

  const forward = afterElements
    .filter((afterElement) => {
      const beforeElement = beforeById.get(afterElement.id);
      if (!beforeElement) {
        return false;
      }

      const changedKeys = normalizedChangedKeys[afterElement.id]
        ?? [...new Set([...Object.keys(beforeElement), ...Object.keys(afterElement)])];
      return changedKeys.length > 0 && hasTrackedChanges(beforeElement, afterElement, changedKeys);
    })
    .map((element) => createElementUpdatedOperation(element));

  const inverse = beforeElements
    .filter((beforeElement) => {
      const afterElement = afterById.get(beforeElement.id);
      if (!afterElement) {
        return false;
      }

      const changedKeys = normalizedChangedKeys[beforeElement.id]
        ?? [...new Set([...Object.keys(beforeElement), ...Object.keys(afterElement)])];
      return changedKeys.length > 0 && hasTrackedChanges(beforeElement, afterElement, changedKeys);
    })
    .map((element) => createElementUpdatedOperation(element));

  return {
    forward,
    inverse,
    changedKeysByElementId: normalizedChangedKeys,
  };
}

export function formatBoardCommandConflict(conflict: BoardCommandConflict): string {
  const action = conflict.direction === 'undo' ? 'Undo' : 'Redo';

  switch (conflict.reason) {
    case 'element-missing':
      return `${action} couldn't be applied because at least one affected element was removed remotely.`;
    case 'element-exists':
      return `${action} couldn't be applied because at least one affected element already exists on the board.`;
    case 'element-changed':
      return `${action} couldn't be applied because at least one affected element was changed remotely.`;
    case 'element-type-mismatch':
      return `${action} couldn't be applied because an affected element no longer has the expected type.`;
    default:
      return `${action} couldn't be applied because the board changed meanwhile.`;
  }
}
