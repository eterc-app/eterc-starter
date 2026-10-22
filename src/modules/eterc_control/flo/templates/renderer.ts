/**
 * Flo template renderer.
 *
 * Flo templates use a small mustache-style syntax:
 *
 *   {{{token}}}                       scalar substitution (dot paths supported)
 *   {{#if token}} ... {{/if}}         conditional block
 *   {{#if !token}} ... {{else}} ...   negated conditional with fallback
 *
 * Template data is precomputed by the generator, so tokens are plain lookups.
 */

export type TemplateData = Record<string, unknown>;

/** Decode HTML-escaped angle brackets after template rendering. */
export function prep_file_contents(content: string): string {
  return content.split("&lt;").join("<").split("&gt;").join(">");
}

const CONTROL_TOKEN =
  /\{\{#if\s+(!?)\s*([\w.$]+)\s*\}\}|\{\{\s*(else|\/if)\s*\}\}/g;

const ECHO_TOKEN = /\{\{\{\s*([\w.$]+)\s*\}\}\}/g;

function lookup(data: TemplateData, key: string): unknown {
  const path = key.replace(/^\$/, "").split(".").filter((part) => part !== "");
  let current: unknown = data;
  for (const part of path) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function resolveExpression(expression: string, data: TemplateData): string {
  const expr = expression.trim();
  const value = lookup(data, expr);

  if (value === undefined) {
    // Keep generation deterministic: warn and emit nothing.
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[flo] Unknown template token: {{{${expr}}}}`);
    }
    return "";
  }

  if (value === null || value === false) return "";

  return String(value);
}

/** Render a Flo template into its target file content. */
export function renderTemplate(template: string, data: TemplateData = {}): string {
  let output = "";
  let lastIndex = 0;
  const stack: boolean[] = [];

  for (const match of template.matchAll(CONTROL_TOKEN)) {
    const index = match.index ?? 0;
    if (stack.every(Boolean)) {
      output += template.slice(lastIndex, index);
    }
    lastIndex = index + match[0].length;

    if (match[2] !== undefined) {
      const negate = match[1] === "!";
      let condition = Boolean(lookup(data, match[2]));
      if (negate) condition = !condition;
      stack.push(condition);
    } else if (match[3] === "else") {
      if (stack.length > 0) {
        stack[stack.length - 1] = !stack[stack.length - 1];
      }
    } else if (match[3] === "/if") {
      stack.pop();
    }
  }

  if (stack.every(Boolean)) {
    output += template.slice(lastIndex);
  }

  output = output.replace(ECHO_TOKEN, (_match, expression: string) =>
    resolveExpression(String(expression), data)
  );

  return prep_file_contents(output);
}
