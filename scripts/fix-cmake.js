const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  try {
    fs.readdirSync(dir).forEach(file => {
      let filepath = path.join(dir, file);
      let stat = fs.statSync(filepath);
      if (stat.isDirectory()) {
        const ignoredDirs = ['.bin', '.cache', '.git', '.cxx', 'build', 'ios', 'docs', 'node_modules'];
        if (!ignoredDirs.includes(file)) {
          walk(filepath, callback);
        }
      } else if (file === 'CMakeLists.txt') {
        callback(filepath);
      }
    });
  } catch (err) {
    // Ignore read errors
  }
}

const nodeModulesPath = path.join(__dirname, '../node_modules');
console.log('Scanning node_modules for CMakeLists.txt files needing NDK 27 / CMP0057 policy fix...');

if (fs.existsSync(nodeModulesPath)) {
  walk(nodeModulesPath, (filePath) => {
    try {
      let content = fs.readFileSync(filePath, 'utf8');

      // Check if project(...) is declared before cmake_minimum_required
      const projectMatch = content.match(/^[ \t]*project\s*\(/m);
      const minReqMatch = content.match(/^[ \t]*cmake_minimum_required\s*\(/m);

      const projectIndex = projectMatch ? projectMatch.index : -1;
      const minReqIndex = minReqMatch ? minReqMatch.index : -1;

      const needsFix = (projectIndex !== -1 && (minReqIndex === -1 || projectIndex < minReqIndex)) ||
                       (minReqIndex !== -1 && !content.includes('CMP0057'));

      if (needsFix) {
        // Remove existing cmake_minimum_required line if present
        let updated = content.replace(/^[ \t]*cmake_minimum_required\s*\([^)]*\)\s*(\r?\n)?/gm, '');

        // Prepend cmake_minimum_required with policy CMP0057 set to NEW
        const header = `cmake_minimum_required(VERSION 3.22.1)\nif(POLICY CMP0057)\n  cmake_policy(SET CMP0057 NEW)\nendif()\n`;
        updated = header + updated;

        fs.writeFileSync(filePath, updated, 'utf8');
        console.log(`[fix-cmake] Patched CMP0057 policy in: ${filePath}`);
      }
    } catch (err) {
      console.error(`Failed to patch CMake file ${filePath}:`, err.message);
    }
  });
}

console.log('CMake scan and patch complete.');
