"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Bold,
  Code2,
  Eye,
  GripVertical,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Pencil,
  Plus,
  Quote,
  RemoveFormatting,
  Strikethrough,
  Trash2,
  Underline,
  Unlink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CmsField } from "@/modules/cms/cms-types";
import {
  as_array,
  as_object,
  as_string,
  option_array,
  option_bool,
  option_number,
  option_string,
} from "./types";

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
  const lineWrapping = option_bool(field, false, "lineWrapping", "line_wrapping");
  const numbersRef = useRef<HTMLPreElement>(null);
  const lines = current.split("\n");

  return (
    <div className="overflow-hidden rounded-lg border border-input bg-card">
      <div className="flex items-center justify-between border-b border-border bg-surface-subtle px-3 py-1.5">
        <span className="font-mono text-xs text-muted-foreground">{language}</span>
        {lineWrapping ? (
          <Badge variant="outline" className="text-xs">
            Wrapped
          </Badge>
        ) : null}
      </div>
      <div className="flex max-h-80">
        {lineNumber ? (
          <pre
            ref={numbersRef}
            aria-hidden="true"
            className="app-scrollbar shrink-0 overflow-hidden border-r border-border bg-surface-subtle px-2 py-2 text-right font-mono text-xs leading-5 text-muted-foreground"
          >
            {lines.map((_, index) => (
              <div key={index}>{index + 1}</div>
            ))}
          </pre>
        ) : null}
        <textarea
          id={`cms-field-${field.name}`}
          value={current}
          disabled={disabled}
          spellCheck={false}
          wrap={lineWrapping ? "soft" : "off"}
          className="app-scrollbar min-h-40 w-full resize-y bg-card px-3 py-2 font-mono text-xs leading-5 text-foreground outline-none disabled:bg-muted disabled:text-muted-foreground"
          onChange={(event) => onChange(event.target.value)}
          onScroll={(event) => {
            if (numbersRef.current) {
              numbersRef.current.scrollTop = event.currentTarget.scrollTop;
            }
          }}
        />
      </div>
    </div>
  );
}

const WYSIWYG_TOOLS = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "h2",
  "h3",
  "bullist",
  "numlist",
  "blockquote",
  "customLink",
  "unlink",
  "removeformat",
];

function exec_command(command: string, value?: string) {
  if (typeof document === "undefined") return;
  document.execCommand(command, false, value);
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
  const [focused, setFocused] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const toolbar = option_array(field, "toolbar")
    .map(String)
    .filter((tool) => WYSIWYG_TOOLS.includes(tool));
  const tools = toolbar.length > 0 ? toolbar : WYSIWYG_TOOLS;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || focused) return;
    if (editor.innerHTML !== current) editor.innerHTML = current;
  }, [current, focused]);

  const tool_button = (
    tool: string,
    label: string,
    icon: ReactNode,
    action: () => void
  ) => {
    if (!tools.includes(tool)) return null;
    return (
      <button
        key={tool}
        type="button"
        title={label}
        aria-label={label}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={action}
        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        {icon}
      </button>
    );
  };

  return (
    <div className="overflow-hidden rounded-lg border border-input bg-card">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface-subtle px-1.5 py-1">
        {tool_button("bold", "Bold", <Bold className="size-3.5" />, () =>
          exec_command("bold")
        )}
        {tool_button("italic", "Italic", <Italic className="size-3.5" />, () =>
          exec_command("italic")
        )}
        {tool_button(
          "underline",
          "Underline",
          <Underline className="size-3.5" />,
          () => exec_command("underline")
        )}
        {tool_button(
          "strikethrough",
          "Strikethrough",
          <Strikethrough className="size-3.5" />,
          () => exec_command("strikeThrough")
        )}
        {tool_button("h2", "Heading 2", <Heading2 className="size-3.5" />, () =>
          exec_command("formatBlock", "h2")
        )}
        {tool_button("h3", "Heading 3", <Heading3 className="size-3.5" />, () =>
          exec_command("formatBlock", "h3")
        )}
        {tool_button("bullist", "Bullet list", <List className="size-3.5" />, () =>
          exec_command("insertUnorderedList")
        )}
        {tool_button(
          "numlist",
          "Numbered list",
          <ListOrdered className="size-3.5" />,
          () => exec_command("insertOrderedList")
        )}
        {tool_button("blockquote", "Quote", <Quote className="size-3.5" />, () =>
          exec_command("formatBlock", "blockquote")
        )}
        {tool_button("customLink", "Link", <Link2 className="size-3.5" />, () =>
          setLinkOpen((current) => !current)
        )}
        {tool_button("unlink", "Remove link", <Unlink className="size-3.5" />, () =>
          exec_command("unlink")
        )}
        {tool_button(
          "removeformat",
          "Clear formatting",
          <RemoveFormatting className="size-3.5" />,
          () => exec_command("removeFormat")
        )}
      </div>

      {linkOpen ? (
        <div className="flex items-center gap-2 border-b border-border bg-card p-2">
          <Input
            value={linkUrl}
            placeholder="https://example.com"
            className="h-8 rounded-md border-input bg-card text-xs"
            onChange={(event) => setLinkUrl(event.target.value)}
          />
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-md"
            disabled={!linkUrl.trim()}
            onClick={() => {
              editorRef.current?.focus();
              exec_command("createLink", linkUrl.trim());
              setLinkOpen(false);
              setLinkUrl("");
            }}
          >
            Apply
          </Button>
        </div>
      ) : null}

      <div className="relative">
        {!current ? (
          <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground">
            {option_string(field, "placeholder") || "Write content..."}
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
            "prose-editor min-h-40 w-full px-3 py-2.5 text-sm leading-6 text-foreground outline-none",
            disabled && "bg-muted text-muted-foreground",
            font_class(option_string(field, "font"))
          )}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onChange(editorRef.current?.innerHTML ?? "");
          }}
          onInput={() => onChange(editorRef.current?.innerHTML ?? "")}
        />
      </div>
    </div>
  );
}

function escape_html(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline_markdown(value: string): string {
  let text = escape_html(value);
  text = text.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">$1</code>'
  );
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  text = text.replace(/_([^_]+)_/g, "<em>$1</em>");
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer" class="underline underline-offset-2">$1</a>'
  );
  return text;
}

function markdown_to_html(source: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let list: "ul" | "ol" | null = null;
  let in_code = false;
  let code: string[] = [];
  let paragraph: string[] = [];

  const flush_paragraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${inline_markdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const close_list = () => {
    if (list) {
      html.push(`</${list}>`);
      list = null;
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      flush_paragraph();
      close_list();
      if (in_code) {
        html.push(
          `<pre class="app-scrollbar overflow-x-auto rounded-lg border border-border bg-surface-subtle p-3 font-mono text-xs"><code>${escape_html(
            code.join("\n")
          )}</code></pre>`
        );
        code = [];
        in_code = false;
      } else {
        in_code = true;
      }
      continue;
    }
    if (in_code) {
      code.push(line);
      continue;
    }
    if (line.trim() === "") {
      flush_paragraph();
      close_list();
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flush_paragraph();
      close_list();
      const level = Math.min(4, heading[1].length) + 1;
      html.push(`<h${level}>${inline_markdown(heading[2])}</h${level}>`);
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flush_paragraph();
      close_list();
      html.push('<hr class="border-border" />');
      continue;
    }
    if (/^>\s?/.test(line)) {
      flush_paragraph();
      close_list();
      html.push(
        `<blockquote class="border-l-2 border-border pl-3 text-muted-foreground">${inline_markdown(
          line.replace(/^>\s?/, "")
        )}</blockquote>`
      );
      continue;
    }
    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      flush_paragraph();
      if (list !== "ul") {
        close_list();
        html.push("<ul>");
        list = "ul";
      }
      html.push(`<li>${inline_markdown(bullet[1])}</li>`);
      continue;
    }
    const ordered = /^\d+\.\s+(.*)$/.exec(line);
    if (ordered) {
      flush_paragraph();
      if (list !== "ol") {
        close_list();
        html.push("<ol>");
        list = "ol";
      }
      html.push(`<li>${inline_markdown(ordered[1])}</li>`);
      continue;
    }
    paragraph.push(line.trim());
  }

  if (in_code) {
    html.push(
      `<pre class="app-scrollbar overflow-x-auto rounded-lg border border-border bg-surface-subtle p-3 font-mono text-xs"><code>${escape_html(
        code.join("\n")
      )}</code></pre>`
    );
  }
  flush_paragraph();
  close_list();
  return html.join("\n");
}

export function MarkdownInput({
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
  const defaultView = option_string(field, "defaultView", "default_view") || "editor";
  const [view, setView] = useState<"editor" | "preview">(
    defaultView === "preview" ? "preview" : "editor"
  );
  const preview = useMemo(() => markdown_to_html(current), [current]);

  return (
    <div className="overflow-hidden rounded-lg border border-input bg-card">
      <div className="flex items-center justify-between border-b border-border bg-surface-subtle px-1.5 py-1">
        <div className="inline-flex items-center gap-0.5">
          <Button
            type="button"
            variant={view === "editor" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 rounded-md px-2 text-xs"
            aria-pressed={view === "editor"}
            onClick={() => setView("editor")}
          >
            <Pencil className="size-3.5" />
            Write
          </Button>
          <Button
            type="button"
            variant={view === "preview" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 rounded-md px-2 text-xs"
            aria-pressed={view === "preview"}
            onClick={() => setView("preview")}
          >
            <Eye className="size-3.5" />
            Preview
          </Button>
        </div>
        <span className="pr-1 font-mono text-xs text-muted-foreground">
          Markdown
        </span>
      </div>
      {view === "editor" ? (
        <textarea
          id={`cms-field-${field.name}`}
          value={current}
          disabled={disabled}
          rows={8}
          placeholder={
            option_string(field, "placeholder") ||
            "Write Markdown here. Use # for headings, ** for bold, and - for lists."
          }
          className={cn(
            "app-scrollbar w-full resize-y bg-card px-3 py-2.5 text-sm leading-6 text-foreground outline-none disabled:bg-muted disabled:text-muted-foreground",
            font_class(option_string(field, "editorFont", "editor_font"))
          )}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <div
          className={cn(
            "markdown-preview min-h-40 px-4 py-3 text-sm leading-6 text-foreground",
            font_class(option_string(field, "previewFont", "preview_font"))
          )}
          dangerouslySetInnerHTML={{
            __html:
              preview ||
              '<p class="text-muted-foreground">Nothing to preview yet.</p>',
          }}
        />
      )}
    </div>
  );
}

interface Block {
  type: string;
  value: string;
}

const BLOCK_TYPES = [
  { value: "paragraph", label: "Paragraph" },
  { value: "heading", label: "Heading" },
  { value: "quote", label: "Quote" },
  { value: "code", label: "Code" },
  { value: "divider", label: "Divider" },
];

function read_blocks(value: unknown): Block[] {
  const list = as_array(value);
  return list.map((entry) => {
    const object = as_object(entry);
    return {
      type: as_string(object.type) || "paragraph",
      value: as_string(object.value ?? object.text ?? object.content),
    };
  });
}

export function BlockEditorInput({
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
  const [type, setType] = useState("paragraph");
  const available = BLOCK_TYPES;

  const update = (next: Block[]) => onChange(next);

  const patch = (index: number, change: Partial<Block>) => {
    update(
      blocks.map((block, blockIndex) =>
        blockIndex === index ? { ...block, ...change } : block
      )
    );
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    update(next);
  };

  return (
    <div className="space-y-2">
      {blocks.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-4 text-center text-xs text-muted-foreground">
          No blocks yet. Add the first block below.
        </div>
      ) : (
        blocks.map((block, index) => (
          <div
            key={index}
            className="rounded-lg border border-border bg-card p-2.5"
          >
            <div className="mb-2 flex items-center gap-2">
              <GripVertical className="size-4 shrink-0 text-muted-foreground" />
              <select
                value={block.type}
                disabled={disabled}
                onChange={(event) => patch(index, { type: event.target.value })}
                className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground outline-none"
              >
                {available.map((entry) => (
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
                  aria-label="Move block up"
                  disabled={disabled || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Move block down"
                  disabled={disabled || index === blocks.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Remove block"
                  disabled={disabled}
                  onClick={() =>
                    update(blocks.filter((_, blockIndex) => blockIndex !== index))
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
            {block.type === "divider" ? (
              <div className="flex items-center gap-2 py-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">Divider</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            ) : block.type === "heading" ? (
              <Input
                value={block.value}
                disabled={disabled}
                placeholder="Heading"
                className="h-13 rounded-lg border-input bg-card text-base font-semibold"
                onChange={(event) => patch(index, { value: event.target.value })}
              />
            ) : (
              <Textarea
                value={block.value}
                disabled={disabled}
                rows={block.type === "code" ? 4 : 3}
                placeholder={
                  block.type === "quote"
                    ? "Quote"
                    : block.type === "code"
                      ? "Code"
                      : "Write a paragraph..."
                }
                className={cn(
                  "rounded-md border-input bg-card",
                  block.type === "code" && "font-mono text-xs"
                )}
                onChange={(event) => patch(index, { value: event.target.value })}
              />
            )}
          </div>
        ))
      )}

      <div className="flex items-center gap-2">
        <select
          value={type}
          disabled={disabled}
          onChange={(event) => setType(event.target.value)}
          className="h-13 rounded-lg border border-input bg-card px-4 text-sm text-foreground outline-none"
        >
          {available.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          className="rounded-lg"
          disabled={disabled}
          onClick={() => update([...blocks, { type, value: "" }])}
        >
          <Plus className="size-4" />
          Add block
        </Button>
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
  return <GripVertical className="size-3.5" />;
}
