# Field Drawer Configuration Plan

## Goal

Update the collection field drawer so creating and editing a field use the same
organized configuration experience. Add a sidebar to the drawer with these
sections, in this order:

1. Schema
2. Field
3. Interface
4. Display
5. Validations
6. Conditions

Selecting a sidebar item shows that section in the drawer's main content area.
The selection is navigation within the drawer, not a separate dialog or a
multi-step save flow. Keep the existing field create/edit flow and save button.

The drawer also needs a consistent, compact visual treatment: inputs in all
sections use one height, user-facing text stays on one line, descriptions are
removed, action buttons use a black background, and labels align across
multi-column layouts.

## Existing implementation

- `FieldDrawer.tsx` currently displays key, label, interface, type and group,
  interface settings, default value, and field behavior in one scrolling form.
- `field-form.ts` adapts `CmsField` values to the drawer state and back.
- `data.tsx` sends field create and update requests.
- `CmsField` metadata is stored in `cms_fields`; `options` currently stores
  interface options and some field-specific values such as the default.
- The record editor and server write path enforce static required fields and
  storage types. They do not currently evaluate field-level validation rules
  or conditions.
- The permission editor has a flat rule-group UI. Its rule model is for
  authorization and should not be treated as the field validation/condition
  model.

## Drawer layout and section ownership

Keep the drawer header and footer stable while the main section content scrolls.
Use a responsive sidebar/section navigation that remains usable at narrow
widths; do not make the user scroll through all six sections to reach the
save action. Keep the section header and footer stable and the active content
scrollable.

## Drawer-wide visual requirements

Apply these requirements to `FieldDrawer.tsx` and every component it composes,
including `FieldOptions.tsx`, `FieldRuleEditor.tsx`, `DefaultValueEditor`, and
the interface-specific configuration controls. Do not limit the audit to the
visible top-level JSX.

### Input dimensions

- Give every text input, select, and other single-line form control the same
  explicit height through a shared drawer control class or component.
- Apply that height to controls in Schema, Field, Interface, Display,
  Validations, Conditions, interface options, nested rule rows, search, and
  condition naming.
- Do not let populated values, placeholders, error state, or optional labels
  change a control's height.
- Multiline editors are not allowed in the drawer. Replace `Textarea` controls
  with single-line controls appropriate to the data. Preserve the underlying
  option/value format and validate or report invalid input without silently
  changing it. Keep long option lists in popovers/selects rather than a
  multiline text box.

### One-line copy and no descriptions

- Remove descriptive/helper paragraphs and explanatory copy from every
  section and nested interface option.
- Keep only concise section titles, field labels, button labels, placeholders,
  and necessary validation/error feedback.
- Keep visible text on one line. Truncate long field/interface labels with
  title or accessible-name support; do not wrap description text because
  descriptions should not be rendered.
- Audit empty states, labels, condition rule controls, and save/cancel buttons
  as well as the six section panels.

### Button styling and labels

- Use a black background with contrasting readable text for primary and
  ordinary drawer actions, including create/add/remove/reorder actions where
  the button is currently styled with a colored background.
- Use concise text-plus-icon buttons for actions where the purpose should be
  immediately clear (for example, “Add rule”, “Add group”, “Create new”).
- Keep icon-only controls only for familiar compact actions such as close or
  delete, and provide an accessible name/tooltip. Preserve destructive-action
  distinction without changing the requested black action-button treatment.
- Apply the treatment consistently to the field drawer and nested option/rule
  editors; do not inadvertently change unrelated application buttons.

### Column and label alignment

- Audit every two-column and multi-column grid in all six sections and nested
  interface/rule editors.
- Align controls by reserving the same label row height in each grid cell.
  Cells with no visible label must still reserve the label slot; a title in
  the neighboring cell must not shift its input vertically.
- Put row/group titles above the grid rather than in only one cell of a
  control row. Do not use descriptions as alignment spacers.
- Standardize label height, control spacing, and control height so fields
  sharing a row start at the same vertical position.
- At narrow widths, stack grid cells in a predictable order and retain the
  same label/control spacing.

### Visual verification checklist

- Inspect all six sidebar sections, create and edit modes, and representative
  interfaces with different configuration controls.
- Check empty and populated values, long labels, validation errors, nested
  groups, and multi-column rows.
- Confirm every form control has the same measured height, every row's
  controls align, no descriptions or multiline controls remain, and action
  buttons have the intended black background.
- Check narrow and desktop drawer widths for truncation, overflow, and usable
  sidebar navigation.

### Schema

- Field key/name and storage type.
- Database-level field settings supported by this application, including
  uniqueness and default value.
- Clearly communicate which schema properties cannot be changed after field
  creation. Preserve current immutable key and storage-type behavior on edit.

### Field

- Human-readable label and group.
- Static required, hidden, and read-only settings.
- Keep alias/presentation-field restrictions intact, such as not exposing
  database-only settings for aliases.

### Interface

- Interface selection and its interface-specific configuration, using the
  existing `InterfaceOptions` component and available interface definitions.
- Preserve the existing create flow for choosing an interface before field
  configuration; after selection, show the six-section editor.

### Display

- Field display configuration, kept separate from interface configuration.
- Inspect and define the smallest coherent display metadata model needed by
  the app. At present, `CmsField` has no explicit display/display-options
  properties, so this section requires persistence and a clear no-display
  configuration state before adding controls.
- Ensure any configured display behavior is consumed by the record editor;
  configuration that is saved but never used is not sufficient.

### Validations

- Add a filter-rule builder with nested AND/OR groups, field/operator/value
  rules, and a custom validation message.
- Rules validate the complete record, so the builder can refer to fields in
  the current collection, including fields other than the one being edited.
- Explain that these are application-level validations, not database
  constraints.

### Conditions

- Add an ordered list of named conditions.
- Each condition has a rule against current record values and the configuration
  to apply to the edited field when the rule matches.
- Support conditional hidden, required, and read-only behavior, and any
  interface options needed for the selected field interface.
- Match Directus-style precedence: the last matching condition wins; when
  none match, use the field's base configuration.
- Decide and implement whether hidden values are retained or cleared on save;
  if clear-on-hide is supported, make it an explicit condition setting.
- State clearly that hiding a field is not access control.

## Implementation sequence

### 1. Define types and behavior

- Add explicit field validation and condition types to `cms-types.ts`, with
  recursive rule groups for nested AND/OR.
- Add validation message and condition metadata to `CmsField` and
  `CmsFieldInput`.
- Define supported operators and validation limits. Reuse shared filter
  concepts where useful, but keep field rule types separate from permission
  policies.
- Specify how required rules behave on both record creation and update,
  including how existing values are included in an update's validation
  context.

### 2. Add compatible metadata persistence

- Add validation, validation-message, conditions, and display metadata to
  `cms_fields`, using the existing schema migration/ensure-column pattern in
  `cms-schema.ts`.
- Parse and serialize these values in `cms-store.ts`, preserving old records
  with empty/default metadata.
- Keep interface options separate from validation, condition, and display
  metadata.

### 3. Refactor the drawer into sections

- Extend `FieldFormState` and its empty/from-field conversion functions with
  all new metadata.
- Add six-section navigation and render each section's controls in
  `FieldDrawer.tsx`.
- Move existing controls into Schema, Field, and Interface without changing
  their current behavior.
- Build the Display section around the finalized display metadata model.
- Add rule-builder and condition-list controls for Validations and Conditions.
- Ensure section changes do not discard unsaved edits; initialize correctly
  for both new and existing fields.

### 4. Wire create and update persistence

- Include all field metadata in create/update payloads in
  `cms_admin/views/data.tsx`.
- Extend the admin actions and HTTP API field handlers to accept and validate
  the new fields.
- Ensure unrelated field updates, such as changing display width, preserve all
  rule and display metadata.
- Return saved field metadata so re-opening the drawer faithfully restores it.

### 5. Apply conditions in the record editor

- Add shared condition evaluation against the current item values.
- Apply effective hidden, required, read-only, and interface option settings
  to the field editor, including re-evaluation as relevant values change.
- Ensure hidden/readonly behavior does not accidentally prevent legitimate
  programmatic or permission-controlled access.
- If clear-on-hide is included, clear values only according to the specified
  save behavior and test it separately.

### 6. Enforce validation on the server

- Evaluate field validation rules against the complete effective record before
  writes, on both create and update.
- Enforce conditionally required fields server-side as well as in the UI.
- Return the custom validation message for a failed field rule and a useful
  field-specific error for conditional required failures.
- Preserve existing type coercion, static required behavior, permission
  enforcement, and database error handling.

### 7. Test and verify

- Test drawer navigation, create/edit initialization, save/reload round trips,
  and preservation of metadata on unrelated updates.
- Test nested AND/OR groups, supported operators, invalid rule input, and
  custom messages.
- Test condition matching, last-match precedence, no-match fallback,
  conditional required/read-only/hidden behavior, and clear-on-hide if
  implemented.
- Test create and update validation using full item state and existing values.
- Test migration from an existing database with no field-rule columns.
- Run the focused tests, then the starter project's typecheck, lint, style
  check, and build.

### 8. Apply and verify drawer visual consistency

- Inventory all controls rendered by the drawer, including nested
  `InterfaceOptions` and rule controls.
- Add/reuse a drawer-scoped shared control class to set one consistent
  single-line input height. Replace multiline controls with suitable
  single-line UI while preserving their value semantics.
- Remove explanatory descriptions throughout the drawer and its nested
  components. Keep necessary error feedback concise and visible.
- Standardize button styling and text-plus-icon action labels within the
  drawer scope.
- Normalize multi-column label rows so every control aligns even when a
  neighboring field has no visible label.
- Re-run typecheck, lint, style checks, and build; then use browser inspection
  at narrow and desktop sizes and verify the visual checklist above.

## Completion criteria

- The field drawer presents the six requested sections in a sidebar for both
  field creation and editing.
- All section data persists and reloads without loss.
- Display configuration has a real runtime effect, or the section clearly
  communicates that no display configuration is available.
- Conditions affect record editing consistently, and validations are enforced
  by server writes as well as surfaced in the editor.
- Drawer controls use a shared height; labels and actions stay one line;
  descriptions and multiline controls are absent; buttons and multi-column
  labels meet the visual requirements above in every section and nested
  interface.
- Existing field setup, permission behavior, and older databases continue to
  work.
