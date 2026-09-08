import { describe, it, expect } from 'vitest';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { useColorScheme } from './use-color-scheme';

describe('useColorScheme (native)', () => {
  it('re-exports react-native\'s useColorScheme unchanged', () => {
    expect(useColorScheme).toBe(useRNColorScheme);
  });
});
