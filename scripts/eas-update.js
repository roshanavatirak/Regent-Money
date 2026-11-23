#!/usr/bin/env node
/**
 * Publishes a JS-only over-the-air update with EAS Update.
 *
 *   npm run update:production -- "Fix budget rounding"
 *   npm run update:preview -- "Try new home cards"
 *
 * Why this script instead of a bare `eas update`:
 * - `eas update` bundles the JS on this computer, so it reads the local .env (localhost backend).
 *   This script uses the EXPO_PUBLIC_* values from the matching profile in eas.json instead,
 *   so the update is built with exactly the same settings as the Play Store build.
 * - It stops if android/.../strings.xml has a different runtime version than app.json "version".
 *   A mismatch means installed apps would never receive the update.
 *
 * Only ship JS and image changes this way. Anything that changes native code (new native package,
 * Expo SDK upgrade, AndroidManifest, Kotlin, gradle) needs a new Play Store build with a new
 * app.json "version" (and the same value in strings.xml).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const channel = process.argv[2];
const message = process.argv.slice(3).join(' ').trim();

if (!['production', 'preview'].includes(channel)) {
  console.error('Usage: node scripts/eas-update.js <production|preview> "message"');
  process.exit(1);
}
if (!message) {
  console.error('Add a short message that says what this update changes.');
  process.exit(1);
}

const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));

const stringsXml = fs.readFileSync(path.join(root, 'android/app/src/main/res/values/strings.xml'), 'utf8');
const nativeRuntime = (stringsXml.match(/name="expo_runtime_version">([^<]+)</) || [])[1]?.trim();
if (nativeRuntime !== app.version) {
  console.error(
    `Runtime version mismatch: app.json version is ${app.version}, strings.xml expo_runtime_version is ${nativeRuntime}.\n` +
      'Make them equal (and ship a Play Store build) before publishing updates.'
  );
  process.exit(1);
}

const profileEnv = eas.build?.[channel]?.env || {};
const env = { ...process.env, ...profileEnv };

console.log(`Publishing to channel "${channel}" for runtime ${app.version}: ${message}`);
const result = spawnSync(
  'npx',
  ['eas-cli', 'update', '--channel', channel, '--environment', channel, '--platform', 'android', '--message', message],
  { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' }
);
process.exit(result.status ?? 1);
