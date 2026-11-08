# Sort Field Implementation Plan

## Goal

Make the optional collection Sort field a complete, reliable record-ordering feature. When enabled, records should receive an order automatically, admins should be able to reorder them from Content, and the admin UI and API should use a consistent default order.

Collections without the optional Sort field must keep their current behavior.

Collections may also use configured field-based ordering. Manual ordering and field-based ordering are mutually exclusive active modes; the inactive settings are retained when switching modes.

## Recommended behavior

- Treat Sort as a system-managed integer order, not a value users normally type by hand.
- Automatically append newly created records after the last ordered record. If the caller explicitly supplies a Sort value through a supported API, preserve it.
- Display the Sort value in the Content table, but make it read-only in the record form.
- Offer collection ordering modes: existing default order, manual Sort order, or one or more configured fields with direction and priority.
- Allow admins to reorder records with drag-and-drop in Content only in manual mode. Provide keyboard-operable move controls as an accessible alternative.
- In field mode, apply configured fields in priority order, place nulls last, then use the collection primary key as a stable tie-breaker. Disable manual reorder controls in this mode.
- For collections without Sort, preserve the current ordering: primary key descending in the admin Content view, and the API's existing default ordering.
- In the REST API, honor an explicitly requested `sort` and `direction`; otherwise, use the active collection ordering mode.

## Implementation steps

### 1. Confirm existing patterns and identify Sort fields

- Inspect existing drag/reorder UI dependencies and CMS field metadata patterns before choosing implementation details.
- Mark the optional Sort field as a system field in its CMS field options, following the metadata convention used by the user audit fields.
- Keep backward compatibility for collections already created with the conventional `sort` integer field but without the marker.
- Ensure custom fields that merely happen to be named `sort` are not accidentally treated as system Sort fields when they can be distinguished.

### 2. Make Sort values system-managed

- Make the optional Sort field read-only in record forms while keeping its value visible.
- In the record creation store path, assign an order after the current maximum when Sort is omitted or empty.
- Preserve explicitly supplied Sort values where API behavior allows them; never trust a client-supplied value to override the automatic value in the CMS admin form.
- Keep the create operation atomic so concurrent record creation does not produce inconsistent ordering. Use a transaction and a deterministic tie-breaker; add appropriate retry or conflict handling if the database's write behavior requires it.
- For existing records with null Sort values, leave them after numbered records until reordered rather than silently making assumptions about their intended order.

### 3. Add admin reordering

- Add a drag handle and row reordering to the Content table only when the collection has a system Sort field.
- Provide keyboard-accessible move-up/move-down controls with clear labels, in addition to pointer drag-and-drop.
- Disable reordering while a search is active so hidden records cannot make the displayed order misleading.
- Keep reordering usable with pagination: reorder only within the current page; records outside that page retain their relative positions.
- Send the collection, page, and ordered primary-key list to a dedicated admin action.
- On the server, validate that the submitted identifiers correspond exactly to the records currently on that page, then persist the new order in a transaction. Assign ranks that preserve the page's position relative to neighboring records; reindex the collection in a transaction only when there is not enough integer space for the new ranks.
- Refresh the current page after a successful reorder and surface failures through the existing toast/error patterns.

### 4. Align list and API ordering

- Persist an active ordering mode and an ordered list of field/direction rules in collection metadata.
- Allow field rules to be selected and edited during collection setup and from collection settings.
- Use the active mode for Content and API list defaults. Disable drag reorder while field mode is active, and retain the saved field rules when switching to manual mode.
- Continue to honor explicit API sort and direction parameters, validating them against storage fields using existing query helpers.
- Ensure null values appear last and primary key is the final stable tie-breaker.

### 5. Add database support

- Migrate collection metadata to store ordering mode and field rules, with legacy collections inferring their prior behavior.
- Add a non-unique index on the Sort column for newly created collections with the optional field.
- For existing collections with a recognized Sort field, create the index safely and idempotently when the CMS schema is initialized or the collection is first used.
- Do not add a unique constraint: ties may exist for imported or explicitly ordered records, and primary-key tie-breaking keeps their order stable.

### 6. Verify behavior and compatibility

- Add focused tests using existing project test conventions (or extract/test small pure helpers if no CMS store test harness exists).
- Cover:
  - automatic append for new records, including empty collections and existing null values;
  - explicit API Sort values;
  - stable ordering for ties and null values;
  - reordering within a page, rejection of stale/invalid submitted IDs, and transaction rollback on failure;
  - API explicit sort overrides and defaults with/without Sort;
  - configured multiple-field ordering and switching between field and manual modes;
  - no behavior change for collections without Sort;
  - read-only form behavior and keyboard reorder controls.
- Run the smallest relevant tests, ESLint, TypeScript typecheck, style checks, and production build.
- Review the final diff to ensure unrelated working-tree changes and database files remain untouched.

## Expected files/surfaces

- `src/modules/cms/cms-types.ts` and `src/modules/cms/cms-schema.ts` — typed ordering metadata and backward-compatible schema migration.
- `src/modules/cms/cms-store.ts` — system field identification, ordering helpers, append behavior, reorder transaction, validation, and query defaults.
- `src/modules/cms_admin/Cms_admin.ts` and `src/modules/cms_api/Cms_api.ts` — collection ordering updates, reorder action, and consistent list defaults.
- `src/modules/cms_admin/views/CollectionOrderingControl.tsx` — shared ordering mode and field-rule editor.
- `src/modules/cms_admin/views/CollectionDialog.tsx` and `src/modules/cms_admin/views/data.tsx` — creation and editing controls.
- `src/modules/cms_admin/views/content.tsx` — drag-and-drop, keyboard controls, refresh, and search-state behavior.
- `src/modules/cms_admin/views/field-inputs/index.tsx` and field form metadata — render Sort read-only.
- Focused storage checks and narrowly required documentation.

## Approval and implementation status

The user approved this plan, and implementation is complete. The storage layer, configurable collection ordering modes, admin and API defaults, and Content reordering UI have been updated as described above.

Verification completed:

- TypeScript typecheck and targeted ESLint passed.
- Production build passed.
- Isolated SQLite checks passed for schema migration, configured multi-field ordering, explicit API sort overrides, switching between field and manual modes, legacy Sort behavior, and unchanged ordering for collections without Sort.
