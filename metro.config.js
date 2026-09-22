const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

// Exclude Android build folders and git folder from the Metro file watcher
// to prevent "Failed to start watch mode" timeouts on Windows
config.resolver.blockList = [
  /[\\/\\\\]android[\\/\\\\]app[\\/\\\\]build[\\/\\\\]/,
  /[\\/\\\\]android[\\/\\\\]build[\\/\\\\]/,
  /[\\/\\\\]\.git[\\/\\\\]/,
];

module.exports = config;