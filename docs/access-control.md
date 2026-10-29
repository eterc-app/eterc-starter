# Access control

Eterc Starter uses roles with per-collection policies. A policy answers four
questions for one role and one action:

1. Which collection can the role use?
2. Which fields can it read or write?
3. Which rows can it read or change?
4. Which values must a create or update satisfy?

The system is private by default. A role with no matching policy cannot use the
collection. The system Admin role is the only role that bypasses policies.

The visual editor lives at `/admin/access`. It exposes the same policy model that
the API uses, so a rule configured in the UI is enforced by the API without a
second interpretation layer.

## Principals

A request is resolved to one principal before a CMS API operation runs.

| Principal | How it is resolved | Notes |
| --- | --- | --- |
| Signed-in administrator | Eterc token cookie or `eterctoken` header | The administrator's linked `eterc_users` row supplies `$user` values. |
| API key | `Authorization: Bearer etk_...` or `X-API-Key` | The key must be active, unexpired, and its role must allow API access. |
| User-bound API key | API key with `user_id` set | The key acts as that `eterc_users` row for `$user` rules. |
| Service API key | API key with `user_id` empty | It has the role's collection policies, but any `$user` rule fails closed. |

The "Acts as" column on the API keys tab shows the administrator username and
email linked through `eterc_administrators.eterc_user_id`. The key itself stores
the `eterc_users.id`. The secret is shown once when the key is created; only its
SHA-256 hash is stored.

API keys cannot manage collections, roles, permissions, or other API keys.
Those operations require a signed-in human administrator.

The signed-in user can manage their own keys at `/admin/profile`. The profile
page only accepts a human session (never an API key), requires `app_access`, and
lists only keys bound to that user. New keys inherit the user's current role and
policies; the caller cannot choose another role or bind another account. Revoking
a profile key checks ownership before changing it. An API key with `user_id` set
therefore keeps the same `$user` values as its owner.

## Rule variables

Rule values can be literals or request-time variables:

| Variable | Resolves to |
| --- | --- |
| `$user.id` | The principal's `eterc_users.id` as a number |
| `$user.email` | The linked administrator email |
| `$user.username` | The linked administrator username |
| `$user.role` | The role display name |
| `$user.role_slug` | The role slug |

A missing value makes the policy fail closed with `403`. For example, a service
API key cannot satisfy `owner_email = $user.email` because it has no user.

Variables are validated when a policy is saved. Unknown variables return `400`
instead of being stored as a typo that could behave unexpectedly. Use `$$` to
store a literal string that starts with `$`, for example `$$5.00`.

## Operators

A rule group has `match: "all"` or `match: "any"` and up to 24 conditions. An
empty group matches every row. Conditions are evaluated with the same semantics
for SQL list queries and JavaScript single-record checks.

| Operator | Meaning | NULL behavior |
| --- | --- | --- |
| `_eq` | Equal | Matches NULL only when the expected value is also NULL. |
| `_neq` | Not equal | A NULL field is not equal to a non-NULL value. |
| `_contains` | Case-insensitive substring | NULL does not match. |
| `_not_contains` | Negated substring | NULL matches. |
| `_starts_with` | Case-insensitive prefix | NULL does not match. |
| `_ends_with` | Case-insensitive suffix | NULL does not match. |
| `_gt`, `_gte`, `_lt`, `_lte` | Ordered comparison | NULL does not match. |
| `_null` | Is NULL when `value: true`; is not NULL when `value: false` | Explicit NULL test. |
| `_in` | Membership in a list | A NULL field matches only if the list contains NULL. |

Details that matter when writing ownership rules:

- Equality is case-sensitive. `Alice@example.com` and `alice@example.com` are
  different values.
- `_contains`, `_not_contains`, `_starts_with`, and `_ends_with` are
  case-insensitive, matching SQLite `LIKE` behavior.
- Numeric strings compare numerically when both sides are numeric. Booleans
  accept `true`/`false` and `1`/`0`; the string `"false"` does not match a stored
  `true`.
- `_in` with an empty list matches no rows. `_in` can contain variables, for
  example `["public", "$user.role_slug"]`.
- `_neq` is the inverse of equality, not an SQL `<>` shortcut. This is why a NULL
  value passes `private_note _neq "secret"` but does not pass
  `private_note _eq "secret"`.

## Field access

Each policy has a field list:

- `["*"]` means every field in the collection.
- `[]` means no client-writable fields and only the primary key in responses.
- A named list limits reads and writes to those fields.
- The primary key `id` is always included in read responses, even when it is not
  listed.

Field access is enforced in two places:

- **Reads:** response rows are projected to the allowed fields. A single-record
  read outside the row policy returns `403`; a list simply omits non-matching
  rows.
- **Writes:** create and update input is checked before it reaches the database.
  A field that is not writable returns `403`. Read-only and hidden metadata do
  not grant access; the policy is authoritative.

Create presets are server-side values. They run before validation and before the
row rule is checked, and they overwrite any client-supplied value for the same
field. A preset field does not need to be in the writable field list. This is the
intended way to stamp ownership fields that a client must not control.

Validation rules run after presets. They are useful for allowed status values,
required relationships, or tenant checks. A failed validation returns `403` and
does not write the row.

## Ownership example

Assume a collection `articles` with these fields:

```text
id          integer, primary key
title       string
owner_email string
owner_id    integer
status      string
tenant      string
```

Create a role named `Owner` and give it these direct policies.

### Read own articles

```json
{
  "collection": "articles",
  "action": "read",
  "fields": ["title", "status", "tenant", "owner_email"],
  "filter": {
    "match": "all",
    "conditions": [
      { "field": "owner_email", "operator": "_eq", "value": "$user.email" }
    ]
  }
}
```

List requests add the equivalent SQL condition:

```sql
WHERE owner_email = ? -- the resolved signed-in email
```

Single-record reads load the row and apply the same rule in JavaScript. A row
belonging to another user returns `403` rather than leaking its existence.

### Create own article

```json
{
  "collection": "articles",
  "action": "create",
  "fields": ["title", "status", "tenant"],
  "filter": {
    "match": "all",
    "conditions": [
      { "field": "owner_email", "operator": "_eq", "value": "$user.email" }
    ]
  },
  "validation": {
    "match": "all",
    "conditions": [
      { "field": "status", "operator": "_in", "value": ["draft", "published"] }
    ]
  },
  "presets": [
    { "field": "owner_email", "value": "$user.email" },
    { "field": "owner_id", "value": "$user.id" }
  ]
}
```

A client that sends `owner_email` or `owner_id` cannot choose another owner: the
presets overwrite those values, and the field list does not include them as
writable fields. The row filter then checks the final row, and validation checks
the final status.

### Update and delete own articles

Use the same row filter for `update` and `delete`:

```json
{
  "collection": "articles",
  "action": "update",
  "fields": ["title", "status", "tenant"],
  "filter": {
    "match": "all",
    "conditions": [
      { "field": "owner_email", "operator": "_eq", "value": "$user.email" }
    ]
  },
  "validation": {
    "match": "all",
    "conditions": [
      { "field": "status", "operator": "_in", "value": ["draft", "published"] }
    ]
  }
}
```

```json
{
  "collection": "articles",
  "action": "delete",
  "fields": ["*"],
  "filter": {
    "match": "all",
    "conditions": [
      { "field": "owner_email", "operator": "_eq", "value": "$user.email" }
    ]
  }
}
```

An update or delete first loads the existing row and checks the policy. The
client cannot change `owner_email` because it is not in the update field list.
If ownership must be transferable, add the ownership field to the update field
list and add a validation rule for the allowed recipients.

For a stable integer owner, use `owner_id` with `$user.id` instead:

```json
{
  "filter": {
    "match": "all",
    "conditions": [
      { "field": "owner_id", "operator": "_eq", "value": "$user.id" }
    ]
  },
  "presets": [{ "field": "owner_id", "value": "$user.id" }]
}
```

Email ownership is convenient for existing tables. ID ownership survives an
email change. Do not use both unless the business rule actually requires both.

### Public rows plus own rows

Set `match: "any"` to combine ownership with a public scope:

```json
{
  "match": "any",
  "conditions": [
    { "field": "owner_email", "operator": "_eq", "value": "$user.email" },
    { "field": "tenant", "operator": "_eq", "value": "public" }
  ]
}
```

The SQL list filter and the JavaScript single-record check both use the same
`any` semantics.

## Role inheritance

A role can have one parent role. If the child has no direct policy for a
collection and action, the parent policy is used. A direct policy completely
replaces the inherited policy; policies are not merged.

- The UI shows an inherited policy read-only and offers **Override in this
  role**. Saving the override creates a direct policy.
- Clearing the direct policy restores inheritance.
- Parent cycles and self-parenting are rejected with `400`.
- The system Admin role cannot be edited and always bypasses policies.

Inheritance is useful for a base `Member` role and narrower roles such as
`Auditor` or `Editor`. It does not change the rule variables: `$user` always
refers to the request principal, not the role that defined the policy.

## Wildcard compatibility

The backend still accepts a permission for collection `*`. It applies to any
collection that does not have a more specific direct policy, and it can be
inherited. Specific collection policies take precedence.

Wildcard policies cannot contain row conditions, validation rules, or presets,
because those rules need collection metadata. The UI surfaces a wildcard grant as
an inherited, read-only **All collections** row; saving a specific collection
policy creates an override for that collection. The matrix itself lists specific
collections only.

## API examples

Create a key bound to a user (administrator session required):

```http
POST /api/v1/cms/keys
Content-Type: application/json
eterctoken: <administrator-token>

{
  "name": "Alice content key",
  "role_id": 6,
  "user_id": 2,
  "expires_at": null
}
```

Use the returned secret once:

```http
GET /api/v1/cms/items/articles
Authorization: Bearer etk_<prefix>_<secret>
```

The response contains only rows that match the role's read policy and only the
fields allowed by that policy.

Common responses:

| Status | Meaning |
| --- | --- |
| `401` | Missing, invalid, expired, or disabled credential. |
| `403` | The role or policy denied the operation, or a `$user` value is unavailable. |
| `400` | The policy or filter is malformed, references a missing field, or uses an unknown variable. |

## Schema migration and operations

The access schema is created and upgraded by `ensure_cms_schema()`:

- `eterc_roles.parent_role_id` and `eterc_api_keys.user_id` are added to existing
  databases when missing.
- The parent-role index is created after the column migration.
- `cms_migrations` records one-time migrations.
- Legacy permission rows with `fields = []` are migrated once to `["*"]` under
  the `access_fields_wildcard_v1` marker. This preserves the old behavior where
  an empty field list meant every field. New policies use `[]` to mean only the
  primary key.

Back up the SQLite database before deploying a schema change. Migrations are
idempotent, but a backup is still the safe rollback path.

## Fail-closed checklist

Before shipping a policy, verify:

- The role has `api_access` if it is used by an API key.
- User-bound keys have the intended `user_id`; service keys are only used for
  rules that do not contain `$user`.
- Create presets set every ownership field that clients must not control.
- Read, create, update, and delete all have the intended row filter.
- Field lists include every field the client must read or write, and exclude
  ownership or internal fields that must be server-controlled.
- Validation covers enum-like values and required relationships.
- The inherited state is intentional; an empty direct policy does not mean
  "inherit" — clear the direct policy to restore inheritance.
