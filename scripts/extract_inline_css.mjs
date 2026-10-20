#!/usr/bin/env node
/**
 * Moves the last inline view stylesheets into the single Tailwind components
 * layer, then removes the <style> tags and their source constants.
 */
import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const root = process.cwd();
const globalsPath = path.join(root, "src", "app", "globals.css");

const targets = [
  {
    file: "src/modules/trongate_control/flo/views/home.tsx",
    constant: "PAGE_CSS",
    styleTag: "<style>{PAGE_CSS}</style>",
  },
  {
    file: "src/modules/trongate_control/flo/FloTrigger.tsx",
    constant: "FLO_CSS",
    styleTag: "<style>{FLO_CSS}</style>",
  },
  {
    file: "src/modules/trongate_control/image_uploader_builder/views/conf_uploader_details.tsx",
    constant: "PAGE_CSS",
    styleTag: "<style>{PAGE_CSS}</style>",
    stripBodyTable: true,
  },
  {
    file: "src/modules/trongate_control/module_builder/views/conf_module_details.tsx",
    constant: "PAGE_CSS",
    styleTag: "<style>{PAGE_CSS}</style>",
  },
  {
    file: "src/modules/trongate_control/module_relations_builder/views/conf_relation_details.tsx",
    constant: "PAGE_CSS",
    styleTag: "<style>{PAGE_CSS}</style>",
  },
];

function rewrite(css) {
  return css.replaceAll("${BASE}", "/");
}

function stripBodyTable(css) {
  const parsed = postcss.parse(css);
  parsed.walkRules((rule) => {
    if (rule.selectors.every((selector) => /^body\s+table\b/.test(selector.trim()))) {
      rule.remove();
    }
  });
  return parsed.toString();
}

const chunks = [];
for (const target of targets) {
  const full = path.join(root, target.file);
  let source = fs.readFileSync(full, "utf8");
  const constantPattern = new RegExp(
    "const " + target.constant + " = `([\\s\\S]*?)`;\\n?",
  );
  const match = source.match(constantPattern);
  if (!match) {
    console.warn(`No ${target.constant} in ${target.file}`);
    continue;
  }
  let css = rewrite(match[1]);
  if (target.stripBodyTable) css = stripBodyTable(css);
  chunks.push(`/* ${target.file} */\n${css.trim()}`);
  source = source.replace(constantPattern, "");
  if (!source.includes(target.styleTag)) {
    console.warn(`No style tag ${target.styleTag} in ${target.file}`);
  }
  source = source.replace(target.styleTag, "");
  source = source.replace(/\n{3,}/g, "\n\n");
  fs.writeFileSync(full, source, "utf8");
}

let globals = fs.readFileSync(globalsPath, "utf8");
const marker = "/* ===== ETERC LEGACY FRAMEWORK (Tailwind components layer) ===== */";
if (!globals.includes(marker)) {
  throw new Error("Legacy CSS marker missing from globals.css");
}
const closing = globals.lastIndexOf("\n}");
if (closing === -1) throw new Error("Could not find components layer close");
globals =
  globals.slice(0, closing) +
  "\n\n/* ===== Inline view styles (migrated to components layer) ===== */\n" +
  chunks.join("\n\n") +
  "\n}\n" +
  globals.slice(closing + 3);
fs.writeFileSync(globalsPath, globals, "utf8");
console.log(`Migrated ${chunks.length} inline stylesheets.`);
