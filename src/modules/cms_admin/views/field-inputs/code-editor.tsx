"use client";

import { useEffect, useMemo, useRef } from "react";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import {
  HighlightStyle,
  StreamLanguage,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
  type StringStream,
} from "@codemirror/language";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers as lineNumbersExtension,
  placeholder as placeholderExtension,
  rectangularSelection,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";

const editorTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--card)",
    color: "var(--foreground)",
    fontSize: "12px",
    height: "100%",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.55",
    maxHeight: "20rem",
    overflow: "auto",
  },
  ".cm-content": {
    caretColor: "var(--foreground)",
    padding: "10px 0",
  },
  ".cm-line": {
    padding: "0 12px",
  },
  ".cm-gutters": {
    backgroundColor: "var(--surface-subtle)",
    borderRight: "1px solid var(--border)",
    color: "var(--muted-foreground)",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 8px 0 12px",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--foreground) 3%, transparent)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--foreground)",
  },
  ".cm-selectionBackground, .cm-content ::selection": {
    backgroundColor:
      "color-mix(in srgb, var(--foreground) 16%, transparent) !important",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--foreground)",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--surface-subtle)",
    border: "1px solid var(--border)",
    color: "var(--muted-foreground)",
  },
  "&.cms-code-editor-fullscreen .cm-scroller": {
    maxHeight: "calc(100vh - 14rem)",
  },
});

const editorHighlight = HighlightStyle.define([
  { tag: tags.comment, color: "var(--muted-foreground)", fontStyle: "italic" },
  {
    tag: [tags.keyword, tags.operatorKeyword, tags.modifier],
    color: "var(--chart-4)",
  },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--chart-2)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--chart-3)" },
  {
    tag: [tags.typeName, tags.className, tags.namespace],
    color: "var(--chart-1)",
  },
  {
    tag: [tags.function(tags.variableName), tags.definition(tags.variableName)],
    color: "var(--chart-5)",
  },
  { tag: tags.propertyName, color: "var(--chart-4)" },
  { tag: [tags.tagName, tags.attributeName], color: "var(--chart-1)" },
  { tag: tags.heading, fontWeight: "600" },
  { tag: tags.link, color: "var(--brand)", textDecoration: "underline" },
  { tag: tags.invalid, color: "var(--destructive)" },
]);

function stream_language(
  token: (stream: StringStream) => string | null
): StreamLanguage<null> {
  return StreamLanguage.define<null>({ token });
}

const SQL_KEYWORDS =
  /^(?:select|from|where|insert|into|values|update|set|delete|create|alter|drop|table|index|view|join|left|right|inner|outer|on|group|by|order|having|limit|offset|and|or|not|null|is|as|distinct|union|all|case|when|then|else|end|primary|key|foreign|references|if|exists|begin|commit|rollback)\b/i;

const sqlLanguage = stream_language((stream) => {
  if (stream.eatSpace()) return null;
  if (stream.match(/^--.*/)) return "comment";
  if (stream.match(/^\/\*/)) {
    while (!stream.match(/^\*\//) && !stream.eol()) stream.next();
    return "comment";
  }
  if (stream.match(/^'(?:[^'\\]|\\.)*'?/)) return "string";
  if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return "string";
  if (stream.match(/^\b\d+(?:\.\d+)?\b/)) return "number";
  if (stream.match(SQL_KEYWORDS)) return "keyword";
  stream.next();
  return null;
});

const PYTHON_KEYWORDS =
  /^(?:and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|True|False|None)\b/;

const pythonLanguage = stream_language((stream) => {
  if (stream.eatSpace()) return null;
  if (stream.match(/^#.*/)) return "comment";
  if (stream.match(/^"""|^'''/)) {
    const quote = stream.current().slice(-3);
    while (!stream.match(new RegExp(`${quote}$`)) && !stream.eol()) {
      stream.next();
    }
    return "string";
  }
  if (stream.match(/^'(?:[^'\\]|\\.)*'?/)) return "string";
  if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return "string";
  if (stream.match(/^\b\d+(?:\.\d+)?\b/)) return "number";
  if (stream.match(PYTHON_KEYWORDS)) return "keyword";
  stream.next();
  return null;
});

const PHP_KEYWORDS =
  /^(?:abstract|and|array|as|break|callable|case|catch|class|clone|const|continue|declare|default|do|echo|else|elseif|empty|enddeclare|endfor|endforeach|endif|endswitch|endwhile|eval|exit|extends|final|finally|fn|for|foreach|function|global|goto|if|implements|include|include_once|instanceof|insteadof|interface|isset|list|match|namespace|new|or|print|private|protected|public|readonly|require|require_once|return|static|switch|throw|trait|try|unset|use|var|while|xor|yield)\b/i;

const phpLanguage = stream_language((stream) => {
  if (stream.eatSpace()) return null;
  if (stream.match(/^<\?php|^\?>/)) return "keyword";
  if (stream.match(/^(?:\/\/|#).*/)) return "comment";
  if (stream.match(/^\/\*/)) {
    while (!stream.match(/^\*\//) && !stream.eol()) stream.next();
    return "comment";
  }
  if (stream.match(/^'(?:[^'\\]|\\.)*'?/)) return "string";
  if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return "string";
  if (stream.match(/^\$[A-Za-z_]\w*/)) return "variableName";
  if (stream.match(/^\b\d+(?:\.\d+)?\b/)) return "number";
  if (stream.match(PHP_KEYWORDS)) return "keyword";
  stream.next();
  return null;
});

const markdownLanguage = stream_language((stream) => {
  if (stream.sol() && stream.match(/^#{1,6}\s/)) return "heading";
  if (stream.sol() && stream.match(/^```/)) return "string";
  if (stream.match(/^`[^`]*`/)) return "string";
  if (stream.match(/^\*\*[^*]+\*\*/)) return "strong";
  if (stream.match(/^\*[^*]+\*/)) return "emphasis";
  if (stream.match(/^\[[^\]]+\]\([^)]+\)/)) return "link";
  if (stream.sol() && stream.match(/^[-*+]\s/)) return "list";
  if (stream.sol() && stream.match(/^\d+\.\s/)) return "list";
  if (stream.sol() && stream.match(/^>\s/)) return "quote";
  stream.next();
  return null;
});

export function language_extension(language: string): Extension {
  const normalized = language.trim().toLowerCase();
  switch (normalized) {
    case "json":
      return json();
    case "javascript":
    case "js":
    case "jsx":
      return javascript({ jsx: true });
    case "typescript":
    case "ts":
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "html":
    case "htm":
      return html();
    case "css":
    case "scss":
      return css();
    case "xml":
      return xml();
    case "yaml":
    case "yml":
      return yaml();
    case "sql":
      return sqlLanguage;
    case "python":
    case "py":
      return pythonLanguage;
    case "php":
      return phpLanguage;
    case "markdown":
    case "md":
      return markdownLanguage;
    default:
      return [];
  }
}

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  lineNumbers?: boolean;
  lineWrapping?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  fullscreen?: boolean;
}

/**
 * CodeMirror-backed editor shared by the Code and JSON interfaces.
 *
 * The component is intentionally controlled: every document change is sent
 * through `onChange`, and values set from outside (formatting, undo from the
 * parent form) are reconciled without losing the current selection when the
 * text is unchanged.
 */
export function CodeEditor({
  value,
  onChange,
  language = "plaintext",
  lineNumbers = true,
  lineWrapping = false,
  readOnly = false,
  placeholder = "",
  ariaLabel,
  fullscreen = false,
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const lineNumberCompartment = useRef(new Compartment());
  const wrappingCompartment = useRef(new Compartment());
  const readOnlyCompartment = useRef(new Compartment());
  const languageCompartment = useRef(new Compartment());
  const languageExtensionValue = useMemo(
    () => language_extension(language),
    [language]
  );

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumberCompartment.current.of(
            lineNumbers ? lineNumbersExtension() : []
          ),
          history(),
          drawSelection(),
          dropCursor(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          rectangularSelection(),
          crosshairCursor(),
          foldGutter(),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            ...foldKeymap,
            indentWithTab,
          ]),
          wrappingCompartment.current.of(
            lineWrapping ? EditorView.lineWrapping : []
          ),
          readOnlyCompartment.current.of(
            EditorState.readOnly.of(readOnly)
          ),
          languageCompartment.current.of(languageExtensionValue),
          syntaxHighlighting(editorHighlight),
          editorTheme,
          EditorState.tabSize.of(2),
          EditorView.contentAttributes.of({
            "aria-label": ariaLabel || "Code editor",
            spellcheck: "false",
          }),
          placeholderExtension(placeholder),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor is created once. Every prop that can change at runtime is
    // handled by one of the compartments below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: lineNumberCompartment.current.reconfigure(
        lineNumbers ? lineNumbersExtension() : []
      ),
    });
  }, [lineNumbers]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: wrappingCompartment.current.reconfigure(
        lineWrapping ? EditorView.lineWrapping : []
      ),
    });
  }, [lineWrapping]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        EditorState.readOnly.of(readOnly)
      ),
    });
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: languageCompartment.current.reconfigure(languageExtensionValue),
    });
  }, [languageExtensionValue]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  return (
    <div
      ref={hostRef}
      data-fullscreen={fullscreen ? "true" : undefined}
      className={
        fullscreen
          ? "cms-code-editor cms-code-editor-fullscreen h-full min-h-0 overflow-auto"
          : "cms-code-editor min-h-40 overflow-hidden"
      }
    />
  );
}
