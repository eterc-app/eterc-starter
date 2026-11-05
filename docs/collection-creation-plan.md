# Directus-Style Collection Creation & Field Management Plan

This document details the functional specifications, UX/UI analysis based on Directus CMS references, and step-by-step implementation tasks for collection creation and field interfaces in Eterc Starter.

---

## 1. Deep Analysis of Reference Images (Directus CMS)

### Image 1: Collection Creation - Step 1: Collection Setup
- **Wizard Layout**:
  - Modal with a left navigation rail:
    - `Collection Setup` (Active step)
    - `Optional Fields` (Step 2)
  - Top header:
    - Cube icon `Box` + Title: **"Creating New Collection"**
    - Top-right primary action button: Circle with right arrow `ArrowRight` (Next step).
  - Information Banner:
    - Neutral light gray/subtle background with info icon:
      `"Name the collection and setup its unique "key" field..."`
  - Form Fields:
    - **Name \*** (Input with placeholder / text, note: *"Collection names are case sensitive"* or slugified).
    - **Singleton**: Switch/toggle card or switch input labeled *"Treat as single object"*. Note: Real Directus uses a toggle/switch, not merely a plain checkbox!
    - Subtle horizontal divider.
    - **Primary Key Field**: Input (`id`).
    - **Type**: Dropdown / Select with options:
      - `Auto-incremented integer`
      - `Auto-incremented big integer`
      - `Generated UUID`
      - `Manually entered string`

### Image 2: Collection Creation - Step 2: Optional Fields
- **Wizard Layout**:
  - Left navigation rail: `Optional Fields` active.
  - Top header: Circle with checkmark `Check` (Confirm / Create Collection).
  - Information Banner:
    `"Enable and rename any of these optional fields."`
  - 2-Column Grid of 6 System/Optional Fields with interactive Switch & Custom Name:
    1. **Status**: Switch + input default `status` + Status flag icon
    2. **Sort**: Switch + input default `sort` + Sort/reorder icon
    3. **Created On**: Switch + input default `date_created` + Clock icon
    4. **Created By**: Switch + input default `user_created` + User icon
    5. **Updated On**: Switch + input default `date_updated` + Clock icon
    6. **Updated By**: Switch + input default `user_updated` + User icon

### Image 3: Collection Detail / Field List View
- Header: Back arrow `<` + Breadcrumb: `Data Model / Students`, Top right: Delete icon (trash) and Save/Check icon.
- Field List (Cards with drag handle / grip icons):
  - Each field is a clean, rounded card with:
    - Drag dots `GripVertical`
    - Monospace/bold field name (e.g. `first_name`, `middle_name`, `last_name`, `email`, `pin`)
    - Hover tooltip: e.g. `Last Name (String)`
    - Right 3-dots `MoreVertical` action menu
- Call to Action:
  - Big black pill button: **`Create Field`**
  - Subtitle link: *"Create Field in Advanced Mode"*
- Below: **Collection Setup** accordion/section:
  - Collection name, Note, Icon picker, Color picker, Display Template, Hidden switch, Singleton switch, Translations.

### Images 4 & 5: Field Interface Picker Drawer / Modal ("New Field (students)")
- Right side drawer / slide-over or dialog:
  - Header: Box icon + `"New Field (collection_name)"` + Search Input `"Search Field..."`
  - Grouped Grid of Field Interfaces (Interactive visual cards with wireframe illustration + Label):
    - **Text & Numbers**:
      - `Input`
      - `Autocomplete Input`
      - `Block Editor`
      - `Code`
      - `Textarea`
      - `WYSIWYG`
      - `Markdown`
      - `Tags`
    - **Selection**:
      - `Toggle` (Switch!)
      - `DateTime`
      - `Repeater`
      - `Map`
      - `Color`
      - `Dropdown`
      - `Icon`
      - `Checkboxes`
      - `Radio Buttons`
      - `Slider`
    - **Relational**:
      - `File`
      - `Image`
      - `Files`
      - `Many to Many`
      - `One to Many`
      - `Many to One`
    - **Presentation / Groups / Other**:
      - `Divider`, `Notice`, `Accordion`, `Hash`

---

## 2. Functional & Data Model Architecture

### Backend & Schema (`cms-store.ts`, `cms-schema.ts`, `cms-types.ts`)
1. **Optional Fields Support**:
   - `create_collection` currently hardcodes creating `created_at` and `updated_at`.
   - Update `CmsCollectionInput` to accept:
     - `optional_fields?: { status?: string; sort?: string; date_created?: string; user_created?: string; date_updated?: string; user_updated?: string }`
   - Dynamically create the chosen optional columns:
     - `status`: `TEXT NOT NULL DEFAULT 'draft'` (interface: `select`, options: `['draft', 'published', 'archived']`)
     - `sort`: `INTEGER NULL` (interface: `number`)
     - `date_created` / `created_at`: `TEXT NOT NULL DEFAULT (datetime('now'))`
     - `date_updated` / `updated_at`: `TEXT NOT NULL DEFAULT (datetime('now'))`
     - `user_created`: `TEXT NULL` or `INTEGER NULL`
     - `user_updated`: `TEXT NULL` or `INTEGER NULL`
2. **Field Types & Interfaces**:
   - Ensure `toggle` / `boolean` uses true boolean switches.
   - Support `switch` interface in records and forms.

### UI Components (`CollectionDialog.tsx`, `Switch.tsx`)
1. **Switch UI Component (`src/components/ui/switch.tsx`)**:
   - Build a Radix-based `<Switch />` component conforming to shadcn UI and Eterc design tokens (avoiding forbidden literal classes like `bg-white`).
2. **Revamped Collection Creation Wizard (`CollectionDialog.tsx`)**:
   - Step 1: **Collection Setup**
     - Collection Name (with real-time slug preview).
     - Singleton toggle using the new `<Switch />`.
     - Primary key field name + Select dropdown (`Auto-incremented integer`, `Auto-incremented big integer`, `Generated UUID`, `Manually entered string`).
     - Display Label, Icon, and Note.
     - Top right: Next circle button `ArrowRight`.
   - Step 2: **Optional Fields**
     - Info banner: `"Enable and rename any of these optional fields."`
     - 6 System Field Cards (`status`, `sort`, `date_created`, `user_created`, `date_updated`, `user_updated`).
     - Each card features:
       - `<Switch />` to enable/disable.
       - Editable `<Input />` for the column name (disabled if switch is OFF, enabled if ON).
       - Field type indicator icon (flag for status, arrows for sort, clock for dates, user for users).
     - Top right: Finish circle button `Check` (submits `data_collection_create`).
3. **Field Creation Drawer (`FieldDrawer` / Type Selector in Data Studio)**:
   - Provide visual interface cards matching Directus style when adding a field to a collection.
4. **Compatibility Guard**:
   - Ensure content management (`content.tsx`) correctly reads and edits collections created with these optional fields (e.g. status badge, date displays).

---

## 3. Step-by-Step Implementation Tasks

### Phase 1: Core Primitives & Backend Expansion
- [ ] **Task 1.1**: Create `src/components/ui/switch.tsx` using `@radix-ui/react-switch` with token-based styling compliant with `check_styles.mjs`.
- [ ] **Task 1.2**: Update `CmsCollectionInput` and `create_collection` in `src/modules/cms/cms-types.ts` and `src/modules/cms/cms-store.ts` to support optional field definitions (status, sort, date_created, user_created, date_updated, user_updated).
- [ ] **Task 1.3**: Update `data_collection_create` in `src/modules/cms_admin/Cms_admin.ts` to forward optional fields payload.

### Phase 2: CollectionDialog UI Overhaul (Directus Replica)
- [ ] **Task 2.1**: Refactor `src/modules/cms_admin/views/CollectionDialog.tsx`:
  - Implement two-step flow (`Collection Setup` and `Optional Fields`) with the left sidebar navigation.
  - Implement top-right circular next (`ArrowRight`) and complete (`Check`) buttons.
  - Replace checkboxes with the new `Switch` component for Singleton and Optional field toggles.
  - Add the 6 optional field cards with custom column naming.
  - Connect form state to submit the chosen optional fields.

### Phase 3: Field Creation & Data Studio Polish
- [ ] **Task 3.1**: Enhance field creation in `src/modules/cms_admin/views/data.tsx` to provide visual interface categories (Text & Numbers, Selection, Relational, etc.) inspired by Directus.
- [ ] **Task 3.2**: Verify content editing in `src/modules/cms_admin/views/content.tsx` seamlessly supports the new optional fields (status dropdown, sorting, etc.).

### Phase 4: Validation & Quality Checks
- [ ] **Task 4.1**: Run `npm run styles:check` and verify no contract or visual regressions.
- [ ] **Task 4.2**: Run `npm run typecheck` to ensure full TypeScript safety.
- [ ] **Task 4.3**: Test collection creation flow end-to-end.

