import type { TgViewComponent } from "@/engine/views-registry";

/**
 * The language module has no views in the PHP original — it is a service
 * module (set/get/reset the current language + load phrase files). The empty
 * map keeps the "{module}/views" convention so the central registry can
 * import every module uniformly.
 */
export const views: Record<string, TgViewComponent> = {};
