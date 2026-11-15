import type { DatabaseDialect } from "../contracts/database";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function quoteIdentifier(
  dialect: DatabaseDialect,
  identifier: string,
): string {
  if (!IDENTIFIER.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
  // MySQL connections enable ANSI_QUOTES so one quoting style works everywhere.
  void dialect;
  return `"${identifier}"`;
}

export function placeholder(dialect: DatabaseDialect, index: number): string {
  return dialect === "postgres" ? `$${index}` : "?";
}

export function isReadQuery(sql: string): boolean {
  const trimmed = sql.trimStart().toUpperCase();
  return (
    trimmed.startsWith("SELECT") ||
    trimmed.startsWith("WITH") ||
    trimmed.startsWith("EXPLAIN") ||
    trimmed.startsWith("SHOW")
  );
}

interface PreparedQuery {
  sql: string;
  params: unknown[] | Record<string, unknown> | undefined;
}

/**
 * Converts named parameters (`:name`, `@name`) and positional `?` markers into
 * the selected dialect's placeholders. Quoted strings, quoted identifiers and
 * comments are skipped so values are never rewritten.
 */
export function prepareQuery(
  sql: string,
  params: unknown[] | Record<string, unknown> | undefined,
  dialect: DatabaseDialect,
): PreparedQuery {
  if (!params) return { sql, params };

  const named = !Array.isArray(params);
  const values: unknown[] = [];
  const out: string[] = [];

  const pushPlaceholder = () => {
    values.push(undefined);
    out.push(placeholder(dialect, values.length));
    return values.length - 1;
  };

  let index = 0;
  while (index < sql.length) {
    const char = sql[index];

    if (char === "'" || char === '"' || char === "`") {
      const quote = char;
      out.push(char);
      index += 1;
      while (index < sql.length) {
        const current = sql[index];
        out.push(current);
        if (current === quote) {
          if (sql[index + 1] === quote) {
            out.push(sql[index + 1]);
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        if (current === "\\" && quote === "'" && dialect !== "postgres") {
          out.push(sql[index + 1] ?? "");
          index += 2;
          continue;
        }
        index += 1;
      }
      continue;
    }

    if (char === "-" && sql[index + 1] === "-") {
      const end = sql.indexOf("\n", index);
      if (end === -1) {
        out.push(sql.slice(index));
        break;
      }
      out.push(sql.slice(index, end + 1));
      index = end + 1;
      continue;
    }

    if (char === "/" && sql[index + 1] === "*") {
      const end = sql.indexOf("*/", index + 2);
      if (end === -1) {
        out.push(sql.slice(index));
        break;
      }
      out.push(sql.slice(index, end + 2));
      index = end + 2;
      continue;
    }

    if (named && char === ":" && sql[index + 1] !== ":") {      const match = /^:([A-Za-z_][A-Za-z0-9_]*)/.exec(sql.slice(index));
      if (match) {
        const value = (params as Record<string, unknown>)[match[1]];
        if (value === undefined) {
          throw new Error(`Missing SQL parameter: ${match[1]}`);
        }
        const slot = pushPlaceholder();
        values[slot] = value;
        index += match[0].length;
        continue;
      }
    }

    if (named && (char === "@" || char === "$")) {
      const match = new RegExp(`^\\${char}([A-Za-z_][A-Za-z0-9_]*)`).exec(
        sql.slice(index),
      );
      if (match) {
        const value = (params as Record<string, unknown>)[match[1]];
        if (value === undefined) {
          throw new Error(`Missing SQL parameter: ${match[1]}`);
        }
        const slot = pushPlaceholder();
        values[slot] = value;
        index += match[0].length;
        continue;
      }
    }

    if (!named && char === "?" && dialect === "postgres") {
      const slot = pushPlaceholder();
      values[slot] = (params as unknown[])[values.length - 1];
      index += 1;
      continue;
    }

    if (!named && char === "?" && dialect !== "postgres") {
      out.push(char);
      index += 1;
      continue;
    }

    if (named && char === "?") {
      throw new Error(
        "Positional SQL markers require positional parameters, not a named object.",
      );
    }

    out.push(char);
    index += 1;
  }

  if (named) {
    return { sql: out.join(""), params: values };
  }
  if (dialect === "postgres") {
    return { sql: out.join(""), params: values };
  }
  return { sql, params };
}
