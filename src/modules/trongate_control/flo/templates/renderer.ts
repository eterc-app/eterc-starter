/**
 * Flo template renderer — a miniature port of the PHP view renderer used by
 * the original site_builder.
 *
 * In the PHP original each donor view is rendered with `ob_start(); require`
 * (Site_builder_model::render()) and then passed through
 * `prep_file_contents()` which decodes `&lt;`/`&gt;` back to `<`/`>`.
 *
 * This renderer preserves the same placeholder syntax:
 *
 *   <?= token ?>                  scalar substitution (dot paths supported)
 *   <?php if (token): ?> … <?php endif; ?>
 *   <?php if (!token): ?> … <?php else: ?> … <?php endif; ?>
 *   <?php // comment ?>
 *
 * Template data is precomputed by the Generator, so tokens are plain lookups
 * (exactly like the extracted variables of the PHP views).
 */

export type TemplateData = Record<string, unknown>;

/** PHP_EOL convenience. */
export const PHP_EOL = "\n";

/**
 * str_replace(['&lt;', '&gt;'], ['<', '>'], $content)
 * (PHP: Site_builder_model::prep_file_contents()).
 */
export function prep_file_contents(content: string): string {
  return content.split("&lt;").join("<").split("&gt;").join(">");
}

const CONTROL_TOKEN =
  /<\?php\s*(?:if\s*\(\s*(!?)\s*([\w.$]+)\s*\)\s*:|(else)\s*:|(endif)\s*;|\/\/[^?]*?)\s*\?>/g;

const ECHO_TOKEN = /<\?=\s*([\s\S]*?)\s*\?>/g;

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

  if (expr === "PHP_EOL") return PHP_EOL;
  if (expr === "PHP_EOL.PHP_EOL" || expr === "PHP_EOL . PHP_EOL") return PHP_EOL + PHP_EOL;

  const value = lookup(data, expr);

  if (value === undefined) {
    // Unknown token: keep generation deterministic — warn and emit nothing.
    // (Matches PHP's behaviour for an undefined variable: empty output.)
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[flo] Unknown template token: <?= ${expr} ?>`);
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

    if (match[1] !== undefined) {
      // <?php if (...) : ?>
      const negate = match[1] === "!";
      let condition = Boolean(lookup(data, match[2]));
      if (negate) condition = !condition;
      stack.push(condition);
    } else if (match[3] !== undefined) {
      // <?php else : ?>
      if (stack.length > 0) {
        stack[stack.length - 1] = !stack[stack.length - 1];
      }
    } else if (match[4] !== undefined) {
      // <?php endif; ?>
      stack.pop();
    }
    // Comment tokens are dropped entirely.
  }

  if (stack.every(Boolean)) {
    output += template.slice(lastIndex);
  }

  output = output.replace(ECHO_TOKEN, (_match, expression: string) =>
    resolveExpression(String(expression), data)
  );

  return prep_file_contents(output);
}
