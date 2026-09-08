/**
 * Cloud-backup state machine.
 *
 * Everything the Backup screen renders lives here rather than in the screen's
 * `useState`, for two reasons:
 *
 *   1. Auto-sync runs from a hook mounted at the app root
 *      (`hooks/use-auto-backup.ts`), so a backup can be in flight while the
 *      Backup screen is unmounted. Its progress still has to be recorded.
 *   2. `lastBackupAt` / `connectedEmail` must survive a restart — that is the
 *      whole point of showing "Last backup: 2 hours ago".
 *
 * Only the *metadata* is persisted. The OAuth tokens stay in
 * `lib/services/google-drive.ts` (under their own AsyncStorage key) so that
 * credentials never travel through zustand devtools or a state snapshot.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import * as backupService from '@/lib/services/backup';
import * as drive from '@/lib/services/google-drive';
import { reportError } from '@/lib/services/observability';
import { zustandStorage } from '@/lib/storage';
import { useAuthStore } from '@/store/auth-store';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type SyncPhase = 'idle' | 'connecting' | 'backing-up' | 'restoring' | 'checking';

export type Outcome = { ok: boolean; error?: string };

/** What we know about the copy sitting in Drive (null = never checked/none). */
export type CloudSnapshot = {
  /** ISO timestamp from Drive's `modifiedTime`. */
  modifiedTime?: string;
  /** Bytes. */
  size?: number;
  /** Drive URL of the backup file, behind the "View in Google Drive" row. */
  webViewLink?: string;
  summary?: backupService.BackupSummary;
};

type BackupState = {
  /** Google account e-mail, when connected. */
  connectedEmail: string | null;
  connected: boolean;
  /** Epoch ms of the last successful upload from this device. */
  lastBackupAt: number | null;
  /** Epoch ms of the last successful restore onto this device. */
  lastRestoreAt: number | null;
  autoSync: boolean;
  phase: SyncPhase;
  /** Last failure, kept so the screen can show it inline under the button. */
  lastError: string | null;
  cloud: CloudSnapshot | null;

  /** Reads the stored token to see whether we are still connected. */
  hydrate: () => Promise<void>;
  connect: () => Promise<Outcome>;
  disconnect: () => Promise<void>;
  setAutoSync: (value: boolean) => void;
  /** Uploads a fresh snapshot. `silent` suppresses the phase spinner (auto-sync). */
  backupNow: (options?: { silent?: boolean }) => Promise<Outcome>;
  restoreNow: () => Promise<Outcome>;
  /** Fetches metadata + summary of what is in Drive right now. */
  refreshCloudInfo: () => Promise<void>;
  deleteCloudBackup: () => Promise<Outcome>;
  clearError: () => void;
};

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

function currentUid(): string | null {
  return useAuthStore.getState().fbUser?.uid ?? null;
}

/**
 * Guard for every Drive operation: without a signed-in user there is no `uid` to
 * scope the snapshot to, and a backup keyed to `'anon'` would be restored onto
 * the wrong account later.
 */
function requireUid(): string {
  const uid = currentUid();
  if (!uid) throw new Error('Sign in to your Smart Planner account first.');
  return uid;
}

export const useBackupStore = create<BackupState>()(
  persist(
    (set, get) => ({
      connectedEmail: null,
      connected: false,
      lastBackupAt: null,
      lastRestoreAt: null,
      autoSync: false,
      phase: 'idle',
      lastError: null,
      cloud: null,

      hydrate: async () => {
        try {
          const conn = await drive.getConnection();
          set({
            connected: conn.connected,
            connectedEmail: conn.email ?? null,
            /* A grant made before backups moved into a visible Drive folder
             * leaves the user "not connected" for reasons they did nothing to
             * cause. Say why, instead of silently showing the Connect button. */
            ...(conn.needsReconnect ? { autoSync: false, lastError: drive.RECONNECT_MESSAGE } : {}),
          });
        } catch (e) {
          reportError(e, 'backup-store/hydrate');
        }
      },

      connect: async () => {
        set({ phase: 'connecting', lastError: null });
        try {
          const conn = await drive.connect();
          set({
            connected: true,
            connectedEmail: conn.email ?? null,
            phase: 'idle',
          });
          // Surface immediately whether there is already a backup to restore.
          void get().refreshCloudInfo();
          return { ok: true };
        } catch (e) {
          const error = drive.driveErrorMessage(e);
          // A user closing the browser is not an error worth logging or showing.
          const cancelled = e instanceof drive.DriveError && e.code === 'cancelled';
          if (!cancelled) reportError(e, 'backup-store/connect');
          set({ phase: 'idle', lastError: cancelled ? null : error });
          return { ok: false, error };
        }
      },

      disconnect: async () => {
        try {
          await drive.disconnect();
        } catch (e) {
          reportError(e, 'backup-store/disconnect');
        }
        // Auto-sync without an account would fail on a timer forever.
        set({
          connected: false,
          connectedEmail: null,
          autoSync: false,
          cloud: null,
          lastError: null,
          phase: 'idle',
        });
      },

      setAutoSync: (value) => {
        set({ autoSync: value });
        // Turning it on should produce a backup now, not at the next edit.
        if (value && get().connected) void get().backupNow({ silent: true });
      },

      backupNow: async ({ silent } = {}) => {
        if (get().phase !== 'idle' && !silent) return { ok: false, error: 'Already working…' };
        if (!silent) set({ phase: 'backing-up', lastError: null });
        try {
          const uid = requireUid();
          const { json, backup } = await backupService.serializeBackup(uid);
          const file = await drive.uploadBackup(json);
          set({
            lastBackupAt: Date.now(),
            phase: 'idle',
            lastError: null,
            cloud: {
              modifiedTime: file.modifiedTime,
              size: file.size ? Number(file.size) : json.length,
              ...(file.webViewLink ? { webViewLink: file.webViewLink } : {}),
              summary: backupService.summarize(backup, uid),
            },
          });
          return { ok: true };
        } catch (e) {
          const error = drive.driveErrorMessage(e);
          reportError(e, 'backup-store/backupNow');
          // A dead token means "not connected" — reflect that so the screen
          // offers a re-connect instead of a retry that can never work.
          const disconnected = e instanceof drive.DriveError && e.code === 'not-connected';
          set({
            phase: 'idle',
            lastError: error,
            ...(disconnected ? { connected: false, autoSync: false } : {}),
          });
          return { ok: false, error };
        }
      },

      restoreNow: async () => {
        if (get().phase !== 'idle') return { ok: false, error: 'Already working…' };
        set({ phase: 'restoring', lastError: null });
        try {
          const uid = requireUid();
          const json = await drive.downloadBackup();
          if (!json) {
            set({ phase: 'idle' });
            return { ok: false, error: 'There is no backup in your Google Drive yet.' };
          }
          const backup = backupService.parseBackup(json);
          await backupService.applyBackup(backup, uid);
          set({
            phase: 'idle',
            lastRestoreAt: Date.now(),
            lastError: null,
            cloud: { ...(get().cloud ?? {}), summary: backupService.summarize(backup, uid) },
          });
          return { ok: true };
        } catch (e) {
          const error =
            e instanceof backupService.BackupFormatError
              ? e.message
              : drive.driveErrorMessage(e);
          reportError(e, 'backup-store/restoreNow');
          const disconnected = e instanceof drive.DriveError && e.code === 'not-connected';
          set({
            phase: 'idle',
            lastError: error,
            ...(disconnected ? { connected: false, autoSync: false } : {}),
          });
          return { ok: false, error };
        }
      },

      refreshCloudInfo: async () => {
        if (!get().connected) return;
        set({ phase: 'checking' });
        try {
          // Upgrading users still have their backup in the old hidden folder.
          // Moving it here means the Backup screen shows it — and Drive shows
          // it — without anyone having to press "Back up now" first.
          const file = (await drive.migrateLegacyBackup()) ?? (await drive.findBackupFile());
          set({
            phase: 'idle',
            cloud: file
              ? {
                  modifiedTime: file.modifiedTime,
                  size: file.size ? Number(file.size) : undefined,
                  ...(file.webViewLink ? { webViewLink: file.webViewLink } : {}),
                  summary: get().cloud?.summary,
                }
              : null,
          });
        } catch (e) {
          reportError(e, 'backup-store/refreshCloudInfo');
          const disconnected = e instanceof drive.DriveError && e.code === 'not-connected';
          set({
            phase: 'idle',
            lastError: drive.driveErrorMessage(e),
            ...(disconnected ? { connected: false, autoSync: false } : {}),
          });
        }
      },

      deleteCloudBackup: async () => {
        set({ phase: 'checking', lastError: null });
        try {
          const existed = await drive.deleteBackup();
          set({ phase: 'idle', cloud: null, lastBackupAt: null });
          return existed ? { ok: true } : { ok: false, error: 'There was no backup to delete.' };
        } catch (e) {
          const error = drive.driveErrorMessage(e);
          reportError(e, 'backup-store/deleteCloudBackup');
          set({ phase: 'idle', lastError: error });
          return { ok: false, error };
        }
      },

      clearError: () => set({ lastError: null }),
    }),
    {
      name: '@aip/backup',
      storage: zustandStorage,
      version: 1,
      /* `phase`, `lastError` and `connected` are runtime facts, not settings:
       * persisting `phase` would restore the app into a permanent "backing up…"
       * spinner if it was killed mid-upload, and `connected` is re-derived from
       * the stored token by `hydrate()`. */
      partialize: (state) => ({
        connectedEmail: state.connectedEmail,
        lastBackupAt: state.lastBackupAt,
        lastRestoreAt: state.lastRestoreAt,
        autoSync: state.autoSync,
        cloud: state.cloud,
      }),
    },
  ),
);
