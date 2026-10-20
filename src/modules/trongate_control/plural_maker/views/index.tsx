import type { TgViewComponent, TgViewProps } from "@/engine/views-registry";
import { PluralMakerHome, type PluralExample } from "./home";

/**
 * View registration map for the plural_maker child module.
 *
 * plural_maker has no PHP views; the only key is the port-only landing page
 * rendered by Plural_maker::index().
 */
const HomeView: TgViewComponent = function PluralMakerHomeView(props: TgViewProps) {
  const data = (props.data ?? {}) as Record<string, unknown>;
  return <PluralMakerHome examples={data.examples as PluralExample[] | undefined} />;
};

export const views: Record<string, TgViewComponent> = {
  "plural_maker/home": HomeView,
};
