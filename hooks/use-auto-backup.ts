/**
 * Auto-sync: pushes a fresh backup to Google Drive a short while after the user
 * stops editing.
 *
 * ---------------------------------------------------------------------------
 * WHY DEBOUNCE INSTEAD OF "UPLOAD ON EVERY CHANGE"
 * ---------------------------------------------------------------------------
 * A single habit tap writes to the store, and so does dragging through a list
 * of tasks. Uploading per change would mean dozens of Drive round-trips a
 * minute, burn battery and mobile data, and hit Drive's rate limits. The store
 * subscriptions below only *arm a timer*; the upload happens once the user has
 * been quiet for `DEBOUNCE_MS`.
 *
 * A hard floor of `MIN_INTERVAL_MS` between uploads sits on top of that, so even
 * continuous editing cannot produce more than one upload per interval.
 *
 * ---------------------------------------------------------------------------
 * WHY IT LIVES IN A ROOT-MOUNTED HOOK
 * ---------------------------------------------------------------------------
 * The subscriptions must outlive the Backup screen — the user turns auto-sync on
 * there and then goes off to add classes for ten minutes. Mounting this in
 * `app/_layout.tsx` gives it the app's lifetime. It is a no-op (subscribes to
 * nothing) until auto-sync is actually enabled.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useBackupStore } from '@/store/backup-store';
import { useHabitsStore } from '@/store/habits-store';
import { usePlannerStore } from '@/store/planner-store';

/** Quiet period after the last edit before uploading. */
const DEBOUNCE_MS = 20_000;

/** Never upload more often than this, however busy the user is. */
const MIN_INTERVAL_MS = 5 * 60_000;

export function useAutoBackup(): void {
  const autoSync = useBackupStore((s) => s.autoSync);
  const connected = useBackupStore((s) => s.connected);
  const hydrate = useBackupStore((s) => s.hydrate);

  /*
   * `connected` is derived from the stored OAuth token rather than persisted, so
   * it starts false on every launch. Without this, auto-sync would only wake up
   * after the user happened to open the Profile or Backup screen.
   */
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!autoSync || !connected) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const run = () => {
      timer = null;
      // `disposed` and the timer are cleared together, synchronously, in the
      // cleanup below — `run` can only ever fire via that same timer, so it
      // can never observe `disposed` as true.
      /* v8 ignore start */
      if (disposed) return;
      /* v8 ignore stop */
      const { lastBackupAt, phase, backupNow } = useBackupStore.getState();
      if (phase !== 'idle') return;
      if (lastBackupAt && Date.now() - lastBackupAt < MIN_INTERVAL_MS) {
        // Too soon: re-arm for the remainder of the window rather than dropping
        // the change, otherwise the last edit before a pause is never uploaded.
        timer = setTimeout(run, MIN_INTERVAL_MS - (Date.now() - lastBackupAt));
        return;
      }
      void backupNow({ silent: true });
    };

    const schedule = () => {
      // Same reasoning as `run` above: the store unsubscribes happen in the
      // same synchronous cleanup that sets `disposed`, so a call to this
      // listener can never observe `disposed` as true.
      /* v8 ignore start */
      if (disposed) return;
      /* v8 ignore stop */
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, DEBOUNCE_MS);
    };

    /*
     * Subscribe to the two stores that hold real user content. The profile and
     * theme stores are intentionally not watched: changing dark mode is not
     * worth a Drive upload, and profile edits already go through a screen the
     * user leaves (which triggers the planner/habits path soon enough anyway).
     */
    const unsubPlanner = usePlannerStore.subscribe(schedule);
    const unsubHabits = useHabitsStore.subscribe(schedule);

    // Backgrounding the app is the best moment to flush: the user is done, and
    // a pending debounce timer may never fire if the OS suspends us.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && timer) {
        clearTimeout(timer);
        timer = null;
        const { phase, backupNow } = useBackupStore.getState();
        if (phase === 'idle') void backupNow({ silent: true });
      }
    });

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      unsubPlanner();
      unsubHabits();
      appStateSub.remove();
    };
  }, [autoSync, connected]);
}
