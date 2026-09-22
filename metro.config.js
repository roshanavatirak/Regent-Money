const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

// Exclude Android build folders, backend folder, and git folder from the Metro file watcher
// to prevent slow bundling and timeouts on Windows
config.resolver.blockList = [
  /[\\/\\\\]android[\\/\\\\]app[\\/\\\\]build[\\/\\\\]/,
  /[\\/\\\\]android[\\/\\\\]build[\\/\\\\]/,
  /[\\/\\\\]\.git[\\/\\\\]/,
  /[\\/\\\\]backend[\\/\\\\]node_modules[\\/\\\\]/,
  /[\\/\\\\]backend[\\/\\\\]dist[\\/\\\\]/,
];

module.exports = config;