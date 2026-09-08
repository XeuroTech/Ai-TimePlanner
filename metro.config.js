// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase JS SDK v10 does not work with Metro's "package exports" resolution
// (enabled by default in Expo SDK 53+). It causes the runtime error:
//   "Component auth has not been registered yet"
// Disabling package exports forces Metro to use the RN CJS bundle so the
// firebase/auth component registers correctly.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
