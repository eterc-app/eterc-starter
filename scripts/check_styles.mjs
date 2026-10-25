#!/usr/bin/env node
/**
 * Eterc starter styling guard.
 *
 * The product layer has one authored stylesheet (Tailwind + shadcn tokens in
 * src/app/globals.css). Runtime pagination CSS is the only documented
 * exception because pagination settings are stored in the database and
 * rendered as a scoped <style> block.
 *
 * This guard enforces the visual contract in docs/design-system.md. It is
 * intentionally narrow: it catches the regressions that repeatedly creep into
 * pages, not every possible Tailwind class.
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

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
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
const hexExceptions = new Set(["src/app/api-reference/ScalarReference.tsx"]);
const palette =
  /(?:bg|text|border|ring|from|via|to|fill|stroke|divide|outline|decoration|shadow)-(?:blue|emerald|green|red|indigo|purple|pink|orange|amber|yellow|teal|cyan|sky|violet|rose|lime|fuchsia|slate|gray|zinc|neutral|stone)-\d{2,3}\b/g;

for (const file of sourceFiles) {
  const text = fs.readFileSync(file, "utf8");
  const relative = path.relative(root, file).replace(/\\/g, "/");

  if (/<link[^>]+rel=["']stylesheet["']/i.test(text)) {
    problems.push(`legacy stylesheet link in ${relative}`);
  }

  if (text.includes("window.confirm")) {
    problems.push(`native confirmation in ${relative}`);
  }

  if (text.includes("<style") && !styleExceptions.has(relative)) {
    problems.push(`inline <style> block in ${relative}`);
  }

  if (!hexExceptions.has(relative)) {
    const hexes = text.match(/(?<!&)#[0-9a-fA-F]{3,8}\b/g) ?? [];
    if (hexes.length > 0) {
      problems.push(`raw hex color in ${relative}: ${hexes[0]}`);
    }
  }

  const paletteMatches = text.match(palette) ?? [];
  if (paletteMatches.length > 0) {
    problems.push(`Tailwind palette color in ${relative}: ${paletteMatches[0]}`);
  }

  const arbitrary = [
    [/\btext-\[[^\]]+\]/g, "arbitrary text size"],
    [/\btracking-\[[^\]]+\]/g, "arbitrary tracking"],
    [/\brounded-\[(?!inherit\])[^\]]+\]/g, "arbitrary radius"],
    [/\bshadow-(?:sm|md|lg|xl|2xl)\b/g, "page-level shadow"],
    [/\bfont-bold\b/g, "font-bold"],
    [/\bbg-white\b/g, "bg-white"],
    [/\btext-black\b/g, "text-black"],
    [/\bborder-border\//g, "border opacity variant"],
    [/\bdivide-border\//g, "divide opacity variant"],
    [/\bring-[0-9]|\bring-foreground|focus-visible:ring/g, "colored/focus ring"],
  ];
  for (const [pattern, label] of arbitrary) {
    const match = text.match(pattern);
    if (match) {
      problems.push(`${label} in ${relative}: ${match[0]}`);
    }
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

const globals = read("src/app/globals.css");
for (const token of [
  "--background: #ededed;",
  "--primary: #000000;",
  "--border: #d9d9d9;",
  "--input: #cccccc;",
  "--surface-subtle: #f5f5f5;",
  "--destructive: #a51d2d;",
  "--radius-surface: 0.625rem;",
  "--field-height: 3.25rem;",
  "--sidebar-width: 17.5rem;",
  "--header-height: 4rem;",
  ".app-page",
  ".type-headline",
  ".type-title",
  ".type-note",
]) {
  if (!globals.includes(token)) {
    problems.push(`missing required design token/utility: ${token}`);
  }
}

const shell = read("src/templates/AdminTemplate.tsx");
for (const token of [
  "w-[280px]",
  "h-16",
  "max-w-[1560px]",
  "bg-sidebar",
  "bg-overlay",
  "type-headline",
]) {
  if (!shell.includes(token)) {
    problems.push(`AdminTemplate missing shell contract: ${token}`);
  }
}

const pageRoots = [
  "src/modules/cms_admin/views/dashboard.tsx",
  "src/modules/cms_admin/views/data.tsx",
  "src/modules/cms_admin/views/access.tsx",
  "src/modules/cms_admin/views/settings.tsx",
  "src/modules/eterc_administrators/views/manage.tsx",
  "src/modules/eterc_administrators/views/create.tsx",
  "src/modules/eterc_administrators/views/show.tsx",
  "src/modules/eterc_administrators/views/update_password.tsx",
  "src/modules/eterc_administrators/views/delete_conf.tsx",
  "src/modules/eterc_administrators/views/not_found.tsx",
  "src/modules/db/views/table_list.tsx",
  "src/modules/db/views/browse.tsx",
  "src/modules/db/views/forger.tsx",
  "src/modules/db/views/sql_console.tsx",
  "src/modules/db/views/delete_conf.tsx",
  "src/modules/db/views/not_found.tsx",
  "src/modules/media/MediaLibrary.tsx",
];
for (const relative of pageRoots) {
  if (!read(relative).includes("app-page")) {
    problems.push(`authenticated page root missing app-page: ${relative}`);
  }
}

const authShell = read("src/modules/login/views/AuthShell.tsx");
for (const token of ["bg-background", "max-w-[440px]", "rounded-lg"]) {
  if (!authShell.includes(token)) {
    problems.push(`AuthShell missing auth surface contract: ${token}`);
  }
}

const setup = read("src/modules/setup/SetupWizard.tsx");
for (const token of ["bg-background", "type-title", "max-w-3xl"]) {
  if (!setup.includes(token)) {
    problems.push(`SetupWizard missing setup surface contract: ${token}`);
  }
}
if (setup.includes("ConfettiCanvas")) {
  problems.push("SetupWizard must not include decorative confetti");
}

for (const [relative, token] of [
  ["src/templates/PublicTemplate.tsx", "bg-background"],
  ["src/templates/Error404.tsx", "bg-background"],
]) {
  if (!read(relative).includes(token)) {
    problems.push(`${relative} missing public/error surface contract: ${token}`);
  }
}

if (problems.length > 0) {
  console.error(`Eterc style check failed (${problems.length}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log("Eterc style check passed.");
