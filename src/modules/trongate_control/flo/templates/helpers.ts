/**
 * Small shared helpers for Flo's code emitters.
 *
 * They mirror the PHP helper functions used by site_builder's original
 * templates (ucfirst / ucwords / extract_rule_name / extract_rule_value) and
 * provide JS/JSX literal serialisation for generated TypeScript.
 */

/** PHP ucfirst(): upper-case the first character only. */
export function ucfirst(value: string): string {
  return value === "" ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

/** PHP ucwords(): upper-case the first character of every space-separated word. */
export function ucwords(value: string): string {
  return value
    .split(" ")
    .map((word) =>
      word === "" ? word : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}

/** JSON.stringify for embedding a JS string literal in generated source. */
export function js(value: string): string {
  return JSON.stringify(value);
}

/** A JSX text expression: {"Task Title"} */
export function jsxText(value: string): string {
  return "{" + js(value) + "}";
}

/** PHP extract_content($rule, '[', ']'). */
export function extractRuleValue(rule: string): string {
  const start = rule.indexOf("[");
  if (start === -1) return "";
  const end = rule.indexOf("]", start + 1);
  if (end === -1) return "";
  return rule.slice(start + 1, end);
}

/** PHP extract_rule_name($rule). */
export function extractRuleName(rule: string): string {
  const start = rule.indexOf("[");
  return (start === -1 ? rule : rule.slice(0, start)).trim();
}
