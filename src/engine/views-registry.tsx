import type { ReactNode, ComponentType } from "react";

/**
 * View registry — maps "module/view_file" keys (identical to the PHP
 * framework's view addressing) to React components.
 *
 * Each module's `views/index.ts` registers its views here; the control
 * panel's generators append new entries when creating modules.
 */

export type TgViewProps = {
  data: Record<string, unknown>;
} & Record<string, unknown>;

export type TgViewComponent = ComponentType<TgViewProps>;

const views = new Map<string, TgViewComponent>();

export function registerView(key: string, component: TgViewComponent): void {
  views.set(key, component);
}

export function registerViews(map: Record<string, TgViewComponent>): void {
  for (const [key, component] of Object.entries(map)) {
    registerView(key, component);
  }
}

export function getView(key: string): TgViewComponent | undefined {
  return views.get(key);
}

export function renderView(
  key: string,
  data: Record<string, unknown>
): ReactNode {
  const Component = getView(key);
  if (!Component) {
    return <div className="container">View not found: {key}</div>;
  }
  return <Component data={data} {...data} />;
}
