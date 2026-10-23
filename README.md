# Eterc

Eterc is a TypeScript-first framework for **Next.js App Router**. It provides a
module/controller/model structure, routing, validation, sessions, tokens,
flashdata, an authenticated control panel, and code generators for building
CRUD modules. Views are React components and application code is TypeScript
from end to end.

- Website: <https://www.eterc.app>
- Documentation: <https://eterc-docs.eterc.app>
- Forums: <https://eterc-forum.eterc.app>

## Stack

| Layer     | Choice                                                          |
| --------- | --------------------------------------------------------------- |
| Framework | Next.js 16.4 (App Router), React 19.3, TypeScript               |
| Database  | SQLite (`prisma/dev.db`)                                        |
| DB access | `better-sqlite3` behind the `Db` class; Prisma for schema       |
| Passwords | bcryptjs (cost 11)                                              |
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
  - admin login URL: `/login/login/et-admin`
- To start over: stop the server, delete `prisma/dev.db*`, restart, and revisit
  `/`.

Copy `.env.example` to `.env` and set a secret:

```dotenv
DATABASE_URL="file:./prisma/dev.db"
ET_SECRET=<64-char hex>     # HMAC key for CSRF tokens
# ET_SQLITE_FILE="prisma/dev.db"  # optional custom SQLite path
# ET_BASE_URL="/"                 # only when served under a sub-path
```

For a VPS, keep the SQLite file on a persistent disk. For serverless hosting,
configure a managed database provider in **Project settings** and enable its
deployment adapter; the bundled SQLite runtime is intended for a persistent
filesystem.

## Routing

| URL shape                                | Behavior                                    |
| ---------------------------------------- | ------------------------------------------- |
| `/{module}/{method}/{params}`            | Standard controller dispatch                |
| `/{parent}-{child}/{method}`             | Child-module dispatch                       |
| `POST /{module}/{method}`                | React server action via `etSubmit`          |
| `POST /api/xhr/{module}/{method}/{params}` | JSON XHR requests                         |
| `redirect('module/method')`              | Navigation through `EtRedirectSignal`       |
| `et_session` cookie                      | Session backed by the `et_sessions` table   |
| `et_flash` cookie                        | One-shot flashdata (`x-et-flash` header)   |
| `et_csrf` cookie                         | Signed CSRF token (`x-et-csrf` header)     |
| `segment()`, `post()`, `get_param()`     | Request helpers in `src/engine`             |

Public URLs use clean aliases while the internal module names stay
addressable: `/control` resolves to `eterc_control`, `/administrators` to
`eterc_administrators`, and `/control/flo` to `eterc_control-flo`.

Controllers live in `src/modules/<module>/<Class>.ts` and extend `Eterc`.
Views are React components registered per module (`views/index.ts` →
`register_views`), aggregated in `src/modules/views.ts`. Controllers are loaded
through `src/engine/registrations.ts`.

## JSON API and Scalar

The starter includes an API-first CMS and an interactive
[Scalar](https://scalar.com/) reference at `/api-reference`. Every content
endpoint is private by default: requests need an authenticated session, an
`EtercToken` header, or an API key.

- API routes use `/api/v1/{resource}/{method}` and map to the
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
  call protected endpoints. External clients can send an `EtercToken`
  header instead.
- Scalar cannot read the HttpOnly session cookie, so protected operations may
  show "Authentication Required" in its test panel. Sending the request still
  uses the signed-in session. To test as an external client, choose Auth Type
  → API Key and paste a token.

Built-in endpoints:

| Method | URL                      | Purpose                                |
| ------ | ------------------------ | -------------------------------------- |
| GET    | `/api/v1/system/health`  | Authenticated health check             |
| GET    | `/api/v1/system/me`      | Current principal (token required)     |
| GET    | `/api/v1/system/modules` | Project modules (token required)       |
| POST   | `/api/v1/system/echo`    | Echo a JSON body, query and method     |

## CMS, roles and API keys

Open `/admin` after signing in. The production admin surface is separate from
the development-only `/control` builders.

- **Data Studio** creates collections (SQLite tables), fields and records. Every
  collection immediately gets REST endpoints under
  `/api/v1/cms/items/{collection}`.
- **Access** creates roles with `read`, `create`, `update` and `delete`
  permissions per collection. Roles also control `app_access`, `api_access`
  and `admin_access`.
- **API keys** use the format `etk_<prefix>_<secret>`. Only a SHA-256 hash is
  stored, and the secret is shown once. Send a key as
  `Authorization: Bearer etk_...` or `x-api-key`.
- **Project settings** stores the selected database and auth providers in
  `data/settings/runtime.json`, masks secrets, tests connections and generates
  an `.env` preview.

Useful content endpoints:

| Method | URL                                      | Purpose                       |
| ------ | ---------------------------------------- | ----------------------------- |
| GET    | `/api/v1/cms/health`                     | Verify authentication         |
| GET    | `/api/v1/cms/me`                         | Current role and permissions  |
| GET    | `/api/v1/cms/collections`                | List accessible collections   |
| GET    | `/api/v1/cms/items/{collection}`         | List records                  |
| POST   | `/api/v1/cms/items/{collection}`         | Create a record               |
| GET    | `/api/v1/cms/items/{collection}/{id}`    | Read a record                 |
| PATCH  | `/api/v1/cms/items/{collection}/{id}`    | Update a record               |
| DELETE | `/api/v1/cms/items/{collection}/{id}`    | Delete a record               |

Collection, field, role, permission, user and API-key management require a
signed-in administrator. API keys cannot change schema or access control.

The bundled runtime uses SQLite and built-in accounts. Provider connection
tests, secret storage and environment generation work for Neon, Supabase,
PostgreSQL, Turso, MySQL, Firebase, Clerk, Auth0 and Supabase Auth. External
runtime adapters are deployment work: this build keeps SQLite and built-in
accounts active while the selected provider configuration is saved.

Add a resource with a normal module plus a controller class ending in `_api`:

```ts
// src/modules/blog_api/Blog_api.ts
import { api_response, require_api_user } from "@/engine/api";
import { Eterc } from "@/engine/controller";

export default class Blog_api extends Eterc {
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
reference files into older projects that use the current starter layout.

## What is included

**Engine** (`src/engine/`): config, request context, router/dispatch, `Db`,
session, CSRF, flashdata, input helpers, string service, validation, tokens,
model, controller, templates, URL helpers, views registry and UI primitives
(`EtForm`, `EtButton`, validation errors, flashdata).

**Framework modules**:

`welcome`, `setup`, `login` (+ `forgot_password`), `eterc_security`,
`eterc_email`, `eterc_administrators`, `pagination`, `image_uploader`,
`db`, `module_relations`, `language`, `utilities`, `file`, `image`,
`eterc_control`.

The `flashdata`, `form`, `string_service`, `templates`, `eterc_tokens`, `url`,
and `validation` services live inside `src/engine` rather than as separate
modules.

**Control panel** (`eterc_control`): dashboard plus every child module —

- `flo` — Flo generator front-end
- `evo` — Evo shell (home, module manager, error/disabled helpers)
- `module_builder` — interactive "Create Module" wizard
- `query_builder` — visual SQL query builder
- `site_builder` — module generation service
- `properties` + `properties_builder` — property data service and builder
- `module_relations` + `module_relations_builder` — relation runtime and wizard
- `image_uploader` + `image_uploader_builder` — uploader runtime and wizard
- `plural_maker` — pluralisation engine

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

All generators are **development-only** (`ENV === 'dev'`).

## Implementation notes

- Views are React components; POSTs use server actions or the JSON XHR route.
- Cookie transport (session, CSRF, flashdata, remember-me) stores request state
  across serverless and multi-process deployments while preserving read-once
  and expiry semantics.
- `Db` speaks SQLite. MySQL-specific SQL (`information_schema`, `SHOW TABLES`,
  `DESCRIBE`, `ALTER … ADD COLUMN` variants) is translated to SQLite
  equivalents.
- Remember-me cookies are `HttpOnly`. The feature is disabled by default via
  `LOGIN_CONFIG`.
- Dev-only modules and JSON endpoints return HTTP 403 instead of rendering the
  Evo "disabled" page.
- The forgot-password entry point falls back to the only configured user level
  when the URL has no level segment.
- `eterc_control` child modules expose small `index()` aliases where the
  dashboard links need a stable entry point.

## Checks

```bash
npm run typecheck
npm run styles:check
npm run lint
# stop the dev server first: a build and `next dev` share .next
npm run build
```

`npm run styles:check` enforces the single-stylesheet rule: only
`src/app/globals.css` may exist, and views may not add stylesheet links or
static inline styles.

`npm run lint` exits successfully. The remaining warnings are non-blocking and
mostly `@next/next/no-img-element` for intentional `<img>` markup. The project
disables two Next rules on purpose: `no-assign-module-variable` (the framework
uses `module` as a local identifier) and `no-html-link-for-pages` (plain
anchors force full-page navigation for generated post-back flows). The query
builder's one-shot DOM measurement carries two targeted
`react-hooks/set-state-in-effect` disables, and the control panel redirect
helper uses `location.assign` instead of assigning `location.href`.

## Attribution

Eterc is derived from the Trongate framework. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the original project,
copyright, and license.
