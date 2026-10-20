# Module relations — runtime settings

The relation builder (the control panel's `module_relations_builder`) writes one
JSON file per configured relation into this directory. The runtime module
(`src/modules/module_relations`) only reads these files.

## File naming

`{module_a}_and_{module_b}.json` — where module_a / module_b are the two module
names of the pair. Either order is accepted; the runtime tries both.

## File shape

```json
[
  {
    "module_name": "authors",
    "record_name_singular": "author",
    "record_name_plural": "authors",
    "identifier_column": "last_name,first_name"
  },
  {
    "module_name": "books",
    "record_name_singular": "book",
    "record_name_plural": "books",
    "identifier_column": "title"
  },
  {
    "relationship_type": "one to many",
    "bridging_table": false
  }
]
```

- `relationship_type` — `"one to many"`, `"one to one"` or `"many to many"`.
- `bridging_table` — only meaningful for `"one to one"`; `true` means the
  relation is backed by a junction table instead of mirrored FK columns.
- `record_name_singular` / `record_name_plural` are human-readable and use a
  space between words ("section type"); database identifiers are derived with
  underscores (`section_type_id`).
- `identifier_column` accepts a comma-separated list; each part must match
  `^[a-z0-9_]+$` and exist on the module's table. Invalid parts are ignored and
  the display value falls back to the record id.

## Lookup order (port)

The runtime searches these locations, in order, for each filename:

1. `TG_MODULE_RELATIONS_SETTINGS_DIR` (environment override)
2. `<project root>/modules/module_relations/settings` (PHP-compatible layout)
3. `src/modules/module_relations/settings` (this directory)
4. `data/module_relations/settings`
5. `data/settings/module_relations`

Junction tables generated for these relations are named
`associated_{module_a}_and_{module_b}` with FK columns
`{singular_a}_id` / `{singular_b}_id`.
