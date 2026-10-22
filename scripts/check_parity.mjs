#!/usr/bin/env node
/**
 * Eterc parity guard.
 *
 * PHP is the source of truth for class, method and helper spelling. This guard
 * reads parity/php-surface.json (generated from the PHP framework) and checks
 * the TypeScript surface for:
 *   1. old camelCase names that the rename map has retired,
 *   2. PHP classes/services that have no TypeScript counterpart,
 *   3. PHP methods that still exist under a camelCase spelling,
 *   4. helper functions that silently changed spelling.
 *
 * Functional omissions (for example the stateful setup wizard replacing PHP's
 * step methods) are recorded in parity/naming-exceptions.json with a reason.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (file) =>
  JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const surface = readJson("parity/php-surface.json");
const namingMap = readJson("parity/naming-map.json");
const exceptions = readJson("parity/naming-exceptions.json");

const exempt = (kind, name) =>
  (exceptions[kind] ?? []).some(
    (entry) => entry.name === name || entry.from === name,
  );

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const sourceFiles = walk(path.join(root, "src")).filter(
  (file) =>
    /\.(ts|tsx)$/.test(file) &&
    !file.replace(/\\/g, "/").includes("/src/generated/"),
);
const source = sourceFiles
  .map((file) => `\n/* ${path.relative(root, file)} */\n${fs.readFileSync(file, "utf8")}`)
  .join("\n");

/** All class bodies in the TS source. */
function collectClasses() {
  const classes = new Map();
  const classRe = /^\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)[^{]*\{/gm;
  const matches = [];
  let match;
  while ((match = classRe.exec(source))) {
    matches.push({ name: match[1], index: match.index });
  }
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const end = index + 1 < matches.length ? matches[index + 1].index : source.length;
    const body = source.slice(current.index, end);
    const methods = new Set();
    const methodRe =
      /^\s*(?:(?:public|protected|private)\s+)?(?:static\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/gm;
    let methodMatch;
    while ((methodMatch = methodRe.exec(body))) {
      if (methodMatch[1] !== "constructor") methods.add(methodMatch[1]);
    }
    classes.set(current.name, methods);
  }
  return classes;
}

const classes = collectClasses();
const exported = new Set();
for (const match of source.matchAll(
  /^\s*export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm,
)) {
  exported.add(match[1]);
}

const serviceClasses = new Set([
  "Flashdata",
  "String_service",
  "Url",
  "Utilities",
]);
const skipClasses = new Set(
  (exceptions.classes ?? [])
    .filter((entry) => entry.skip)
    .map((entry) => entry.name),
);

const problems = [];

// 1. Retired spellings must not come back.
for (const oldName of [
  ...Object.keys(namingMap.functions ?? {}),
  ...Object.keys(namingMap.classes ?? {}),
]) {
  if (exempt("retired", oldName)) continue;
  const pattern = new RegExp(`(?<![A-Za-z0-9_$])${oldName}(?![A-Za-z0-9_$])`);
  if (pattern.test(source)) {
    problems.push(`retired spelling still present: ${oldName}`);
  }
}

// 2. PHP classes need a counterpart (or an explicit skip exception).
for (const [className, info] of Object.entries(surface.classes)) {
  if (skipClasses.has(className)) continue;
  if (serviceClasses.has(className)) continue;
  if (classes.has(className)) continue;
  if (!exempt("classes", className)) {
    problems.push(
      `PHP class ${className} (${info.file}) has no TypeScript class counterpart`,
    );
  }
}

// 3. Public PHP methods must keep their spelling. A camelCase variant is a
//    naming delta; a completely absent method is a functional gap tracked in
//    the exceptions file.
for (const [className, info] of Object.entries(surface.classes)) {
  if (skipClasses.has(className)) continue;
  const methods = [...classes.entries()].find(([name]) => name === className)?.[1];
  const exportedMethods = serviceClasses.has(className) ? exported : null;
  for (const method of info.methods) {
    if (method.visibility !== "public") continue;
    if (method.name.startsWith("__")) continue;
    const exact = methods?.has(method.name) || exportedMethods?.has(method.name);
    if (exact) continue;

    const camel = method.name.replace(/_([a-z])/g, (_all, letter) =>
      letter.toUpperCase(),
    );
    const hasCamel =
      camel !== method.name &&
      (methods?.has(camel) || exportedMethods?.has(camel));
    if (hasCamel && !exempt("methods", `${className}::${method.name}`)) {
      problems.push(
        `PHP method ${className}::${method.name} is spelled ${camel} in TypeScript`,
      );
    }
  }
}

// 4. Helper functions.
for (const helper of surface.helpers) {
  if (exported.has(helper)) continue;
  if (exempt("helpers", helper)) continue;
  problems.push(`PHP helper ${helper} has no exported TypeScript function`);
}

const forbiddenGeneratorPatterns = [
  /\bsiteUrl\b/,
  /\bsetFlashdata\b/,
  /\bcurrentUrl\b/,
  /\bremoveQueryString\b/,
  /className="(?:card|button|records-table|form-group|table-container)\b/,
];
for (const file of sourceFiles.filter((file) =>
  file.replace(/\\/g, "/").includes("/flo/templates/"),
)) {
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of forbiddenGeneratorPatterns) {
    if (pattern.test(text)) {
      problems.push(
        `generator template ${path.relative(root, file)} contains ${pattern}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(`Eterc parity check failed (${problems.length}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log("Eterc parity check passed.");
