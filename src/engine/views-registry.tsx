import type { ReactNode, ComponentType } from "react";

export type EtViewProps = {
  data: Record<string, unknown>;
} & Record<string, unknown>;

export type EtViewComponent = ComponentType<EtViewProps>;

const views = new Map<string, EtViewComponent>();

export function register_view(key: string, component: EtViewComponent): void {
  views.set(key, component);
}

export function register_views(map: Record<string, EtViewComponent>): void {
  for (const [key, component] of Object.entries(map)) {
    register_view(key, component);
  }
}

export function get_view(key: string): EtViewComponent | undefined {
  return views.get(key);
}

export function render_view(
  key: string,
  data: Record<string, unknown>
): ReactNode {
  const Component = get_view(key);
  if (!Component) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">
        View not found: {key}
      </div>
    );
  }
  return <Component data={data} {...data} />;
}
