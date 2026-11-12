# Flows runtime

Eterc Flows is a Directus-style automation engine. A flow has one trigger and a
graph of operations connected by **resolve** and **reject** paths. Flows are
managed at `/admin/flows`.

## Triggers

| Trigger | Purpose |
| --- | --- |
| Event hook | Filter (blocking) or action (non-blocking) around CMS writes. |
| Webhook | Authenticated HTTP endpoint at `/api/flows/webhook/<flow-id>`. |
| Schedule | Five-field CRON expression, evaluated in **UTC**. |
| Another flow | Started by the "Run another flow" operation. |
| Manual | Started from the admin list with a collection/item scope. |

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `FLOWS_ENABLED` | `1` | Set `0` to disable triggers, the scheduler and the queue. |
| `FLOW_RUNTIME` | `embedded` | `embedded`, `worker` or `serverless`. |
| `FLOW_CRON_SECRET` | unset | Required by `/api/flows/cron`, `/api/flows/worker` and detailed health. |
| `ETERC_FLOW_SECRET` | generated file | HMAC key for webhook secrets. Set it to keep secrets stable across instances. |
| `FLOW_PUBLIC_URL` | `http://localhost:3000` | Public base URL used for webhook links. |
| `FLOW_LOGS_RETENTION_DAYS` | `90` | Run retention window. |
| `FLOWS_ALLOW_UNSECURED_CRON` | unset | Development escape hatch; never enable in production. |

`FLOW_RUNTIME=embedded` starts the scheduler from `src/instrumentation.ts` and
drains the job queue in-process. `worker` leaves the HTTP worker endpoint for a
systemd timer or container cron. `serverless` is reserved for the Phase 8 Vercel
adapter and is not production-ready.

## Endpoints

- `POST /api/flows/webhook/<id>` — method, secret, async, reject mode, response
  body and GET caching are configured per flow. Send the secret in
  `x-et-flow-secret` or as a Bearer token. Public mode is opt-in.
- `GET|POST /api/flows/cron` — advance due schedules and drain the queue.
  Requires `FLOW_CRON_SECRET`.
- `GET|POST /api/flows/worker` — drain queued jobs. Requires the same secret.
- `GET /api/flows/health` — public summary. Add `?details=1` with the secret for
  runtime, database, queue, scheduler and per-check details.

## Data and safety

- Tables: `cms_flows`, `cms_flow_operations`, `cms_flow_runs`,
  `cms_flow_run_steps`, `cms_flow_jobs`.
- Webhook secrets are HMAC-SHA-256 hashes; only a short prefix is exposed.
- Run inputs and outputs are redacted and truncated for logs.
- Event filters fail closed (reject = HTTP 403, failure = HTTP 500). Action hooks
  enqueue a durable job.
- Item operations call the CMS store directly and do **not** re-trigger event
  hooks, avoiding recursion.
- Schedules are UTC-only in v1. The UI says so explicitly.

## Vercel

Vercel remains blocked. It requires a remote database, remote object storage, an
async data layer, a serverless-safe queue and a verified preview test. The
desktop shows the blocked state with reasons; it must not emit a Vercel project
that silently loses SQLite or uploads.
