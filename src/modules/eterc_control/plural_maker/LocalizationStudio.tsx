"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  BookOpen,
  Check,
  Copy,
  Download,
  Languages,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Direction = "plural" | "singular";
type Phrases = Record<string, string>;

export interface PluralExample {
  singular: string;
  plural: string;
  round_trip: string;
}

interface LocalizationStudioProps {
  initialLocale: string;
  initialLocales: string[];
  initialBuiltin: Phrases;
  initialCatalog: Phrases;
  initialOverrides: Phrases;
  examples: PluralExample[];
  csrfToken: string;
  apiRoot: string;
}

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/;

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

function sortedPhrases(phrases: Phrases): string {
  return JSON.stringify(
    Object.keys(phrases)
      .sort()
      .map((key) => [key, phrases[key]])
  );
}

async function unwrapJson(response: Response): Promise<Record<string, unknown>> {
  const envelope = (await response.json()) as Record<string, unknown>;

  if (envelope.status === "redirect") {
    window.location.assign(String(envelope.redirect ?? "/"));
    throw new Error("Redirecting...");
  }

  if (envelope.status === "error") {
    throw new Error(
      String(envelope.message ?? "The request could not be completed.")
    );
  }

  const data = envelope.data;
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }

  return envelope;
}

async function postJson(
  url: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return unwrapJson(response);
}

export function LocalizationStudio({
  initialLocale,
  initialLocales,
  initialBuiltin,
  initialCatalog,
  initialOverrides,
  examples,
  csrfToken,
  apiRoot,
}: LocalizationStudioProps) {
  const [locale, setLocale] = useState(initialLocale);
  const [locales, setLocales] = useState<string[]>(initialLocales);
  const [builtin, setBuiltin] = useState<Phrases>(initialBuiltin);
  const [catalog, setCatalog] = useState<Phrases>(initialCatalog);
  const [overrides, setOverrides] = useState<Phrases>(initialOverrides);
  const [draft, setDraft] = useState<Phrases>(initialOverrides);
  const [search, setSearch] = useState("");
  const [loadingLocale, setLoadingLocale] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phraseError, setPhraseError] = useState("");
  const [phraseNotice, setPhraseNotice] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [showNewLocale, setShowNewLocale] = useState(false);
  const [newLocale, setNewLocale] = useState("");

  const initial_example =
    examples.find((example) => example.singular === "category") ??
    examples[0] ??
    null;
  const [direction, setDirection] = useState<Direction>("plural");
  const [word, setWord] = useState(initial_example?.singular ?? "category");
  const [result, setResult] = useState<PluralExample | null>(initial_example);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState("");
  const [copied, setCopied] = useState(false);

  const [batchText, setBatchText] = useState("");
  const [batchResults, setBatchResults] = useState<
    Array<{ input: string; output: string }>
  >([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState("");
  const [batchCopied, setBatchCopied] = useState(false);

  const importRef = useRef<HTMLInputElement>(null);

  const dirty = useMemo(
    () => sortedPhrases(draft) !== sortedPhrases(overrides),
    [draft, overrides]
  );

  const phraseKeys = useMemo(() => {
    const keys = new Set([...Object.keys(builtin), ...Object.keys(draft)]);
    return Array.from(keys).sort((left, right) => left.localeCompare(right));
  }, [builtin, draft]);

  const filteredKeys = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle === "") return phraseKeys;
    return phraseKeys.filter((key) => {
      const text = `${key} ${builtin[key] ?? ""} ${draft[key] ?? ""}`;
      return text.toLowerCase().includes(needle);
    });
  }, [builtin, draft, phraseKeys, search]);

  const overrideCount = Object.keys(draft).length;

  const convertWord = useCallback(
    async (value: string, nextDirection: Direction) => {
      const trimmed = value.trim();
      if (trimmed === "") {
        setResult(null);
        setConvertError("");
        return;
      }

      setConverting(true);
      setConvertError("");
      try {
        const data = await postJson(`${apiRoot}/convert`, {
          word: trimmed,
          direction: nextDirection,
        });
        if (data.ok === false) {
          throw new Error(String(data.error ?? "The word could not be converted."));
        }
        setResult({
          singular: nextDirection === "plural" ? trimmed : String(data.output ?? ""),
          plural: nextDirection === "plural" ? String(data.output ?? "") : trimmed,
          round_trip: String(data.round_trip ?? ""),
        });
      } catch (error) {
        setResult(null);
        setConvertError(
          error instanceof Error ? error.message : "The word could not be converted."
        );
      } finally {
        setConverting(false);
      }
    },
    [apiRoot]
  );

  const swapDirection = () => {
    const next: Direction = direction === "plural" ? "singular" : "plural";
    setDirection(next);
    if (result !== null) {
      const nextWord = next === "plural" ? result.plural : result.singular;
      setWord(nextWord);
      void convertWord(nextWord, next);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy this text", text);
    }
  };

  const copyResult = async () => {
    if (result === null) return;
    await copyText(result.plural);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const runBatch = async () => {
    if (batchText.trim() === "") {
      setBatchError("Paste at least one word.");
      return;
    }

    setBatchBusy(true);
    setBatchError("");
    setBatchResults([]);
    try {
      const data = await postJson(`${apiRoot}/batch`, {
        words: batchText,
        direction,
      });
      const results = Array.isArray(data.results)
        ? (data.results as Array<{ input?: unknown; output?: unknown }>).map(
            (entry) => ({
              input: String(entry.input ?? ""),
              output: String(entry.output ?? ""),
            })
          )
        : [];
      setBatchResults(results);
    } catch (error) {
      setBatchError(
        error instanceof Error ? error.message : "The list could not be converted."
      );
    } finally {
      setBatchBusy(false);
    }
  };

  const copyBatch = async () => {
    const text = batchResults
      .map((entry) => `${entry.input} → ${entry.output}`)
      .join("\n");
    if (text === "") return;
    await copyText(text);
    setBatchCopied(true);
    window.setTimeout(() => setBatchCopied(false), 1600);
  };

  const applyCatalog = (data: Record<string, unknown>) => {
    const nextBuiltin = asPhrases(data.builtin);
    const nextOverrides = asPhrases(data.overrides);
    const nextCatalog = asPhrases(data.catalog);
    const nextLocale = String(data.locale ?? locale);
    const nextLocales = Array.from(
      new Set([
        ...locales,
        nextLocale,
        ...(Array.isArray(data.locales)
          ? data.locales.map((entry) => String(entry))
          : []),
      ])
    ).sort();

    setBuiltin(nextBuiltin);
    setOverrides(nextOverrides);
    setDraft(nextOverrides);
    setCatalog(nextCatalog);
    setLocales(nextLocales);
    setLocale(nextLocale);
  };

  const loadLocale = async (nextLocale: string) => {
    setLoadingLocale(true);
    setPhraseError("");
    setPhraseNotice("");
    try {
      const data = await postJson(`${apiRoot}/load_catalog`, {
        locale: nextLocale,
      });
      applyCatalog(data);
    } catch (error) {
      setPhraseError(
        error instanceof Error ? error.message : "The locale could not be loaded."
      );
    } finally {
      setLoadingLocale(false);
    }
  };

  const changeLocale = (nextLocale: string) => {
    if (nextLocale === locale) return;
    if (dirty && !window.confirm("Discard unsaved phrase changes?")) return;
    setLocale(nextLocale);
    void loadLocale(nextLocale);
  };

  const setOverride = (key: string, value: string) => {
    setDraft((current) => {
      const next = { ...current };
      if (value.trim() === "") {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
    setPhraseNotice("");
  };

  const addPhrase = () => {
    const key = newKey.trim();
    const value = newValue.trim();

    if (!KEY_PATTERN.test(key)) {
      setPhraseError(
        "Keys may contain letters, numbers, dots, dashes and underscores."
      );
      return;
    }
    if (value === "") {
      setPhraseError("Enter the translated text.");
      return;
    }

    setDraft((current) => ({ ...current, [key]: value }));
    setNewKey("");
    setNewValue("");
    setPhraseError("");
    setPhraseNotice("");
  };

  const removePhrase = (key: string) => {
    setDraft((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const savePhrases = async () => {
    setSaving(true);
    setPhraseError("");
    setPhraseNotice("");
    try {
      const data = await postJson(`${apiRoot}/save_catalog`, {
        locale,
        phrases: draft,
        csrf_token: csrfToken,
      });
      if (data.ok === false) {
        throw new Error(String(data.error ?? "The phrases could not be saved."));
      }
      applyCatalog(data);
      setPhraseNotice("Phrasebook saved. Validation messages now use it.");
    } catch (error) {
      setPhraseError(
        error instanceof Error ? error.message : "The phrases could not be saved."
      );
    } finally {
      setSaving(false);
    }
  };

  const resetPhrases = async () => {
    if (!window.confirm(`Reset ${locale} to the shipped phrasebook?`)) return;

    setSaving(true);
    setPhraseError("");
    setPhraseNotice("");
    try {
      const data = await postJson(`${apiRoot}/reset_catalog`, {
        locale,
        csrf_token: csrfToken,
      });
      applyCatalog(data);
      setPhraseNotice("Shipped phrases restored.");
    } catch (error) {
      setPhraseError(
        error instanceof Error ? error.message : "The phrases could not be reset."
      );
    } finally {
      setSaving(false);
    }
  };

  const exportPhrases = () => {
    const effective = { ...builtin, ...draft };
    const blob = new Blob([JSON.stringify(effective, null, 2) + "\n"], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${locale}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const importPhrases = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;

    setPhraseError("");
    setPhraseNotice("");
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        throw new Error("The file must contain a JSON object.");
      }

      const imported: Phrases = {};
      for (const [key, value] of Object.entries(
        parsed as Record<string, unknown>
      )) {
        if (!KEY_PATTERN.test(key)) {
          throw new Error(`Invalid phrase key: ${key}`);
        }
        if (typeof value !== "string") {
          throw new Error(`The value for ${key} must be a string.`);
        }
        if (value.trim() !== "") imported[key] = value;
      }

      setDraft(imported);
      setPhraseNotice("JSON imported. Review the changes, then save.");
    } catch (error) {
      setPhraseError(
        error instanceof Error ? error.message : "The JSON could not be imported."
      );
    }
  };

  const createLocale = () => {
    const candidate = newLocale.trim().toLowerCase();
    if (!/^[a-z]{2}(?:-[a-z0-9]{2,8})?$/.test(candidate)) {
      setPhraseError("Use a locale code such as de, pt-BR, or en-GB.");
      return;
    }

    setNewLocale("");
    setShowNewLocale(false);

    if (locales.includes(candidate)) {
      changeLocale(candidate);
      return;
    }

    if (dirty && !window.confirm("Discard unsaved phrase changes?")) return;

    setLocales((current) =>
      Array.from(new Set([...current, candidate])).sort()
    );
    setLocale(candidate);
    void loadLocale(candidate);
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-[-0.01em]">
            Localization Studio
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Pluralize names for generated tables and labels, or translate the
            framework&apos;s local validation phrases. Overrides are stored as
            project JSON and applied immediately.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground">
          <Languages className="size-3.5" strokeWidth={1.75} />
          {locales.length} locales · {overrideCount} local overrides
        </div>
      </div>

      <Tabs defaultValue="pluralizer" className="gap-4">
        <TabsList>
          <TabsTrigger value="pluralizer">
            <Wand2 className="size-4" strokeWidth={1.75} />
            Pluralizer
          </TabsTrigger>
          <TabsTrigger value="phrasebook">
            <BookOpen className="size-4" strokeWidth={1.75} />
            Phrasebook
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pluralizer" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">Convert a word</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Handles irregulars, compound names, and case.
                  </p>
                </div>
                <div className="flex items-center rounded-md border bg-background p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      setDirection("plural");
                      void convertWord(word, "plural");
                    }}
                    className={cn(
                      "rounded px-2 py-1 transition-colors",
                      direction === "plural"
                        ? "bg-secondary font-medium text-secondary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Plural
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDirection("singular");
                      void convertWord(word, "singular");
                    }}
                    className={cn(
                      "rounded px-2 py-1 transition-colors",
                      direction === "singular"
                        ? "bg-secondary font-medium text-secondary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Singular
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <Label htmlFor="plural-word" className="text-xs">
                  {direction === "plural" ? "Singular word" : "Plural word"}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="plural-word"
                    value={word}
                    onChange={(event) => setWord(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void convertWord(word, direction);
                      }
                    }}
                    placeholder={
                      direction === "plural" ? "e.g. category" : "e.g. categories"
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Swap direction"
                    onClick={swapDirection}
                  >
                    <ArrowLeftRight className="size-4" strokeWidth={1.75} />
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void convertWord(word, direction)}
                    disabled={converting || word.trim() === ""}
                  >
                    {converting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ArrowRight className="size-4" strokeWidth={1.75} />
                    )}
                    Convert
                  </Button>
                </div>
              </div>

              {convertError ? (
                <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {convertError}
                </p>
              ) : null}

              <div className="mt-4 rounded-lg border bg-muted/20 p-3">
                {result === null ? (
                  <p className="text-xs text-muted-foreground">
                    Enter a word to see its plural form.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{result.singular}</span>
                      <ArrowRight
                        className="size-3.5 text-muted-foreground"
                        strokeWidth={1.75}
                      />
                      <span className="font-semibold text-primary">
                        {result.plural}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="ml-auto size-7"
                        aria-label="Copy plural"
                        onClick={() => void copyResult()}
                      >
                        {copied ? (
                          <Check className="size-3.5" strokeWidth={2} />
                        ) : (
                          <Copy className="size-3.5" strokeWidth={1.75} />
                        )}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Round trip: {result.round_trip}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Try an example
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {examples.map((example) => (
                    <button
                      key={example.singular}
                      type="button"
                      onClick={() => {
                        setWord(example.singular);
                        setDirection("plural");
                        void convertWord(example.singular, "plural");
                      }}
                      className="rounded-full border bg-background px-2.5 py-1 text-[11px] transition-colors hover:border-primary/40 hover:bg-accent"
                    >
                      {example.singular}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">Batch convert</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    One word per line. Useful for table and label naming.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() =>
                    setBatchText(
                      "category\nperson\nanalysis\nknife\nsheep\ntooth"
                    )
                  }
                >
                  <Sparkles className="size-3.5" strokeWidth={1.75} />
                  Sample
                </Button>
              </div>

              <Textarea
                value={batchText}
                onChange={(event) => setBatchText(event.target.value)}
                rows={5}
                className="mt-3 font-mono text-xs"
                placeholder={"category\nperson\nanalysis"}
              />

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void runBatch()}
                  disabled={batchBusy}
                >
                  {batchBusy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="size-3.5" strokeWidth={1.75} />
                  )}
                  Convert list
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setBatchText("");
                    setBatchResults([]);
                    setBatchError("");
                  }}
                >
                  Clear
                </Button>
                {batchResults.length > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void copyBatch()}
                  >
                    {batchCopied ? (
                      <Check className="size-3.5" strokeWidth={2} />
                    ) : (
                      <Copy className="size-3.5" strokeWidth={1.75} />
                    )}
                    Copy results
                  </Button>
                ) : null}
              </div>

              {batchError ? (
                <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {batchError}
                </p>
              ) : null}

              {batchResults.length > 0 ? (
                <div className="mt-3 max-h-[220px] overflow-auto rounded-lg border">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-muted/80 text-[10.5px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                      <tr>
                        <th className="px-3 py-2 font-medium">Input</th>
                        <th className="px-3 py-2 font-medium">Output</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchResults.map((entry, index) => (
                        <tr
                          key={`${entry.input}-${index}`}
                          className="border-t"
                        >
                          <td className="px-3 py-1.5 font-mono">
                            {entry.input}
                          </td>
                          <td className="px-3 py-1.5 font-mono font-medium text-primary">
                            {entry.output}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          </div>
        </TabsContent>

        <TabsContent value="phrasebook" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="locale" className="text-xs text-muted-foreground">
                Locale
              </Label>
              <select
                id="locale"
                value={locale}
                onChange={(event) => changeLocale(event.target.value)}
                disabled={loadingLocale}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {locales.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
              {loadingLocale ? (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              ) : null}
            </div>

            {showNewLocale ? (
              <div className="flex items-center gap-1.5">
                <Input
                  value={newLocale}
                  onChange={(event) => setNewLocale(event.target.value)}
                  placeholder="de or pt-BR"
                  className="h-8 w-28 text-xs"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      createLocale();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  onClick={createLocale}
                >
                  Add
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => setShowNewLocale(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setShowNewLocale(true)}
              >
                <Plus className="size-3.5" strokeWidth={1.75} />
                New locale
              </Button>
            )}

            <div className="relative ml-auto min-w-[180px] flex-1 sm:max-w-[260px]">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                strokeWidth={1.75}
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search phrases..."
                className="h-8 pl-8 text-xs"
              />
            </div>

            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => void importPhrases(event)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => importRef.current?.click()}
            >
              <Upload className="size-3.5" strokeWidth={1.75} />
              Import
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={exportPhrases}
            >
              <Download className="size-3.5" strokeWidth={1.75} />
              Export
            </Button>
          </div>

          {phraseError ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {phraseError}
            </p>
          ) : null}
          {phraseNotice ? (
            <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700">
              {phraseNotice}
            </p>
          ) : null}

          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2.5">
              <div className="text-xs">
                <span className="font-medium">
                  {filteredKeys.length} phrases
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  · {overrideCount} overridden · {locale}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => void resetPhrases()}
                  disabled={saving || Object.keys(overrides).length === 0}
                >
                  <RotateCcw className="size-3.5" strokeWidth={1.75} />
                  Reset
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  onClick={() => void savePhrases()}
                  disabled={saving || !dirty}
                >
                  {saving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Save className="size-3.5" strokeWidth={1.75} />
                  )}
                  Save phrasebook
                  {dirty ? (
                    <span className="ml-0.5 size-1.5 rounded-full bg-primary-foreground/80" />
                  ) : null}
                </Button>
              </div>
            </div>

            <div className="max-h-[520px] overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-card text-[10.5px] uppercase tracking-wide text-muted-foreground shadow-[0_1px_0_var(--border)]">
                  <tr>
                    <th className="w-[180px] px-3 py-2 font-medium">Key</th>
                    <th className="px-3 py-2 font-medium">Shipped phrase</th>
                    <th className="w-[42%] px-3 py-2 font-medium">
                      Local override
                    </th>
                    <th className="w-8 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filteredKeys.map((key) => {
                    const has_override = Object.prototype.hasOwnProperty.call(
                      draft,
                      key
                    );
                    const is_custom =
                      !Object.prototype.hasOwnProperty.call(builtin, key);

                    return (
                      <tr key={key} className="border-t align-top">
                        <td className="px-3 py-2">
                          <code className="break-all font-mono text-[11px]">
                            {key}
                          </code>
                          {is_custom ? (
                            <span className="ml-1 rounded bg-secondary px-1 py-0.5 text-[9px] uppercase tracking-wide text-secondary-foreground">
                              custom
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {builtin[key] ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={draft[key] ?? ""}
                            onChange={(event) =>
                              setOverride(key, event.target.value)
                            }
                            placeholder={
                              is_custom
                                ? "Enter translation"
                                : "Using shipped phrase"
                            }
                            className={cn(
                              "h-8 text-xs",
                              has_override && "border-primary/40 bg-accent/20"
                            )}
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          {has_override ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-destructive"
                              aria-label={`Remove override for ${key}`}
                              onClick={() => removePhrase(key)}
                            >
                              <Trash2
                                className="size-3.5"
                                strokeWidth={1.75}
                              />
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredKeys.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-10 text-center text-xs text-muted-foreground"
                      >
                        No phrases match that search.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="border-t bg-muted/20 p-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Add a custom phrase
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[180px] flex-1">
                  <Input
                    value={newKey}
                    onChange={(event) => setNewKey(event.target.value)}
                    placeholder="key_name"
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="min-w-[220px] flex-[2]">
                  <Input
                    value={newValue}
                    onChange={(event) => setNewValue(event.target.value)}
                    placeholder="Translated text"
                    className="h-8 text-xs"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addPhrase();
                      }
                    }}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={addPhrase}
                >
                  <Plus className="size-3.5" strokeWidth={1.75} />
                  Add
                </Button>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {catalog["required_error"] !== undefined
              ? "Validation messages use these phrases. Local overrides are stored in data/settings/language."
              : "Local overrides are stored in data/settings/language."}
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default LocalizationStudio;
