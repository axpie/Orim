import type { Board, BoardElement, BoardOperation } from '../../../types/models';

export type BoardOperationPayload = BoardOperation | BoardOperation[];

function areArraysEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (!Object.is(left[index], right[index])) {
      return false;
    }
  }

  return true;
}

function areElementsEqual(left: BoardElement, right: BoardElement): boolean {
  if (left === right) {
    return true;
  }

  const leftRecord = left as unknown as Record<string, unknown>;
  const rightRecord = right as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);

  for (const key of keys) {
    const leftValue = leftRecord[key];
    const rightValue = rightRecord[key];

    if (Array.isArray(leftValue) || Array.isArray(rightValue)) {
      if (!Array.isArray(leftValue) || !Array.isArray(rightValue) || !areArraysEqual(leftValue, rightValue)) {
        return false;
      }
      continue;
    }

    if (!Object.is(leftValue, rightValue)) {
      return false;
    }
  }

  return true;
}

function findElement(elements: BoardElement[], elementId: string): BoardElement | undefined {
  return elements.find((element) => element.id === elementId);
}

export function createElementAddedOperation(element: BoardElement): BoardOperation {
  return {
    type: 'element.added',
    element: structuredClone(element),
  };
}

export function createElementUpdatedOperation(element: BoardElement): BoardOperation {
  return {
    type: 'element.updated',
    element: structuredClone(element),
  };
}

export function createElementDeletedOperation(elementId: string): BoardOperation {
  return {
    type: 'element.deleted',
    elementId,
  };
}

export function createElementsDeletedOperation(elementIds: string[]): BoardOperation {
  if (elementIds.length === 1) {
    return createElementDeletedOperation(elementIds[0]);
  }

  return {
    type: 'elements.deleted',
    elementIds: [...elementIds],
  };
}

export function createBoardMetadataUpdatedOperation(
  board: Pick<Board, 'title' | 'labelOutlineEnabled' | 'arrowOutlineEnabled' | 'customColors' | 'recentColors'>,
): BoardOperation {
  return {
    type: 'board.metadata.updated',
    title: board.title,
    labelOutlineEnabled: board.labelOutlineEnabled,
    arrowOutlineEnabled: board.arrowOutlineEnabled,
    customColors: [...board.customColors],
    recentColors: [...board.recentColors],
  };
}

export function haveBoardElementsChanged(before: BoardElement[], after: BoardElement[]): boolean {
  if (before.length !== after.length) {
    return true;
  }

  const afterById = new Map(after.map((element) => [element.id, element]));
  if (afterById.size !== before.length) {
    return true;
  }

  for (const previous of before) {
    const next = afterById.get(previous.id);
    if (!next || !areElementsEqual(previous, next)) {
      return true;
    }
  }

  return false;
}

export function deriveElementOperations(before: BoardElement[], after: BoardElement[]): BoardOperation[] {
  const operations: BoardOperation[] = [];
  const beforeById = new Map(before.map((element) => [element.id, element]));
  const afterById = new Map(after.map((element) => [element.id, element]));

  for (const element of after) {
    const previous = beforeById.get(element.id);
    if (!previous) {
      operations.push(createElementAddedOperation(element));
      continue;
    }

    if (!areElementsEqual(previous, element)) {
      operations.push(createElementUpdatedOperation(element));
    }
  }

  const deletedIds = before
    .filter((element) => !afterById.has(element.id))
    .map((element) => element.id);

  if (deletedIds.length === 1) {
    operations.push(createElementDeletedOperation(deletedIds[0]));
  } else if (deletedIds.length > 1) {
    operations.push(createElementsDeletedOperation(deletedIds));
  }

  return operations;
}

export function applyBoardOperation(board: Board, operation: BoardOperation): Board {
  switch (operation.type) {
    case 'element.added': {
      const exists = board.elements.some((element) => element.id === operation.element.id);
      return {
        ...board,
        elements: exists
          ? board.elements.map((element) => element.id === operation.element.id ? operation.element : element)
          : [...board.elements, operation.element],
      };
    }
    case 'element.updated':
      return {
        ...board,
        elements: board.elements.map((element) => element.id === operation.element.id ? operation.element : element),
      };
    case 'element.deleted':
      return {
        ...board,
        elements: board.elements.filter((element) => element.id !== operation.elementId),
      };
    case 'elements.deleted': {
      const deletedIds = new Set(operation.elementIds);
      return {
        ...board,
        elements: board.elements.filter((element) => !deletedIds.has(element.id)),
      };
    }
    case 'board.metadata.updated':
      return {
        ...board,
        title: operation.title ?? board.title,
        labelOutlineEnabled: operation.labelOutlineEnabled ?? board.labelOutlineEnabled,
        arrowOutlineEnabled: operation.arrowOutlineEnabled ?? board.arrowOutlineEnabled,
        customColors: operation.customColors ?? board.customColors,
        recentColors: operation.recentColors ?? board.recentColors,
      };
    default:
      return board;
  }
}

export function applyBoardOperations(board: Board, operations: BoardOperation[]): Board {
  return operations.reduce((currentBoard, operation) => applyBoardOperation(currentBoard, operation), board);
}

function doesBoardMatchOperation(board: Board, operation: BoardOperation): boolean {
  switch (operation.type) {
    case 'element.added':
    case 'element.updated': {
      const current = findElement(board.elements, operation.element.id);
      return !!current && areElementsEqual(current, operation.element);
    }
    case 'element.deleted':
      return !findElement(board.elements, operation.elementId);
    case 'elements.deleted':
      return operation.elementIds.every((elementId) => !findElement(board.elements, elementId));
    case 'board.metadata.updated':
      return (operation.title === undefined || board.title === operation.title)
        && (operation.labelOutlineEnabled === undefined || board.labelOutlineEnabled === operation.labelOutlineEnabled)
        && (operation.arrowOutlineEnabled === undefined || board.arrowOutlineEnabled === operation.arrowOutlineEnabled)
        && (operation.customColors === undefined || areArraysEqual(board.customColors, operation.customColors))
        && (operation.recentColors === undefined || areArraysEqual(board.recentColors, operation.recentColors));
    default:
      return true;
  }
}

export function doesBoardMatchOperations(board: Board, operations: BoardOperation[]): boolean {
  return operations.every((operation) => doesBoardMatchOperation(board, operation));
}

export function asOperationPayload(operations: BoardOperation[]): BoardOperationPayload | undefined {
  if (operations.length === 0) {
    return undefined;
  }

  return operations.length === 1 ? operations[0] : operations;
}
