/**
 * Shared types for the Module Relations Builder wizard.
 *
 * Port of modules/trongate_control/module_relations_builder. The wizard state
 * lives in the `evo_wizard` session key, exactly like the PHP original.
 */

export const RELATION_TYPES = [
  "one to one",
  "one to many",
  "many to many",
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

export interface RelationsWizard {
  relation_type?: RelationType | string;
  parent_module?: string;
  child_module?: string;
  singular_a?: string;
  singular_b?: string;
  plural_a?: string;
  plural_b?: string;
  identifier_column_a?: string;
  identifier_column_b?: string;
  bridging_table?: boolean;
}

/** One row of the module picker (a relation-eligible module/table). */
export interface RelationModuleChoice {
  module: string;
  label: string;
}

/** Kind of anchor an injection item is addressed to. */
export type InjectionAnchorKind = "exact" | "class-end" | "show-tail";

/**
 * One code-injection item.
 *
 * - `exact`      - a literal anchor string; inserted before its line or after
 *                  the anchor occurrence.
 * - `class-end`  - the end of the generated controller class (final `}`).
 * - `show-tail`  - before the fragment's closing `</>` in a generated show
 *                  view, after the details card and any sibling panels.
 */
export interface InjectionItem {
  path: string;
  displayPath: string;
  anchorKind: InjectionAnchorKind;
  anchor: string;
  insert: "before" | "after";
  block: string;
  marker: string;
  /** Refuse when the target already posts this field name. */
  refuseField?: string;
  /** Uploader-only: verify the delete scaffold loads `$record`. */
  needsRecord?: boolean;
}

/** The fully composed (but unwritten) injection plan. */
export interface InjectionPlan {
  items: InjectionItem[];
  originals: Record<string, string>;
  updates: Record<string, string>;
}

export interface GenerationFailure {
  ok: false;
  headline: string;
  message: string;
}
