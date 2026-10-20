/**
 * Cross-platform Android Build Runner
 */

const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');

const ROOT_DIR = path.resolve(__dirname, '..');
const mode = process.argv[2] || 'release';
const isWindows = os.platform() === 'win32';

if (isWindows) {
  const batPath = path.join(__dirname, 'build-android.bat');
  const res = spawnSync('cmd.exe', ['/c', batPath, mode, '--no-pause'], {
    cwd: ROOT_DIR,
    stdio: 'inherit'
  });
  process.exit(res.status || 0);
} else {
  const shPath = path.join(__dirname, 'build-android.sh');
  const res = spawnSync('bash', [shPath, mode], {
    cwd: ROOT_DIR,
    stdio: 'inherit'
  });
  process.exit(res.status || 0);
}
