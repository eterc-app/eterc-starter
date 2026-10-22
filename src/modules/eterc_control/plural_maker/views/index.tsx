import type { EtViewComponent, EtViewProps } from "@/engine/views-registry";
import { PluralMakerHome, type PluralExample } from "./home";
import LocalizationView from "./localization";
const HomeView: EtViewComponent = function PluralMakerHomeView(props: EtViewProps) {
  const data = (props.data ?? {}) as Record<string, unknown>;
  return <PluralMakerHome examples={data.examples as PluralExample[] | undefined} />;
};

export const views: Record<string, EtViewComponent> = {
  "plural_maker/home": HomeView,
  "plural_maker/localization": LocalizationView,
};
