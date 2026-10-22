export const UPLOADER_DEFAULTS = {
  column: "picture",
  destination: "uploads",
  max_size: 2000,
  max_width: 1200,
  max_height: 1200,
  resize_max_width: 450,
  resize_max_height: 450,
  thumbnails: true,
  thumbnail_max_width: 120,
  thumbnail_max_height: 120,
} as const;

export interface UploaderWizard {
  module?: string;
  table?: string;
  column?: string;
  destination?: string;
  max_size?: number;
  max_width?: number;
  max_height?: number;
  resize_max_width?: number;
  resize_max_height?: number;
  thumbnails?: boolean;
  thumbnail_max_width?: number;
  thumbnail_max_height?: number;
}

/** The JSON contract read by the image_uploader runtime. */
export interface UploaderSettings {
  module: string;
  column: string;
  destination: string;
  max_size: number;
  max_width: number;
  max_height: number;
  resize_max_width: number;
  resize_max_height: number;
  thumbnails: boolean;
  thumbnail_max_width: number;
  thumbnail_max_height: number;
}

/** One row of the module chooser. */
export interface UploaderModuleChoice {
  module: string;
  label: string;
  ready: boolean;
  reasons: string[];
}

/** Kind of anchor an injection item is addressed to. */
export type UploaderAnchorKind = "exact" | "show-tail";

/** One code-injection item. */
export interface UploaderInjectionItem {
  path: string;
  displayPath: string;
  anchorKind: UploaderAnchorKind;
  anchor: string;
  insert: "before" | "after";
  block: string;
  marker: string;
  /** Verify the delete scaffold loads `record` before the delete call. */
  needsRecord?: boolean;
}

/** The fully composed (but unwritten) injection plan. */
export interface UploaderInjectionPlan {
  items: UploaderInjectionItem[];
  originals: Record<string, string>;
  updates: Record<string, string>;
}
