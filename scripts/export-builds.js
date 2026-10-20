/**
 * Unified Build Artifacts Exporter
 * 
 * Scans all platform build outputs (Windows NSIS/MSI, Android APKs, Linux DEB/AppImage, macOS DMG)
 * and copies them into the centralized `dist/` output directory, categorizing by platform
 * and generating SHA-256 checksums for release verification.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const releaseOnly = process.argv.includes('--release-only') || process.env.RELEASE_ONLY === 'true';

const PLATFORM_DIRS = {
  windows: path.join(DIST_DIR, 'windows'),
  android: path.join(DIST_DIR, 'android'),
  linux: path.join(DIST_DIR, 'linux'),
  macos: path.join(DIST_DIR, 'macos')
};

// Ensure all distribution directories exist
for (const dir of Object.values(PLATFORM_DIRS)) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function calculateSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function copyFileSafe(src, dest) {
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    return true;
  } catch (err) {
    console.error(`Failed to copy ${src} -> ${dest}:`, err.message);
    return false;
  }
}

function scanAndExport() {
  console.log('\n======================================================');
  console.log('       Hmanager Pro - Unified Build Exporter          ');
  console.log('======================================================\n');
  console.log(`[Target Output Directory] -> ${DIST_DIR}\n`);

  const collected = [];

  // 1. Android APKs
  const androidApkBase = path.join(ROOT_DIR, 'src-tauri', 'gen', 'android', 'app', 'build', 'outputs', 'apk');
  if (fs.existsSync(androidApkBase)) {
    function findApks(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          findApks(full);
        } else if (entry.name.endsWith('.apk')) {
          if (releaseOnly && entry.name.toLowerCase().includes('debug')) {
            continue;
          }
          let targetName = entry.name;
          if (entry.name === 'app-arm64-release.apk') targetName = 'Hmanager-Pro-arm64-release.apk';
          else if (entry.name === 'app-arm64-debug.apk') targetName = 'Hmanager-Pro-arm64-debug.apk';
          else if (entry.name === 'app-universal-release.apk') targetName = 'Hmanager-Pro-universal-release.apk';
          else if (entry.name === 'app-universal-debug.apk') targetName = 'Hmanager-Pro-universal-debug.apk';
          else if (entry.name.startsWith('app-')) targetName = `Hmanager-Pro-${entry.name.slice(4)}`;

          const platformDest = path.join(PLATFORM_DIRS.android, targetName);
          const rootDistDest = path.join(DIST_DIR, targetName);

          copyFileSafe(full, platformDest);
          copyFileSafe(full, rootDistDest);

          collected.push({
            platform: 'Android',
            filename: targetName,
            platformPath: platformDest,
            rootPath: rootDistDest,
            size: fs.statSync(platformDest).size
          });
        }
      }
    }
    findApks(androidApkBase);
  }

  // 2. Desktop Bundles (Windows NSIS/MSI, Linux DEB/AppImage, macOS DMG)
  function findBundleDirs(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === 'bundle') {
            results.push(full);
          } else if (!['build', 'deps', 'incremental', '.fingerprint'].includes(e.name)) {
            results = results.concat(findBundleDirs(full));
          }
        }
      }
    } catch (_) {}
    return results;
  }

  const targetDir = path.join(ROOT_DIR, 'src-tauri', 'target');
  const bundleDirs = findBundleDirs(targetDir);

  for (const bundleBase of bundleDirs) {
    // Windows NSIS (.exe)
    const nsisDir = path.join(bundleBase, 'nsis');
    if (fs.existsSync(nsisDir)) {
      for (const file of fs.readdirSync(nsisDir)) {
        if (file.endsWith('.exe')) {
          const src = path.join(nsisDir, file);
          const platformDest = path.join(PLATFORM_DIRS.windows, file);
          const rootDistDest = path.join(DIST_DIR, file);
          copyFileSafe(src, platformDest);
          copyFileSafe(src, rootDistDest);
          collected.push({
            platform: 'Windows',
            filename: file,
            platformPath: platformDest,
            rootPath: rootDistDest,
            size: fs.statSync(platformDest).size
          });
        }
      }
    }

    // Windows MSI (.msi)
    const msiDir = path.join(bundleBase, 'msi');
    if (fs.existsSync(msiDir)) {
      for (const file of fs.readdirSync(msiDir)) {
        if (file.endsWith('.msi')) {
          const src = path.join(msiDir, file);
          const platformDest = path.join(PLATFORM_DIRS.windows, file);
          const rootDistDest = path.join(DIST_DIR, file);
          copyFileSafe(src, platformDest);
          copyFileSafe(src, rootDistDest);
          collected.push({
            platform: 'Windows',
            filename: file,
            platformPath: platformDest,
            rootPath: rootDistDest,
            size: fs.statSync(platformDest).size
          });
        }
      }
    }

    // Linux (deb & appimage)
    const debDir = path.join(bundleBase, 'deb');
    if (fs.existsSync(debDir)) {
      for (const file of fs.readdirSync(debDir)) {
        if (file.endsWith('.deb')) {
          const src = path.join(debDir, file);
          const platformDest = path.join(PLATFORM_DIRS.linux, file);
          const rootDistDest = path.join(DIST_DIR, file);
          copyFileSafe(src, platformDest);
          copyFileSafe(src, rootDistDest);
          collected.push({
            platform: 'Linux',
            filename: file,
            platformPath: platformDest,
            rootPath: rootDistDest,
            size: fs.statSync(platformDest).size
          });
        }
      }
    }

    const appImageDir = path.join(bundleBase, 'appimage');
    if (fs.existsSync(appImageDir)) {
      for (const file of fs.readdirSync(appImageDir)) {
        if (file.endsWith('.AppImage')) {
          const src = path.join(appImageDir, file);
          const platformDest = path.join(PLATFORM_DIRS.linux, file);
          const rootDistDest = path.join(DIST_DIR, file);
          copyFileSafe(src, platformDest);
          copyFileSafe(src, rootDistDest);
          collected.push({
            platform: 'Linux',
            filename: file,
            platformPath: platformDest,
            rootPath: rootDistDest,
            size: fs.statSync(platformDest).size
          });
        }
      }
    }

    // macOS (dmg & app)
    const dmgDir = path.join(bundleBase, 'dmg');
    if (fs.existsSync(dmgDir)) {
      for (const file of fs.readdirSync(dmgDir)) {
        if (file.endsWith('.dmg')) {
          const src = path.join(dmgDir, file);
          const platformDest = path.join(PLATFORM_DIRS.macos, file);
          const rootDistDest = path.join(DIST_DIR, file);
          copyFileSafe(src, platformDest);
          copyFileSafe(src, rootDistDest);
          collected.push({
            platform: 'macOS',
            filename: file,
            platformPath: platformDest,
            rootPath: rootDistDest,
            size: fs.statSync(platformDest).size
          });
        }
      }
    }
  }

  // Check if any existing files are in dist/android or dist/windows that might have been copied previously
  for (const [platform, dir] of Object.entries(PLATFORM_DIRS)) {
    if (fs.existsSync(dir)) {
      for (const file of fs.readdirSync(dir)) {
        const full = path.join(dir, file);
        if (fs.statSync(full).isFile() && !file.endsWith('.txt') && !file.endsWith('.idsig')) {
          if (releaseOnly && file.toLowerCase().includes('debug')) {
            continue;
          }
          const already = collected.some(c => c.filename === file);
          if (!already) {
            collected.push({
              platform: platform.charAt(0).toUpperCase() + platform.slice(1),
              filename: file,
              platformPath: full,
              rootPath: path.join(DIST_DIR, file),
              size: fs.statSync(full).size
            });
            // Ensure root dist has a copy too
            if (!fs.existsSync(path.join(DIST_DIR, file))) {
              copyFileSafe(full, path.join(DIST_DIR, file));
            }
          }
        }
      }
    }
  }

  if (collected.length === 0) {
    console.log('No compiled build artifacts found yet.');
    console.log('Run one of the build commands first:');
    console.log('  npm run build:windows   - Build Windows installer & MSI');
    console.log('  npm run build:android   - Build Android APK');
    console.log('  npm run build:linux     - Build Linux DEB & AppImage');
    console.log('  npm run build:macos     - Build macOS DMG\n');
    return;
  }

  // Deduplicate collected list by filename
  const uniqueItems = [];
  const seen = new Set();
  for (const item of collected) {
    if (!seen.has(item.filename)) {
      seen.add(item.filename);
      uniqueItems.push(item);
    }
  }

  // Generate SHA-256 Checksums
  const checksumLines = [];
  console.log('Collected Build Artifacts:\n');
  console.log('| Platform | Filename                                    | Size       | SHA-256 Checksum (first 12) |');
  console.log('|----------|---------------------------------------------|------------|-----------------------------|');

  for (const item of uniqueItems) {
    const hash = calculateSha256(item.platformPath);
    checksumLines.push(`${hash}  ${item.filename}`);
    const shortHash = hash.substring(0, 12) + '...';
    const platPadded = item.platform.padEnd(8);
    const filePadded = item.filename.padEnd(43);
    const sizePadded = formatSize(item.size).padEnd(10);
    console.log(`| ${platPadded} | ${filePadded} | ${sizePadded} | ${shortHash.padEnd(27)} |`);
  }

  const checksumPath = path.join(DIST_DIR, 'SHA256SUMS.txt');
  fs.writeFileSync(checksumPath, checksumLines.join('\n') + '\n', 'utf8');

  console.log('\n------------------------------------------------------');
  console.log(`[OK] All ${uniqueItems.length} build artifact(s) synced to: ${DIST_DIR}`);
  console.log(`[OK] Checksums written to: ${checksumPath}`);
  console.log('======================================================\n');
}

if (require.main === module) {
  scanAndExport();
}

module.exports = { scanAndExport };
