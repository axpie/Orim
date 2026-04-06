import type { BoardElement } from '../../types/models';

export type ZOrderAction =
  | 'bring-to-front'
  | 'bring-forward'
  | 'send-backward'
  | 'send-to-back';

export type ZOrderAvailability = Record<ZOrderAction, boolean>;

export interface ZOrderResult {
  elements: BoardElement[];
  changedIds: string[];
  effectiveSelectedIds: string[];
}

const ACTIONS: ZOrderAction[] = [
  'bring-to-front',
  'bring-forward',
  'send-backward',
  'send-to-back',
];

function sortElementsByZIndex(elements: readonly BoardElement[]): BoardElement[] {
  return [...elements].sort((left, right) => {
    const zOrder = (left.zIndex ?? 0) - (right.zIndex ?? 0);
    return zOrder !== 0 ? zOrder : left.id.localeCompare(right.id);
  });
}

function expandSelectionWithGroups(
  elements: readonly BoardElement[],
  selectedIds: Iterable<string>,
): Set<string> {
  const selection = new Set(selectedIds);
  if (selection.size === 0) {
    return selection;
  }

  const selectedGroupIds = new Set(
    elements
      .filter((element) => selection.has(element.id) && element.groupId)
      .map((element) => element.groupId as string),
  );

  if (selectedGroupIds.size === 0) {
    return selection;
  }

  for (const element of elements) {
    if (element.groupId && selectedGroupIds.has(element.groupId)) {
      selection.add(element.id);
    }
  }

  return selection;
}

function moveSelectionToExtreme(
  orderedElements: readonly BoardElement[],
  selectedIds: ReadonlySet<string>,
  action: Extract<ZOrderAction, 'bring-to-front' | 'send-to-back'>,
): BoardElement[] {
  const selected = orderedElements.filter((element) => selectedIds.has(element.id));
  const unselected = orderedElements.filter((element) => !selectedIds.has(element.id));
  return action === 'send-to-back'
    ? [...selected, ...unselected]
    : [...unselected, ...selected];
}

function moveSelectionOneStep(
  orderedElements: readonly BoardElement[],
  selectedIds: ReadonlySet<string>,
  action: Extract<ZOrderAction, 'bring-forward' | 'send-backward'>,
): BoardElement[] {
  const next = [...orderedElements];

  if (action === 'bring-forward') {
    for (let index = next.length - 2; index >= 0; index -= 1) {
      if (selectedIds.has(next[index].id) && !selectedIds.has(next[index + 1].id)) {
        [next[index], next[index + 1]] = [next[index + 1], next[index]];
      }
    }

    return next;
  }

  for (let index = 1; index < next.length; index += 1) {
    if (selectedIds.has(next[index].id) && !selectedIds.has(next[index - 1].id)) {
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
    }
  }

  return next;
}

function reorderPartition(
  orderedElements: readonly BoardElement[],
  selectedIds: ReadonlySet<string>,
  action: ZOrderAction,
): BoardElement[] {
  if (orderedElements.length === 0) {
    return [];
  }

  const selectedCount = orderedElements.filter((element) => selectedIds.has(element.id)).length;
  if (selectedCount === 0) {
    return [...orderedElements];
  }

  if (action === 'bring-to-front' || action === 'send-to-back') {
    return moveSelectionToExtreme(orderedElements, selectedIds, action);
  }

  return moveSelectionOneStep(orderedElements, selectedIds, action);
}

export function applyZOrderAction(
  elements: readonly BoardElement[],
  selectedIds: Iterable<string>,
  action: ZOrderAction,
): ZOrderResult {
  const effectiveSelection = expandSelectionWithGroups(elements, selectedIds);
  if (effectiveSelection.size === 0) {
    return { elements: [...elements], changedIds: [], effectiveSelectedIds: [] };
  }

  const orderedFrames = reorderPartition(
    sortElementsByZIndex(elements.filter((element) => element.$type === 'frame')),
    effectiveSelection,
    action,
  );
  const orderedNonFrames = reorderPartition(
    sortElementsByZIndex(elements.filter((element) => element.$type !== 'frame')),
    effectiveSelection,
    action,
  );
  const orderedElements = [...orderedFrames, ...orderedNonFrames];

  const updatedZIndexById = new Map<string, number>();
  orderedElements.forEach((element, index) => {
    if ((element.zIndex ?? 0) !== index) {
      updatedZIndexById.set(element.id, index);
    }
  });

  if (updatedZIndexById.size === 0) {
    return {
      elements: [...elements],
      changedIds: [],
      effectiveSelectedIds: elements
        .filter((element) => effectiveSelection.has(element.id))
        .map((element) => element.id),
    };
  }

  return {
    elements: elements.map((element) => {
      const nextZIndex = updatedZIndexById.get(element.id);
      return nextZIndex == null
        ? element
        : { ...element, zIndex: nextZIndex };
    }),
    changedIds: [...updatedZIndexById.keys()],
    effectiveSelectedIds: elements
      .filter((element) => effectiveSelection.has(element.id))
      .map((element) => element.id),
  };
}

export function getZOrderAvailability(
  elements: readonly BoardElement[],
  selectedIds: Iterable<string>,
): ZOrderAvailability {
  return Object.fromEntries(
    ACTIONS.map((action) => [action, applyZOrderAction(elements, selectedIds, action).changedIds.length > 0]),
  ) as ZOrderAvailability;
}

export function getZOrderShortcutLabel(action: ZOrderAction): string {
  switch (action) {
    case 'bring-to-front':
      return 'Cmd/Ctrl + Shift + ]';
    case 'bring-forward':
      return 'Cmd/Ctrl + ]';
    case 'send-backward':
      return 'Cmd/Ctrl + [';
    case 'send-to-back':
      return 'Cmd/Ctrl + Shift + [';
    default:
      return '';
  }
}

export function getZOrderActionFromKeyboardEvent(event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'key' | 'code'>): ZOrderAction | null {
  const hasPrimaryModifier = event.ctrlKey || event.metaKey;
  if (!hasPrimaryModifier) {
    return null;
  }

  if (!event.altKey && (event.code === 'BracketRight' || event.key === ']')) {
    return event.shiftKey ? 'bring-to-front' : 'bring-forward';
  }

  if (!event.altKey && (event.code === 'BracketLeft' || event.key === '[')) {
    return event.shiftKey ? 'send-to-back' : 'send-backward';
  }

  if (event.altKey && event.code === 'ArrowUp') {
    return event.shiftKey ? 'bring-to-front' : 'bring-forward';
  }

  if (event.altKey && event.code === 'ArrowDown') {
    return event.shiftKey ? 'send-to-back' : 'send-backward';
  }

  return null;
}
