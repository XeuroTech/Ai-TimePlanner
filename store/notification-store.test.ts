import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));
const mocks = vi.hoisted(() => ({ authState: { fbUser: null as { uid: string } | null } }));
vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: (s: typeof mocks.authState) => unknown) => selector(mocks.authState), {
    getState: () => mocks.authState,
  }),
}));

import { useMyNotifications, useNotificationStore, useUnreadNotificationCount } from './notification-store';

beforeEach(() => {
  mocks.authState.fbUser = { uid: 'u1' };
  useNotificationStore.setState({ items: [] });
});

describe('useNotificationStore actions', () => {
  it('add stamps a generated id and the current uid, and defaults read to false', () => {
    useNotificationStore.getState().add({ title: 'T', message: 'M', at: 100, icon: 'i', colorKey: 'primary', kind: 'test' });
    const [item] = useNotificationStore.getState().items;
    expect(item).toMatchObject({ title: 'T', uid: 'u1', read: false });
    expect(item.id).toBeTruthy();
  });

  it('stamps "anon" when no one is signed in', () => {
    mocks.authState.fbUser = null;
    useNotificationStore.getState().add({ title: 'T', message: 'M', at: 100, icon: 'i', colorKey: 'primary', kind: 'test' });
    expect(useNotificationStore.getState().items[0].uid).toBe('anon');
  });

  it('uses a provided id instead of generating one', () => {
    useNotificationStore.getState().add({ id: 'fixed-id', title: 'T', message: 'M', at: 100, icon: 'i', colorKey: 'primary', kind: 'test' });
    expect(useNotificationStore.getState().items[0].id).toBe('fixed-id');
  });

  it('drops a duplicate delivery of the same notification id', () => {
    useNotificationStore.getState().add({ id: 'dup', title: 'T', message: 'M', at: 100, icon: 'i', colorKey: 'primary', kind: 'test' });
    useNotificationStore.getState().add({ id: 'dup', title: 'T2', message: 'M2', at: 200, icon: 'i', colorKey: 'primary', kind: 'test' });
    expect(useNotificationStore.getState().items).toHaveLength(1);
    expect(useNotificationStore.getState().items[0].title).toBe('T');
  });

  it('caps the inbox at 100 items, dropping the oldest', () => {
    for (let i = 0; i < 105; i += 1) {
      useNotificationStore.getState().add({ id: `n${i}`, title: `T${i}`, message: 'M', at: i, icon: 'i', colorKey: 'primary', kind: 'test' });
    }
    const items = useNotificationStore.getState().items;
    expect(items).toHaveLength(100);
    expect(items[0].id).toBe('n104'); // newest first
  });

  it('markRead flips only the matching item', () => {
    useNotificationStore.setState({
      items: [
        { id: 'a', uid: 'u1', title: 'A', message: '', at: 1, read: false, icon: '', colorKey: '', kind: '' },
        { id: 'b', uid: 'u1', title: 'B', message: '', at: 2, read: false, icon: '', colorKey: '', kind: '' },
      ],
    });
    useNotificationStore.getState().markRead('a');
    const items = useNotificationStore.getState().items;
    expect(items.find((i) => i.id === 'a')?.read).toBe(true);
    expect(items.find((i) => i.id === 'b')?.read).toBe(false);
  });

  it('markAllRead flips every item', () => {
    useNotificationStore.setState({
      items: [
        { id: 'a', uid: 'u1', title: 'A', message: '', at: 1, read: false, icon: '', colorKey: '', kind: '' },
        { id: 'b', uid: 'u1', title: 'B', message: '', at: 2, read: false, icon: '', colorKey: '', kind: '' },
      ],
    });
    useNotificationStore.getState().markAllRead();
    expect(useNotificationStore.getState().items.every((i) => i.read)).toBe(true);
  });

  it('remove drops only the matching item', () => {
    useNotificationStore.setState({
      items: [
        { id: 'a', uid: 'u1', title: 'A', message: '', at: 1, read: false, icon: '', colorKey: '', kind: '' },
        { id: 'b', uid: 'u1', title: 'B', message: '', at: 2, read: false, icon: '', colorKey: '', kind: '' },
      ],
    });
    useNotificationStore.getState().remove('a');
    expect(useNotificationStore.getState().items.map((i) => i.id)).toEqual(['b']);
  });

  it('clear empties the inbox', () => {
    useNotificationStore.getState().add({ title: 'A', message: '', at: 1, icon: '', colorKey: '', kind: '' });
    useNotificationStore.getState().clear();
    expect(useNotificationStore.getState().items).toEqual([]);
  });
});

describe('useMyNotifications', () => {
  it('returns only the current user\'s items, sorted newest first', () => {
    useNotificationStore.setState({
      items: [
        { id: 'a', uid: 'u1', title: 'Older', message: '', at: 1, read: false, icon: '', colorKey: '', kind: '' },
        { id: 'b', uid: 'other', title: 'Not mine', message: '', at: 5, read: false, icon: '', colorKey: '', kind: '' },
        { id: 'c', uid: 'u1', title: 'Newer', message: '', at: 3, read: false, icon: '', colorKey: '', kind: '' },
      ],
    });
    const { result } = renderHook(() => useMyNotifications());
    expect(result.current.map((i) => i.title)).toEqual(['Newer', 'Older']);
  });

  it('falls back to the "anon" bucket when no one is signed in', () => {
    mocks.authState.fbUser = null;
    useNotificationStore.setState({
      items: [{ id: 'a', uid: 'anon', title: 'Anon item', message: '', at: 1, read: false, icon: '', colorKey: '', kind: '' }],
    });
    const { result } = renderHook(() => useMyNotifications());
    expect(result.current.map((i) => i.title)).toEqual(['Anon item']);
  });
});

describe('useUnreadNotificationCount', () => {
  it('counts only unread items belonging to the current user', () => {
    useNotificationStore.setState({
      items: [
        { id: 'a', uid: 'u1', title: 'A', message: '', at: 1, read: false, icon: '', colorKey: '', kind: '' },
        { id: 'b', uid: 'u1', title: 'B', message: '', at: 2, read: true, icon: '', colorKey: '', kind: '' },
        { id: 'c', uid: 'other', title: 'C', message: '', at: 3, read: false, icon: '', colorKey: '', kind: '' },
      ],
    });
    const { result } = renderHook(() => useUnreadNotificationCount());
    expect(result.current).toBe(1);
  });
});
