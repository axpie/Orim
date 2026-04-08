import type { CursorPresence } from '../../../types/models';

export function mergeCursorPresence(previous: CursorPresence[], next: CursorPresence[]): CursorPresence[] {
  const previousByClientId = new Map(previous.map((cursor) => [cursor.clientId, cursor]));
  const nextByClientId = new Map(next.map((cursor) => {
    const existing = previousByClientId.get(cursor.clientId);
    return [cursor.clientId, {
      ...existing,
      ...cursor,
      worldX: cursor.worldX ?? existing?.worldX ?? null,
      worldY: cursor.worldY ?? existing?.worldY ?? null,
    }];
  }));

  const merged: CursorPresence[] = [];

  for (const cursor of previous) {
    const updated = nextByClientId.get(cursor.clientId);
    if (!updated) {
      continue;
    }

    merged.push(updated);
    nextByClientId.delete(cursor.clientId);
  }

  for (const cursor of next) {
    const added = nextByClientId.get(cursor.clientId);
    if (!added) {
      continue;
    }

    merged.push(added);
    nextByClientId.delete(cursor.clientId);
  }

  return merged;
}
