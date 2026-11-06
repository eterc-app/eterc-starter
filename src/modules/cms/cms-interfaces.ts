/**
 * Interface registry for the CMS field builder.
 *
 * Directus separates a field's storage type from the interface that edits it.
 * This registry keeps the same idea: each interface declares the storage types
 * it can edit, the type it selects by default and the options it understands.
 * The Data Studio drawer and the record form both read from this file so they
 * cannot drift apart.
 */

import type {
  CmsChoice,
  CmsFieldInterface,
  CmsFieldType,
  CmsRepeaterField,
} from "./cms-types";

export type CmsInterfaceGroup =
  | "Text & Numbers"
  | "Selection"
  | "Relational"
  | "Translations"
  | "Presentation"
  | "Groups"
  | "Other";

export interface CmsInterfaceDefinition {
  id: CmsFieldInterface;
  label: string;
  group: CmsInterfaceGroup;
  /** Storage types accepted by the interface. */
  types: CmsFieldType[];
  defaultType: CmsFieldType;
  /** Presentation and group interfaces create metadata only, not a column. */
  alias?: boolean;
  /** Group interfaces collect child fields through `field.group`. */
  groupInterface?: boolean;
  /** Presentation interfaces render without a field label. */
  presentation?: boolean;
  defaultOptions?: Record<string, unknown>;
}

export const CMS_INTERFACE_GROUPS: CmsInterfaceGroup[] = [
  "Text & Numbers",
  "Selection",
  "Relational",
  "Translations",
  "Presentation",
  "Groups",
  "Other",
];

const WYSIWYG_TOOLBAR = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "h2",
  "h3",
  "bullist",
  "numlist",
  "blockquote",
  "customLink",
  "unlink",
  "removeformat",
];

export const CMS_INTERFACES: Record<CmsFieldInterface, CmsInterfaceDefinition> = {
  input: {
    id: "input",
    label: "Input",
    group: "Text & Numbers",
    types: ["string", "text", "integer", "decimal"],
    defaultType: "string",
    defaultOptions: { font: "sans-serif", trim: false, masked: false },
  },
  input_autocomplete_api: {
    id: "input_autocomplete_api",
    label: "Autocomplete Input (API)",
    group: "Text & Numbers",
    types: ["string", "text"],
    defaultType: "string",
    defaultOptions: {
      trigger: "debounce",
      rate: 500,
      font: "sans-serif",
      resultsPath: "",
      textPath: "",
      valuePath: "",
    },
  },
  block_editor: {
    id: "block_editor",
    label: "Block Editor",
    group: "Text & Numbers",
    types: ["json"],
    defaultType: "json",
    defaultOptions: {
      font: "sans-serif",
      bordered: true,
    },
  },
  code: {
    id: "code",
    label: "Code",
    group: "Text & Numbers",
    types: ["string", "text", "json"],
    defaultType: "text",
    defaultOptions: { language: "plaintext", lineNumber: true, lineWrapping: false },
  },
  textarea: {
    id: "textarea",
    label: "Textarea",
    group: "Text & Numbers",
    types: ["text", "string"],
    defaultType: "text",
    defaultOptions: { font: "sans-serif", trim: false },
  },
  wysiwyg: {
    id: "wysiwyg",
    label: "WYSIWYG",
    group: "Text & Numbers",
    types: ["text", "string"],
    defaultType: "text",
    defaultOptions: {
      font: "sans-serif",
      toolbar: WYSIWYG_TOOLBAR,
    },
  },
  markdown: {
    id: "markdown",
    label: "Markdown",
    group: "Text & Numbers",
    types: ["text", "string"],
    defaultType: "text",
    defaultOptions: {
      defaultView: "editor",
      editorFont: "sans-serif",
      previewFont: "sans-serif",
    },
  },
  tags: {
    id: "tags",
    label: "Tags",
    group: "Text & Numbers",
    types: ["json"],
    defaultType: "json",
    defaultOptions: {
      allowCustom: true,
      alphabetize: false,
      iconRight: "tag",
    },
  },

  toggle: {
    id: "toggle",
    label: "Toggle",
    group: "Selection",
    types: ["boolean"],
    defaultType: "boolean",
    defaultOptions: {
      iconOn: "check",
      iconOff: "x",
      label: "Enabled",
    },
  },
  datetime: {
    id: "datetime",
    label: "Datetime",
    group: "Selection",
    types: ["datetime", "string"],
    defaultType: "datetime",
    defaultOptions: {
      format: "long",
      includeSeconds: false,
    },
  },
  repeater: {
    id: "repeater",
    label: "Repeater",
    group: "Selection",
    types: ["json"],
    defaultType: "json",
    defaultOptions: {
      addLabel: "Create New",
      fields: [] satisfies CmsRepeaterField[],
    },
  },
  map: {
    id: "map",
    label: "Map",
    group: "Selection",
    types: ["json"],
    defaultType: "json",
    defaultOptions: {
      defaultLat: 0,
      defaultLng: 0,
      defaultZoom: 2,
      height: 320,
    },
  },
  color: {
    id: "color",
    label: "Color",
    group: "Selection",
    types: ["string"],
    defaultType: "string",
    defaultOptions: { opacity: false },
  },
  dropdown: {
    id: "dropdown",
    label: "Dropdown",
    group: "Selection",
    types: ["string", "integer", "decimal", "select"],
    defaultType: "string",
    defaultOptions: { allowNone: true, allowOther: false },
  },
  icon: {
    id: "icon",
    label: "Icon",
    group: "Selection",
    types: ["string"],
    defaultType: "string",
    defaultOptions: {},
  },
  checkboxes: {
    id: "checkboxes",
    label: "Checkboxes",
    group: "Selection",
    types: ["json"],
    defaultType: "json",
    defaultOptions: {
      itemsShown: 8,
      allowOther: false,
    },
  },
  checkboxes_tree: {
    id: "checkboxes_tree",
    label: "Checkboxes (Tree)",
    group: "Selection",
    types: ["json"],
    defaultType: "json",
    defaultOptions: { itemsShown: 8, allowOther: false },
  },
  dropdown_multiselect: {
    id: "dropdown_multiselect",
    label: "Dropdown (Multiple)",
    group: "Selection",
    types: ["json"],
    defaultType: "json",
    defaultOptions: { allowNone: false, allowOther: false, previewThreshold: 3 },
  },
  radio: {
    id: "radio",
    label: "Radio Buttons",
    group: "Selection",
    types: ["string", "integer", "decimal", "select"],
    defaultType: "string",
    defaultOptions: { allowOther: false },
  },

  file: {
    id: "file",
    label: "File",
    group: "Relational",
    types: ["string"],
    defaultType: "string",
    defaultOptions: {},
  },
  image: {
    id: "image",
    label: "Image",
    group: "Relational",
    types: ["image", "string"],
    defaultType: "image",
    defaultOptions: {},
  },
  files: {
    id: "files",
    label: "Files",
    group: "Relational",
    types: ["json"],
    defaultType: "json",
    defaultOptions: {},
  },
  builder_m2a: {
    id: "builder_m2a",
    label: "Builder (M2A)",
    group: "Relational",
    types: ["json"],
    defaultType: "json",
    defaultOptions: { limit: 15 },
  },
  many_to_many: {
    id: "many_to_many",
    label: "Many to Many",
    group: "Relational",
    types: ["json"],
    defaultType: "json",
    defaultOptions: { limit: 15 },
  },
  one_to_many: {
    id: "one_to_many",
    label: "One to Many",
    group: "Relational",
    types: ["json"],
    defaultType: "json",
    defaultOptions: { limit: 15 },
  },
  tree_view: {
    id: "tree_view",
    label: "Tree View",
    group: "Relational",
    types: ["json", "relation"],
    defaultType: "json",
    defaultOptions: { parentField: "parent" },
  },
  many_to_one: {
    id: "many_to_one",
    label: "Many to One",
    group: "Relational",
    types: ["json", "relation", "string", "integer"],
    defaultType: "json",
    defaultOptions: { relatedCollection: "" },
  },

  translations: {
    id: "translations",
    label: "Translations",
    group: "Translations",
    types: ["json"],
    defaultType: "json",
    defaultOptions: {
      languages: ["en"],
      defaultLanguage: "en",
      userLanguage: false,
    },
  },

  header: {
    id: "header",
    label: "Header",
    group: "Presentation",
    types: ["alias"],
    defaultType: "alias",
    alias: true,
    presentation: true,
    defaultOptions: { title: "", subtitle: "", icon: "", color: "" },
  },
  divider: {
    id: "divider",
    label: "Divider",
    group: "Presentation",
    types: ["alias"],
    defaultType: "alias",
    alias: true,
    presentation: true,
    defaultOptions: { inlineTitle: false },
  },
  buttons: {
    id: "buttons",
    label: "Buttons",
    group: "Presentation",
    types: ["alias"],
    defaultType: "alias",
    alias: true,
    presentation: true,
    defaultOptions: { links: [] },
  },
  notice: {
    id: "notice",
    label: "Notice",
    group: "Presentation",
    types: ["alias"],
    defaultType: "alias",
    alias: true,
    presentation: true,
    defaultOptions: { color: "normal", icon: "info", text: "" },
  },
  accordion: {
    id: "accordion",
    label: "Accordion",
    group: "Groups",
    types: ["alias"],
    defaultType: "alias",
    alias: true,
    groupInterface: true,
    presentation: true,
    defaultOptions: { accordionMode: true, start: "closed" },
  },
  detail_group: {
    id: "detail_group",
    label: "Detail Group",
    group: "Groups",
    types: ["alias"],
    defaultType: "alias",
    alias: true,
    groupInterface: true,
    presentation: true,
    defaultOptions: { start: "open" },
  },
  raw_group: {
    id: "raw_group",
    label: "Raw Group",
    group: "Groups",
    types: ["alias"],
    defaultType: "alias",
    alias: true,
    groupInterface: true,
    presentation: true,
    defaultOptions: {},
  },

  collection_item_dropdown: {
    id: "collection_item_dropdown",
    label: "Collection Item Dropdown",
    group: "Other",
    types: ["json"],
    defaultType: "json",
    defaultOptions: { selectedCollection: "", template: "" },
  },
  collection_item_dropdown_multiple: {
    id: "collection_item_dropdown_multiple",
    label: "Collection Item Dropdown (Multiple)",
    group: "Other",
    types: ["json"],
    defaultType: "json",
    defaultOptions: { selectedCollection: "", template: "" },
  },
  hash: {
    id: "hash",
    label: "Hash",
    group: "Other",
    types: ["string"],
    defaultType: "string",
    defaultOptions: { masked: true },
  },
  slider: {
    id: "slider",
    label: "Slider",
    group: "Other",
    types: ["integer", "decimal"],
    defaultType: "integer",
    defaultOptions: {
      minValue: 0,
      maxValue: 100,
      stepInterval: 1,
      alwaysShowValue: true,
    },
  },

  // Legacy interfaces created by older versions of the CMS.
  number: {
    id: "number",
    label: "Number",
    group: "Text & Numbers",
    types: ["integer", "decimal"],
    defaultType: "integer",
    defaultOptions: { font: "sans-serif" },
  },
  json: {
    id: "json",
    label: "JSON",
    group: "Text & Numbers",
    types: ["json"],
    defaultType: "json",
    defaultOptions: { language: "json", lineNumber: true },
  },
  select: {
    id: "select",
    label: "Select",
    group: "Selection",
    types: ["select", "string", "integer", "decimal"],
    defaultType: "select",
    defaultOptions: { allowNone: true },
  },
  relation: {
    id: "relation",
    label: "Relation",
    group: "Relational",
    types: ["relation", "json", "string", "integer"],
    defaultType: "relation",
    defaultOptions: { enableSelect: true },
  },
};

export function cms_interface_definition(
  id: CmsFieldInterface | string | null | undefined
): CmsInterfaceDefinition {
  if (id && id in CMS_INTERFACES) {
    return CMS_INTERFACES[id as CmsFieldInterface];
  }
  return CMS_INTERFACES.input;
}

export function cms_interface_default_type(
  id: CmsFieldInterface | string | null | undefined
): CmsFieldType {
  return cms_interface_definition(id).defaultType;
}

export function cms_interface_types(
  id: CmsFieldInterface | string | null | undefined
): CmsFieldType[] {
  return cms_interface_definition(id).types;
}

export function cms_is_alias_interface(
  id: CmsFieldInterface | string | null | undefined
): boolean {
  return cms_interface_definition(id).alias === true;
}

export function cms_is_group_interface(
  id: CmsFieldInterface | string | null | undefined
): boolean {
  return cms_interface_definition(id).groupInterface === true;
}

export function cms_is_presentation_interface(
  id: CmsFieldInterface | string | null | undefined
): boolean {
  return cms_interface_definition(id).presentation === true;
}

export function cms_interface_defaults(
  id: CmsFieldInterface | string | null | undefined
): Record<string, unknown> {
  return { ...(cms_interface_definition(id).defaultOptions ?? {}) };
}

const CHOICE_INTERFACES = new Set<CmsFieldInterface>([
  "dropdown",
  "select",
  "radio",
  "checkboxes",
  "checkboxes_tree",
  "dropdown_multiselect",
  "tags",
]);

/** True when the interface stores its option list in `options.choices`. */
export function cms_interface_uses_choices(
  id: CmsFieldInterface | string | null | undefined
): boolean {
  return CHOICE_INTERFACES.has(cms_interface_definition(id).id);
}

function choice_value(value: unknown, fallback: string): string | number | boolean {
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? fallback : text;
}

/**
 * Accept both the legacy comma-separated string list and the Directus choice
 * object shape so existing projects keep working after the upgrade.
 */
export function cms_normalize_choices(value: unknown): CmsChoice[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry, index): CmsChoice | null => {
      if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
        const text = String(entry);
        return { text, value: entry };
      }
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const choice = entry as Record<string, unknown>;
      const text = String(choice.text ?? choice.name ?? choice.value ?? "").trim();
      if (text === "") return null;
      const normalized: CmsChoice = {
        text,
        value: choice_value(choice.value, text || String(index)),
      };
      if (typeof choice.icon === "string" && choice.icon !== "") normalized.icon = choice.icon;
      if (typeof choice.color === "string" && choice.color !== "") normalized.color = choice.color;
      if (
        typeof choice.parent === "string" ||
        typeof choice.parent === "number" ||
        typeof choice.parent === "boolean"
      ) {
        normalized.parent = choice.parent;
      }
      return normalized;
    })
    .filter((entry): entry is CmsChoice => entry !== null);
}

export function cms_choice_text(
  choices: CmsChoice[],
  value: unknown
): string | null {
  const found = choices.find((choice) => String(choice.value) === String(value));
  return found ? found.text : null;
}

export function cms_normalize_repeater_fields(value: unknown): CmsRepeaterField[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): CmsRepeaterField | null => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const item = entry as Record<string, unknown>;
      const field = String(item.field ?? item.name ?? "").trim();
      if (field === "") return null;
      const type = String(item.type ?? "string") as CmsFieldType;
      return {
        field,
        name: String(item.name ?? item.label ?? field),
        type,
        interface: (item.interface as CmsFieldInterface | undefined) ?? undefined,
        options:
          item.options && typeof item.options === "object" && !Array.isArray(item.options)
            ? (item.options as Record<string, unknown>)
            : {},
        required: item.required === true,
        width: item.width === "full" ? "full" : "half",
      };
    })
    .filter((entry): entry is CmsRepeaterField => entry !== null);
}
