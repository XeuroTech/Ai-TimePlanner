import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * use-auto-backup.ts subscribes directly to the planner/habits zustand stores
 * (`store.subscribe(cb)`), so those two are faked as minimal real pub/sub
 * stores rather than plain objects — the debounce logic under test genuinely
 * depends on the subscription firing. useBackupStore and AppState are simpler
 * to just stub outright.
 */
const mocks = vi.hoisted(() => {
  function makeSubscribable<T extends object>(initial: T) {
    let state = initial;
    const listeners = new Set<() => void>();
    return {
      getState: () => state,
      setState: (partial: Partial<T>) => {
        state = { ...state, ...partial };
        listeners.forEach((l) => l());
      },
      subscribe: (cb: () => void) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    };
  }
  return {
    planner: makeSubscribable({}),
    habits: makeSubscribable({}),
    backupState: { autoSync: false, connected: false, lastBackupAt: null as number | null, phase: 'idle' as string, hydrate: vi.fn(async () => {}), backupNow: vi.fn(async () => ({ ok: true })) },
    appStateHandlers: new Set<(state: string) => void>(),
  };
});

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: vi.fn((_event: string, cb: (state: string) => void) => {
      mocks.appStateHandlers.add(cb);
      return { remove: () => mocks.appStateHandlers.delete(cb) };
    }),
  },
}));
vi.mock('@/store/planner-store', () => ({ usePlannerStore: mocks.planner }));
vi.mock('@/store/habits-store', () => ({ useHabitsStore: mocks.habits }));
vi.mock('@/store/backup-store', () => ({
  useBackupStore: Object.assign((selector: (s: typeof mocks.backupState) => unknown) => selector(mocks.backupState), {
    getState: () => mocks.backupState,
  }),
}));

import { useAutoBackup } from './use-auto-backup';

function fireAppState(state: string) {
  mocks.appStateHandlers.forEach((h) => h(state));
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.appStateHandlers.clear();
  mocks.backupState.autoSync = false;
  mocks.backupState.connected = false;
  mocks.backupState.lastBackupAt = null;
  mocks.backupState.phase = 'idle';
  mocks.backupState.hydrate = vi.fn(async () => {});
  mocks.backupState.backupNow = vi.fn(async () => ({ ok: true }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAutoBackup', () => {
  it('hydrates the backup connection on mount', () => {
    renderHook(() => useAutoBackup());
    expect(mocks.backupState.hydrate).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe to the stores when auto-sync is off', () => {
    renderHook(() => useAutoBackup());
    mocks.planner.setState({});
    expect(mocks.backupState.backupNow).not.toHaveBeenCalled();
  });

  it('does not subscribe when auto-sync is on but Drive is not connected', () => {
    mocks.backupState.autoSync = true;
    mocks.backupState.connected = false;
    renderHook(() => useAutoBackup());
    mocks.planner.setState({});
    vi.advanceTimersByTime(60_000);
    expect(mocks.backupState.backupNow).not.toHaveBeenCalled();
  });

  it('backs up after the debounce window once a planner/habit edit happens', async () => {
    mocks.backupState.autoSync = true;
    mocks.backupState.connected = true;
    renderHook(() => useAutoBackup());

    mocks.planner.setState({});
    await vi.advanceTimersByTimeAsync(19_999);
    expect(mocks.backupState.backupNow).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.backupState.backupNow).toHaveBeenCalledWith({ silent: true });
  });

  it('a habit edit also arms the same debounce', async () => {
    mocks.backupState.autoSync = true;
    mocks.backupState.connected = true;
    renderHook(() => useAutoBackup());
    mocks.habits.setState({});
    await vi.advanceTimersByTimeAsync(20_000);
    expect(mocks.backupState.backupNow).toHaveBeenCalledTimes(1);
  });

  it('collapses rapid-fire edits into a single debounced upload', async () => {
    mocks.backupState.autoSync = true;
    mocks.backupState.connected = true;
    renderHook(() => useAutoBackup());

    mocks.planner.setState({});
    await vi.advanceTimersByTimeAsync(10_000);
    mocks.planner.setState({}); // re-arms the timer before it fires
    await vi.advanceTimersByTimeAsync(19_999);
    expect(mocks.backupState.backupNow).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.backupState.backupNow).toHaveBeenCalledTimes(1);
  });

  it('skips the upload and does not re-arm when another operation is already in progress', async () => {
    mocks.backupState.autoSync = true;
    mocks.backupState.connected = true;
    mocks.backupState.phase = 'restoring';
    renderHook(() => useAutoBackup());
    mocks.planner.setState({});
    await vi.advanceTimersByTimeAsync(20_000);
    expect(mocks.backupState.backupNow).not.toHaveBeenCalled();
  });

  it('re-arms for the remainder of the interval floor when the last backup was too recent', async () => {
    mocks.backupState.autoSync = true;
    mocks.backupState.connected = true;
    mocks.backupState.lastBackupAt = Date.now() - 60_000; // 1 minute ago; floor is 5 minutes
    renderHook(() => useAutoBackup());

    mocks.planner.setState({});
    await vi.advanceTimersByTimeAsync(20_000); // debounce fires, hits the floor guard, re-arms
    expect(mocks.backupState.backupNow).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4 * 60_000); // remainder of the 5-minute floor
    expect(mocks.backupState.backupNow).toHaveBeenCalledTimes(1);
  });

  it('flushes a pending debounce immediately when the app is backgrounded', async () => {
    mocks.backupState.autoSync = true;
    mocks.backupState.connected = true;
    renderHook(() => useAutoBackup());

    mocks.planner.setState({});
    fireAppState('background');
    await Promise.resolve();
    expect(mocks.backupState.backupNow).toHaveBeenCalledWith({ silent: true });

    // The pending timer was cleared, so it must not fire again later.
    mocks.backupState.backupNow.mockClear();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(mocks.backupState.backupNow).not.toHaveBeenCalled();
  });

  it('clears the pending timer but does not flush when backgrounding while another operation is in progress', async () => {
    mocks.backupState.autoSync = true;
    mocks.backupState.connected = true;
    mocks.backupState.phase = 'restoring';
    renderHook(() => useAutoBackup());

    mocks.planner.setState({});
    fireAppState('background');
    await Promise.resolve();
    expect(mocks.backupState.backupNow).not.toHaveBeenCalled();

    // The pending timer was cleared regardless of phase, so it must not fire later.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(mocks.backupState.backupNow).not.toHaveBeenCalled();
  });

  it('does nothing on backgrounding when no upload was pending', async () => {
    mocks.backupState.autoSync = true;
    mocks.backupState.connected = true;
    renderHook(() => useAutoBackup());
    fireAppState('background');
    await Promise.resolve();
    expect(mocks.backupState.backupNow).not.toHaveBeenCalled();
  });

  it('ignores a transition back to "active"', async () => {
    mocks.backupState.autoSync = true;
    mocks.backupState.connected = true;
    renderHook(() => useAutoBackup());
    mocks.planner.setState({});
    fireAppState('active');
    await Promise.resolve();
    expect(mocks.backupState.backupNow).not.toHaveBeenCalled();
  });

  it('unsubscribes from both stores and the AppState listener, and clears any pending timer, on unmount', async () => {
    mocks.backupState.autoSync = true;
    mocks.backupState.connected = true;
    const { unmount } = renderHook(() => useAutoBackup());
    mocks.planner.setState({});
    unmount();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(mocks.backupState.backupNow).not.toHaveBeenCalled();
    expect(mocks.appStateHandlers.size).toBe(0);
  });
});
