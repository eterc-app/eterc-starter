#!/usr/bin/env node
/**
 * One-time CSS consolidation for the Eterc Tailwind migration.
 *
 * The legacy framework was authored as thirteen per-module stylesheets. The
 * final app has exactly one authored stylesheet (`src/app/globals.css`). This
 * script carries the legacy declarations into the Tailwind components layer,
 * scopes page-specific sheets so their document-level rules cannot leak into
 * other routes, and rewrites public asset URLs to absolute paths.
 *
 * Run: node scripts/build_globals_css.mjs
 */
import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const root = process.cwd();
const globalsPath = path.join(root, "src", "app", "globals.css");
const marker = "/* ===== ETERC LEGACY FRAMEWORK (Tailwind components layer) ===== */";
const base = fs
  .readFileSync(globalsPath, "utf8")
  .split(marker)[0]
  .trimEnd();

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function rewriteUrls(css, replacements) {
  for (const [from, to] of replacements) {
    css = css.split(from).join(to);
  }
  return css;
}

function scopeSelector(selector, scope) {
  let value = selector.trim();
  if (value === "") return value;
  if (value === "html" || value === "body" || value === ":root") return scope;
  if (/^(html|body)\s+(html|body)(?=[\s.:#>+~[]|$)/.test(value)) {
    return value.replace(/^(html|body)\s+(html|body)/, scope);
  }
  if (/^html(?=[\s.:#>+~[])/.test(value)) {
    return value.replace(/^html/, scope);
  }
  if (/^body(?=[\s.:#>+~[])/.test(value)) {
    return value.replace(/^body/, scope);
  }
  if (/^:root(?=[\s.:#>+~[])/.test(value)) {
    return value.replace(/^:root/, scope);
  }
  return `${scope} ${value}`;
}

function scopeCss(css, scope, replacements = []) {
  const rootNode = postcss.parse(rewriteUrls(css, replacements));
  rootNode.walkRules((rule) => {
    const parent = rule.parent;
    if (
      parent &&
      parent.type === "atrule" &&
      /keyframes$/i.test(parent.name)
    ) {
      return;
    }
    rule.selectors = rule.selectors.map((selector) =>
      scopeSelector(selector, scope),
    );
  });
  return rootNode.toString();
}

function stripLegacySpacingUtilities(css) {
  const rootNode = postcss.parse(css);
  rootNode.walkRules((rule) => {
    if (
      rule.selectors.every((selector) =>
        /^\.(?:mt|mb|ml|mr)-[0-7]$/.test(selector.trim()),
      )
    ) {
      rule.remove();
    }
  });
  return rootNode.toString();
}

const iconUrls = [["url('../trongate-icons/", "url('/trongate-icons/"]];

const globalCss = [
  stripLegacySpacingUtilities(read("public/css/trongate.css")),
  rewriteUrls(read("public/css/trongate-icons.css"), iconUrls),
  read("public/templates_module/css/admin.css"),
  read("public/image_uploader_module/css/image_uploader.css"),
].join("\n\n");

const authCss = scopeCss(
  read("public/login_module/css/login_default.css"),
  ".auth-page",
);

const setupCss = scopeCss(
  read("public/setup_module/css/setup.css"),
  ".setup-page",
);

const propertiesCss = [
  scopeCss(read("public/trongate_control-properties_builder_module/css/w3.css"), ".properties-builder-app"),
  scopeCss(
    read("public/trongate_control-properties_builder_module/css/properties_builder.css"),
    ".properties-builder-app",
    [
      ["url('../fonts/", "url('/trongate_control-properties_builder_module/fonts/"],
      ["url('../images/", "url('/trongate_control-properties_builder_module/images/"],
    ],
  ),
].join("\n\n");

const queryCss = [
  scopeCss(
    read("public/trongate_control-query_builder_module/css/table-joins.css"),
    ".query-builder-page",
    [["url('../images/", "url('/trongate_control-query_builder_module/images/"]],
  ),
  scopeCss(
    read("public/trongate_control-query_builder_module/css/query_builder.css"),
    ".query-builder-page",
  ),
  scopeCss(
    read("public/trongate_control-query_builder_module/css/query_builder_page.css"),
    ".query-builder-page",
    [["url('../fonts/", "url('/trongate_control-query_builder_module/fonts/"]],
  ),
].join("\n\n");

const propertiesOverrides = `
/* The original Properties Builder was a standalone document. These rules
   reproduce its document-level layout inside the scoped page wrapper. */
.properties-builder-app {
  display: block;
  min-height: 100vh;
  overflow: hidden;
  background-color: #000;
}
.properties-builder-app .container {
  width: 1600px;
  max-width: none;
  margin: 0 auto;
  padding: 0;
}
.properties-builder-app .cloak { display: block; }
.properties-builder-app .center-stage { width: auto; margin: 0; padding: 0; }
.properties-builder-app h2 { font-size: 1.4em; color: silver; }
.properties-builder-app button.accordion { margin: 0; border-radius: 0; }
.properties-builder-app .properties-selector button { margin: 0 0 0.8em 0; }
.properties-builder-app .accordion-content label.control { margin: 0 0 7px 0; }
.properties-builder-app .accordion-content button { margin: 1em 0 0 0; }
.properties-builder-app .modal-body {
  padding: 0.01em 16px 13em;
  border-inline: none;
  overflow-y: visible;
}
.properties-builder-app .modal-body button { margin: 0; }
`;

const authOverrides = `
.auth-page { width: 100%; max-width: none; padding: 0; }
.auth-page .card { box-shadow: 0 18px 50px rgb(0 0 0 / 0.28); }
`;

const setupOverrides = `
.setup-page { width: 100%; min-height: 100vh; padding: 20px; }
`;

const output = `${base}

${marker}
@layer components {
${globalCss}

${authCss}
${authOverrides}

${setupCss}
${setupOverrides}

${propertiesCss}
${propertiesOverrides}

${queryCss}
}
`;

fs.writeFileSync(globalsPath, output, "utf8");
console.log(`Wrote ${globalsPath} (${output.length} bytes).`);
