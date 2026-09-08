import { describe, it, expect, vi } from 'vitest';

// `Ionicons` is only ever used in a type position here (`keyof typeof
// Ionicons.glyphMap`), but the bundler still keeps the runtime import, which
// would otherwise pull in the whole (Flow-syntax) react-native package —
// same reason constants/palette.ts's `Platform` import needs mocking below.
vi.mock('@expo/vector-icons', () => ({ Ionicons: {} }));
vi.mock('react-native', () => ({ Platform: { select: (opts: any) => opts.default ?? opts.ios } }));

import { ADD_ENTRY_CONFIG, CATEGORIES, getAddEntryConfig, getCategory } from './categories';

describe('getCategory', () => {
  it('returns the matching category for a known id', () => {
    expect(getCategory('teacher')).toBe(CATEGORIES.find((c) => c.id === 'teacher'));
  });

  it('falls back to the last category ("other") for an unknown id', () => {
    expect(getCategory('not-a-real-id' as any)).toBe(CATEGORIES[CATEGORIES.length - 1]);
  });

  it('falls back to "other" for undefined and null', () => {
    expect(getCategory(undefined)).toBe(CATEGORIES[CATEGORIES.length - 1]);
    expect(getCategory(null)).toBe(CATEGORIES[CATEGORIES.length - 1]);
  });
});

describe('getAddEntryConfig', () => {
  it('returns the matching config for a known id', () => {
    expect(getAddEntryConfig('developer')).toBe(ADD_ENTRY_CONFIG.developer);
  });

  it('falls back to "other" for an unknown, undefined or null id', () => {
    expect(getAddEntryConfig('not-a-real-id' as any)).toBe(ADD_ENTRY_CONFIG.other);
    expect(getAddEntryConfig(undefined)).toBe(ADD_ENTRY_CONFIG.other);
    expect(getAddEntryConfig(null)).toBe(ADD_ENTRY_CONFIG.other);
  });
});
