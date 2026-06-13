const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  try {
    fs.readdirSync(dir).forEach(file => {
      let filepath = path.join(dir, file);
      let stat = fs.statSync(filepath);
      if (stat.isDirectory()) {
        // Skip common large directories that do not contain build.gradle
        if (file !== '.bin' && file !== '.cache' && file !== 'node_modules') {
          walk(filepath, callback);
        }
      } else if (file === 'build.gradle') {
        callback(filepath);
      }
    });
  } catch (err) {
    // Ignore read errors
  }
}

const nodeModulesPath = path.join(__dirname, '../node_modules');
console.log('Scanning node_modules for build.gradle files containing jcenter()...');
if (fs.existsSync(nodeModulesPath)) {
  walk(nodeModulesPath, (filePath) => {
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('jcenter()')) {
        content = content.replace(/jcenter\(\)/g, 'mavenCentral()');
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Patched jcenter() to mavenCentral() in: ${filePath}`);
      }
    } catch (err) {
      console.error(`Failed to patch file ${filePath}:`, err.message);
    }
  });
}
console.log('Scan complete.');
