const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

// Exclude Android build folders and git folder from the Metro file watcher
// to prevent "Failed to start watch mode" timeouts on Windows
config.resolver.blockList = [
  /[\\/\\\\]android[\\/\\\\]app[\\/\\\\]build[\\/\\\\]/,
  /[\\/\\\\]android[\\/\\\\]build[\\/\\\\]/,
  /[\\/\\\\]\.git[\\/\\\\]/,
];

// Ensure .native.js files are resolved before .js for React Native
config.resolver.sourceExts = [
  'native.js',
  'native.ts',
  'native.tsx',
  ...config.resolver.sourceExts,
];

module.exports = config;