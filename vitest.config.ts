import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // Under jsdom there's no real native runtime, so RN imports resolve to
      // the web implementation the project already ships for its web build —
      // same component/hook API, backed by real DOM nodes React Testing
      // Library can render and query.
      'react-native': 'react-native-web',
    },
  },
  define: {
    // Metro/Babel inject this global at build time; under Vitest nothing
    // defines it, and several expo-* packages read it at module scope
    // (before any test code runs), crashing the whole file with
    // "ReferenceError: __DEV__ is not defined" before a single test collects.
    __DEV__: 'true',
    'process.env.EXPO_OS': JSON.stringify('web'),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.animation-polyfill.ts', './vitest.setup.ts'],
    // Default 5000ms is too tight for tests that chain several real-timer
    // Pressable interactions (each with its own ~50ms activation delay) under
    // this suite's full parallel run — see vitest.setup.ts's asyncUtilTimeout
    // comment for the same underlying load-based timing issue.
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Vitest skips generating the coverage report by default when any test
      // fails. This keeps `npx vitest run --coverage` printing the report
      // regardless, so one failing test doesn't hide the whole summary.
      reportOnFailure: true,
      // Expand this list as each module gets test coverage — keeps the report
      // free of noise from modules that have no tests yet.
      include: [
        'lib/time.ts',
        'lib/validation.ts',
        'lib/analytics.ts',
        'lib/services/backup.ts',
        'lib/services/reminders.ts',
        'lib/firebase/errors.ts',
        'lib/db/chat-repository.ts',
        'constants/categories.ts',
        'store/habits-store.ts',
        'store/theme-store.ts',
        'store/notification-store.ts',
        'store/planner-store.ts',
        'store/backup-store.ts',
        'hooks/use-color-scheme.ts',
        'hooks/use-color-scheme.web.ts',
        'hooks/use-theme-color.ts',
        'hooks/use-app-theme.ts',
        'hooks/use-premium.ts',
        'hooks/use-analytics.ts',
        'hooks/use-reminders.ts',
        'hooks/use-auto-backup.ts',
        'components/charts.tsx',
        'components/ui/clock-time-picker.tsx',
        'components/themed-text.tsx',
        'components/themed-view.tsx',
        'components/hello-wave.tsx',
        'components/external-link.tsx',
        'components/haptic-tab.tsx',
        'components/ui/collapsible.tsx',
        'components/ui/icon-symbol.tsx',
        'components/ui/icon-symbol.ios.tsx',
        'components/ui/button.tsx',
        'components/ui/text-field.tsx',
        'components/ui/empty-state.tsx',
        'components/ui/toast.tsx',
        'components/progress-ring.tsx',
        'components/screen-placeholder.tsx',
        'components/parallax-scroll-view.tsx',
        'app/**/*.tsx',
      ],
    },
  },
});