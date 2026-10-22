# Eterc

A PHP-faithful TypeScript port of an established PHP framework (v2) and its
control-panel code generators to **Next.js App Router**. The PHP routing
model, module/controller/model structure, validation, sessions, tokens,
flashdata and control-panel workflows are preserved. Views and generated code
are TypeScript + React instead of PHP.

- Website: <https://www.eterc.app>
- Documentation: <https://eterc-docs.eterc.app>
- Forums: <https://eterc-forum.eterc.app>

## Stack

| Layer     | Choice                                                          |
| --------- | --------------------------------------------------------------- |
| Framework | Next.js 16.4 (App Router), React 19.3, TypeScript               |
| Database  | SQLite (`prisma/dev.db`)                                        |
| DB access | `better-sqlite3` behind the ported `Db` class; Prisma for schema |
| Passwords | bcryptjs (cost 11, same as PHP)                                 |
| Images    | sharp                                                           |
| Email     | nodemailer                                                      |
| UI        | Tailwind CSS 4 + shadcn/ui (one authored `src/app/globals.css`) |

## Quick start

```bash
npm install
npx prisma generate   # after schema edits
npm run dev
```

Open <http://localhost:3000>.

- A fresh database starts in the setup wizard (`/setup`).
- This workspace's development database is already installed with:
  - username `admin`
  - password `test12345`
  - admin login URL: `/login/login/tg-admin`
- To start over: stop the server, delete `prisma/dev.db*`, restart, and revisit
  `/`.

`.env`:

```dotenv
DATABASE_URL="file:./prisma/dev.db"
TG_SECRET=<64-char hex>     # HMAC key for CSRF tokens
# TG_BASE_URL="/"           # only when served under a sub-path
```

## Routing model

| PHP                                          | Port                                             |
| -------------------------------------------- | ------------------------------------------------ |
| `/{module}/{method}/{params}`                | same URL shape                                   |
| `/{parent}-{child}/{method}` (child module)  | same URL shape                                   |
| `POST /{module}/{method}` form posts         | React server action `tgSubmit`                   |
| `MX` JSON requests                           | `POST /api/xhr/{module}/{method}/{params}`       |
| `redirect('module/method')`                  | real navigation (`TgRedirectSignal`)             |
| PHP session                                  | `tg_sessions` table + `tg_session` cookie        |
| flashdata                                    | one-shot `tg_flash` cookie (`x-tg-flash` header) |
| CSRF (`csrf_token`)                          | signed `tg_csrf` cookie + `x-tg-csrf` header     |
| `segment()`, `post()`, `get_param()`, …      | same helpers, ported in `src/engine`             |

Public URLs use clean aliases while the canonical module names stay internal:
`/control` resolves to `trongate_control`, `/administrators` to
`trongate_administrators`, and `/control/flo` to `trongate_control-flo`. Every
`trongate_*` URL continues to work for compatibility.

Controllers live in `src/modules/<module>/<Class>.ts` and extend `Trongate`.
Views are React components registered per module (`views/index.ts` →
`register_views`), aggregated in `src/modules/views.ts`. Controllers are loaded
through `src/engine/registrations.ts`.

## JSON API and Scalar

The starter includes an opt-in JSON API and an interactive
[Scalar](https://scalar.com/) reference at `/api-reference`.

- Public API routes use `/api/v1/{resource}/{method}` and map to the
  `{resource}_api` controller. For example,
  `/api/v1/system/health` calls `System_api.health()`.
- Only controllers registered under a module name ending in `_api` are
  exposed. Ordinary page controllers are never made public by accident.
  Methods whose names start with `_` are private and cannot be called through
  the API; use that prefix for controller helpers.
- `/api/openapi` serves an OpenAPI 3.1 document assembled from
  `src/modules/<module>/assets/api.json` fragments.
- `/api-reference` renders that document with Scalar. Test requests use the
  current same-origin session, so signing in to the control panel is enough to
  call protected endpoints. External clients can send a `Trongatetoken`
  header instead.
- Scalar cannot read the HttpOnly session cookie, so protected operations may
  show "Authentication Required" in its test panel. Sending the request still
  uses the signed-in session. To test as an external client, choose Auth Type
  → API Key and paste a token.

Built-in endpoints:

| Method | URL                      | Purpose                                   |
| ------ | ------------------------ | ----------------------------------------- |
| GET    | `/api/v1/system/health`  | Public health check                       |
| GET    | `/api/v1/system/me`      | Current administrator (token required)    |
| GET    | `/api/v1/system/modules` | Project modules (token required)          |
| POST   | `/api/v1/system/echo`    | Echo a JSON body, query and method        |

Add a resource with a normal module plus a controller class ending in `_api`:

```ts
// src/modules/blog_api/Blog_api.ts
import { api_response, require_api_user } from "@/engine/api";
import { Trongate } from "@/engine/controller";

export default class Blog_api extends Trongate {
  list() {
    return api_response({ posts: [] });
  }

  create() {
    require_api_user();
    return api_response({ created: true }, 201);
  }
}
```

Register the loader in `src/engine/registrations.ts`:

```ts
blog_api: () => import("@/modules/blog_api/Blog_api"),
```

Then add the matching `src/modules/blog_api/assets/api.json` fragment so the
endpoint is documented in Scalar:

```json
{
  "paths": {
    "/api/v1/blog/list": {
      "get": {
        "tags": ["Blog"],
        "summary": "List posts",
        "responses": { "200": { "description": "Post list" } }
      }
    }
  }
}
```

The document is read when `/api-reference` and `/api/openapi` are requested, so
new or edited fragments appear on the next request. Use
`api_response(body, status, headers)` to set a non-200 status. The
`system_api` controller is built in, and the desktop app copies the API
reference files into older projects when it opens them.

## What is ported

**Engine** (`src/engine/`): config, request context, router/dispatch, `Db`,
session, CSRF, flashdata, input helpers, string service, validation, tokens,
model, controller, templates, URL helpers, views registry and UI primitives
(`TgForm`, `TgButton`, validation errors, flashdata).

**Framework modules**:

`welcome`, `setup`, `login` (+ `forgot_password`), `trongate_security`,
`trongate_email`, `trongate_administrators`, `pagination`, `image_uploader`,
`db`, `module_relations`, `language`, `utilities`, `file`, `image`,
`trongate_control`.

The PHP service modules (`flashdata`, `form`, `string_service`, `templates`,
`trongate_tokens`, `url`, `validation`) are implemented inside `src/engine`
rather than as separate modules.

**Control panel** (`trongate_control`): dashboard plus every child module —

- `flo` — Flo generator front-end
- `evo` — Evo shell (home, module manager, error/disabled helpers)
- `module_builder` — interactive "Create Module" wizard
- `query_builder` — visual SQL query builder
- `site_builder` — module generation service
- `properties` + `properties_builder` — property data service and builder
- `module_relations` + `module_relations_builder` — relation runtime and wizard
- `image_uploader` + `image_uploader_builder` — uploader runtime and wizard
- `plural_maker` — pluralisation engine (port-only landing page)

## Code generation

Flo and the Module Builder's Site Builder write complete Next.js modules to
`src/modules/generated/<module>/`:

```
<Module>.ts            controller
<Module>_model.ts      model
views/*.tsx            manage / create / show / delete_conf / not_found
                       (+ search_modal when a property is searchable)
views/index.ts         view registration map
manifest.json          metadata used by the generated-module index
<module>.sql           one-shot SQLite schema (removed after a clean run)
```

After each successful generation the index at
`src/modules/generated/index.ts` is rewritten with static imports and lazy
controller loaders; `src/engine/registrations.ts` and `src/modules/views.ts`
spread that index once, so no shared file needs editing per module. The dev
server must recompile (or be restarted) before the new routes resolve; a
production build picks up generated modules on the next build.

Module Relations Builder and Image Uploader Builder modify an existing generated
module in place: they add foreign-key columns/junction tables, write settings
under `data/settings/module_relations/` and `data/settings/image_uploader/`, and
inject panel/dropdown/delete-hook code into the target views and controller.

All generators are **development-only** (`ENV === 'dev'`), matching the PHP
guards.

## Port deviations

- Views are React components; POSTs use server actions or the JSON XHR route.
  PHP view files, output buffering and `Modules::run()` are not reproduced.
- Cookie transport (session, CSRF, flashdata, remember-me) replaces PHP's
  process-local session state while preserving read-once and expiry semantics.
- `Db` speaks SQLite. MySQL-specific SQL (`information_schema`, `SHOW TABLES`,
  `DESCRIBE`, `ALTER … ADD COLUMN` variants) is ported to SQLite equivalents.
- Remember-me cookies are `HttpOnly` in the port; PHP sets them without it.
  The feature is disabled by default, as in `config/login.php`.
- Dev-only modules and JSON endpoints return HTTP 403 rather than Evo's HTML
  "disabled" page.
- The forgot-password entry point falls back to the only configured user level
  when the URL has no level segment. PHP's reset view links to that level-less
  URL, which would otherwise 404 when a `secret_login_word` is configured.
- `trongate_control` child modules get small port-only `index()` aliases where
  PHP only exposed specific entry methods, so every dashboard link resolves.

## Checks

```bash
npm run typecheck
npm run parity
npm run styles:check
npm run lint
# stop the dev server first: a build and `next dev` share .next
npm run build
```

`npm run parity` compares the public TypeScript surface with the PHP
class/method/helper inventory in `parity/php-surface.json` and rejects retired
camelCase spellings. `npm run styles:check` enforces the single-stylesheet
rule: only `src/app/globals.css` may exist, and views may not add stylesheet
links or static inline styles.

`npm run lint` exits successfully. The remaining warnings are non-blocking and mostly
`@next/next/no-img-element` for the deliberately preserved `<img>` markup that
mirrors the PHP templates. The port disables three Next rules that conflict
with the PHP conventions on purpose: `no-assign-module-variable` (the framework
uses `module` as a local identifier) and `no-html-link-for-pages` (plain anchors
force the PHP-style full-page request cycle). The query builder's one-shot DOM
measurement carries two targeted `react-hooks/set-state-in-effect` disables, and
the control panel redirect helper uses `location.assign` instead of assigning
`location.href`.

## Attribution

Eterc is a TypeScript port of an upstream PHP framework. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the original project,
copyright, and license.
