/**
 * Replaces "*" versions for @sandclaw/* internal dependencies with "^<actual-version>"
 * across all workspace packages and sample-app before publishing.
 *
 * Run by release-it's after:bump hook so the published packages have real version ranges.
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const ROOT = new URL("..", import.meta.url).pathname;

// Collect all workspace package.json paths
const pkgJsonPaths = [];

// packages/*
const packagesDir = join(ROOT, "packages");
for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    pkgJsonPaths.push(join(packagesDir, entry.name, "package.json"));
  }
}

// sample-app
pkgJsonPaths.push(join(ROOT, "sample-app", "package.json"));

// Build a map of @sandclaw/* package names → their current version
const versionMap = new Map();
for (const p of pkgJsonPaths) {
  try {
    const pkg = JSON.parse(readFileSync(p, "utf8"));
    if (pkg.name && pkg.name.startsWith("@sandclaw/")) {
      versionMap.set(pkg.name, pkg.version);
    }
  } catch {
    // skip missing files
  }
}

console.log(`Found ${versionMap.size} @sandclaw/* packages`);

const DEP_KEYS = ["dependencies", "devDependencies", "peerDependencies"];
let totalFixed = 0;

for (const p of pkgJsonPaths) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(p, "utf8"));
  } catch {
    continue;
  }

  let changed = false;

  for (const key of DEP_KEYS) {
    const deps = pkg[key];
    if (!deps) continue;

    for (const [name, version] of Object.entries(deps)) {
      if (name.startsWith("@sandclaw/") && version === "*") {
        const realVersion = versionMap.get(name);
        if (realVersion) {
          deps[name] = `^${realVersion}`;
          changed = true;
          totalFixed++;
        }
      }
    }
  }

  if (changed) {
    writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
    console.log(`  Fixed: ${pkg.name || p}`);
  }
}

console.log(`Replaced ${totalFixed} "*" dependency versions.`);
