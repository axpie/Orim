import type { BoardElement } from '../../../types/models';

const CLIPBOARD_STORAGE_KEY = 'orim:whiteboard:clipboard';
const CLIPBOARD_PREFIX = 'ORIM_WHITEBOARD_CLIPBOARD:';

let inMemoryClipboard: BoardElement[] = [];

export function getClipboardElements(): BoardElement[] {
  return inMemoryClipboard;
}

export function setClipboardElements(elements: BoardElement[]): void {
  inMemoryClipboard = elements;
}

export function serializeClipboardElements(elements: BoardElement[]): string {
  return `${CLIPBOARD_PREFIX}${JSON.stringify({ version: 1, elements })}`;
}

export function deserializeClipboardPayload(rawValue: string | null | undefined): BoardElement[] | null {
  if (!rawValue || !rawValue.startsWith(CLIPBOARD_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue.slice(CLIPBOARD_PREFIX.length)) as { elements?: BoardElement[] };
    return Array.isArray(parsed.elements) ? parsed.elements : null;
  } catch {
    return null;
  }
}

export function persistClipboardPayload(payload: string): void {
  try {
    window.localStorage.setItem(CLIPBOARD_STORAGE_KEY, payload);
  } catch {
    // Ignore storage access failures.
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(payload).catch(() => {
      // Ignore clipboard write failures and keep local fallback.
    });
  }
}

export function readStoredClipboardElements(): BoardElement[] | null {
  try {
    return deserializeClipboardPayload(window.localStorage.getItem(CLIPBOARD_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function hasClipboardElementsAvailable(): boolean {
  const storedElements = readStoredClipboardElements();
  return inMemoryClipboard.length > 0 || (storedElements?.length ?? 0) > 0;
}

export async function readBrowserClipboardElements(): Promise<BoardElement[] | 'unavailable' | null> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
    return 'unavailable';
  }

  try {
    const clipboardText = await navigator.clipboard.readText();
    return deserializeClipboardPayload(clipboardText);
  } catch {
    return 'unavailable';
  }
}
