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

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!/\bspace-y-/.test(lines[index])) continue;
    let next = index + 1;
    while (next < lines.length && lines[next].trim() === "") next += 1;
    if (next < lines.length && /^<(?:Label|FieldLabel)\b/.test(lines[next].trim())) {
      problems.push(
        `field spacing in ${relative}:${index + 1}; use grid gap-3 because Label m-0 overrides space-y-*`,
      );
    }
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
  "--field-height: 2.5rem;",
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
  "PageActionsProvider",
  "PageActionsSlot",
]) {
  if (!shell.includes(token)) {
    problems.push(`AdminTemplate missing shell contract: ${token}`);
  }
}
if (shell.includes("Private API")) {
  problems.push("AdminTemplate must not render the Private API badge");
}

const pageRoots = [
  "src/modules/cms_admin/views/dashboard.tsx",
  "src/modules/cms_admin/views/data.tsx",
  "src/modules/cms_admin/views/access.tsx",
  "src/modules/cms_admin/views/settings.tsx",
  "src/modules/cms_admin/views/profile.tsx",
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

const contentSidebar = read("src/modules/cms_admin/views/ContentSidebar.tsx");
for (const token of [
  "Search collections",
  'aria-label="Collections"',
  "New collection",
  "lg:sticky",
  "h-10",
]) {
  if (!contentSidebar.includes(token)) {
    problems.push(`ContentSidebar missing collection-rail contract: ${token}`);
  }
}

for (const relative of [
  "src/modules/cms_admin/views/dashboard.tsx",
  "src/modules/cms_admin/views/data.tsx",
]) {
  const page = read(relative);
  for (const token of [
    "ContentSidebar",
    "lg:grid-cols-[248px_minmax(0,1fr)]",
  ]) {
    if (!page.includes(token)) {
      problems.push(`content page missing collection-rail contract: ${relative} (${token})`);
    }
  }
}

const dashboardPage = read("src/modules/cms_admin/views/dashboard.tsx");
for (const forbidden of ["API mode", "Private by default", "fieldCount"]) {
  if (dashboardPage.includes(forbidden)) {
    problems.push(`Content overview must not render overview stat content: ${forbidden}`);
  }
}
if (!dashboardPage.includes("sm:grid-cols-2 xl:grid-cols-3")) {
  problems.push("Content overview must use a collection card grid");
}

const dataPage = read("src/modules/cms_admin/views/data.tsx");
for (const forbidden of ["Browse collections", "SideDrawer"]) {
  if (dataPage.includes(forbidden)) {
    problems.push(`Data Studio must use the collection rail, not a drawer: ${forbidden}`);
  }
}

const sheet = read("src/components/ui/sheet.tsx");
for (const token of [
  'data-slot="sheet-content"',
  "max-w-[600px]",
  "border-l border-border",
  "border-r border-border",
  'side?: "left" | "right"',
  "slide-in-from-left",
  "bg-popover",
  "app-scrollbar",
  "bg-surface-subtle",
  "flex-col-reverse",
]) {
  if (!sheet.includes(token)) {
    problems.push(`Sheet missing surface contract: ${token}`);
  }
}

const pageActions = read("src/components/app/PageActions.tsx");
for (const token of [
  "DropdownMenuTrigger",
  'aria-label={label}',
  "MoreHorizontal",
  "destructive",
]) {
  if (!pageActions.includes(token)) {
    problems.push(`PageActions missing action-menu contract: ${token}`);
  }
}

const pageHeader = read("src/components/app/PageHeader.tsx");
if (pageHeader.includes("actions")) {
  problems.push("PageHeader must not render page actions; use PageActionsPortal");
}

for (const relative of [
  "src/modules/cms_admin/views/dashboard.tsx",
  "src/modules/cms_admin/views/data.tsx",
  "src/modules/cms_admin/views/access.tsx",
  "src/modules/cms_admin/views/settings.tsx",
  "src/modules/cms_admin/views/profile.tsx",
  "src/modules/eterc_administrators/views/manage.tsx",
  "src/modules/eterc_administrators/views/create.tsx",
  "src/modules/media/MediaLibrary.tsx",
]) {
  if (read(relative).includes("PageHeader")) {
    problems.push(
      `primary workspace page must use the top-bar breadcrumb, not PageHeader: ${relative}`,
    );
  }
}

if (read("src/modules/eterc_administrators/views/create.tsx").includes("max-w-3xl")) {
  problems.push("Create user must use the full content width, not max-w-3xl");
}

const pageActionsSlot = read("src/components/app/PageActionsSlot.tsx");
for (const token of [
  "PageActionsProvider",
  "PageActionsSlot",
  "PageActionsPortal",
  "createPortal",
  'data-testid="topbar-page-actions"',
]) {
  if (!pageActionsSlot.includes(token)) {
    problems.push(`PageActionsSlot missing top-bar action contract: ${token}`);
  }
}

for (const relative of [
  "src/modules/cms_admin/views/dashboard.tsx",
  "src/modules/cms_admin/views/data.tsx",
  "src/modules/cms_admin/views/access.tsx",
  "src/modules/cms_admin/views/settings.tsx",
  "src/modules/cms_admin/views/profile.tsx",
  "src/modules/eterc_administrators/views/manage.tsx",
  "src/modules/eterc_administrators/views/create.tsx",
  "src/modules/eterc_administrators/views/show.tsx",
  "src/modules/db/views/table_list.tsx",
  "src/modules/db/views/browse.tsx",
  "src/modules/db/views/sql_console.tsx",
  "src/modules/media/MediaLibrary.tsx",
]) {
  if (!read(relative).includes("PageActionsPortal")) {
    problems.push(`page actions must render in the top bar: ${relative}`);
  }
}

const sideDrawer = read("src/components/app/SideDrawer.tsx");
for (const token of [
  "SheetContent",
  'side = "left"',
  "aria-current",
  "max-w-[360px]",
  "SectionDrawer",
]) {
  if (!sideDrawer.includes(token)) {
    problems.push(`SideDrawer missing drawer contract: ${token}`);
  }
}

const ruleSheet = read("src/modules/cms_admin/views/access/RuleSheet.tsx");
for (const token of [
  "SheetContent",
  "SheetBody",
  'aria-label="Policy sections"',
  "Policy section",
  "Override in this role",
  "Notice",
  "Inherited",
  'label="Insert a user variable"',
]) {
  if (!ruleSheet.includes(token)) {
    problems.push(`RuleSheet missing policy-editor contract: ${token}`);
  }
}
if (ruleSheet.includes("TabsList")) {
  problems.push("RuleSheet must use a section rail, not tabs");
}

const accessPage = read("src/modules/cms_admin/views/access.tsx");
for (const token of ["SectionDrawer", "SideDrawer", "PageActions", "Browse roles"]) {
  if (!accessPage.includes(token)) {
    problems.push(`Access page missing drawer/action contract: ${token}`);
  }
}
if (accessPage.includes("TabsList")) {
  problems.push("Access page must use a section drawer, not tabs");
}

const profilePage = read("src/modules/cms_admin/views/profile.tsx");
for (const token of [
  "PageActionsPortal",
  'aria-label="API keys"',
  "profile_key_create",
  "profile_key_revoke",
  "Create API key",
]) {
  if (!profilePage.includes(token)) {
    problems.push(`Profile page missing API-key contract: ${token}`);
  }
}

const createUserPage = read("src/modules/eterc_administrators/views/create.tsx");
for (const token of [
  "first_name",
  "last_name",
  "email",
  "role_id",
  "confirm_password",
  "ShieldCheck",
]) {
  if (!createUserPage.includes(token)) {
    problems.push(`Create user page missing account-field contract: ${token}`);
  }
}

for (const relative of [
  "src/components/ui/input.tsx",
  "src/components/ui/input-group.tsx",
]) {
  if (!read(relative).includes("h-10")) {
    problems.push(`${relative} must use the 40 px field height`);
  }
}
if (!read("src/components/ui/select.tsx").includes("data-[size=default]:h-10")) {
  problems.push("Select must use the 40 px default field height");
}

const authShell = read("src/modules/login/views/AuthShell.tsx");
for (const token of ["bg-background", "max-w-[440px]", "rounded-lg"]) {
  if (!authShell.includes(token)) {
    problems.push(`AuthShell missing auth surface contract: ${token}`);
  }
}

const loginDefault = read("src/modules/login/views/login_default.tsx");
for (const token of [
  "lg:grid-cols-2",
  "bg-card",
  "style={background_style(background)}",
  "social_providers",
  "login_error_message",
  "site_host",
]) {
  if (!loginDefault.includes(token)) {
    problems.push(`login_default missing split-login contract: ${token}`);
  }
}
if (loginDefault.includes("AuthShell")) {
  problems.push("login_default must use the split surface, not AuthShell");
}
if (/client[_-]?secret/i.test(loginDefault)) {
  problems.push("login_default must not receive OAuth client secrets");
}
for (const relative of [
  "src/modules/login/views/forgot_password_form.tsx",
  "src/modules/login/views/reset_password_form.tsx",
]) {
  if (!read(relative).includes("AuthShell")) {
    problems.push(`${relative} must keep the shared AuthShell surface`);
  }
}
if (!read("src/modules/login/Login.ts").includes("get_public_login_settings")) {
  problems.push("Login controller must pass only public login settings to the view");
}
if (!read(".gitignore").includes("/data/settings/login.secrets.json")) {
  problems.push("OAuth client secrets must be gitignored");
}
if (!read("data/settings/login.json").includes('"version": 1')) {
  problems.push("data/settings/login.json must contain the versioned defaults");
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
