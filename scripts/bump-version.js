import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const pkgPath = path.join(rootDir, 'package.json');
const mainCjsPath = path.join(rootDir, 'electron', 'main.cjs');
const settingsModalPath = path.join(rootDir, 'src', 'components', 'SettingsModal.tsx');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const currentVersion = pkg.version || '1.0.0';

// Increment patch version (e.g. 1.4.0 -> 1.4.1) or custom if specified via CLI arg
const customArg = process.argv[2];
let nextVersion = '';

if (customArg && /^\d+\.\d+\.\d+$/.test(customArg)) {
  nextVersion = customArg;
} else {
  const parts = currentVersion.split('.').map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  nextVersion = parts.join('.');
}

console.log(`Bumping version: ${currentVersion} -> ${nextVersion}`);

// 1. Update package.json
pkg.version = nextVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

// 2. Update electron/main.cjs
if (fs.existsSync(mainCjsPath)) {
  let mainContent = fs.readFileSync(mainCjsPath, 'utf8');
  mainContent = mainContent.replace(
    /let currentVersion = '[^']+';/,
    `let currentVersion = '${nextVersion}';`
  );
  fs.writeFileSync(mainCjsPath, mainContent, 'utf8');
}

// 3. Update SettingsModal.tsx
if (fs.existsSync(settingsModalPath)) {
  let settingsContent = fs.readFileSync(settingsModalPath, 'utf8');
  // Replace currentVersion: '...'
  settingsContent = settingsContent.replace(
    /currentVersion:\s*['"]\d+\.\d+\.\d+['"]/,
    `currentVersion: '${nextVersion}'`
  );
  // Replace badge vX.Y.Z
  settingsContent = settingsContent.replace(
    />\s*v\d+\.\d+\.\d+\s*</g,
    `>v${nextVersion}<`
  );
  // Replace footer Prism Soundboard vX.Y.Z
  settingsContent = settingsContent.replace(
    /Prism Soundboard v\d+\.\d+\.\d+/g,
    `Prism Soundboard v${nextVersion}`
  );
  fs.writeFileSync(settingsModalPath, settingsContent, 'utf8');
}

console.log(`[OK] Successfully updated all version references to v${nextVersion}`);
