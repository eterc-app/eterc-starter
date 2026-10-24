# Eterc

Eterc is an API-first CMS and TypeScript framework for **Next.js App Router**.
It provides collections, fields, records, roles, permissions, API keys, a media
library, and a module/controller/model structure with routing, validation,
sessions, and tokens. Views are React components and application code is
TypeScript from end to end.

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
select a managed database provider while creating the project in Eterc Desktop
and enable its deployment adapter; the bundled SQLite runtime is intended for a
persistent filesystem.

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
addressable: `/admin` resolves to `cms_admin`, `/admin/media` to `media`, and
`/administrators` to `eterc_administrators`.

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
  current same-origin session, so signing in to the CMS admin is enough to
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

Open `/admin` after signing in.

- **Data Studio** creates collections (SQLite tables), fields and records. Every
  collection immediately gets REST endpoints under
  `/api/v1/cms/items/{collection}`.
- **Media library** uploads images, edits titles and alt text, and copies stable
  URLs for use in content fields.
- **Access** creates roles with `read`, `create`, `update` and `delete`
  permissions per collection. Roles also control `app_access`, `api_access`
  and `admin_access`.
- **API keys** use the format `etk_<prefix>_<secret>`. Only a SHA-256 hash is
  stored, and the secret is shown once. Send a key as
  `Authorization: Bearer etk_...` or `x-api-key`.
- **Project settings** manages API defaults and schema utilities. Database and
  auth provider selection happens in Eterc Desktop during project creation;
  `/admin` shows the active runtime read-only.

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

The bundled runtime uses SQLite and built-in accounts. Eterc Desktop supports
provider selection and connection tests for Neon, Supabase, PostgreSQL, Turso,
MySQL, Firebase, Clerk, Auth0 and Supabase Auth. External runtime adapters are
deployment work: this build keeps SQLite and built-in accounts active while the
selected provider configuration is saved.

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
`eterc_email`, `eterc_administrators`, `cms`, `cms_admin`, `cms_api`, `media`,
`pagination`, `db`, `utilities`, `file`, `image`.

The `flashdata`, `form`, `string_service`, `templates`, `eterc_tokens`, `url`,
and `validation` services live inside `src/engine` rather than as separate
modules.

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
- The forgot-password entry point falls back to the only configured user level
  when the URL has no level segment.
- The media library stores files under `public/uploads/media` and metadata under
  `data/settings/media_library/index.json`.

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
anchors force full-page navigation for post-back flows).

## Attribution

Eterc is derived from the Trongate framework. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the original project,
copyright, and license.
