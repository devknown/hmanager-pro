/**
 * Unified Build Orchestrator for Hmanager Pro
 * 
 * Supports:
 *   node scripts/build.js [target] [mode]
 * 
 * Targets:
 *   - windows (or desktop)
 *   - android
 *   - linux
 *   - macos
 *   - all (builds desktop for current OS + android)
 * 
 * Automatically exports all resulting packages to the unified `dist/` directory.
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const { scanAndExport } = require('./export-builds');

const ROOT_DIR = path.resolve(__dirname, '..');
const target = (process.argv[2] || 'desktop').toLowerCase();
const mode = (process.argv[3] || 'release').toLowerCase();

console.log('======================================================');
console.log(`  Hmanager Pro - Building target: [${target}] (${mode})`);
console.log('======================================================\n');

function runStep(cmd, desc) {
  console.log(`--> ${desc}...`);
  try {
    execSync(cmd, { cwd: ROOT_DIR, stdio: 'inherit' });
    return true;
  } catch (err) {
    console.error(`Error during step: ${desc}`);
    return false;
  }
}

// 1. Build CSS
if (!runStep('npm run build:css', 'Building Tailwind CSS bundle')) {
  process.exit(1);
}

// 2. Dispatch Target
let success = true;

if (target === 'windows' || target === 'desktop' || target === 'win') {
  success = runStep('npx tauri build', 'Building Tauri Desktop bundle');
} else if (target === 'android') {
  const runner = path.join(__dirname, 'build-android.js');
  const res = spawnSync('node', [runner, mode], { cwd: ROOT_DIR, stdio: 'inherit' });
  success = res.status === 0;
} else if (target === 'linux') {
  success = runStep('npx tauri build --bundles deb,appimage', 'Building Linux DEB & AppImage bundles');
} else if (target === 'macos' || target === 'mac' || target === 'darwin') {
  const isUniversal = process.argv.includes('--universal') || process.env.TAURI_UNIVERSAL === 'true';
  const targetFlag = isUniversal ? '--target universal-apple-darwin' : '';
  success = runStep(`npx tauri build --bundles dmg ${targetFlag}`.trim(), 'Building macOS DMG bundle');
} else if (target === 'all') {
  console.log('--> Building Native Desktop Application...');
  const desktopSuccess = runStep('npx tauri build', 'Building Tauri Desktop bundle');
  
  console.log('--> Building Android APK...');
  const runner = path.join(__dirname, 'build-android.js');
  const androidRes = spawnSync('node', [runner, mode], { cwd: ROOT_DIR, stdio: 'inherit' });
  const androidSuccess = androidRes.status === 0;
  
  success = desktopSuccess && androidSuccess;
} else {
  console.error(`Unknown build target: "${target}". Valid options are: windows, android, linux, macos, all.`);
  process.exit(1);
}

// 3. Export all to dist
console.log('\n--> Syncing output artifacts to unified dist directory...');
scanAndExport();

if (!success) {
  console.error('[WARNING] Some build steps encountered errors.');
  process.exit(1);
} else {
  console.log('[SUCCESS] All build tasks finished successfully.');
}
