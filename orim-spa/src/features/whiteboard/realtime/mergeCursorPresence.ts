import type { CursorPresence } from '../../../types/models';

export function mergeCursorPresence(previous: CursorPresence[], next: CursorPresence[]): CursorPresence[] {
  const previousByClientId = new Map(previous.map((cursor) => [cursor.clientId, cursor]));
  return next.map((cursor) => {
    const existing = previousByClientId.get(cursor.clientId);
    return {
      ...existing,
      ...cursor,
      worldX: cursor.worldX ?? existing?.worldX ?? null,
      worldY: cursor.worldY ?? existing?.worldY ?? null,
    };
  });
}
