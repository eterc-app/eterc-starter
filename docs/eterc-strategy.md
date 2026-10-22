# Eterc naming and architecture

Status: current

This document describes the naming rules and architectural boundaries used by
the Eterc starter. It replaces the earlier rebrand proposal.

## 1. Brand and package names

| Item | Value |
|---|---|
| Framework name | **Eterc** |
| Package name | `eterc` |
| Home page | `https://www.eterc.app` |
| Documentation | `https://eterc-docs.eterc.app` |
| Forums | `https://eterc-forum.eterc.app` |
| API base | `https://eterc-api.eterc.app/` |

All outbound project links are kept in `src/engine/config.ts`.

Eterc is an MIT-licensed TypeScript framework for Next.js. The required
copyright and permission notice for its upstream project is preserved in
`THIRD_PARTY_NOTICES.md`; the rest of the application uses Eterc naming only.

## 2. Naming contract

| Kind | Rule | Example |
|---|---|---|
| Framework classes | `Pascal_snake` | `Eterc_control`, `Eterc_administrators` |
| Files for framework classes | Same name as the class | `Eterc_administrators.ts` |
| Controller/model methods | `snake_case` | `submit_login`, `get_db_config_form_data` |
| TS-only framework functions | `snake_case` | `site_url`, `build_request` |
| React components | `PascalCase` | `AdminTemplate`, `EtForm`, `EtButton` |
| React hooks | `use` + `PascalCase` | `useEtUi` |
| Constants | `UPPER_SNAKE_CASE` | `BASE_URL`, `ET_SECRET` |
| Cookies, headers, DB, URLs | Eterc names | `et_session`, `eterctoken`, `eterc_user_id` |

React and Next.js naming rules take precedence for components, hooks, reserved
exports, and third-party APIs.

## 3. Modules and files

Controllers live in `src/modules/<module>/<Class>.ts` and extend `Eterc`.
Views are React components registered per module and aggregated in
`src/modules/views.ts`. Controllers are loaded through
`src/engine/registrations.ts`.

Framework modules:

- `welcome`, `setup`, `login` (including `forgot_password`)
- `eterc_security`, `eterc_email`, `eterc_administrators`
- `pagination`, `image_uploader`, `db`, `module_relations`, `language`,
  `utilities`, `file`, `image`
- `eterc_control` and its child generators

The core services (`flashdata`, `form`, `string_service`, `templates`,
`eterc_tokens`, `url`, `validation`) are implemented inside `src/engine`.

Generated modules live under `src/modules/generated/<module>/` and are indexed
by `src/modules/generated/index.ts`.

## 4. Public URLs

Clean paths are the canonical browser URLs:

| Public URL | Internal module |
|---|---|
| `/control` | `eterc_control` |
| `/control/flo/home` | `eterc_control-flo` |
| `/control/module-builder` | `eterc_control-module_builder` |
| `/administrators/manage` | `eterc_administrators` |

The alias resolution lives in `src/engine/url-aliases.ts`. The browser URL and
`current_url()` keep the clean path; `site_url()` emits the clean path.

## 5. Database

SQLite is used by both the framework `Db` class and Prisma. The schema lives in
`prisma/schema.prisma`; the installer DDL lives in
`src/modules/setup/Setup_model.ts`.

Core tables:

- `eterc_user_levels`
- `eterc_users`
- `eterc_administrators`
- `eterc_tokens`
- `et_sessions`
- `login_attempts`
- `password_resets`

The installer is idempotent. A fresh project starts in the setup wizard and
creates the schema and first administrator.

## 6. Sessions, tokens, and CSRF

| Concern | Storage |
|---|---|
| Session id | `et_session` cookie and `et_sessions` table |
| Auth token cookie | `eterctoken` |
| Auth token header | `EtercToken` |
| Auth token storage | `eterc_tokens` table and session value |
| Flashdata | `et_flash` cookie, `x-et-flash` header |
| CSRF | `et_csrf` cookie, `x-et-csrf` header |

The API accepts the signed-in session as well as an `EtercToken` header.

## 7. JSON API and Scalar

- Public API routes: `/api/v1/{resource}/{method}`.
- Only controllers registered under a module ending in `_api` are exposed.
- Methods whose names start with `_` are private.
- OpenAPI 3.1 document: `/api/openapi`.
- Interactive reference: `/api-reference` (Scalar).

OpenAPI fragments are read from `src/modules/<module>/assets/api.json` at
request time. See `README.md` for an example resource.

## 8. Styling

Tailwind CSS 4 and shadcn/ui are the only styling system. The single authored
stylesheet is `src/app/globals.css`; runtime pagination CSS is the documented
exception. `npm run styles:check` enforces the rule.

## 9. Validation

Before committing:

```bash
npm run typecheck
npm run styles:check
npm run lint
npm run build
```

After changing the starter, rebuild the desktop app's bundled starter archive
and installer so both artifacts ship the same code.
