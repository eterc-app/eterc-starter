#!/usr/bin/env node
/**
 * Applies parity/naming-map.json to the TypeScript source tree.
 *
 * The map is intentionally data-driven: framework symbols keep the exact
 * spelling of their PHP counterparts, while React/Next identifiers stay as
 * their runtimes require. File moves are performed before import rewriting so
 * the map remains usable in both directions.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const map = JSON.parse(
  fs.readFileSync(path.join(root, "parity", "naming-map.json"), "utf8"),
);

const roots = [path.join(root, "src")];
const extraFiles = [path.join(root, "README.md")];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".next") return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const identifierEntries = [
  ...Object.entries(map.functions ?? {}),
  ...Object.entries(map.classes ?? {}),
].sort((a, b) => b[0].length - a[0].length);

const importEntries = Object.entries(map.imports ?? {}).sort(
  (a, b) => b[0].length - a[0].length,
);

const files = [...roots.flatMap(walk), ...extraFiles].filter(
  (file) => file.endsWith(".ts") || file.endsWith(".tsx") || file.endsWith(".md"),
);

let changed = 0;
for (const full of files) {
  if (!fs.existsSync(full)) continue;
  const before = fs.readFileSync(full, "utf8");
  let after = before;

  for (const [from, to] of identifierEntries) {
    const pattern = new RegExp(
      `(?<![A-Za-z0-9_$])${escapeRegExp(from)}(?![A-Za-z0-9_$])`,
      "g",
    );
    after = after.replace(pattern, to);
  }

  // Import specifiers are path fragments, not identifiers; replace them as
  // quoted strings so a module called "./templates" cannot touch an unrelated
  // word in prose.
  for (const [from, to] of importEntries) {
    const pattern = new RegExp(
      `(?<=["'])${escapeRegExp(from)}(?=["'])`,
      "g",
    );
    after = after.replace(pattern, to);
  }

  if (after !== before) {
    fs.writeFileSync(full, after, "utf8");
    changed += 1;
  }
}

console.log(`Rewrote ${changed} file(s) with naming-map symbols.`);

// Case-only renames need a two-step move on Windows.
for (const [from, to] of Object.entries(map.files ?? {})) {
  const source = path.join(root, from);
  const target = path.join(root, to);
  if (!fs.existsSync(source)) continue;
  const temp = `${source}.rename-tmp`;
  fs.renameSync(source, temp);
  fs.renameSync(temp, target);
  console.log(`Moved ${from} -> ${to}`);
}
