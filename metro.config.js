// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase JS SDK v10 does not work with Metro's "package exports" resolution
// (enabled by default in Expo SDK 53+). It causes the runtime error:
//   "Component auth has not been registered yet"
// Disabling package exports forces Metro to use the RN CJS bundle so the
// firebase/auth component registers correctly.
config.resolver.unstable_enablePackageExports = false;

// expo-router's file-based routing scans every file under app/, so the
// *.test.tsx files colocated there (see vitest.config.ts) get treated as
// routes and Metro tries to bundle their Node-only imports (e.g.
// "node:module" from @testing-library/react). Vitest resolves test files on
// its own, outside Metro, so blocking them here only removes them from the
// app bundle/route graph.
config.resolver.blockList = [/\.test\.[jt]sx?$/];

module.exports = config;
