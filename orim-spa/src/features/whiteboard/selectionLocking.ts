import type { BoardElement } from '../../types/models';

type LockableElement = Pick<BoardElement, 'isLocked'>;

export function hasLockedSelection(elements: readonly LockableElement[]): boolean {
  return elements.some((element) => element.isLocked === true);
}

export function areAllSelectedElementsLocked(elements: readonly LockableElement[]): boolean {
  return elements.length > 0 && elements.every((element) => element.isLocked === true);
}

export function canDeleteSelection(elements: readonly LockableElement[]): boolean {
  return elements.length > 0 && !hasLockedSelection(elements);
}
