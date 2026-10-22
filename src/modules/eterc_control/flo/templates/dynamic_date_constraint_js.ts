/**
 * Dynamic date-constraint script — port of
 * site_builder/views/dynamic_date_constraint_js.php.
 */

import type { TemplateContext } from "../FloTypes";

/** True when any temporal property has an in-the-past/future rule. */
export function needsDateConstraintJs(data: TemplateContext): boolean {
  const temporal_types = ["date", "date and time", "time"];
  return data.posted_properties.some(
    (property) =>
      temporal_types.includes(property.property_type) &&
      (property.validation_rules.includes("in the past") ||
        property.validation_rules.includes("in the future"))
  );
}

/** Build the browser script body that sets min/max on temporal inputs. */
export function buildDateConstraintJs(data: TemplateContext): string {
  if (!needsDateConstraintJs(data)) return "";

  return [
    "(() => {",
    "  const applyDateConstraints = () => {",
    "    const now = new Date();",
    '    const pad = (value) => String(value).padStart(2, "0");',
    '    const localToday = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());',
    '    const localNow = localToday + "T" + pad(now.getHours()) + ":" + pad(now.getMinutes());',
    "",
    '    document.querySelectorAll("[data-date-constraint]").forEach((input) => {',
    '      const constraint = input.getAttribute("data-date-constraint");',
    '      const type = input.getAttribute("type");',
    "      let bound;",
    '      if (type === "time") {',
    '        bound = pad(now.getHours()) + ":" + pad(now.getMinutes());',
    '      } else if (type === "datetime-local") {',
    "        bound = localNow;",
    "      } else {",
    "        bound = localToday;",
    "      }",
    "",
    '      if (constraint === "past") {',
    '        input.setAttribute("max", bound);',
    '      } else if (constraint === "future") {',
    '        input.setAttribute("min", bound);',
    "      }",
    "    });",
    "  };",
    "",
    '  if (document.readyState === "loading") {',
    '    document.addEventListener("DOMContentLoaded", applyDateConstraints);',
    "  } else {",
    "    applyDateConstraints();",
    "  }",
    "})();",
  ].join("\n");
}
