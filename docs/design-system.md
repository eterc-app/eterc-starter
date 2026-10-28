# Eterc Starter design system

This document is the visual contract for the Eterc Starter web frontend. It adapts the
canonical Eterc Desktop admin design system to a browser application. The implementation source
of truth is `src/app/globals.css` plus the primitives in `src/components/ui` and the shared page
components in `src/components/app`. When this document and a one-off class disagree, the document
wins and the class must be removed or promoted into a primitive.

The starter remains CMS-first and private by default. The visual system must not change setup,
authentication, roles, API keys, media, database, or routing behavior.

## 1. Non-negotiable rules

1. Use design tokens or shared primitives. Do not introduce raw hex colors, Tailwind palette
   colors (`slate`, `blue`, `emerald`, `amber`, `violet`, etc.), or page-level shadows.
2. Use the type scale in section 3. Do not add arbitrary `text-[13px]`, `font-bold`, oversized
   display headings, or all-caps section labels.
3. Use an 8 px radius for controls and a 10 px radius for surfaces. Pills and avatars may be
   fully round. Do not use `rounded-2xl`, `rounded-3xl`, or arbitrary radii.
4. Use 1 px borders. Do not use 2 px borders, colored glow rings, or border opacity variants for
   neutral dividers.
5. Use black for primary actions and field focus. The navy brand color is for identity accents
   only.
6. Use labels selectively. A field label is required when the value is not self-evident. A
   description is reserved for destructive actions, security, non-obvious defaults, and
   validation. Do not repeat the label in helper text.
7. The top bar is global workspace chrome. The breadcrumb identifies the current page; primary
   workspace pages do not repeat the title in a `PageHeader`. When a page does use `PageHeader`,
   it owns the `h1`. Page actions belong in the top-bar action slot, never in the page header.
8. Every authenticated page root uses `app-page`. Auth, setup, and public pages use their own
   full-screen surface but the same tokens and type scale.
9. Run `npm run typecheck`, `npm run styles:check`, `npm run lint`, and `npm run build` before
   considering a UI change complete.

## 2. Color tokens

Light mode is canonical. Dark mode is an adaptation of the same hierarchy and must not invent new
accents.

| Token | Light | Use |
| --- | --- | --- |
| `--background` | `#ededed` | App canvas behind cards |
| `--card` / `--popover` | `#ffffff` | Sidebar, top bar, cards, menus |
| `--foreground` | `#000000` | Primary text and primary actions |
| `--muted-foreground` | `#666666` | Secondary text, notes, placeholders |
| `--border` | `#d9d9d9` | Card, table, and divider borders |
| `--input` | `#cccccc` | Field borders and scrollbar thumb |
| `--primary` | `#000000` | Primary button, checked control, focus |
| `--primary-foreground` | `#ffffff` | Text on primary |
| `--secondary` / `--muted` | `#ededed` | Secondary buttons, selected rows, icon wells |
| `--brand` | `#11355d` | Identity accents (brand marks, code/folder icons) |
| `--destructive` | `#a51d2d` | Destructive text and tinted destructive actions |
| `--success` | `#2e7d32` | Healthy status only |
| `--warning` | `#b26a00` | Attention states only |
| `--surface-subtle` | `#f5f5f5` | Table headers, footers, inset panels |
| `--surface-inverted` | `#0e1c2f` | Tooltip surface |
| `--overlay` | `rgb(38 50 56 / 0.8)` | Dialog and mobile-navigation scrim |

Rules:

- Semantic tints are allowed only for semantic states, for example
  `border-destructive/30 bg-destructive/5 text-destructive`.
- Never use a semantic color as decoration. A healthy card does not get a green tint unless it
  communicates health.
- Do not use the old starter blue (`#2563eb`), emerald/blue status accents, or blue-tinted
  surfaces. The canvas is neutral gray and the primary action is black.
- `text-white` and `bg-white` are forbidden; use foreground/background tokens.

## 3. Typography

Fonts are self-hosted by `next/font/google`: Inter for UI and Fira Mono for machine-readable
values. If the font download fails at build time, the CSS falls back to the system sans/mono
stack; do not switch to a runtime font CDN.

| Role | Class / recipe | Size / line | Weight |
| --- | --- | --- | --- |
| Body | default | 14 / 22 | 500 |
| Label | `Label` / `type-label` | 16 / 19 | 600 |
| Page title | `PageHeader` (secondary) / `type-title` | 18 / 24 | 500 |
| Section title | `h2` / `text-base font-semibold` | 16 / 22 | 600 |
| Card title | `CardTitle` | 16 / 22 | 600 |
| Note | `type-note` | 13 / 18 italic | 500 |
| Eyebrow | `type-headline` | 12 / 16 | 600 |
| Micro / badge | `text-xs` | 13 / 18 | 600 |
| Mono value | `font-mono text-xs` | 13 / 18 | 500 |
| Hero number | `text-lg font-medium` | 18 / 24 | 500 |

Rules:

- Page titles are 18 px. Do not use 24 px or 30 px page headings.
- Use `font-medium` for display numbers and titles, `font-semibold` for labels and emphasis.
  Never use `font-bold`.
- Use sentence case. All-caps is reserved for short brand lockups and is not a section-label
  device.
- Use `type-note` only for an actual note: security guidance, destructive consequences, or a
  non-obvious default. Do not put a note under every field.
- Machine-readable identifiers, paths, keys, SQL, and code use `font-mono`. UI prose does not.
- Use tabular numbers for counts and timings.

## 4. Geometry and layout

| Element | Value |
| --- | --- |
| Sidebar | 280 px (`w-[280px]`) |
| Content collection rail | 248 px (`lg:grid-cols-[248px_minmax(0,1fr)]`) |
| Top bar | 64 px (`h-16`) |
| Content padding | 32 px on large screens, 16–24 px below |
| Maximum content width | 1560 px (`max-w-[1560px]`) |
| Control radius | 8 px (`rounded-lg`) |
| Surface radius | 10 px (`rounded-xl`) |
| Border width | 1 px |
| Standard field height | 40 px (`h-10`) |
| Large field height | 48 px (`h-12`) |
| Standard button height | 40 px (`h-10`) |
| Large button height | 60 px (`h-15`) |
| Compact button height | 32 px (`h-8`) |
| Icon button | 40 px (`size-10`) |
| Card padding | 16 px |
| Form column gap | 32 px |
| Form row gap | 24 px |

Shell composition:

- `AdminTemplate` is the authenticated shell. It has a 280 px white sidebar, a 64 px white top
  bar, and a gray canvas with 32 px padding. There is no Electron title bar or assistant rail.
- The sidebar has 12 px horizontal padding, 40 px navigation rows, and 12 px sentence-case
  section labels. The active row uses `--muted` and semibold text.
- The top bar holds the mobile navigation trigger, sidebar collapse, breadcrumb, the current
  page's action icons, and the theme toggle. It does not repeat the page title or carry status
  badges.
- Page actions are dynamic. Each route portals its action icons into the top-bar slot immediately
  before the theme toggle; the slot is empty on routes without actions. When a page uses
  `PageHeader`, it carries the title and description only; primary workspace pages rely on the
  breadcrumb instead. Never add a separate page-action row in the content area.
- The account menu lives in the sidebar footer and opens upward.
- Main content is capped at 1560 px and centered. Pages use the `app-page` utility for a
  consistent 24 px vertical rhythm.
- Content overview and Data Studio share a 248 px collection rail inside the page. It is
  navigation, not a second work column; on narrow screens it collapses to a `Collections`
  disclosure above the work surface.
- Auth and setup pages are full-screen canvas surfaces. The active login is a split screen;
  forgot/reset and blocked-access pages keep the single white `AuthShell` card. Public pages
  use the same canvas and card hierarchy.

## 5. Components

### Buttons

- Default: black fill, white text, 40 px tall, 8 px radius, 16 px horizontal padding.
- Outline: white fill, 1 px `--border`, foreground text. Hover uses `--muted`.
- Secondary: neutral fill for selected filters and toggles.
- Ghost: text/icon actions only; hover uses `--muted`.
- Destructive: tinted red surface with red text. A destructive action inside a confirmation
  dialog uses `variant="destructive"`. Do not use solid red for normal buttons.
- Icon buttons are 40 px with a visible `aria-label` and, when useful, a tooltip.
- Never add page-level shadows to buttons. Focus is the shared 2 px outline with 2 px offset.

### Page actions

- Page actions live in the top bar, immediately before the theme toggle. Use `PageActionsPortal`
  with the shared `PageActions` menu; do not pass an `actions` prop to `PageHeader`.
- A single action is an icon-only button with an accessible name. Multiple actions use the shared
  `PageActions` menu. Page-specific icon buttons, such as **Access sections**, may sit beside the
  menu in the same slot.
- The slot is route-owned: the current page mounts its actions and the previous page's actions
  disappear on navigation. Do not duplicate the action set in the page body.

### Fields

- Inputs, selects, and textareas are 40 px tall by default, white, 1 px `--input`, 8 px radius,
  12 px horizontal padding, 14 px text.
- Focus is a 1 px black border plus a soft black shadow:
  `focus-visible:border-ring focus-visible:shadow-[0_0_16px_-8px_var(--ring)]`. Do not use a
  colored outer ring on fields.
- Placeholders are muted and never replace a label.
- Labels are 14 px semibold. Keep the label and control in a 12 px vertical stack using `grid gap-3`; the label's `m-0` overrides `space-y-*` margins.
- Helper text is 13 px italic muted and appears only when it changes a decision.
- Form grids use two columns at `sm` and larger, 32 px column gap, 24 px row gap. Long text fields
  span both columns.

### Cards and surfaces

- Cards are white, 1 px `--border`, 10 px radius, no shadow, 16 px padding.
- Card headers that separate from content use a 1 px bottom border and 12 px bottom padding.
- Use `--surface-subtle` for table headers, footers, inset panels, and metadata wells.
- Do not use gradients, glass effects, lift-on-hover, or colored card borders except for
  semantic warning/error surfaces.
- Non-blocking notices use the shared `Notice` primitive: a white surface, 10 px radius, 1 px
  border, a 4 px black left border, and a black icon. Reserve red tints for destructive
  consequences and failed operations. Do not use amber-tinted cards for ordinary guidance.

### Tables

- Table text is 14 px; headers are 13 px semibold muted on `--surface-subtle`, 44 px tall.
- Rows are 44 px tall with 1 px bottom borders and a subtle hover. Selected rows use `--muted`.
- Cells use 12 px horizontal padding. Actions are right-aligned.
- Identifiers use `font-mono text-xs`. Do not use 10 px or 11 px text in tables.
- Empty states use the shared `EmptyState` primitive with a 48 px icon well, a 16 px semibold
  title, and at most one short note.

### Section navigation and drawers

- Do not use tab bars in the admin workspace. Page sections and policy sections use a sidebar
  list instead.
- Page sections open in the shared `SectionDrawer`: a left sheet, at most 360 px wide, with
  40 px navigation rows, an icon, a short description, and an optional count badge.
- A sheet with multiple sections uses a persistent 170 px vertical section rail on desktop and a
  single section `Select` on narrow screens. Do not render a horizontal tab strip inside a sheet.
- When a page would otherwise have two working columns, keep the primary content full width and
  move the secondary column into a `SideDrawer` or `Sheet`. The drawer is opened from an
  icon-only trigger with an accessible name.
- The content module is the documented exception: Content overview and Data Studio share a
  persistent 248 px collection rail on `lg` and wider. It is navigation, not a second work
  column; the records table remains the only work surface. Below `lg`, the rail collapses to a
  `Collections` disclosure above the page content.
- The access page role list and media details remain drawers, not permanent second columns.

### Content collection rail

- Use the shared `ContentSidebar` for the collection rail. Do not build a page-specific
  collection drawer or a horizontal collection tab strip.
- The rail is a white surface with a 1 px border and 10 px radius, sticky at 24 px on desktop.
  It has a `Collections` header, collection count, search field, 40 px collection rows, and a
  footer action for creating a collection.
- Collection rows use a small icon well, the collection label, and the item count. The active
  row uses `--muted` and semibold text. Keep the machine name in the row title or in the
  collection card, not as a second line in the rail.
- Content overview is a collection browser: a card grid with label, machine name, item count,
  and singleton/hidden state. Do not add aggregate stat cards, an API-mode summary, or a
  duplicate collection list below the grid.

### Dialogs

- Dialogs are white, 10 px radius, 1 px border, 24 px padding, and a large soft shadow. The
  scrim uses `--overlay`.
- Titles are 18 px medium. Descriptions are 13 px italic muted and only explain consequences or
  non-obvious behavior.
- Footers are inset with a 1 px top border and `--surface-subtle`, with the primary action on the
  right and Cancel on the left.
- Destructive confirmations must name the object and state that the action cannot be undone.
- Use the shared `useConfirm` hook from `@/components/app/ConfirmDialog` for confirmations;
  render its `dialog` once per page and `await confirm({...})` before the action. Do not call
  `window.confirm` in application code.
- Long dialogs scroll with `app-scrollbar`; the close button stays at the top right.

### Sheets

- Use the shared `Sheet` primitives for contextual editors that should stay
  attached to the page, such as a collection policy. Use a `Dialog` for short
  confirmations and compact forms.
- A sheet enters from the right by default, is full height, and is at most 600 px
  wide (`max-w-[600px]`). Use `side="left"` for a section or list drawer. A policy
  editor may use 760 px so the 170 px section rail fits beside the form. The sheet
  has a 1 px border, a 24 px body/header/footer inset, a large soft shadow, and the
  shared overlay scrim. It does not repeat the page title or page header.
- The header has an 18 px medium title, an optional badge or short description,
  and a 40 px close icon at the top right with a visible accessible name.
- The body is the only scrolling region and uses `app-scrollbar`. The footer is
  inset with a 1 px top border and `--surface-subtle`; the primary action is on
  the right and Cancel/Close is on the left. On narrow widths the footer stacks
  with the primary action first.
- Rule editors group conditions into bordered inset cards. Use compact selects
  and inputs, keep labels selective, and put a single `type-note` at the section
  level for security or non-obvious behavior instead of a note under every
  control.
- An inherited policy is read-only. Show a `Notice` that names the parent role
  and offer a single **Override in this role** action. Do not silently edit an
  inherited policy or imply that clearing a direct policy is the same as an empty
  direct policy.
- Field access uses a checklist. "Select all fields" maps to `["*"]`; an empty
  list means the primary key only. Show required, hidden, and read-only metadata
  as badges, not as extra prose.
- Validation and presets sections are only rendered for create and update actions.

### Badges and status

- Badges are 24 px tall, 13 px semibold, 6 px radius, and use outline or a semantic tint.
- Status is communicated by text plus a semantic badge, not color alone. Success is green,
  attention amber, error red, inactive neutral.
- Do not create custom pill colors outside the badge variants.

### Menus and tooltips

- Menus are white popovers, 10 px radius, 1 px border, 4 px padding, 36 px minimum row height.
- Tooltips use the inverted surface, 13 px text, 8 px radius, and a 300 ms delay.
- Focus and hover states use `--muted`/`--accent`; no colored highlights.

### Empty states

- Use `EmptyState` for a full empty region. It is a white card with a dashed 1 px border, a
  48 px icon well, a 16 px semibold title, and optional actions.
- Use an inline empty state inside a table or editor for a smaller region.
- Do not use emoji, illustrations, or decorative gradients.

## 6. Page composition

Primary workspace pages use the top-bar breadcrumb as their page identity and start with content:

```tsx
<div className="app-page">
  <PageActionsPortal>
    <PageActions
      items={[{ label: "Refresh", icon: <RefreshCw />, onSelect: refresh }]}
    />
  </PageActionsPortal>
  {/* page sections, 24 px apart via app-page */}
</div>
```

- Do not restore `PageHeader` on Content overview, Data Studio, Media library, Access & API,
  Project settings, or Manage users. Their breadcrumb is the page title.
- Secondary pages may use `PageHeader` when a local title adds context. It owns the `h1`; do not
  add another page-level heading. Use an eyebrow for the app section and a title for the page.
- Actions live in the top-bar action slot, not the page header. `PageActions` renders a single
  action as an icon button and multiple items as the shared overflow menu. Page-specific icon
  buttons may sit beside it. Do not place large text buttons in the top bar or page header.
- Metadata such as an API endpoint or database path goes in a `font-mono text-xs` line or an inset
  panel, not in a hero card.
- Start content immediately; do not add `mt-4`/`mt-5` when `app-page` already provides the gap.
- Content overview is a collection browser, not a dashboard. Use collection cards with label,
  machine name, item count, and collection state. Do not add aggregate stat cards, an API-mode
  summary, or a second collection list.

## 7. Auth, setup, and public pages

- `login_default` is the active split-screen login. The left half is the white sign-in surface:
  brand mark and name, a 380 px form column, selective labels, one black primary action, optional
  social buttons, and a small private-by-default/signed-out footer. The right half is the
  configurable workspace panel and is hidden below the `lg` breakpoint.
- The right panel may be a solid color, a two-stop gradient, or a project image with an optional
  color overlay. It carries only the domain badge; do not put form fields or explanatory copy
  there. Image previews are project-local public paths, never remote URLs.
- Login branding, the right panel, and GitHub/Google social buttons are configured from the
  desktop app only. The web admin has no login customization screen. Non-secret settings live in
  `data/settings/login.json`; OAuth client secrets live in the gitignored
  `data/settings/login.secrets.json` and are never passed to the login view.
- Social buttons appear only when a provider is enabled and has a client ID and secret. Provider
  errors use fixed `login_error` enum copy; do not render arbitrary redirect text. Keep the
  forgot-password link conditional on the level configuration.
- `AuthShell` still owns forgot/reset password, blocked-access, and alternate login views. It is
  a full-screen canvas with a 440 px card, brand mark, title, optional description, and the
  private-by-default footer.
- Auth cards use the same 10 px surface radius, 1 px border, 14 px semibold labels, and 40 px
  fields as the admin workspace. Login may use a 44 px brand mark and the standard 40 px
  primary button.
- The setup wizard uses a 3xl max-width card on the canvas. Steps use a neutral track; the active
  step is black, not blue. Do not add confetti, gradients, or rainbow colors.
- Public pages use the neutral canvas, a white card, and black primary actions. They do not use
  the admin sidebar or top bar.
- Error pages use the same card hierarchy and sentence-case copy. Do not use 30 px status
  headings.

## 8. Dark mode

- Dark mode uses the same hierarchy: dark canvas, slightly lighter cards, light foreground, and
  a light primary action.
- Do not add dark-only accent colors. Semantic colors remain green/amber/red with the same
  meaning.
- Check focus outlines and field borders in dark mode; both must remain visible.
- The theme toggle lives in the top bar. Persist the preference through `next-themes`.

## 9. Accessibility

- Every icon-only button needs `aria-label` and a tooltip when the icon is not universally
  understood.
- Keyboard focus is always visible: 2 px outline, 2 px offset, `--ring`.
- Inputs, selects, and textareas use `Label` with a matching `htmlFor`.
- Do not rely on color alone for status, validation, or selection.
- Dialog titles and descriptions must be announced; destructive confirmations must have a
  description.
- Keep text contrast at or above WCAG AA for the token pairings in section 2.

## 10. Enforcement

`npm run styles:check` scans source for the most common regressions:

- raw hex colors in TSX (the Scalar reference theme is the documented exception)
- Tailwind palette colors
- arbitrary text sizes, radii, tracking, and page-level shadows
- `font-bold`, `bg-white`, `text-black`, `border-border/…`, `divide-border/…`, `ring-*`
- page roots that miss `app-page` in the authenticated admin modules
- required tokens and shell geometry in `globals.css` and `AdminTemplate`
- no admin tabs, no private-API badge, and page actions use the shared icon menu
- the shared sheet/side-drawer geometry and the policy editor's inherited/override contract
- the content module's shared collection rail, overview card grid, and absence of overview stat
  cards
- the split login surface, its social/error hooks, and the `AuthShell` fallback for reset pages
- native `window.confirm` calls
- legacy stylesheets and inline `<style>` blocks

The check is intentionally narrow. It does not replace review. A reviewer should still inspect
the rendered app at 1280 px, 1440 px, and 390 px.

## 11. Change checklist

- [ ] The page uses `app-page` and either the top-bar breadcrumb (primary workspace pages) or
      `PageHeader` (secondary pages), or the appropriate auth/setup/public surface.
- [ ] No duplicate page title in the top bar.
- [ ] No raw palette colors, hex colors, arbitrary type sizes, or arbitrary radii.
- [ ] Fields use `Input`/`Select`/`Textarea` and the shared focus treatment.
- [ ] Buttons use the shared variants and sizes.
- [ ] Page actions are icon-only or use the `PageActions` menu.
- [ ] Cards use 1 px borders, 10 px radius, no shadow.
- [ ] No admin tab bars; sections use a drawer or vertical rail.
- [ ] Two-column work areas use a drawer for the secondary column, except the content module
      collection rail.
- [ ] Content overview and Data Studio use the shared collection rail; the overview has no
      stat cards or API-mode summary.
- [ ] Login keeps the split surface, conditional social/forgot controls, and no client secrets.
- [ ] Sheets use the shared primitive, the correct side, and the inset footer.
- [ ] Inherited policies are read-only and expose the override action.
- [ ] Labels are selective; notes are reserved for real decisions.
- [ ] Field labels sit 12 px above their controls.
- [ ] Icon-only buttons have labels and tooltips.
- [ ] Light and dark mode both render correctly.
- [ ] `npm run typecheck` passes.
- [ ] `npm run styles:check` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
