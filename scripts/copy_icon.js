const fs = require('fs');
const path = require('path');

const source = 'C:\\Users\\rosha\\.gemini\\antigravity-ide\\brain\\45342019-f469-4360-87bf-39713f9cd696\\regent_app_icon_1781330326744.png';
const destination = path.join(__dirname, '../assets/icon.png');

try {
  fs.copyFileSync(source, destination);
  console.log('App icon updated successfully!');
} catch (err) {
  console.error('Failed to copy app icon:', err.message);
}
