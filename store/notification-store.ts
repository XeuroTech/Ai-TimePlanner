/**
 * Persisted inbox for notifications the app has actually delivered.
 *
 * `app/notifications.tsx` used to render a hard-coded empty array with a
 * "TODO(backend)" note. Rows are now appended by the expo-notifications
 * listeners registered in `app/_layout.tsx`.
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { zustandStorage } from '@/lib/storage';
import { useAuthStore } from '@/store/auth-store';

export type InboxItem = {
  id: string;
  uid: string;
  title: string;
  message: string;
  /** Delivery time, epoch ms. */
  at: number;
  read: boolean;
  /** Ionicon name, chosen by whoever scheduled the reminder. */
  icon: string;
  /** Key into the palette (`primary`, `blue`, `orange`, …). */
  colorKey: string;
  kind: string;
};

type NotificationState = {
  items: InboxItem[];
  add: (input: Omit<InboxItem, 'id' | 'uid' | 'read'> & { id?: string }) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clear: () => void;
};

/** Cap the inbox so it can't grow without bound in AsyncStorage. */
const MAX_ITEMS = 100;

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      items: [],

      add: (input) =>
        set((s) => {
          const id = input.id ?? `${input.at}-${Math.random().toString(36).slice(2, 8)}`;
          // The OS can hand us the same notification twice (received + opened).
          if (s.items.some((i) => i.id === id)) return s;
          const item: InboxItem = {
            ...input,
            id,
            uid: useAuthStore.getState().fbUser?.uid ?? 'anon',
            read: false,
          };
          return { items: [item, ...s.items].slice(0, MAX_ITEMS) };
        }),

      markRead: (id) =>
        set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, read: true } : i)) })),
      markAllRead: () => set((s) => ({ items: s.items.map((i) => ({ ...i, read: true })) })),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    {
      name: '@aip/notifications',
      storage: zustandStorage,
      version: 1,
    },
  ),
);

/* -------------------------------------------------------------------------- */
/* Selectors                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Inbox rows for the signed-in user, newest first.
 *
 * Filters inside `useMemo` rather than inside the zustand selector — returning
 * a fresh array from the selector makes `useSyncExternalStore` think the store
 * changed on every render (same trap documented in planner-store).
 */
export function useMyNotifications(): InboxItem[] {
  const uid = useAuthStore((s) => s.fbUser?.uid ?? 'anon');
  const items = useNotificationStore((s) => s.items);
  return useMemo(
    () => items.filter((i) => i.uid === uid).sort((a, b) => b.at - a.at),
    [items, uid],
  );
}

export function useUnreadNotificationCount(): number {
  const items = useMyNotifications();
  return useMemo(() => items.filter((i) => !i.read).length, [items]);
}
