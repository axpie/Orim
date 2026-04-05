import { describe, expect, it } from 'vitest';
import { areAllSelectedElementsLocked, canDeleteSelection, hasLockedSelection } from '../selectionLocking';

describe('selectionLocking', () => {
  it('detects when a selection contains locked elements', () => {
    expect(hasLockedSelection([{ isLocked: false }, { isLocked: true }])).toBe(true);
    expect(hasLockedSelection([{ isLocked: false }, { isLocked: false }])).toBe(false);
  });

  it('detects when a selection is fully locked', () => {
    expect(areAllSelectedElementsLocked([{ isLocked: true }, { isLocked: true }])).toBe(true);
    expect(areAllSelectedElementsLocked([{ isLocked: true }, { isLocked: false }])).toBe(false);
    expect(areAllSelectedElementsLocked([])).toBe(false);
  });

  it('blocks deletion whenever a locked element is part of the selection', () => {
    expect(canDeleteSelection([{ isLocked: false }])).toBe(true);
    expect(canDeleteSelection([{ isLocked: false }, { isLocked: true }])).toBe(false);
    expect(canDeleteSelection([{ isLocked: true }])).toBe(false);
    expect(canDeleteSelection([])).toBe(false);
  });
});
