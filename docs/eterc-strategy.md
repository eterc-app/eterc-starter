# Eterc — Rebrand, PHP Naming Parity, and Tailwind/shadcn Strategy

Status: proposal · 2026-10-20
Scope: `C:\PROJECT\ui-builder\eterc-starter` (the Next.js port of Trongate 2.2026.0927)

---

## 0. Decisions at a glance

| Decision | Choice |
|---|---|
| Framework name | **Eterc** (`eterc` in package names, `Eterc` in prose) |
| npm package | `eterc` — unclaimed as of 2026-10-20 |
| npm scope | `@eterc/*` — unclaimed |
| CLI package | `create-eterc` — unclaimed |
| Home page | `https://www.eterc.app` |
| Docs site | `https://eterc-docs.eterc.app` |
| GitHub org/repo | `etercjs` — handle unclaimed (`eterc` is already a GitHub user) |
| Naming rule | PHP surface keeps its **exact** PHP name; TS-only code uses `snake_case`; React/Next use their required conventions |
| CSS rule | Tailwind CSS 4 + shadcn/ui are the only styling system; one authored `globals.css`; no legacy CSS files |
| Compatibility rule | Keep `tg_*` cookies/headers, `trongate_*` module names, and PHP class/method names — the brand changes, the protocol does not |

**Tagline:** *Eterc — PHP semantics, Next.js speed.*

**Licence:** Trongate is MIT (Copyright © 2019 Dave Connelly). Eterc must ship the original MIT notice and attribution. Rebranding is permitted; removing the notice is not.

---

## 1. Framework name

### 1.1 Recommendation: **Eterc**

Reasons:

- Short, pronounceable, and satisfies the constraint (it *is* the word `eterc`).
- The npm name `eterc` returns **404** from the registry — available.
- `eterc.app` is the production domain: the home page is `https://www.eterc.app`, and section sites follow the `<project>-<section>.eterc.app` pattern.
- A scope (`@eterc/core`, `@eterc/ui`) protects the ecosystem even if the unscoped name is later contested.
- Variants are available if the primary is ever rejected: `etercjs`, `etercforge`, `etercstack`, `etercgate`, `etercbase` (all verified unclaimed).

### 1.2 Availability evidence (checked 2026-10-20)

| Identifier | Status |
|---|---|
| npm `eterc` | **available** (registry 404) |
| npm `create-eterc`, `eterc-cli`, `eterc-docs`, `@eterc/core` | **available** |
| npm `etercjs`, `eterc-ui`, `etercui`, `etercforge`, `etercstack`, `etercgate`, `etercbase`, `etercframe`, `etercnext` | **available** |
| `eterc.dev` | available (optional redirect) |
| `eterc.com` | registered |
| `eterc.app` | registered — production home (`www.eterc.app`) |
| GitHub `eterc` | taken by user `EterC` |
| GitHub `etercjs` | **available** (404) |

Caveats:

- Availability is a snapshot, not a reservation. Register the npm scope and the GitHub org **before** publishing.
- Do a trademark search before a public launch; a GitHub handle with the same spelling already exists.
- `eterc.com` is registered and is not part of this plan. `eterc.dev` can be registered later as a redirect to `https://www.eterc.app`.
- Every section site uses the project name as the subdomain prefix: `eterc-docs`, `eterc-forum`, `eterc-api`, and so on.

### 1.3 Public URL map

The PHP app pointed at `https://trongate.io`. Eterc keeps the same information architecture and maps links as follows:

| Original | Eterc |
|---|---|
| `https://trongate.io` | `https://www.eterc.app` |
| `https://trongate.io/documentation` | `https://eterc-docs.eterc.app` |
| `https://trongate.io/docs` | `https://eterc-docs.eterc.app` |
| `https://trongate.io/forums...` | `https://eterc-forum.eterc.app` |
| `https://trongate.io/` (API base) | `https://eterc-api.eterc.app/` |

Do not hard-code these in views. Use the constants in `src/engine/config.ts`:

```ts
export const ETERC_HOME_URL = "https://www.eterc.app";
export const ETERC_DOCS_URL = "https://eterc-docs.eterc.app";
export const ETERC_FORUM_URL = "https://eterc-forum.eterc.app";
export const ETERC_API_URL = "https://eterc-api.eterc.app/";
```

The rule for any future `https://trongate.io/<section>` link is: keep the section semantics, move it to `<project>-<section>.eterc.app`. The home page stays on `www`.

### 1.4 Package layout

```
eterc                     meta package / starter
@eterc/core               engine, routing, DB, validation, sessions
@eterc/ui                 shadcn-based component layer + design tokens
@eterc/generators         Flo / Site Builder / code generators
create-eterc              npx create-eterc@latest
```

The current monorepo is a single app; extraction into packages can happen after the rename and CSS migration. Do not block either on a package split.

### 1.5 What keeps the Trongate name

For parity and backward compatibility:

- `tg_session`, `tg_csrf`, `tg_flash`, `trongatetoken` cookies/headers.
- `trongate_control`, `trongate_administrators`, `trongate_security`, `trongate_tokens` module names.
- `trongate_user_id` database column.
- PHP method/class names, including legacy spellings.
- MIT attribution and a “port of Trongate” line in the README.

Brand-level changes only: package name, README title/logo, site metadata, site/domains, CLI banner, example app names.

---

## 2. PHP naming parity

### 2.1 Guiding rule

> If a symbol exists in the PHP framework, the TypeScript symbol must use the **same spelling**. TypeScript-only plumbing uses `snake_case` too, so the whole framework reads like Trongate. React and Next.js keep the names their runtimes require.

This makes the port grep-compatible with the PHP source: searching `set_flashdata` finds both implementations.

### 2.2 Naming contract

| Kind | Rule | Example | Exceptions |
|---|---|---|---|
| PHP classes | `Pascal_snake`, exact PHP spelling | `Trongate_control`, `Image_uploader`, `Forgot_password` | React components |
| Files for PHP classes | Same name as the class | `Trongate_administrators.ts` | Next route files |
| Controller/model methods | exact PHP `snake_case` | `submit_login`, `get_db_config_form_data` | `constructor` |
| Public/protected helpers | exact PHP `snake_case` | `set_flashdata`, `current_url`, `get_last_segment` | — |
| TS-only framework functions | `snake_case` | `site_url`, `build_request`, `run_request` | React components/hooks |
| Private helpers | `snake_case` | `add_error`, `parse_rule` | — |
| React components | `PascalCase` | `AdminTemplate`, `ModuleBuilderWizard` | — |
| React hooks | `use` + `PascalCase` | `useTgUi` | React rule |
| Types/interfaces | `PascalCase` | `TgRequest`, `RouteTarget` | — |
| Constants | `UPPER_SNAKE_CASE` | `BASE_URL`, `TG_BASE_URL` | — |
| Next reserved exports | verbatim | `default`, `metadata`, `generateMetadata`, `dynamic`, `instant`, `GET`, `POST` | Next rule |
| Cookies/headers/DB/URLs | unchanged | `tg_session`, `current_url`, `trongate_user_id` | migration compatibility |

**Always exempt:** `constructor`, `super`, `default`, React event props (`onClick`), shadcn/Radix props (`asChild`, `variant`), DOM APIs, third-party imports.

### 2.3 Audit result (actual, not hypothetical)

A scan of 44 PHP controller/model classes against the port found:

- **58 deltas total**
  - **21** are `__construct` → `constructor` — expected, allowlisted.
  - **37** are real drift:
    - **16** DB API methods (`insert`, `update`, `query`, `get_where`, …) implemented in `src/engine/db.ts` under the **same names** — the class was split, not renamed.
    - **19** setup-wizard methods replaced by a different flow (`database_config`, `submit_admin_account`, …).
    - **2** `prep_file_contents` helpers in the relations/uploader builders.
- **0 camelCase controller/model methods.** The controller surface is already faithful.
- **9 PHP classes** have no same-name TS file because they were reorganised into engine services (`Url`, `Flashdata`, `String_service`, `Templates`, `Validation`, `Validation_model`, `Trongate_tokens`, `Form`, plus the module-level `Db`).

**Conclusion:** the rename is concentrated in the **helper layer**, **class/file names**, **private helpers**, and **generator templates** — not in the controllers. That keeps the risk low and the codemod mechanical.

### 2.4 Helper rename inventory

This is the public drift that matters most. Counts are current call sites (source + generated templates).

#### URL / request / flashdata

| Current | Canonical | Call sites |
|---|---|---|
| `siteUrl` | `site_url` (TS-only; consistency) | 106+ |
| `setFlashdata` | `set_flashdata` | 28+ |
| `currentUrl` | `current_url` | 7+ |
| `previousUrl` | `previous_url` | 9+ |
| `removeQueryString` | `remove_query_string` | 4+ |
| `getNumSegments` | `get_num_segments` | 2+ |
| `getLastSegment` | `get_last_segment` | 11+ |
| `fromTrongateMx` | `from_trongate_mx` | — |
| `currentUrlWithQuery` | `current_url_with_query` | — |
| `getParam` | `get_param` | 9+ |
| `flashMessages` | `flash_messages` | — |
| `hasPost` | `has_post` | — |
| `uploadedFile` | `uploaded_file` | — |
| `uploadedFiles` | `uploaded_files` | — |

#### String service (`modules/string_service/String_service.php`)

`truncateStr → truncate_str`, `truncateWords → truncate_words`, `getLastPart → get_last_part`, `extractContent → extract_content`, `removeSubstrBetween → remove_substr_between`, `nicePrice → nice_price`, `urlTitle → url_title`, `sanitizeFilename → sanitize_filename`, `makeRandStr → make_rand_str`, `replaceHtmlTags → replace_html_tags`, `removeHtmlCode → remove_html_code`, `filterStr → filter_str`, `filterString → filter_string`, `filterName → filter_name`, `escapeHtml → escape_html`, `escapeRegExp → escape_regexp`, `decodeHtmlEntities → decode_html_entities`, `stripTags → strip_tags`.

#### Engine plumbing (TS-only, snake_case for consistency)

`buildRequest → build_request`, `runInContext → run_in_context`, `runRequest → run_request`, `flushResponseCookies → flush_response_cookies`, `runWithContext → run_with_context`, `getContext → get_context`, `hasContext → has_context`, `prepareController → prepare_controller`, `registerSyncService → register_sync_service`, `resolveRoute → resolve_route`, `loadController → load_controller`, `registerView → register_view`, `registerViews → register_views`, `getView → get_view`, `renderView → render_view`, `createCsrfToken → create_csrf_token`, `isValidCsrfToken → is_valid_csrf_token`, `csrfToken → csrf_token`, `csrfCheck → csrf_check`, `getSessionId → get_session_id`, `ensureSessionId → ensure_session_id`, `sessionGet → session_get`, `sessionSet → session_set`, `sessionUnset → session_unset`, `sessionClear → session_clear`, `purgeExpiredSessions → purge_expired_sessions`, `escapeIdentifier → escape_identifier`, `ensureDir → ensure_dir`, `dataPath → data_path`, `ensureDataDirs → ensure_data_dirs`, `createProxy → create_proxy`.

React components (`TgForm`, `TgButton`, `TgUiProvider`, `Flashdata`, `ValidationErrors`), hooks (`useTgUi`), and Next exports are **not** renamed.

### 2.5 Class / file rename map

| Current | Canonical | PHP source |
|---|---|---|
| `TrongateAdministrators.ts` / class `TrongateAdministrators` | `Trongate_administrators.ts` / `Trongate_administrators` | `Trongate_administrators.php` |
| `TrongateAdministrators_model.ts` / `TrongateAdministratorsModel` | `Trongate_administrators_model.ts` / `Trongate_administrators_model` | `Trongate_administrators_model.php` |
| `ModuleRelations.ts` / class `ModuleRelations` | `Module_relations.ts` / `Module_relations` | `Module_relations.php` |
| `ModuleRelations_model.ts` / `ModuleRelations_model` | `Module_relations_model.ts` / `Module_relations_model` | `Module_relations_model.php` |
| `ForgotPassword.ts` / class `ForgotPassword` | `Forgot_password.ts` / `Forgot_password` | `Forgot_password.php` |
| `DbAdmin.ts` / class `DbAdmin` | `Db.ts` / `Db` (module controller; engine stays `Db`) | `Db.php` |
| `DbAdmin_model.ts` / `DbAdminModel` | `Db_model.ts` / `Db_model` | port-only helper |
| `TrongateSecurityService.ts` / `TrongateSecurityService` | `Trongate_security.ts` / `Trongate_security` | `Trongate_security.php` |
| `engine/templates.tsx` / `TemplatesService` | `engine/Templates.tsx` / `Templates` | `Templates.php` |
| `engine/tokens.ts` / `TrongateTokensService` | `engine/Trongate_tokens.ts` / `Trongate_tokens` | `Trongate_tokens.php` |
| `engine/validation.ts` / `ValidationService` | `engine/Validation.ts` / `Validation` | `Validation.php` |
| `engine/string-service.ts` (functions) | `engine/String_service.ts` | `String_service.php` |
| `engine/url.ts` (functions) | `engine/Url.ts` | `Url.php` |
| `engine/flashdata.ts` (functions) | `engine/Flashdata.ts` | `Flashdata.php` |

Notes:

- TypeScript allows `Db` in `engine/db.ts` and `Db` in `modules/db/Db.ts` to coexist; imports use aliases (`import DbController from ...`). Do not rename the engine class.
- `Form` is not merely renamed: the PHP `form_*` helpers were not ported; the port uses the `TgForm` component. Treat this as a separate parity gap (see §2.7), not a rename.
- `Url`, `Flashdata`, `String_service`, `Templates`, `Validation`, `Trongate_tokens` were flattened into functions. Renaming the files/classes first is cheap; adding service facades (`this.url`, `this.flashdata`) is an optional second step if true PHP ergonomics are required.

### 2.6 Real functional gaps found by the audit

These are not renaming tasks; decide explicitly:

1. **DB API location.** `insert/update/query/...` live on the engine `Db` class, while PHP exposes them through the module class. The names match; add a manifest mapping rather than duplicating methods.
2. **Setup wizard.** The port replaced 19 PHP step methods with a stateful wizard. Either:
   - add thin PHP-named methods (`database_config`, `submit_admin_account`, …) that map to wizard steps, or
   - record them in `naming-exceptions.json` as an intentional architectural divergence. Recommended for fidelity: add the aliases.
3. **`prep_file_contents`.** Two builder models dropped this helper. Rename the replacement or restore the method name.
4. **`Form` module.** `form_input`, `form_open`, `form_dropdown`, … are absent. To claim “same framework”, port them as React-element-returning helpers (`Form_input`, etc. are not valid; use `form_input()` returning `ReactNode`) or document the component replacement. Budget ~2 days if porting.
5. **Service modules as URLs.** PHP can address `/url/current_url`; the port treats these as engine services. Decide whether routability is part of parity; if yes, register thin controllers.

### 2.7 Enforcement

#### Parity manifest

Generate `parity/php-surface.json` from the PHP source using PHP's `token_get_all` (or the npm `php-parser` package if PHP is not installed):

```json
{
  "helpers": ["anchor", "current_url", "flashdata", "get_last_segment", "get_num_segments", "previous_url", "redirect", "remove_query_string", "segment", "set_flashdata"],
  "classes": {
    "Login": { "file": "modules/login/Login.php", "methods": ["index", "submit_login"] }
  }
}
```

Then `scripts/check_parity.ts` uses `ts-morph` to:

- resolve each PHP class to its TS counterpart (mapping file for moved classes),
- collect public/protected methods,
- compare against `parity/naming-exceptions.json`,
- fail with `expected name -> actual name` and the file/line.

Run it in `npm run parity` and in CI.

#### ESLint guard

Scope to `.ts` framework files (not `.tsx`):

```js
{
  files: ["src/engine/**/*.ts", "src/modules/**/*.ts"],
  rules: {
    "@typescript-eslint/naming-convention": [
      "error",
      { selector: "classMethod", format: ["snake_case"] },
      { selector: "function", modifiers: ["exported"], format: ["snake_case"] },
      {
        selector: "class",
        format: null,
        custom: { regex: "^[A-Z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*$", match: true }
      }
    ]
  }
}
```

`naming-exceptions.json` carries reasons, e.g.:

```json
[
  { "symbol": "constructor", "reason": "TypeScript reserved" },
  { "symbol": "GET", "reason": "Next.js route handler" },
  { "symbol": "TgForm", "reason": "React component" },
  { "symbol": "setup.database_config", "reason": "replaced by wizard until aliases are added" }
]
```

#### Codemod

`scripts/rename_symbols.ts` (ts-morph):

1. Read `parity/naming-map.json`:
   ```json
   {
     "functions": { "setFlashdata": "set_flashdata" },
     "classes": { "TrongateAdministrators": "Trongate_administrators" },
     "files": { "src/modules/trongate_administrators/TrongateAdministrators.ts": "src/modules/trongate_administrators/Trongate_administrators.ts" }
   }
   ```
2. Resolve declarations and call `rename()`.
3. Move class files and let ts-morph rewrite imports.
4. Run `tsc --noEmit`, `eslint --fix`, `npm run build`.
5. Update generator templates (`src/modules/trongate_control/flo/templates/*.ts`) in the same commit — otherwise every newly generated module reintroduces the old names.
6. Add a golden-file test: generate a sample module, assert no `siteUrl|setFlashdata|...` appears in the output.

#### Order of operations

1. `git init` + baseline commit (the workspace currently has no VCS — this is the single most important safety step).
2. Commit the strategy + parity script with **no** renames.
3. Rename helpers (largest call-site count, lowest risk).
4. Rename classes/files and update registrations.
5. Rename private helpers (optional, cosmetic).
6. Update generators, README, docs.
7. Make `npm run parity` and ESLint guards blocking.

---

## 3. Tailwind CSS 4 + shadcn/ui

### 3.1 Current state (measured)

| Item | Count / size |
|---|---|
| Public CSS files | 13 (~90.5 KB) |
| App CSS files | `src/app/globals.css` (268 B), `src/app/page.module.css` (2.6 KB) |
| Legacy selectors | **643 distinct class names** |
| Static `className="..."` tokens | 193 distinct |
| Dynamic `className={...}` expressions | 20 |
| Inline `style={{...}}` objects | 65 |
| `<style>` blocks in views | 22 |
| `@keyframes` | 15 |
| `@media` queries | 25 |
| CSS custom properties | 32 |
| Element-selector rules | 128 |

Stylesheets are loaded via `<link>` tags in `src/app/layout.tsx` and several views, plus W3.css for the Properties Builder. The icon font (`trongate-icons.css`) is separate.

### 3.2 Target architecture

```
src/app/globals.css          ← the only authored CSS file
src/components/ui/*          ← shadcn components
src/lib/utils.ts             ← cn()
components.json              ← shadcn config
postcss.config.mjs           ← @tailwindcss/postcss
```

Dependencies (versions verified 2026-10-20):

```
tailwindcss@4.3.3
@tailwindcss/postcss@4.3.3
shadcn@4.22.1
tw-animate-css@1.4.0
lucide-react@1.60.0
class-variance-authority@0.7.1
tailwind-merge@3.7.0
clsx@2.1.1
```

Setup:

```bash
npx shadcn@latest init
npx shadcn@latest add button card input label textarea select checkbox radio-group \
  table dialog alert-dialog dropdown-menu tabs accordion command popover separator \
  badge tooltip sonner scroll-area
```

If the CLI rejects Next 16, perform the same setup manually — it is only `components.json`, `lib/utils.ts`, CSS variables, and the dependency list.

### 3.3 One CSS file, no exceptions in the app

`src/app/globals.css`:

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-muted: var(--muted);
  --color-border: var(--border);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-danger: var(--danger);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --animate-spin: spin 1s linear infinite;
  --animate-blink: blink 1s step-end infinite;
}

:root {
  /* Port the existing Trongate palette 1:1 so the rebrand does not change
     the visual identity on day one. Add Eterc-specific tokens after parity. */
  --primary: #2563eb;
  --primary-foreground: #ffffff;
  --secondary: #64748b;
  --success: #16a34a;
  --warning: #d97706;
  --danger: #dc2626;
  --background: #ffffff;
  --foreground: #171717;
  --border: #e5e7eb;
  --radius: 0.5rem;
  /* Existing framework tokens: --header-bg, --sidebar, --submenu-bg,
     --row-hover-bg, --row-odd-bg, --overlay-bg, ... */
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground antialiased; }
}
```

Rules:

- No `tailwind.config.ts` (v4 is CSS-first); add one only if a third-party tool insists.
- Use `next/font` for typography; expose `--font-sans`.
- Icon font deleted; use `lucide-react`.
- W3.css deleted; Properties Builder rebuilt with shadcn.
- Dark mode is optional; reserve the `.dark` token block now.

### 3.4 Legacy class → shadcn/Tailwind mapping

Start with the high-frequency tokens found in source:

| Legacy | Target |
|---|---|
| `button`, `btn`, `btn-primary`, `button alt`, `danger`, `success` | `<Button variant="default|secondary|destructive|outline">` |
| `card`, `card-heading`, `card-body` | `<Card><CardHeader><CardTitle><CardContent>` |
| `form-group`, `form-column`, `validation-errors` | `<Label>` + `<Input>` + `<FormMessage>` (or `ValidationErrors`) |
| `table`, `alt` (row striping) | `<Table>` + `data-[state=selected]` / `odd:` |
| `alert-success`, `alert-error`, `bg-flash-overlay` | `<Alert>` / `sonner` |
| `accordion`, `accordion-content`, `accordion-top-rhs-icon` | `<Accordion>` |
| `autocomplete`, `autocomplete-items`, `autocomplete-active` | `<Command>` / `<Combobox>` |
| `options-selector`, `selector-btn` | `<ToggleGroup>` / `<Tabs>` |
| `modal`, `modal-*` | `<Dialog>` / `<AlertDialog>` |
| `dropdown`, `dropdown-*` | `<DropdownMenu>` |
| `w3-*` (23 KB W3.css) | Tailwind utilities; delete W3.css |
| `container`, `center-stage`, `text-center`, `mt-1/2/3` | Tailwind layout/spacing utilities |
| `transferer`, `transferer-*` | two-pane `Card` + `ScrollArea` + `Button` |
| `blink`, `spin`, `fading`, `celebrate-pulse`, `form-shake` | `@theme` keyframes + `animate-*` utilities |

The full map should be generated into `parity/legacy-class-map.json`; do not hand-edit 643 classes.

### 3.5 Migration order

1. **Foundation** — install Tailwind/shadcn, create tokens, `cn()`, verify a single route renders with utilities.
2. **Shell** — `AdminTemplate` (header, sidebar, submenu, footer, flashdata), `Error404`, error pages.
3. **Auth** — login variants, forgot/reset password, setup wizard.
4. **Core admin** — welcome, administrators, DB admin, pagination, language, utilities, image uploader, module relations.
5. **Control panel** — dashboard, Flo, Evo.
6. **Builders** — module builder, site builder, relations builder, uploader builder, properties builder (replace W3.css).
7. **Query Builder** — canvas/drag layout last; it depends on computed geometry.
8. **Delete** all `public/**/*.css`, `<link rel="stylesheet">`, `page.module.css`, and the icon font.

Per page:

1. Capture Playwright screenshots at 375/768/1440 px.
2. Replace markup with shadcn/Tailwind.
3. Compare screenshots; fix visual regressions.
4. Remove that module's `<link>` tag.
5. Only then delete its CSS file.

### 3.6 Allowed exceptions (documented, not hidden)

- **Computed inline styles** — query-builder canvas coordinates, progress widths, dynamic colors coming from DB/config. These are values, not style sheets. Require a comment `/* computed geometry */` and forbid static literal `style={{}}`.
- **Pagination custom CSS** — convert settings to CSS variables applied to the nav element (`style={{ "--pg-active-bg": color }}`), then use arbitrary values (`bg-[var(--pg-active-bg)]`). If arbitrary user CSS remains a feature, treat it as a sanitised escape hatch and mark it in the guard script.
- **Emails** — inline CSS is required by email clients and is outside the app CSS pipeline. Keep it inline; do not route it through Tailwind.
- **Third-party embeds** — if any remain, isolate them behind a component and document.

### 3.7 Guardrails

`scripts/check_styles.mjs` (CI + `npm run styles:check`):

- Fail if any `.css` exists outside `src/app/globals.css` (allowlist for email assets if introduced).
- Fail on `<link rel="stylesheet">` or `<style>` in `src/**/*.tsx` unless the file is in the allowlist (pagination/email).
- Fail on static `style={{ ... }}` literal values; allow `style={{ "--var": value }}` and computed expressions with an inline `/* computed */` marker.
- Fail if `public/css/` or `public/*_module/css/` exists.
- Warn on raw hex colors in TSX; require tokens.

Class sorting: `prettier-plugin-tailwindcss` (add to Prettier config).

Visual regression: Playwright route snapshots for every module at three widths; keep the baseline in `tests/screenshots/`.

### 3.8 Generator output

Flo/Site Builder templates currently emit legacy markup and camelCase helpers (`siteUrl`, `setFlashdata`). They must be updated in the **same** change as the rename, otherwise every new module reintroduces the old style. Add a generation smoke test:

```bash
# generate a scratch module, then assert:
rg -n "siteUrl|setFlashdata|className=\"button|/css/trongate" src/modules/generated/
# expect: no matches
```

Generated modules should emit shadcn imports (`@/components/ui/button`, etc.) and Tailwind class strings from the start.

---

## 4. Execution plan

### Phase 0 — Safety and baseline (1 day)

- `git init`, commit the current green state (tsc/build/lint/smoke).
- Capture Playwright screenshots of all routes.
- Generate `parity/php-surface.json` and the current drift report.
- Add `npm run parity` and `npm run styles:check` as non-blocking scripts.

**Exit:** baseline artifacts committed; no code changes.

### Phase 1 — Helper rename + generator parity (3–4 days)

- Add `parity/naming-map.json` and `scripts/rename_symbols.ts`.
- Rename the helper layer (`set_flashdata`, `current_url`, `remove_query_string`, string service, engine plumbing).
- Update all call sites and `flo/templates/*`.
- Update README examples.
- Run tsc/lint/build/smoke; generate a module and verify canonical names.

**Exit:** `npm run parity` reports only allowlisted deltas; generators emit canonical names.

### Phase 2 — Class/file parity (2–3 days)

- Rename the classes/files in §2.5.
- Update `registrations.ts`, `views.ts`, dynamic imports, tests.
- Add service facades only if required for parity (optional).
- Add PHP-named setup aliases or record the exception.

**Exit:** parity script green; all routes 200; generated-module smoke green.

### Phase 3 — Tailwind/shadcn foundation (2–3 days)

- Install dependencies, `components.json`, `globals.css`, tokens, `cn()`.
- Convert shell + flashdata + error pages.
- Add guard scripts and Prettier plugin.
- Establish screenshot baseline.

**Exit:** app shell renders from Tailwind only; one legacy CSS file deleted.

### Phase 4 — Auth and setup (3–4 days)

- Convert six login variants, forgot/reset, setup wizard.
- Delete their `<style>` blocks and module CSS.

**Exit:** auth/setup pages use shadcn/Tailwind; no legacy CSS links on those routes.

### Phase 5 — Core admin (5–7 days)

- Welcome, administrators, DB admin, pagination, language, utilities, image uploader, module relations.
- Port pagination to CSS variables; remove `default_css.tsx`.

**Exit:** core admin routes converted; CSS files for those modules deleted.

### Phase 6 — Control panel and builders (6–8 days)

- Dashboard, Flo, Evo, module/site/relations/uploader builders.
- Properties Builder: delete W3.css, rebuild with `Accordion`, `Dialog`, `Tabs`.

**Exit:** control-panel routes converted; W3.css deleted.

### Phase 7 — Query Builder and cleanup (4–6 days)

- Convert static chrome to Tailwind; keep only computed geometry inline.
- Delete remaining CSS, `<link>` tags, icon font, `page.module.css`.
- Fix visual diffs at three breakpoints.
- Update docs, README, metadata, package name, MIT attribution.

**Exit:** `npm run styles:check` green; no `.css` outside `globals.css`; all snapshots approved.

**Total estimate:** ~26–35 engineer-days (5–7 weeks solo; ~3 weeks with two developers after Phase 2).

---

## 5. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| No version control | A bad codemod is unrecoverable | `git init` + commit before Phase 1; one commit per rename batch |
| Class/file rename breaks dynamic registrations | Routes 404 / build fails | ts-morph moves + tsc; route smoke test after each batch |
| Generated modules keep old names | Drift returns | Update templates in same commit; golden-file generation test |
| Renaming `Db` collides with engine `Db` | Build conflict | Module class `Db`, engine class `Db`; import alias `DbController` |
| Tailwind preflight changes global element styles | Visual regressions | Keep `@layer base` minimal; screenshot per route; migrate shell first |
| 643 legacy classes | Partial migration limbo | Module-by-module deletion; temporary allowlist; no new legacy classes |
| W3.css conflicts | Properties Builder layout breaks | Delete W3.css only after the page is rebuilt with shadcn |
| Query builder inline geometry | Looks broken if converted blindly | Keep computed inline styles; convert chrome only |
| Pagination custom CSS API | Users rely on arbitrary CSS | Convert to CSS variables; document breaking change or keep sanitised escape hatch |
| Email CSS | Emails break if Tailwind applied | Explicit exemption; keep inline styles |
| shadcn CLI/Next 16 incompatibility | Setup blocked | Manual setup is small; pin versions and verify in a branch |
| npm/domain name taken later | Rebrand churn | Register `eterc` on npm, secure `eterc.app`, and create the `etercjs` GitHub org before launch |
| Trademark conflict | Legal risk | Search before public launch; keep `etercjs` fallback |
| MIT attribution lost in rebrand | Licence violation | Keep `license.txt`, add attribution in README and package metadata |

---

## 6. Definition of done

1. `npm run parity` — 0 unallowlisted PHP/TS naming deltas.
2. `npm run styles:check` — 0 CSS files outside `src/app/globals.css`; 0 `<link rel="stylesheet">`; 0 static inline styles.
3. `rg "siteUrl|setFlashdata|currentUrl|removeQueryString|TrongateAdministrators|ModuleRelations|ForgotPassword"` returns only the allowlist.
4. Flo/Site Builder generation smoke test emits canonical names and shadcn/Tailwind markup.
5. All routes return the same status as the baseline; auth + CRUD + generator E2E pass.
6. Visual snapshots approved at 375/768/1440 px.
7. `package.json` name is `eterc`; README title/logo/metadata rebranded; MIT attribution retained.
8. `npm pack --dry-run` succeeds; the tarball contains no legacy CSS.
9. All rendered project links use the `ETERC_*` URL constants; no rendered `https://trongate.io` links remain.

---

## Appendix A — PHP helper names (source of truth)

From `engine/tg_helpers/*.php`:

```
current_url, segment, remove_query_string, get_num_segments, get_last_segment,
redirect, previous_url, anchor, set_flashdata, flashdata, block_url, json,
ip_address, display, return_file_info, sort_by_property, sort_rows_by_property,
from_trongate_mx
```

From module services:

```
String_service: truncate_str, truncate_words, get_last_part, extract_content,
remove_substr_between, nice_price, url_title, sanitize_filename, out,
make_rand_str, replace_html_tags, remove_html_code, filter_str, filter_string,
filter_name, escape_html, escape_regexp, decode_html_entities, strip_tags
Url: current_url, segment, remove_query_string, get_num_segments,
get_last_segment, redirect, previous_url, anchor
Flashdata: set_flashdata, flashdata
Trongate_tokens: attempt_get_valid_token, destroy, delete_old_tokens,
get_user_id, get_user_obj, get_user_level, generate_token, regenerate
Validation: set_language, reset_language, set_caller, set_rules, run,
display_errors, get_js_injection
```

## Appendix B — Audit commands

```bash
# PHP class/method inventory (run against a checkout of the upstream framework)
rg -n "^\s*(class|function)\s+" <path-to-upstream-framework>\modules

# TS class/method inventory
rg -n "^\s{2}[A-Za-z_]+\s*\(" C:\PROJECT\ui-builder\eterc-starter\src

# Naming drift (the script used for §2.3)
node scripts/php-ts-parity.js

# CSS inventory
rg -o "\.[a-zA-Z_][a-zA-Z0-9_-]*" public -g "*.css" | sort -u | wc -l
rg -n 'className="' src -g "*.tsx" | wc -l
rg -n "style=\{\{" src -g "*.tsx" | wc -l
```

---

*Prepared for the `eterc-starter` port. The next irreversible step is `git init`; the next code step is Phase 1 (helper renames).*
