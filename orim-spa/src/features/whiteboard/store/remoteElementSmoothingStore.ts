import { create } from 'zustand';

const SMOOTHING_MS = 70;
const POSITION_EPSILON = 0.5;

interface SmoothEntry {
  renderedX: number;
  renderedY: number;
  targetX: number;
  targetY: number;
}

interface RemoteElementSmoothingState {
  entries: Record<string, SmoothEntry>;
  setTarget: (id: string, targetX: number, targetY: number, currentX: number, currentY: number) => void;
  step: (deltaMs: number) => boolean;
  clearAll: () => void;
}

export const useRemoteElementSmoothingStore = create<RemoteElementSmoothingState>()((set, get) => ({
  entries: {},

  setTarget: (id, targetX, targetY, currentX, currentY) => {
    const current = get().entries[id];
    if (current) {
      if (current.targetX === targetX && current.targetY === targetY) {
        return;
      }

      set((state) => ({
        entries: { ...state.entries, [id]: { ...current, targetX, targetY } },
      }));
    } else {
      if (currentX === targetX && currentY === targetY) {
        return;
      }

      set((state) => ({
        entries: {
          ...state.entries,
          [id]: { renderedX: currentX, renderedY: currentY, targetX, targetY },
        },
      }));
    }
  },

  step: (deltaMs) => {
    const smoothing = 1 - Math.exp(-deltaMs / SMOOTHING_MS);
    const { entries } = get();
    const nextEntries: Record<string, SmoothEntry> = {};
    let hasMovement = false;

    for (const [id, entry] of Object.entries(entries)) {
      const dx = entry.targetX - entry.renderedX;
      const dy = entry.targetY - entry.renderedY;

      if (Math.abs(dx) <= POSITION_EPSILON && Math.abs(dy) <= POSITION_EPSILON) {
        // Settled — drop the entry so the element renders from board state directly
        continue;
      }

      hasMovement = true;
      nextEntries[id] = {
        ...entry,
        renderedX: entry.renderedX + dx * smoothing,
        renderedY: entry.renderedY + dy * smoothing,
      };
    }

    set({ entries: nextEntries });
    return hasMovement;
  },

  clearAll: () => set({ entries: {} }),
}));

/**
 * Call this BEFORE applying the remote operation to the board store so that
 * `currentX/Y` reflects the element's position prior to the update.
 */
export function notifyRemoteElementMoved(
  elementId: string,
  targetX: number,
  targetY: number,
  currentX: number,
  currentY: number,
) {
  useRemoteElementSmoothingStore.getState().setTarget(elementId, targetX, targetY, currentX, currentY);
}
