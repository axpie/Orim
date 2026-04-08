import { describe, expect, it } from 'vitest';
import type { CursorPresence } from '../../../../types/models';
import { mergeCursorPresence } from '../mergeCursorPresence';

function createCursor(overrides: Partial<CursorPresence> & Pick<CursorPresence, 'clientId' | 'displayName'>): CursorPresence {
  return {
    clientId: overrides.clientId,
    displayName: overrides.displayName,
    colorHex: overrides.colorHex ?? '#2563eb',
    userId: overrides.userId ?? null,
    worldX: overrides.worldX ?? null,
    worldY: overrides.worldY ?? null,
    selectedElementIds: overrides.selectedElementIds ?? [],
    updatedAtUtc: overrides.updatedAtUtc ?? '2026-04-08T18:13:03.247Z',
  };
}

describe('mergeCursorPresence', () => {
  it('keeps the previous collaborator order when an existing cursor updates', () => {
    const previous = [
      createCursor({ clientId: 'a', displayName: 'Alex', worldX: 10, worldY: 20 }),
      createCursor({ clientId: 'm', displayName: 'Marcel', worldX: 30, worldY: 40 }),
      createCursor({ clientId: 'r', displayName: 'Ralf', worldX: 50, worldY: 60 }),
    ];

    const merged = mergeCursorPresence(previous, [
      previous[0],
      previous[2],
      createCursor({ clientId: 'm', displayName: 'Marcel', selectedElementIds: ['shape-1'] }),
    ]);

    expect(merged.map((cursor) => cursor.clientId)).toEqual(['a', 'm', 'r']);
    expect(merged[1]).toMatchObject({
      clientId: 'm',
      displayName: 'Marcel',
      selectedElementIds: ['shape-1'],
      worldX: 30,
      worldY: 40,
    });
  });

  it('removes missing collaborators and appends newly joined ones after the existing order', () => {
    const previous = [
      createCursor({ clientId: 'p', displayName: 'Pragmatic Process Wizardd' }),
      createCursor({ clientId: 'm', displayName: 'Marcel' }),
      createCursor({ clientId: 'a', displayName: 'Alex' }),
    ];

    const merged = mergeCursorPresence(previous, [
      createCursor({ clientId: 'a', displayName: 'Alex' }),
      createCursor({ clientId: 'r', displayName: 'Ralf' }),
      createCursor({ clientId: 'm', displayName: 'Marcel' }),
    ]);

    expect(merged.map((cursor) => cursor.clientId)).toEqual(['m', 'a', 'r']);
  });
});
