import { describe, it, expect } from 'vitest';
import { deriveBoardSyncStatus } from '../boardSyncStatus';

describe('deriveBoardSyncStatus', () => {
  const defaults = {
    connectionState: 'connected' as const,
    lastError: null,
    isDirty: false,
    outboxCount: 0,
    isSaving: false,
    saveError: null as unknown,
  };

  // ── connected states ────────────────────────────────────────────────

  it('should return saved when connected, clean, no outbox', () => {
    const status = deriveBoardSyncStatus(defaults);
    expect(status.kind).toBe('saved');
    expect(status.hasPendingChanges).toBe(false);
    expect(status.queuedChangesCount).toBe(0);
  });

  it('should return unsaved when connected and dirty', () => {
    const status = deriveBoardSyncStatus({ ...defaults, isDirty: true });
    expect(status.kind).toBe('unsaved');
    expect(status.hasPendingChanges).toBe(true);
  });

  it('should return unsyncedChanges when connected with outbox items', () => {
    const status = deriveBoardSyncStatus({ ...defaults, outboxCount: 3 });
    expect(status.kind).toBe('unsyncedChanges');
    expect(status.hasPendingChanges).toBe(true);
    expect(status.queuedChangesCount).toBe(3);
  });

  it('should return saving when isSaving is true', () => {
    const status = deriveBoardSyncStatus({ ...defaults, isSaving: true });
    expect(status.kind).toBe('saving');
  });

  it('should prioritise saving over unsaved', () => {
    const status = deriveBoardSyncStatus({ ...defaults, isSaving: true, isDirty: true });
    expect(status.kind).toBe('saving');
    expect(status.hasPendingChanges).toBe(true);
  });

  // ── save error ──────────────────────────────────────────────────────

  it('should return saveError when saveError is a string', () => {
    const status = deriveBoardSyncStatus({ ...defaults, saveError: 'timeout' });
    expect(status.kind).toBe('saveError');
    expect(status.detail).toBe('timeout');
  });

  it('should return saveError when saveError is an Error', () => {
    const status = deriveBoardSyncStatus({ ...defaults, saveError: new Error('boom') });
    expect(status.kind).toBe('saveError');
    expect(status.detail).toBe('boom');
  });

  it('should return saveError when saveError has response.data string', () => {
    const status = deriveBoardSyncStatus({
      ...defaults,
      saveError: { response: { data: 'server error' } },
    });
    expect(status.kind).toBe('saveError');
    expect(status.detail).toBe('server error');
  });

  it('should extract error from response.data.error', () => {
    const status = deriveBoardSyncStatus({
      ...defaults,
      saveError: { response: { data: { error: 'field error' } } },
    });
    expect(status.kind).toBe('saveError');
    expect(status.detail).toBe('field error');
  });

  it('should extract message from response.data.message', () => {
    const status = deriveBoardSyncStatus({
      ...defaults,
      saveError: { response: { data: { message: 'msg' } } },
    });
    expect(status.kind).toBe('saveError');
    expect(status.detail).toBe('msg');
  });

  it('should extract title from response.data.title', () => {
    const status = deriveBoardSyncStatus({
      ...defaults,
      saveError: { response: { data: { title: 'Validation Error' } } },
    });
    expect(status.kind).toBe('saveError');
    expect(status.detail).toBe('Validation Error');
  });

  it('should fall back to message property on error object', () => {
    const status = deriveBoardSyncStatus({
      ...defaults,
      saveError: { message: 'fallback msg' },
    });
    expect(status.kind).toBe('saveError');
    expect(status.detail).toBe('fallback msg');
  });

  it('should not treat whitespace-only saveError string as error', () => {
    const status = deriveBoardSyncStatus({ ...defaults, saveError: '   ' });
    expect(status.kind).not.toBe('saveError');
  });

  it('saveError takes precedence over connection state', () => {
    const status = deriveBoardSyncStatus({
      ...defaults,
      connectionState: 'reconnecting',
      saveError: 'oops',
    });
    expect(status.kind).toBe('saveError');
  });

  // ── connecting ──────────────────────────────────────────────────────

  it('should return connecting', () => {
    const status = deriveBoardSyncStatus({ ...defaults, connectionState: 'connecting' });
    expect(status.kind).toBe('connecting');
  });

  it('should include lastError in connecting detail', () => {
    const status = deriveBoardSyncStatus({
      ...defaults,
      connectionState: 'connecting',
      lastError: 'retry',
    });
    expect(status.detail).toBe('retry');
  });

  // ── reconnecting ───────────────────────────────────────────────────

  it('should return reconnecting', () => {
    const status = deriveBoardSyncStatus({ ...defaults, connectionState: 'reconnecting' });
    expect(status.kind).toBe('reconnecting');
  });

  it('should report hasPendingChanges during reconnect with outbox', () => {
    const status = deriveBoardSyncStatus({
      ...defaults,
      connectionState: 'reconnecting',
      outboxCount: 2,
    });
    expect(status.hasPendingChanges).toBe(true);
    expect(status.queuedChangesCount).toBe(2);
  });

  // ── disconnected ───────────────────────────────────────────────────

  it('should return offline when disconnected without error', () => {
    const status = deriveBoardSyncStatus({ ...defaults, connectionState: 'disconnected' });
    expect(status.kind).toBe('offline');
  });

  it('should return connectionError when disconnected with error', () => {
    const status = deriveBoardSyncStatus({
      ...defaults,
      connectionState: 'disconnected',
      lastError: 'server unreachable',
    });
    expect(status.kind).toBe('connectionError');
    expect(status.detail).toBe('server unreachable');
  });
});
