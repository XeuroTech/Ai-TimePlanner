// Learn more: https://docs.expo.dev/guides/customizing-metro/
const path = require('path');
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

// expo-sqlite's web backend (wa-sqlite) statically imports its .wasm binary
// (node_modules/expo-sqlite/web/worker.ts -> './wa-sqlite/wa-sqlite.wasm').
// Metro only bundles extensions it knows about, and "wasm" is in neither the
// default sourceExts nor assetExts list, so the web build fails to resolve
// it. Treating it as an asset (like an image) is the fix documented at
// https://docs.expo.dev/versions/v54.0.0/sdk/sqlite/#usage-on-the-web-platform.
config.resolver.assetExts.push('wasm');

// react-native-web's Alert.alert() is a no-op (see metro/web-alert-shim.js
// for the full explanation), which silently breaks every confirm/destructive
// dialog in the app on web only. Swap in a working implementation for the
// web bundle specifically, once Metro's own resolution confirms that's what
// an import actually resolved to — iOS/Android and Vitest are unaffected.
const { resolveRequest: defaultResolveRequest } = config.resolver;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolution = defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
  if (
    platform === 'web' &&
    resolution.type === 'sourceFile' &&
    /react-native-web[\\/]dist[\\/]exports[\\/]Alert[\\/]index\.js$/.test(resolution.filePath)
  ) {
    return { type: 'sourceFile', filePath: path.resolve(__dirname, 'metro/web-alert-shim.js') };
  }
  return resolution;
};

module.exports = config;
