import type { BoardElement } from '../../types/models';

type BoardElementType = BoardElement['$type'];
type BoardElementLike = Partial<Record<string, unknown>> & { $type?: unknown };

const BOARD_ELEMENT_TYPES = new Set<BoardElementType>([
  'shape',
  'text',
  'richtext',
  'markdown',
  'sticky',
  'frame',
  'arrow',
  'icon',
  'file',
  'drawing',
]);

export function inferBoardElementType(element: BoardElementLike): BoardElementType | null {
  if (typeof element.$type === 'string' && BOARD_ELEMENT_TYPES.has(element.$type as BoardElementType)) {
    return element.$type as BoardElementType;
  }

  if ('shapeType' in element) {
    return 'shape';
  }
  if ('html' in element) {
    return 'richtext';
  }
  if ('markdown' in element) {
    return 'markdown';
  }
  if ('text' in element) {
    return 'fillColor' in element ? 'sticky' : 'text';
  }
  if ('iconName' in element) {
    return 'icon';
  }
  if ('points' in element) {
    return 'drawing';
  }
  if ('contentType' in element || 'fileUrl' in element) {
    return 'file';
  }
  if ('sourceElementId' in element || 'targetElementId' in element || 'routeStyle' in element || 'sourceX' in element || 'targetX' in element) {
    return 'arrow';
  }
  if ('fillColor' in element && 'strokeColor' in element) {
    return 'frame';
  }

  return null;
}

export function ensureBoardElementTypeDiscriminator<T extends BoardElement>(element: T): T {
  const inferredType = inferBoardElementType(element as unknown as BoardElementLike);
  if (!inferredType || element.$type === inferredType) {
    return element;
  }

  return {
    ...element,
    $type: inferredType,
  } as T;
}

export function ensureBoardElementsTypeDiscriminators<T extends BoardElement>(elements: readonly T[]): T[] {
  return elements.map((element) => ensureBoardElementTypeDiscriminator(element));
}
