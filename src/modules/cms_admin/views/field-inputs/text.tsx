"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Bold,
  Braces,
  Code2,
  Columns2,
  Copy,
  Eye,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Pilcrow,
  Pencil,
  Plus,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Table2,
  Trash2,
  Underline,
  Undo2,
  Unlink,
  WrapText,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CmsField } from "@/modules/cms/cms-types";
import { CodeEditor } from "./code-editor";
import { markdown_to_html } from "./markdown";
import {
  as_array,
  as_object,
  as_string,
  option_array,
  option_bool,
  option_number,
  option_string,
  type CmsMediaConfig,
} from "./types";
import { is_image_file, upload_image } from "./media";

function font_class(value: string): string {
  if (value === "monospace" || value === "mono") return "font-mono";
  if (value === "serif") return "font-serif";
  return "";
}

function path_value(source: unknown, path: string): unknown {
  if (!path) return source;
  return path.split(".").reduce<unknown>((current, key) => {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, source);
}

export function TextInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const current = as_string(value);
  const iconLeft = option_string(field, "iconLeft", "icon_left");
  const iconRight = option_string(field, "iconRight", "icon_right");
  const font = option_string(field, "font");
  const trim = option_bool(field, false, "trim");
  const numeric = field.type === "integer" || field.type === "decimal";
  const prefix = iconLeft ? <DynamicIcon name={iconLeft} size={15} /> : null;
  const suffix = iconRight ? <DynamicIcon name={iconRight} size={15} /> : null;

  return (
    <div className="relative">
      {prefix ? (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {prefix}
        </span>
      ) : null}
      <Input
        id={`cms-field-${field.name}`}
        type={numeric ? "number" : "text"}
        step={field.type === "decimal" ? "any" : undefined}
        value={current}
        disabled={disabled}
        placeholder={option_string(field, "placeholder")}
        className={cn(
          "h-13 rounded-lg border-input bg-card",
          prefix && "pl-9",
          suffix && "pr-9",
          font_class(font)
        )}
        onChange={(event) => onChange(event.target.value)}
        onBlur={
          trim
            ? (event) => onChange(event.target.value.trim())
            : undefined
        }
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

interface ApiResult {
  text: string;
  value: string;
}

export function AutocompleteApiInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const current = as_string(value);
  const url = option_string(field, "url", "endpoint");
  const trigger = option_string(field, "trigger") || "debounce";
  const rate = option_number(field, 500, "rate");
  const resultsPath = option_string(field, "resultsPath", "responsePath", "response_path");
  const textPath = option_string(field, "textPath", "text_path") || "text";
  const valuePath = option_string(field, "valuePath", "value_path") || "value";
  const [selection, setSelection] = useState<{
    value: string;
    text: string;
  } | null>(null);
  const [results, setResults] = useState<ApiResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const query =
    selection && selection.value === current ? selection.text : current;
  const visible_results = query.trim() === "" ? [] : results;

  useEffect(() => {
    if (!url || disabled) return;
    const search = query.trim();
    if (search === "") return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const target = url.includes("{{search}}")
          ? url.replace(/\{\{\s*search\s*\}\}/g, encodeURIComponent(search))
          : `${url}${url.includes("?") ? "&" : "?"}search=${encodeURIComponent(
              search
            )}`;
        const response = await fetch(target, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`The lookup failed (HTTP ${response.status}).`);
        }
        const payload = (await response.json()) as unknown;
        const list = path_value(payload, resultsPath);
        const rows = Array.isArray(list) ? list : Array.isArray(payload) ? payload : [];
        const mapped = rows
          .map((row): ApiResult | null => {
            if (typeof row === "string" || typeof row === "number") {
              return { text: String(row), value: String(row) };
            }
            if (!row || typeof row !== "object") return null;
            const object = row as Record<string, unknown>;
            const text = as_string(path_value(object, textPath));
            const optionValue = as_string(path_value(object, valuePath));
            const label = text || optionValue;
            if (!label) return null;
            return { text: label, value: optionValue || label };
          })
          .filter((entry): entry is ApiResult => entry !== null)
          .slice(0, 25);
        if (!cancelled) {
          setResults(mapped);
          setOpen(true);
        }
      } catch (lookupError) {
        if (!cancelled) {
          setError(
            lookupError instanceof Error
              ? lookupError.message
              : "The lookup failed."
          );
          setResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (trigger === "enter") return;
    const timer = window.setTimeout(run, Math.max(0, rate));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [disabled, query, rate, resultsPath, textPath, trigger, url, valuePath]);

  const run_now = async () => {
    if (!url) return;
    const search = query.trim();
    if (search === "") return;
    setLoading(true);
    setError("");
    try {
      const target = url.includes("{{search}}")
        ? url.replace(/\{\{\s*search\s*\}\}/g, encodeURIComponent(search))
        : `${url}${url.includes("?") ? "&" : "?"}search=${encodeURIComponent(
            search
          )}`;
      const response = await fetch(target, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`The lookup failed (HTTP ${response.status}).`);
      }
      const payload = (await response.json()) as unknown;
      const list = path_value(payload, resultsPath);
      const rows = Array.isArray(list) ? list : Array.isArray(payload) ? payload : [];
      setResults(
        rows
          .map((row): ApiResult | null => {
            if (typeof row === "string" || typeof row === "number") {
              return { text: String(row), value: String(row) };
            }
            if (!row || typeof row !== "object") return null;
            const object = row as Record<string, unknown>;
            const text = as_string(path_value(object, textPath));
            const optionValue = as_string(path_value(object, valuePath));
            const label = text || optionValue;
            return label ? { text: label, value: optionValue || label } : null;
          })
          .filter((entry): entry is ApiResult => entry !== null)
          .slice(0, 25)
      );
      setOpen(true);
    } catch (lookupError) {
      setError(
        lookupError instanceof Error ? lookupError.message : "The lookup failed."
      );
    } finally {
      setLoading(false);
    }
  };

  if (!url) {
    return (
      <div className="space-y-2">
        <TextInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          Add a lookup URL in Data Studio to enable autocomplete.
        </p>
      </div>
    );
  }

  return (
    <div className="relative space-y-2">
      <div className="relative">
        <Input
          id={`cms-field-${field.name}`}
          value={query}
          disabled={disabled}
          placeholder={option_string(field, "placeholder") || "Start typing..."}
          className={cn(
            "h-13 rounded-lg border-input bg-card pr-9",
            font_class(option_string(field, "font"))
          )}
          onChange={(event) => {
            setSelection(null);
            onChange(event.target.value);
            if (trigger !== "enter") setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && trigger === "enter") {
              event.preventDefault();
              void run_now();
            }
          }}
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {open && visible_results.length > 0 ? (
        <div className="app-scrollbar absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-[0_16px_40px_-20px_rgb(0_0_0/0.35)]">
          {visible_results.map((result) => (
            <button
              key={`${result.value}-${result.text}`}
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(result.value);
                setSelection({ value: result.value, text: result.text });
                setOpen(false);
              }}
            >
              <span className="truncate">{result.text}</span>
              {result.value !== result.text ? (
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {result.value}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextareaInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const current = as_string(value);
  const softLength = option_number(field, 0, "softLength", "soft_limit");
  const font = option_string(field, "font");
  const trim = option_bool(field, false, "trim");

  return (
    <div className="space-y-1.5">
      <Textarea
        id={`cms-field-${field.name}`}
        value={current}
        disabled={disabled}
        rows={5}
        placeholder={option_string(field, "placeholder")}
        className={cn("rounded-lg border-input bg-card", font_class(font))}
        onChange={(event) => onChange(event.target.value)}
        onBlur={
          trim ? (event) => onChange(event.target.value.trim()) : undefined
        }
      />
      {softLength > 0 ? (
        <p
          className={cn(
            "text-right text-xs tabular-nums text-muted-foreground",
            current.length > softLength && "text-destructive"
          )}
        >
          {current.length} / {softLength}
        </p>
      ) : null}
    </div>
  );
}

const CODE_LANGUAGE_LABELS: Record<string, string> = {
  plaintext: "Plain text",
  text: "Plain text",
  json: "JSON",
  javascript: "JavaScript",
  js: "JavaScript",
  jsx: "JSX",
  typescript: "TypeScript",
  ts: "TypeScript",
  tsx: "TSX",
  html: "HTML",
  htm: "HTML",
  css: "CSS",
  scss: "CSS",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
  sql: "SQL",
  markdown: "Markdown",
  md: "Markdown",
  php: "PHP",
  python: "Python",
  py: "Python",
};

function EditorToolButton({
  label,
  icon,
  onClick,
  disabled,
  active,
  text,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  text?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active ? true : undefined}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
        active && "bg-secondary text-foreground"
      )}
    >
      {icon}
      {text ? <span className="text-xs font-semibold">{text}</span> : null}
    </button>
  );
}

export function CodeInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const current = as_string(value);
  const language = option_string(field, "language") || "plaintext";
  const lineNumber = option_bool(field, true, "lineNumber", "line_number");
  const initialWrapping = option_bool(
    field,
    false,
    "lineWrapping",
    "line_wrapping"
  );
  const [lineWrapping, setLineWrapping] = useState(initialWrapping);
  const [fullscreen, setFullscreen] = useState(false);
  const [formatError, setFormatError] = useState("");
  const languageLabel =
    CODE_LANGUAGE_LABELS[language.toLowerCase()] || language || "Plain text";
  const lineCount = current === "" ? 1 : current.split("\n").length;
  const isJson = language.toLowerCase() === "json" || field.type === "json";

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  const format_json = () => {
    if (current.trim() === "") return;
    try {
      const parsed: unknown = JSON.parse(current);
      onChange(JSON.stringify(parsed, null, 2));
      setFormatError("");
    } catch {
      setFormatError("This value is not valid JSON yet.");
    }
  };

  const copy_value = () => {
    if (current === "") return;
    void navigator.clipboard
      .writeText(current)
      .then(() => toast.success("Copied to clipboard."))
      .catch(() => toast.error("Could not copy the value."));
  };

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-subtle px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <Badge variant="outline" className="rounded-md font-mono text-xs">
          {languageLabel}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {lineCount} line{lineCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-0.5">
        {isJson ? (
          <EditorToolButton
            label="Format JSON"
            icon={<Braces className="size-3.5" />}
            onClick={format_json}
            disabled={disabled}
          />
        ) : null}
        <EditorToolButton
          label={lineWrapping ? "Disable line wrapping" : "Wrap long lines"}
          icon={<WrapText className="size-3.5" />}
          onClick={() => setLineWrapping((next) => !next)}
          disabled={disabled}
          active={lineWrapping}
        />
        <EditorToolButton
          label="Copy code"
          icon={<Copy className="size-3.5" />}
          onClick={copy_value}
          disabled={disabled}
        />
        <EditorToolButton
          label={fullscreen ? "Exit fullscreen" : "Edit in fullscreen"}
          icon={
            fullscreen ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )
          }
          onClick={() => setFullscreen((next) => !next)}
          active={fullscreen}
        />
      </div>
    </div>
  );

  const editor = (
    <CodeEditor
      value={current}
      onChange={(next) => onChange(next)}
      language={language}
      lineNumbers={lineNumber}
      lineWrapping={lineWrapping}
      readOnly={disabled}
      placeholder={option_string(field, "placeholder") || "Write code..."}
      ariaLabel={field.label || field.name}
      fullscreen={fullscreen}
    />
  );

  const footer = (
    <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-subtle px-3 py-1.5 text-xs text-muted-foreground">
      <span>{current.length.toLocaleString()} characters</span>
      <span className="font-mono">{languageLabel}</span>
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col gap-3 bg-overlay p-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-subtle px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {field.label || field.name}
              </p>
              <p className="text-xs text-muted-foreground">
                Press Escape to return to the form.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-md"
              onClick={() => setFullscreen(false)}
            >
              <Minimize2 className="size-3.5" />
              Exit
            </Button>
          </div>
          {toolbar}
          <div className="min-h-0 flex-1">{editor}</div>
          {footer}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="overflow-hidden rounded-lg border border-input bg-card">
        {toolbar}
        {editor}
        {footer}
      </div>
      {formatError ? (
        <p role="alert" className="text-xs text-destructive">
          {formatError}
        </p>
      ) : null}
    </div>
  );
}


const WYSIWYG_TOOLS = [
  "undo",
  "redo",
  "h1",
  "h2",
  "h3",
  "h4",
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "bullist",
  "numlist",
  "blockquote",
  "codeblock",
  "horizontalrule",
  "customLink",
  "unlink",
  "image",
  "alignleft",
  "aligncenter",
  "alignright",
  "removeformat",
];

const BLOCK_CODE_LANGUAGES = [
  "plaintext",
  "javascript",
  "typescript",
  "json",
  "html",
  "css",
  "php",
  "python",
  "sql",
  "yaml",
  "markdown",
];

interface EditorTool {
  tool: string;
  label: string;
  icon: ReactNode;
  text?: string;
  active?: boolean;
  disabled?: boolean;
  run: () => void;
}

function ToolbarDivider() {
  return (
    <span
      aria-hidden="true"
      className="mx-1 h-5 w-px shrink-0 self-center bg-border"
    />
  );
}

function escape_html(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Accept only URLs that are safe inside href/src attributes. */
function safe_link_url(raw: string): string {
  const value = raw.trim();
  if (value === "") return "";
  if (/^(?:https?:\/\/|mailto:|tel:|\/|#|\.\.?\/)/i.test(value)) return value;
  if (/^www\./i.test(value)) return `https://${value}`;
  return "";
}

function safe_media_url(raw: string): string {
  const value = raw.trim();
  if (/^(?:https?:\/\/|\/|data:image\/)/i.test(value)) return value;
  return "";
}

function count_words(source: string): number {
  const text = source.trim();
  if (text === "") return 0;
  return text.split(/\s+/).length;
}

function count_html_words(source: string): number {
  const text = source
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z][a-z0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return count_words(text);
}

function exec_command(command: string, value?: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    return document.execCommand(command, false, value);
  } catch {
    return false;
  }
}

function query_command(command: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}

export function WysiwygInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const current = as_string(value);
  const editorRef = useRef<HTMLDivElement>(null);
  const insertRangeRef = useRef<Range | null>(null);
  const insertTextRef = useRef("");
  const [focused, setFocused] = useState(false);
  const [view, setView] = useState<"visual" | "html">("visual");
  const [fullscreen, setFullscreen] = useState(false);
  const [insertMode, setInsertMode] = useState<"link" | "image" | null>(null);
  const [insertUrl, setInsertUrl] = useState("");
  const [active, setActive] = useState<Set<string>>(new Set());
  const toolbar = option_array(field, "toolbar")
    .map(String)
    .filter((tool) => WYSIWYG_TOOLS.includes(tool));
  const tools = toolbar.length > 0 ? toolbar : WYSIWYG_TOOLS;
  const has = (tool: string) => tools.includes(tool);
  const placeholder =
    option_string(field, "placeholder") || "Write content...";
  const words = count_html_words(current);

  const refresh_active = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || typeof window === "undefined") return;
    const selection = window.getSelection();
    if (
      !selection ||
      selection.rangeCount === 0 ||
      !selection.anchorNode ||
      !editor.contains(selection.anchorNode)
    ) {
      return;
    }
    const next = new Set<string>();
    for (const command of [
      "bold",
      "italic",
      "underline",
      "strikeThrough",
      "insertUnorderedList",
      "insertOrderedList",
    ]) {
      if (query_command(command)) next.add(command);
    }
    const anchor = selection.anchorNode;
    const element =
      anchor instanceof Element ? anchor : (anchor?.parentElement ?? null);
    const block = element?.closest("h1, h2, h3, h4, blockquote, pre");
    if (block) next.add(`format:${block.tagName.toLowerCase()}`);
    if (element?.closest("a")) next.add("link");
    if (element?.closest("img")) next.add("image");
    if (next.delete("strikeThrough")) next.add("strikethrough");
    setActive(next);
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || focused || view !== "visual") return;
    if (editor.innerHTML !== current) editor.innerHTML = current;
  }, [current, focused, view, fullscreen]);

  useEffect(() => {
    if (!focused) return;
    const handler = () => refresh_active();
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [focused, refresh_active]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  const sync = () => onChange(editorRef.current?.innerHTML ?? "");

  const apply = (command: string, commandValue?: string) => {
    if (disabled || view !== "visual") return;
    editorRef.current?.focus();
    exec_command(command, commandValue);
    sync();
    setFocused(true);
    refresh_active();
  };

  const format_block = (tag: string) => apply("formatBlock", `<${tag}>`);

  const open_insert = (mode: "link" | "image") => {
    const selection = window.getSelection();
    insertRangeRef.current =
      selection && selection.rangeCount > 0
        ? selection.getRangeAt(0).cloneRange()
        : null;
    insertTextRef.current = selection?.toString() ?? "";
    setInsertUrl("");
    setInsertMode(mode);
  };

  const restore_selection = () => {
    const editor = editorRef.current;
    editor?.focus();
    const selection = window.getSelection();
    if (selection && insertRangeRef.current) {
      selection.removeAllRanges();
      selection.addRange(insertRangeRef.current);
    }
  };

  const close_insert = () => {
    insertRangeRef.current = null;
    insertTextRef.current = "";
    setInsertMode(null);
    setInsertUrl("");
  };

  const insert_link = () => {
    const url = safe_link_url(insertUrl);
    if (!url) {
      toast.error("Enter a valid link URL.");
      return;
    }
    const label = insertTextRef.current.trim() || url;
    restore_selection();
    apply(
      "insertHTML",
      `<a href="${escape_html(url)}">${escape_html(label)}</a>`
    );
    close_insert();
  };

  const insert_image = () => {
    const url = safe_media_url(insertUrl);
    if (!url) {
      toast.error("Enter a valid image URL.");
      return;
    }
    restore_selection();
    apply(
      "insertHTML",
      `<img src="${escape_html(url)}" alt="${escape_html(
        insertTextRef.current.trim()
      )}" />`
    );
    close_insert();
  };

  const tool_groups: EditorTool[][] = [
    [
      {
        tool: "undo",
        label: "Undo",
        icon: <Undo2 className="size-3.5" />,
        run: () => apply("undo"),
        disabled,
      },
      {
        tool: "redo",
        label: "Redo",
        icon: <Redo2 className="size-3.5" />,
        run: () => apply("redo"),
        disabled,
      },
    ],
    [
      {
        tool: "h1",
        label: "Heading 1",
        icon: <Heading1 className="size-3.5" />,
        active: active.has("format:h1"),
        run: () => format_block("h1"),
      },
      {
        tool: "h2",
        label: "Heading 2",
        icon: <Heading2 className="size-3.5" />,
        active: active.has("format:h2"),
        run: () => format_block("h2"),
      },
      {
        tool: "h3",
        label: "Heading 3",
        icon: <Heading3 className="size-3.5" />,
        active: active.has("format:h3"),
        run: () => format_block("h3"),
      },
      {
        tool: "h4",
        label: "Heading 4",
        icon: <span className="text-xs font-semibold">H4</span>,
        active: active.has("format:h4"),
        run: () => format_block("h4"),
      },
    ],
    [
      {
        tool: "bold",
        label: "Bold",
        icon: <Bold className="size-3.5" />,
        active: active.has("bold"),
        run: () => apply("bold"),
      },
      {
        tool: "italic",
        label: "Italic",
        icon: <Italic className="size-3.5" />,
        active: active.has("italic"),
        run: () => apply("italic"),
      },
      {
        tool: "underline",
        label: "Underline",
        icon: <Underline className="size-3.5" />,
        active: active.has("underline"),
        run: () => apply("underline"),
      },
      {
        tool: "strikethrough",
        label: "Strikethrough",
        icon: <Strikethrough className="size-3.5" />,
        active: active.has("strikethrough"),
        run: () => apply("strikeThrough"),
      },
    ],
    [
      {
        tool: "bullist",
        label: "Bullet list",
        icon: <List className="size-3.5" />,
        active: active.has("insertUnorderedList"),
        run: () => apply("insertUnorderedList"),
      },
      {
        tool: "numlist",
        label: "Numbered list",
        icon: <ListOrdered className="size-3.5" />,
        active: active.has("insertOrderedList"),
        run: () => apply("insertOrderedList"),
      },
      {
        tool: "blockquote",
        label: "Quote",
        icon: <Quote className="size-3.5" />,
        active: active.has("format:blockquote"),
        run: () => format_block("blockquote"),
      },
      {
        tool: "codeblock",
        label: "Code block",
        icon: <Code2 className="size-3.5" />,
        active: active.has("format:pre"),
        run: () => format_block("pre"),
      },
      {
        tool: "horizontalrule",
        label: "Divider",
        icon: <Minus className="size-3.5" />,
        run: () => apply("insertHorizontalRule"),
      },
    ],
    [
      {
        tool: "customLink",
        label: "Insert link",
        icon: <Link2 className="size-3.5" />,
        active: active.has("link") || insertMode === "link",
        run: () => open_insert("link"),
      },
      {
        tool: "unlink",
        label: "Remove link",
        icon: <Unlink className="size-3.5" />,
        run: () => apply("unlink"),
      },
      {
        tool: "image",
        label: "Insert image",
        icon: <ImageIcon className="size-3.5" />,
        active: active.has("image") || insertMode === "image",
        run: () => open_insert("image"),
      },
    ],
    [
      {
        tool: "alignleft",
        label: "Align left",
        icon: <AlignLeft className="size-3.5" />,
        run: () => apply("justifyLeft"),
      },
      {
        tool: "aligncenter",
        label: "Align center",
        icon: <AlignCenter className="size-3.5" />,
        run: () => apply("justifyCenter"),
      },
      {
        tool: "alignright",
        label: "Align right",
        icon: <AlignRight className="size-3.5" />,
        run: () => apply("justifyRight"),
      },
    ],
    [
      {
        tool: "removeformat",
        label: "Clear formatting",
        icon: <RemoveFormatting className="size-3.5" />,
        run: () => {
          apply("removeFormat");
          format_block("p");
        },
      },
    ],
  ];
  // Toolbar actions read the selection ref only after a click.
  // eslint-disable-next-line react-hooks/refs
  const visible_groups = tool_groups
    .map((group) => group.filter((item) => has(item.tool)))
    .filter((group) => group.length > 0);

  const mode_toggle = (
    <div className="inline-flex items-center gap-0.5">
      <Button
        type="button"
        variant={view === "visual" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 rounded-md px-2 text-xs"
        aria-pressed={view === "visual"}
        onClick={() => setView("visual")}
      >
        <Pilcrow className="size-3.5" />
        Visual
      </Button>
      <Button
        type="button"
        variant={view === "html" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 rounded-md px-2 text-xs"
        aria-pressed={view === "html"}
        onClick={() => {
          sync();
          setView("html");
        }}
      >
        <Code2 className="size-3.5" />
        HTML
      </Button>
    </div>
  );

  const toolbar_bar =
    view === "visual" ? (
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface-subtle px-1.5 py-1">
        {visible_groups.map((group, group_index) => (
          <Fragment key={group[0]?.tool ?? group_index}>
            {group_index > 0 ? <ToolbarDivider /> : null}
            <div className="flex items-center gap-0.5">
              {group.map((item) => (
                <EditorToolButton
                  key={item.tool}
                  label={item.label}
                  icon={item.icon}
                  text={item.text}
                  active={item.active}
                  disabled={disabled || item.disabled}
                  onClick={item.run}
                />
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    ) : null;

  const insert_bar =
    view === "visual" && insertMode ? (
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-2 py-2">
        <span className="text-xs font-semibold text-muted-foreground">
          {insertMode === "link" ? "Link URL" : "Image URL"}
        </span>
        <Input
          autoFocus
          value={insertUrl}
          placeholder={
            insertMode === "link"
              ? "https://example.com"
              : "https://example.com/image.jpg"
          }
          className="h-8 min-w-48 flex-1 rounded-md border-input bg-card text-xs"
          onChange={(event) => setInsertUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (insertMode === "link") insert_link();
              else insert_image();
            }
            if (event.key === "Escape") close_insert();
          }}
        />
        <Button
          type="button"
          size="sm"
          className="h-8 rounded-md"
          disabled={!insertUrl.trim()}
          onClick={insertMode === "link" ? insert_link : insert_image}
        >
          Insert
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 rounded-md"
          onClick={close_insert}
        >
          Cancel
        </Button>
      </div>
    ) : null;

  const editor_body =
    view === "html" ? (
      <textarea
        id={`cms-field-${field.name}`}
        value={current}
        disabled={disabled}
        spellCheck={false}
        aria-label={`${field.label || field.name} HTML source`}
        placeholder={placeholder}
        className="app-scrollbar h-full min-h-60 w-full resize-none bg-card px-3 py-2.5 font-mono text-xs leading-5 text-foreground outline-none disabled:bg-muted disabled:text-muted-foreground"
        onChange={(event) => onChange(event.target.value)}
      />
    ) : (
      <div className="relative h-full">
        {!current ? (
          <span className="pointer-events-none absolute left-4 top-3 text-sm text-muted-foreground">
            {placeholder}
          </span>
        ) : null}
        <div
          ref={editorRef}
          id={`cms-field-${field.name}`}
          role="textbox"
          aria-multiline="true"
          aria-label={field.label || field.name}
          contentEditable={!disabled}
          suppressContentEditableWarning
          className={cn(
            "prose-editor app-scrollbar h-full min-h-60 w-full overflow-auto px-4 py-3 text-sm leading-6 text-foreground outline-none",
            disabled && "bg-muted text-muted-foreground",
            font_class(option_string(field, "font"))
          )}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            sync();
          }}
          onInput={sync}
          onKeyUp={refresh_active}
          onMouseUp={refresh_active}
        />
      </div>
    );

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-subtle px-3 py-1.5 text-xs text-muted-foreground">
      <span>
        {words.toLocaleString()} word{words === 1 ? "" : "s"} ·{" "}
        {current.length.toLocaleString()} characters
      </span>
      <span>{view === "html" ? "HTML source" : "Rich text"}</span>
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col gap-3 bg-overlay p-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">
                {field.label || field.name}
              </p>
              {mode_toggle}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Escape to close
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-md"
                onClick={() => {
                  sync();
                  setFullscreen(false);
                }}
              >
                <Minimize2 className="size-3.5" />
                Exit
              </Button>
            </div>
          </div>
          {toolbar_bar}
          {insert_bar}
          <div className="min-h-0 flex-1">{editor_body}</div>
          {footer}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-input bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-subtle px-1.5 py-1">
        {mode_toggle}
        <div className="flex items-center gap-0.5">
          <EditorToolButton
            label={fullscreen ? "Exit fullscreen" : "Edit in fullscreen"}
            icon={
              fullscreen ? (
                <Minimize2 className="size-3.5" />
              ) : (
                <Maximize2 className="size-3.5" />
              )
            }
            onClick={() => {
              sync();
              setFullscreen((next) => !next);
            }}
            active={fullscreen}
          />
        </div>
      </div>
      {toolbar_bar}
      {insert_bar}
      <div className={cn("relative", view === "visual" && !fullscreen && "max-h-96 overflow-auto")}>
        {editor_body}
      </div>
      {footer}
    </div>
  );
}

interface MarkdownRange {
  start: number;
  end: number;
}

function apply_line_marker(
  value: string,
  range: MarkdownRange,
  prefix: string,
  pattern: RegExp
): { value: string; selection: MarkdownRange } {
  const line_start = value.lastIndexOf("\n", Math.max(0, range.start - 1)) + 1;
  const next_break = value.indexOf("\n", range.end);
  const line_end = next_break === -1 ? value.length : next_break;
  const segment = value.slice(line_start, line_end);
  const lines = segment.split("\n");
  const filled = lines.filter((line) => line.trim() !== "");
  const all_marked =
    filled.length > 0 && filled.every((line) => pattern.test(line));
  const next_lines = lines.map((line) => {
    if (line.trim() === "") return line;
    if (all_marked) return line.replace(pattern, "$1");
    const match = /^(\s*)(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+)?(.*)$/.exec(
      line
    );
    return `${match?.[1] ?? ""}${prefix}${match?.[2] ?? line}`;
  });
  const next_segment = next_lines.join("\n");
  const next_value =
    value.slice(0, line_start) + next_segment + value.slice(line_end);
  const delta = next_segment.length - segment.length;
  return {
    value: next_value,
    selection: { start: line_start, end: range.end + delta },
  };
}

function wrap_markdown_range(
  value: string,
  range: MarkdownRange,
  before: string,
  after: string,
  placeholder: string
): { value: string; selection: MarkdownRange } {
  const selected = value.slice(range.start, range.end);
  const inner = selected || placeholder;
  const next_value =
    value.slice(0, range.start) +
    before +
    inner +
    after +
    value.slice(range.end);
  const inner_start = range.start + before.length;
  return {
    value: next_value,
    selection: { start: inner_start, end: inner_start + inner.length },
  };
}

function blank_lines_before(value: string, index: number): string {
  if (index === 0) return "";
  if (value.slice(0, index).endsWith("\n\n")) return "";
  if (value.slice(0, index).endsWith("\n")) return "\n";
  return "\n\n";
}

function blank_lines_after(value: string, index: number): string {
  if (index >= value.length) return "";
  if (value.slice(index).startsWith("\n\n")) return "";
  if (value.slice(index).startsWith("\n")) return "\n";
  return "\n\n";
}

export function MarkdownInput({
  field,
  value,
  onChange,
  disabled,
  media,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  media?: CmsMediaConfig;
}) {
  const current = as_string(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const linkRangeRef = useRef<MarkdownRange | null>(null);
  const imageRangeRef = useRef<MarkdownRange | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const defaultView =
    option_string(field, "defaultView", "default_view") || "editor";
  const [view, setView] = useState<"editor" | "split" | "preview">(
    defaultView === "preview" || defaultView === "split"
      ? defaultView
      : "editor"
  );
  const [fullscreen, setFullscreen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const preview = useMemo(() => markdown_to_html(current), [current]);
  const words = count_words(current);
  const lines = current === "" ? 1 : current.split("\n").length;
  const placeholder =
    option_string(field, "placeholder") ||
    "Write Markdown here. Use # for headings, ** for bold, and - for lists.";

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  const selected_range = (): MarkdownRange => {
    const textarea = textareaRef.current;
    return {
      start: textarea?.selectionStart ?? current.length,
      end: textarea?.selectionEnd ?? current.length,
    };
  };

  const focus_range = (next: string, selection: MarkdownRange) => {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const start = Math.max(0, Math.min(selection.start, next.length));
      const end = Math.max(0, Math.min(selection.end, next.length));
      textarea.setSelectionRange(start, end);
    });
  };

  const commit = (next: string, selection: MarkdownRange) => {
    onChange(next);
    if (view === "preview") setView("editor");
    focus_range(next, selection);
  };

  const wrap_selection = (
    before: string,
    after: string,
    placeholderText: string
  ) => {
    const result = wrap_markdown_range(
      current,
      selected_range(),
      before,
      after,
      placeholderText
    );
    commit(result.value, result.selection);
  };

  const mark_lines = (prefix: string, pattern: RegExp) => {
    const result = apply_line_marker(current, selected_range(), prefix, pattern);
    commit(result.value, result.selection);
  };

  const insert_block_text = (text: string) => {
    const range = selected_range();
    const before = blank_lines_before(current, range.start);
    const after = blank_lines_after(current, range.end);
    const next =
      current.slice(0, range.start) +
      before +
      text +
      after +
      current.slice(range.end);
    const caret = range.start + before.length + text.length;
    commit(next, { start: caret, end: caret });
  };

  const open_link = () => {
    linkRangeRef.current = selected_range();
    setLinkUrl("");
    setLinkOpen(true);
  };

  const apply_link = () => {
    const url = safe_link_url(linkUrl);
    if (!url) {
      toast.error("Enter a valid link URL.");
      return;
    }
    const range = linkRangeRef.current ?? selected_range();
    const selected = current.slice(range.start, range.end);
    const label = selected || url;
    const next =
      current.slice(0, range.start) +
      `[${label}](${url})` +
      current.slice(range.end);
    const caret = range.start + label.length + url.length + 4;
    commit(next, { start: caret, end: caret });
    linkRangeRef.current = null;
    setLinkOpen(false);
    setLinkUrl("");
  };

  const upload_markdown_image = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!is_image_file(file)) {
      toast.error("Choose a JPG, PNG, GIF, or WEBP image.");
      return;
    }
    if (!media) {
      toast.error("Image uploads are not configured on this page.");
      return;
    }

    const range = imageRangeRef.current ?? selected_range();
    const selected = current.slice(range.start, range.end).trim();
    const alt = (selected || file.name.replace(/\.[^.]+$/, ""))
      .replace(/[\[\]\\]/g, "")
      .trim();
    setLinkOpen(false);
    setUploadingImage(true);
    setUploadProgress(0);
    void upload_image(
      file,
      media,
      option_string(field, "folder"),
      setUploadProgress
    )
      .then((image) => {
        const markdown = `![${alt}](${image.url})`;
        const next =
          current.slice(0, range.start) + markdown + current.slice(range.end);
        const caret = range.start + markdown.length;
        commit(next, { start: caret, end: caret });
      })
      .catch((error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : "The image could not be uploaded."
        );
      })
      .finally(() => {
        setUploadingImage(false);
        setUploadProgress(0);
        imageRangeRef.current = null;
      });
  };

  const apply_wrap = (before: string, after: string, sample: string) =>
    wrap_selection(before, after, sample);

  const tool_groups: EditorTool[][] = [
    [
      {
        tool: "bold",
        label: "Bold",
        icon: <Bold className="size-3.5" />,
        run: () => apply_wrap("**", "**", "bold text"),
      },
      {
        tool: "italic",
        label: "Italic",
        icon: <Italic className="size-3.5" />,
        run: () => apply_wrap("*", "*", "italic text"),
      },
      {
        tool: "strikethrough",
        label: "Strikethrough",
        icon: <Strikethrough className="size-3.5" />,
        run: () => apply_wrap("~~", "~~", "struck text"),
      },
      {
        tool: "code",
        label: "Inline code",
        icon: <Code2 className="size-3.5" />,
        run: () => apply_wrap("`", "`", "code"),
      },
    ],
    [
      {
        tool: "h1",
        label: "Heading 1",
        icon: <Heading1 className="size-3.5" />,
        run: () => mark_lines("# ", /^(\s*)#\s+/),
      },
      {
        tool: "h2",
        label: "Heading 2",
        icon: <Heading2 className="size-3.5" />,
        run: () => mark_lines("## ", /^(\s*)##\s+/),
      },
      {
        tool: "h3",
        label: "Heading 3",
        icon: <Heading3 className="size-3.5" />,
        run: () => mark_lines("### ", /^(\s*)###\s+/),
      },
    ],
    [
      {
        tool: "bullist",
        label: "Bullet list",
        icon: <List className="size-3.5" />,
        run: () => mark_lines("- ", /^(\s*)[-*+]\s+/),
      },
      {
        tool: "numlist",
        label: "Numbered list",
        icon: <ListOrdered className="size-3.5" />,
        run: () => mark_lines("1. ", /^(\s*)\d+\.\s+/),
      },
      {
        tool: "quote",
        label: "Quote",
        icon: <Quote className="size-3.5" />,
        run: () => mark_lines("> ", /^(\s*)>\s+/),
      },
      {
        tool: "codeblock",
        label: "Code block",
        icon: <Code2 className="size-3.5" />,
        run: () => {
          const range = selected_range();
          const selected = current.slice(range.start, range.end);
          const text = `\`\`\`\n${selected || "code"}\n\`\`\``;
          const before = blank_lines_before(current, range.start);
          const after = blank_lines_after(current, range.end);
          const next =
            current.slice(0, range.start) +
            before +
            text +
            after +
            current.slice(range.end);
          const caret = range.start + before.length + text.length;
          commit(next, { start: caret, end: caret });
        },
      },
    ],
    [
      {
        tool: "link",
        label: "Insert link",
        icon: <Link2 className="size-3.5" />,
        active: linkOpen,
        run: open_link,
      },
      {
        tool: "image",
        label: uploadingImage
          ? `Uploading image (${uploadProgress}%)`
          : "Upload image",
        icon: uploadingImage ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <ImageIcon className="size-3.5" />
        ),
        disabled: !media || uploadingImage,
        run: () => {
          if (!media || uploadingImage) return;
          imageRangeRef.current = selected_range();
          imageInputRef.current?.click();
        },
      },
      {
        tool: "table",
        label: "Insert table",
        icon: <Table2 className="size-3.5" />,
        run: () =>
          insert_block_text(
            "| Column | Column |\n| --- | --- |\n| Cell | Cell |"
          ),
      },
      {
        tool: "divider",
        label: "Insert divider",
        icon: <Minus className="size-3.5" />,
        run: () => insert_block_text("---"),
      },
    ],
  ];

  const mode_toggle = (
    <div className="inline-flex items-center gap-0.5">
      {(
        [
          { value: "editor", label: "Write", icon: <Pencil className="size-3.5" /> },
          { value: "split", label: "Split", icon: <Columns2 className="size-3.5" /> },
          { value: "preview", label: "Preview", icon: <Eye className="size-3.5" /> },
        ] as const
      ).map((mode) => (
        <Button
          key={mode.value}
          type="button"
          variant={view === mode.value ? "secondary" : "ghost"}
          size="sm"
          className="h-7 rounded-md px-2 text-xs"
          aria-pressed={view === mode.value}
          onClick={() => {
            setView(mode.value);
            if (mode.value !== "preview") {
              focus_range(current, selected_range());
            }
          }}
        >
          {mode.icon}
          {mode.label}
        </Button>
      ))}
    </div>
  );

  const link_bar = linkOpen ? (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-2 py-2">
      <span className="text-xs font-semibold text-muted-foreground">
        Link URL
      </span>
      <Input
        autoFocus
        value={linkUrl}
        placeholder="https://example.com"
        className="h-8 min-w-48 flex-1 rounded-md border-input bg-card text-xs"
        onChange={(event) => setLinkUrl(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            apply_link();
          }
          if (event.key === "Escape") {
            setLinkOpen(false);
            setLinkUrl("");
          }
        }}
      />
      <Button
        type="button"
        size="sm"
        className="h-8 rounded-md"
        disabled={!linkUrl.trim()}
        onClick={apply_link}
      >
        Insert
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 rounded-md"
        onClick={() => {
          setLinkOpen(false);
          setLinkUrl("");
        }}
      >
        Cancel
      </Button>
    </div>
  ) : null;

  /* eslint-disable react-hooks/refs -- Toolbar callbacks only read refs on click. */
  const toolbar_bar = (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface-subtle px-1.5 py-1">
      {tool_groups.map((group, group_index) => (
        <Fragment key={group[0]?.tool ?? group_index}>
          {group_index > 0 ? <ToolbarDivider /> : null}
          <div className="flex items-center gap-0.5">
            {group.map((item) => (
              <EditorToolButton
                key={item.tool}
                label={item.label}
                icon={item.icon}
                active={item.active}
                disabled={disabled || uploadingImage || item.disabled}
                onClick={item.run}
              />
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  );
  /* eslint-enable react-hooks/refs */

  const textarea = (
    <textarea
      ref={textareaRef}
      id={`cms-field-${field.name}`}
      value={current}
      disabled={disabled || uploadingImage}
      spellCheck
      placeholder={placeholder}
      className={cn(
        "app-scrollbar h-full min-h-60 w-full resize-none bg-card px-3 py-2.5 text-sm leading-6 text-foreground outline-none disabled:bg-muted disabled:text-muted-foreground",
        font_class(option_string(field, "editorFont", "editor_font"))
      )}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        const modifier = event.metaKey || event.ctrlKey;
        if (!modifier) return;
        const key = event.key.toLowerCase();
        if (key === "b") {
          event.preventDefault();
          apply_wrap("**", "**", "bold text");
        } else if (key === "i") {
          event.preventDefault();
          apply_wrap("*", "*", "italic text");
        } else if (key === "k") {
          event.preventDefault();
          open_link();
        }
      }}
    />
  );

  const preview_pane = (
    <div
      className={cn(
        "markdown-preview app-scrollbar overflow-auto px-4 py-3 text-sm leading-6 text-foreground",
        fullscreen ? "h-full min-h-0" : view === "preview" ? "min-h-60" : "min-h-0",
        view === "split" && "border-t border-border md:border-l md:border-t-0",
        font_class(option_string(field, "previewFont", "preview_font"))
      )}
      dangerouslySetInnerHTML={{
        __html:
          preview ||
          '<p class="text-muted-foreground">Nothing to preview yet.</p>',
      }}
    />
  );

  const editor_body =
    view === "editor" ? (
      <div className="min-h-60">{textarea}</div>
    ) : view === "preview" ? (
      preview_pane
    ) : (
      <div
        className={cn(
          "grid grid-cols-1 md:grid-cols-2",
          fullscreen ? "h-full min-h-0 flex-1" : "h-96"
        )}
      >
        <div className="relative min-h-0 overflow-hidden">{textarea}</div>
        {preview_pane}
      </div>
    );

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-subtle px-3 py-1.5 text-xs text-muted-foreground">
      <span>
        {words.toLocaleString()} word{words === 1 ? "" : "s"} ·{" "}
        {current.length.toLocaleString()} characters · {lines} line
        {lines === 1 ? "" : "s"}
      </span>
      <span>Markdown · GFM</span>
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col gap-3 bg-overlay p-4">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={upload_markdown_image}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">
                {field.label || field.name}
              </p>
              {mode_toggle}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Escape to close
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-md"
                onClick={() => setFullscreen(false)}
              >
                <Minimize2 className="size-3.5" />
                Exit
              </Button>
            </div>
          </div>
          {toolbar_bar}
          {link_bar}
          <div className="flex min-h-0 flex-1 flex-col">{editor_body}</div>
          {footer}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-input bg-card">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={upload_markdown_image}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-subtle px-1.5 py-1">
        {mode_toggle}
        <div className="flex items-center gap-0.5">
          <EditorToolButton
            label={fullscreen ? "Exit fullscreen" : "Edit in fullscreen"}
            icon={
              fullscreen ? (
                <Minimize2 className="size-3.5" />
              ) : (
                <Maximize2 className="size-3.5" />
              )
            }
            onClick={() => setFullscreen((next) => !next)}
            active={fullscreen}
          />
        </div>
      </div>
      {toolbar_bar}
      {link_bar}
      {editor_body}
      {footer}
    </div>
  );
}

type Block = Record<string, unknown> & { type: string; value: string };

const BLOCK_TYPES = [
  {
    value: "paragraph",
    label: "Paragraph",
    icon: <Pilcrow className="size-3.5" />,
  },
  {
    value: "heading",
    label: "Heading",
    icon: <Heading2 className="size-3.5" />,
  },
  {
    value: "quote",
    label: "Quote",
    icon: <Quote className="size-3.5" />,
  },
  {
    value: "code",
    label: "Code",
    icon: <Code2 className="size-3.5" />,
  },
  {
    value: "image",
    label: "Image",
    icon: <ImageIcon className="size-3.5" />,
  },
  {
    value: "divider",
    label: "Divider",
    icon: <Minus className="size-3.5" />,
  },
];

function read_blocks(value: unknown): Block[] {
  const list = as_array(value);
  return list.map((entry) => {
    const object = as_object(entry);
    return {
      ...object,
      type: as_string(object.type) || "paragraph",
      value: as_string(object.value ?? object.text ?? object.content),
    };
  });
}

function block_number(block: Block, key: string, fallback: number): number {
  const raw = block[key];
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function block_text(block: Block, key: string, fallback: string): string {
  const value = block[key];
  return typeof value === "string" && value !== "" ? value : fallback;
}

function block_label(type: string): string {
  return BLOCK_TYPES.find((entry) => entry.value === type)?.label ?? "Block";
}

export function BlockEditorInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const blocks = read_blocks(value);
  const bordered = option_bool(field, true, "bordered");
  const paragraphPlaceholder =
    option_string(field, "placeholder") || "Write a paragraph...";
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const update = (next: Block[]) => onChange(next);

  const patch = (index: number, change: Record<string, unknown>) => {
    update(
      blocks.map((block, blockIndex) =>
        blockIndex === index ? { ...block, ...change } : block
      )
    );
  };

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= blocks.length) return;
    const next = [...blocks];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    update(next);
  };

  const add_block = (type: string) => {
    const block: Block = { type, value: "" };
    if (type === "heading") block.level = 2;
    if (type === "code") block.language = "plaintext";
    update([...blocks, block]);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">
          {blocks.length} block{blocks.length === 1 ? "" : "s"}
        </p>
        <p className="text-xs text-muted-foreground">
          Drag the handle to reorder
        </p>
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface-subtle px-4 py-6 text-center">
          <p className="text-sm font-semibold text-foreground">No blocks yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose a block type below to start building the content.
          </p>
        </div>
      ) : (
        blocks.map((block, index) => {
          const type = block.type || "paragraph";
          const level = [2, 3, 4].includes(block_number(block, "level", 2))
            ? block_number(block, "level", 2)
            : 2;
          const language = block_text(block, "language", "plaintext");
          const headingClass =
            level === 2
              ? "text-xl font-semibold"
              : level === 3
                ? "text-lg font-semibold"
                : "text-base font-semibold";

          return (
            <div
              key={index}
              onDragOver={(event) => {
                if (dragIndex === null) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setOverIndex(index);
              }}
              onDragLeave={() =>
                setOverIndex((current) =>
                  current === index ? null : current
                )
              }
              onDrop={(event) => {
                event.preventDefault();
                const raw = event.dataTransfer.getData("text/plain");
                const from =
                  dragIndex ?? (raw === "" ? null : Number(raw));
                if (from !== null && Number.isInteger(from)) move(from, index);
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={cn(
                "rounded-lg border bg-card p-2.5 transition-colors",
                bordered ? "border-border" : "border-transparent bg-surface-subtle",
                overIndex === index && dragIndex !== index && "border-brand bg-brand/5",
                dragIndex === index && "opacity-60"
              )}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  draggable={!disabled}
                  aria-label="Drag to reorder block"
                  title="Drag to reorder block"
                  disabled={disabled}
                  onDragStart={(event) => {
                    setDragIndex(index);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", String(index));
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  className="cursor-grab touch-none rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <GripVertical className="size-4" />
                </button>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  {block_type_icon(type)}
                  {block_label(type)}
                </span>
                <Badge
                  variant="outline"
                  className="rounded-md px-1.5 py-0 text-xs text-muted-foreground"
                >
                  {index + 1}
                </Badge>
                <select
                  value={type}
                  disabled={disabled}
                  aria-label="Block type"
                  onChange={(event) =>
                    patch(index, { type: event.target.value })
                  }
                  className="h-7 rounded-md border border-input bg-card px-1.5 text-xs text-foreground outline-none"
                >
                  {BLOCK_TYPES.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
                <div className="ml-auto flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Duplicate block"
                    title="Duplicate block"
                    disabled={disabled}
                    onClick={() => {
                      const next = [...blocks];
                      next.splice(index + 1, 0, { ...block });
                      update(next);
                    }}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Move block up"
                    title="Move block up"
                    disabled={disabled || index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Move block down"
                    title="Move block down"
                    disabled={disabled || index === blocks.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Remove block"
                    title="Remove block"
                    disabled={disabled}
                    onClick={() =>
                      update(
                        blocks.filter(
                          (_, blockIndex) => blockIndex !== index
                        )
                      )
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>

              {type === "divider" ? (
                <div className="flex items-center gap-2 py-1">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">Divider</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              ) : type === "heading" ? (
                <div className="flex flex-wrap items-start gap-2">
                  <select
                    value={level}
                    disabled={disabled}
                    aria-label="Heading level"
                    onChange={(event) =>
                      patch(index, { level: Number(event.target.value) })
                    }
                    className="h-13 rounded-lg border border-input bg-card px-2 text-sm text-foreground outline-none"
                  >
                    <option value={2}>H2</option>
                    <option value={3}>H3</option>
                    <option value={4}>H4</option>
                  </select>
                  <Input
                    value={block.value}
                    disabled={disabled}
                    placeholder="Heading"
                    className={cn(
                      "h-13 min-w-48 flex-1 rounded-lg border-input bg-card",
                      headingClass
                    )}
                    onChange={(event) =>
                      patch(index, { value: event.target.value })
                    }
                  />
                </div>
              ) : type === "code" ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <select
                      value={language}
                      disabled={disabled}
                      aria-label="Code language"
                      onChange={(event) =>
                        patch(index, { language: event.target.value })
                      }
                      className="h-7 rounded-md border border-input bg-card px-1.5 text-xs text-foreground outline-none"
                    >
                      {BLOCK_CODE_LANGUAGES.map((entry) => (
                        <option key={entry} value={entry}>
                          {CODE_LANGUAGE_LABELS[entry] || entry}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-muted-foreground">
                      CodeMirror editor
                    </span>
                  </div>
                  <CodeEditor
                    value={block.value}
                    onChange={(next) => patch(index, { value: next })}
                    language={language}
                    lineNumbers={false}
                    lineWrapping
                    readOnly={disabled}
                    placeholder="Code"
                    ariaLabel={`${field.label || field.name} code block ${index + 1}`}
                  />
                </div>
              ) : type === "image" ? (
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={block.value}
                      disabled={disabled}
                      placeholder="Image URL"
                      className="h-10 rounded-md border-input bg-card font-mono text-xs"
                      onChange={(event) =>
                        patch(index, { value: event.target.value })
                      }
                    />
                    <Input
                      value={block_text(block, "alt", "")}
                      disabled={disabled}
                      placeholder="Alternative text"
                      className="h-10 rounded-md border-input bg-card text-xs"
                      onChange={(event) =>
                        patch(index, { alt: event.target.value })
                      }
                    />
                  </div>
                  {safe_media_url(block.value) ? (
                    <div className="overflow-hidden rounded-md border border-border bg-surface-subtle p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={safe_media_url(block.value)}
                        alt={block_text(block, "alt", "")}
                        className="max-h-40 w-auto max-w-full rounded object-contain"
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Enter an absolute URL or a path under /uploads to preview
                      the image.
                    </p>
                  )}
                </div>
              ) : type === "quote" ? (
                <Textarea
                  value={block.value}
                  disabled={disabled}
                  rows={3}
                  placeholder="Quote"
                  className="rounded-md border-input bg-card italic"
                  onChange={(event) =>
                    patch(index, { value: event.target.value })
                  }
                />
              ) : (
                <Textarea
                  value={block.value}
                  disabled={disabled}
                  rows={3}
                  placeholder={paragraphPlaceholder}
                  className="rounded-md border-input bg-card"
                  onChange={(event) =>
                    patch(index, { value: event.target.value })
                  }
                />
              )}
            </div>
          );
        })
      )}

      <div className="rounded-lg border border-dashed border-border bg-surface-subtle p-2.5">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Plus className="size-3.5" />
          Add block
        </div>
        <div className="flex flex-wrap gap-1.5">
          {BLOCK_TYPES.map((entry) => (
            <button
              key={entry.value}
              type="button"
              disabled={disabled}
              onClick={() => add_block(entry.value)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
            >
              {entry.icon}
              {entry.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function code_summary(value: unknown): string {
  return as_string(value).split("\n")[0] ?? "";
}

export function TextareaCounter({
  value,
  limit,
}: {
  value: string;
  limit: number;
}) {
  if (limit <= 0) return null;
  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        value.length > limit ? "text-destructive" : "text-muted-foreground"
      )}
    >
      {value.length} / {limit}
    </span>
  );
}

export function block_type_icon(type: string) {
  if (type === "code") return <Code2 className="size-3.5" />;
  if (type === "heading") return <Heading2 className="size-3.5" />;
  if (type === "quote") return <Quote className="size-3.5" />;
  if (type === "image") return <ImageIcon className="size-3.5" />;
  if (type === "divider") return <Minus className="size-3.5" />;
  return <Pilcrow className="size-3.5" />;
}
