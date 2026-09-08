import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, StateStorage } from 'zustand/middleware';

/**
 * Thin AsyncStorage helpers + a Zustand-compatible storage adapter.
 * Swapping the underlying persistence engine later means editing this file only.
 */

export async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function writeJSON(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function remove(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

/** Storage adapter for zustand's `persist` middleware. */
const stateStorage: StateStorage = {
  getItem: (name) => AsyncStorage.getItem(name),
  setItem: (name, value) => AsyncStorage.setItem(name, value),
  removeItem: (name) => AsyncStorage.removeItem(name),
};

export const zustandStorage = createJSONStorage(() => stateStorage);
