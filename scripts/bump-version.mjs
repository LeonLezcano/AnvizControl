import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgPath = path.resolve(__dirname, '../package.json');
const verPath = path.resolve(__dirname, '../version.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const parts = pkg.version.replace(/^v/, '').split('.');
let major = parseInt(parts[0] || '1', 10);
let minor = parseInt(parts[1] || '0', 10);
let patch = parseInt(parts[2] || '00', 10);

patch += 1;
const patchStr = patch < 10 ? `0${patch}` : `${patch}`;
const newVersion = `v${major}.${minor}.${patchStr}`;
const semVer = `${major}.${minor}.${patchStr}`;

pkg.version = semVer;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const versionData = {
  version: newVersion,
  semver: semVer,
  updatedAt: new Date().toISOString()
};
fs.writeFileSync(verPath, JSON.stringify(versionData, null, 2) + '\n');

console.log(`Version incrementada exitosamente a: ${newVersion}`);
