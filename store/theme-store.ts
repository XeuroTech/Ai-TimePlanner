import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { zustandStorage } from '@/lib/storage';

type ThemeState = {
  darkMode: boolean;
  notificationsEnabled: boolean;
  setDarkMode: (value: boolean) => void;
  setNotificationsEnabled: (value: boolean) => void;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      darkMode: false,
      notificationsEnabled: true,
      setDarkMode: (value) => set({ darkMode: value }),
      setNotificationsEnabled: (value) => set({ notificationsEnabled: value }),
    }),
    {
      name: '@aip/theme',
      storage: zustandStorage,
      version: 1,
    },
  ),
);
