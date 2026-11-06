# Data Studio fields

Data Studio follows Directus's distinction between a field's **storage type**
and its **interface**. The storage type determines how a value is stored;
the interface determines how an editor enters and views it. Directus describes
this model in its [fields](https://docs.directus.io/guides/data-model/fields)
and [interfaces](https://docs.directus.io/guides/data-model/interfaces)
guides.

## How it works here

- `src/modules/cms/cms-interfaces.ts` is the interface registry. It groups the
  field picker, defines compatible storage types, and supplies default options.
- `src/modules/cms_admin/views/FieldDrawer.tsx` lets users choose an interface,
  then configure its compatible storage type and options.
- `src/modules/cms_admin/views/FieldOptions.tsx` edits interface-specific
  options. Choices, defaults, and interface settings are saved in field
  metadata.
- `src/modules/cms_admin/views/field-inputs/` contains the record controls.
  `FieldInput` dispatches from the same interface metadata used by the drawer,
  so a configured interface renders as a control rather than a generic text
  input.

Field keys and storage types are fixed after creation. An interface can be
changed only to one compatible with the existing storage type. This avoids
metadata drifting away from the actual SQLite column, which would otherwise
require a database migration.

Presentation fields and groups are metadata-only alias fields: they do not
create database columns or hold record values. Group membership is stored
separately from interface options.

Relationship interfaces use the selected collection's existing records and
primary keys. In this SQLite-backed CMS, to-many values are stored as JSON and
single relations as scalar IDs; this provides editor pickers without claiming
Directus's database-level relationship or junction-table semantics.

## Adding an interface

1. Add its ID, label, group, supported storage types, and default options to
   `CMS_INTERFACES`.
2. Add its configuration controls to `InterfaceOptions`.
3. Implement its record control and map it in `FieldInput`.
4. Add an icon in `FieldDrawer` if the default icon is not suitable.
5. Check defaults, record display, and any relation or media dependencies.
