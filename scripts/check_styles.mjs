#!/usr/bin/env node
/**
 * Eterc styling guard.
 *
 * The product layer has one authored stylesheet (Tailwind + shadcn tokens in
 * src/app/globals.css). Runtime pagination CSS is the only documented
 * exception because pagination settings are stored in the database and were
 * emitted as a <style> block by the PHP view.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");
const publicDir = path.join(root, "public");

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const problems = [];

const cssFiles = [...walk(src), ...walk(publicDir)]
  .filter((file) => file.endsWith(".css"))
  .map((file) => path.relative(root, file).replace(/\\/g, "/"))
  .filter((file) => file !== "src/app/globals.css");

for (const file of cssFiles) {
  problems.push(`stylesheet outside src/app/globals.css: ${file}`);
}

const sourceFiles = walk(src).filter((file) => /\.(ts|tsx)$/.test(file));
const styleExceptions = new Set([
  "src/modules/pagination/default_css.ts",
  "src/modules/pagination/views/default_css.tsx",
]);

for (const file of sourceFiles) {
  const text = fs.readFileSync(file, "utf8");
  const relative = path.relative(root, file).replace(/\\/g, "/");

  if (/<link[^>]+rel=["']stylesheet["']/i.test(text)) {
    problems.push(`legacy stylesheet link in ${relative}`);
  }

  if (text.includes("<style") && !styleExceptions.has(relative)) {
    problems.push(`inline <style> block in ${relative}`);
  }

  let index = 0;
  while ((index = text.indexOf("style={{", index)) !== -1) {
    const start = index + "style=".length;
    let depth = 0;
    let end = start;
    for (; end < text.length; end += 1) {
      const char = text[end];
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const object = text.slice(start + 1, end);
    const dynamic =
      object.includes("?") ||
      object.includes("&&") ||
      object.includes("||") ||
      /\b[A-Za-z_$][\w$]*\s*\./.test(object) ||
      /\b[A-Za-z_$][\w$]*\s*\]/.test(object);
    if (!dynamic) {
      const line = text.slice(0, index).split(/\r?\n/).length;
      problems.push(`static inline style in ${relative}:${line}`);
    }
    index = end + 1;
  }
}

if (fs.existsSync(publicDir)) {
  for (const file of walk(publicDir).filter((entry) => entry.endsWith(".css"))) {
    problems.push(
      `legacy public stylesheet: ${path.relative(root, file).replace(/\\/g, "/")}`,
    );
  }
}

if (problems.length > 0) {
  console.error(`Eterc style check failed (${problems.length}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log("Eterc style check passed.");
