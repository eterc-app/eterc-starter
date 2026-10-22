import type { EtViewProps } from "@/engine/views-registry";
import {
  LocalizationStudio,
  type PluralExample,
} from "../LocalizationStudio";

type Phrases = Record<string, string>;

function asPhrases(value: unknown): Phrases {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const phrases: Phrases = {};
  for (const [key, phrase] of Object.entries(value as Record<string, unknown>)) {
    if (typeof phrase === "string") phrases[key] = phrase;
  }
  return phrases;
}

export default function LocalizationView({ data }: EtViewProps) {
  const examples = Array.isArray(data.examples)
    ? (data.examples as PluralExample[])
    : [];
  const locales = Array.isArray(data.locales)
    ? data.locales.map((locale) => String(locale))
    : ["en", "es", "fr"];

  return (
    <LocalizationStudio
      initialLocale={String(data.locale ?? "en")}
      initialLocales={locales}
      initialBuiltin={asPhrases(data.builtin)}
      initialCatalog={asPhrases(data.catalog)}
      initialOverrides={asPhrases(data.overrides)}
      examples={examples}
      csrfToken={String(data.csrf_token ?? "")}
      apiRoot={String(
        data.api_root ?? "/api/xhr/eterc_control-plural_maker"
      )}
    />
  );
}
