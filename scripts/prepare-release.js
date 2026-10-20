/**
 * Release Notes & Artifacts Checksum Generator
 * Used by GitHub Actions to produce a release body with SHA-256 checksums table.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ASSETS_DIR = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../dist');

if (!fs.existsSync(ASSETS_DIR)) {
  console.error(`Assets directory not found: ${ASSETS_DIR}`);
  process.exit(1);
}

function calculateSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const entries = fs.readdirSync(ASSETS_DIR)
  .filter(f => !f.endsWith('.txt') && !f.endsWith('.md') && !f.endsWith('.json') && !f.endsWith('.idsig') && !f.toLowerCase().includes('debug'))
  .map(filename => {
    const fullPath = path.join(ASSETS_DIR, filename);
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) return null;
    return {
      filename,
      fullPath,
      size: stat.size,
      sha256: calculateSha256(fullPath)
    };
  })
  .filter(Boolean);

// Sort entries by platform/extension: APK, EXE, MSI, DMG, DEB, AppImage
const order = ['.apk', '.exe', '.msi', '.dmg', '.deb', '.appimage'];
entries.sort((a, b) => {
  const extA = path.extname(a.filename).toLowerCase();
  const extB = path.extname(b.filename).toLowerCase();
  const idxA = order.indexOf(extA);
  const idxB = order.indexOf(extB);
  if (idxA !== -1 && idxB !== -1) return idxA - idxB;
  return a.filename.localeCompare(b.filename);
});

// Write SHA256SUMS.txt
const sumsContent = entries.map(e => `${e.sha256}  ${e.filename}`).join('\n') + '\n';
fs.writeFileSync(path.join(ASSETS_DIR, 'SHA256SUMS.txt'), sumsContent, 'utf8');

// Generate Markdown Release Notes Table
let md = '### Official Release Packages\n\n';
md += '| Platform | Package | Size | SHA-256 Checksum |\n';
md += '| :--- | :--- | :--- | :--- |\n';

for (const e of entries) {
  let platform = 'Other';
  const nameLower = e.filename.toLowerCase();
  if (nameLower.endsWith('.apk')) platform = '📱 **Android**';
  else if (nameLower.endsWith('.exe')) platform = '🪟 **Windows (Setup)**';
  else if (nameLower.endsWith('.msi')) platform = '🪟 **Windows (MSI)**';
  else if (nameLower.endsWith('.dmg')) platform = '🍎 **macOS (DMG)**';
  else if (nameLower.endsWith('.deb')) platform = '🐧 **Linux (Debian/Ubuntu)**';
  else if (nameLower.endsWith('.appimage')) platform = '🐧 **Linux (AppImage)**';

  md += `| ${platform} | \`${e.filename}\` | ${formatSize(e.size)} | \`${e.sha256}\` |\n`;
}

md += '\n> [!NOTE]\n';
md += '> Verify file integrity using `sha256sum -c SHA256SUMS.txt` on Linux/macOS or `Get-FileHash <file> -Algorithm SHA256` on Windows PowerShell.\n';

const notesPath = path.join(ASSETS_DIR, 'RELEASE_NOTES.md');
fs.writeFileSync(notesPath, md, 'utf8');
console.log(`Generated SHA256SUMS.txt and RELEASE_NOTES.md for ${entries.length} release artifacts.`);
