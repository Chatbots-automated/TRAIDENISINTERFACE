import { readFileSync, writeFileSync } from 'node:fs';

const packagePath = new URL('../package.json', import.meta.url);
const lockPath = new URL('../package-lock.json', import.meta.url);

function bumpPatch(version) {
  const parts = String(version).split('.').map((part) => Number.parseInt(part, 10));

  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part) || part < 0)) {
    throw new Error(`Expected semantic version in MAJOR.MINOR.PATCH format, received "${version}"`);
  }

  parts[2] += 1;
  return parts.join('.');
}

const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
const nextVersion = bumpPatch(pkg.version);

pkg.version = nextVersion;
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
lock.version = nextVersion;

if (lock.packages?.['']) {
  lock.packages[''].version = nextVersion;
}

writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
console.log(nextVersion);
