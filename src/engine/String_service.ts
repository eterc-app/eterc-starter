import * as crypto from "node:crypto";

export function truncate_str(value: string, maxLength: number): string {
  if (Array.from(value).length <= maxLength) return value;
  return Array.from(value).slice(0, maxLength).join("") + "...";
}

export function truncate_words(value: string, maxWords: number): string {
  const words = value.trim().split(/\s+/).filter((w) => w !== "");
  if (words.length <= maxWords) return value;
  return words.slice(0, maxWords).join(" ") + "...";
}

export function get_last_part(str: string, delimiter = "-"): string {
  if (str.includes(delimiter)) {
    const parts = str.split(delimiter);
    return parts[parts.length - 1];
  }
  return str;
}

export function extract_content(str: string, startDelim: string, endDelim: string): string {
  const startPos = str.indexOf(startDelim);
  if (startPos === -1) return "";
  const contentStart = startPos + startDelim.length;
  const endPos = str.indexOf(endDelim, contentStart);
  if (endPos === -1) return "";
  return str.slice(contentStart, endPos);
}

export function remove_substr_between(
  start: string,
  end: string,
  haystack: string,
  removeAll = false
): string {
  if (!removeAll) {
    const startPos = haystack.indexOf(start);
    if (startPos === -1) return haystack;
    const endPos = haystack.indexOf(end, startPos + start.length);
    if (endPos === -1) return haystack;

    let result =
      haystack.slice(0, startPos) + haystack.slice(endPos + end.length);
    if (
      startPos > 0 &&
      haystack[startPos - 1] === " " &&
      result[startPos] === " "
    ) {
      result = result.slice(0, startPos) + result.slice(startPos + 1);
    }
    return result;
  }

  let current = haystack;
  for (;;) {
    const startPos = current.indexOf(start);
    if (startPos === -1) break;
    const endPos = current.indexOf(end, startPos + start.length);
    if (endPos === -1) break;
    let removed =
      current.slice(0, startPos) + current.slice(endPos + end.length);
    if (
      startPos > 0 &&
      current[startPos - 1] === " " &&
      removed[startPos] === " "
    ) {
      removed = removed.slice(0, startPos) + removed.slice(startPos + 1);
    }
    current = removed;
  }
  return current;
}

export function nice_price(num: number, currencySymbol?: string | null): string {
  const formatted = numberFormat(num, 2);
  let result = formatted.replace(".00", "");
  if (currencySymbol !== undefined && currencySymbol !== null) {
    result = currencySymbol + result;
  }
  return result;
}

function numberFormat(num: number, decimals: number): string {
  const fixed = Math.abs(num).toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = num < 0 ? "-" : "";
  return decPart !== undefined ? `${sign}${withCommas}.${decPart}` : `${sign}${withCommas}`;
}
export function transliterate(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\x7F]/g, (ch) => {
      // Common non-Latin characters that NFKD does not decompose.
      const map: Record<string, string> = {
        "\u00df": "ss",
        "\u00e6": "ae",
        "\u00c6": "AE",
        "\u0153": "oe",
        "\u0152": "OE",
        "\u00f8": "o",
        "\u00d8": "O",
        "\u0111": "d",
        "\u0110": "D",
        "\u0142": "l",
        "\u0141": "L",
      };
      return map[ch] ?? "";
    });
}

export function url_title(value: string, trans = true): string {
  let input = value;
  if (trans === true) {
    input = transliterate(input);
  }
  let slug = decode_html_entities(input);
  slug = slug.replace(/[^\p{L}\d]+/gu, "-");
  slug = slug.replace(/^[-\s]+|[-\s]+$/g, "");
  return slug.toLowerCase();
}

export function sanitize_filename(
  filename: string,
  trans = true,
  maxLength = 200
): string {
  if (filename.includes("\0")) {
    throw new Error("Filename contains null bytes");
  }

  const lastDot = filename.lastIndexOf(".");
  const extension = lastDot > 0 ? filename.slice(lastDot + 1) : "";
  let basename = lastDot > 0 ? filename.slice(0, lastDot) : filename;
  // Handle names like ".htaccess"
  if (lastDot === 0) basename = "";

  if (basename === "") {
    basename = "file_" + uniqid();
  }

  let cleanBasename = url_title(basename, trans);

  if (cleanBasename === "") {
    cleanBasename = "file_" + uniqid();
  }

  if (cleanBasename.length > maxLength) {
    cleanBasename = cleanBasename.slice(0, maxLength).replace(/-+$/, "");
  }

  const cleanExtension = extension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

  return cleanExtension ? `${cleanBasename}.${cleanExtension}` : cleanBasename;
}

export type OutFormat = "html" | "attribute" | "xml" | "json" | "javascript";

export function out(
  input: unknown,
  outputFormat: OutFormat = "html"
): string {
  if (input === null || input === undefined) return "";
  const str = String(input);

  switch (outputFormat) {
    case "html":
    case "attribute":
      return escape_html(str);
    case "xml":
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    case "json":
      return jsonHexEncode(str);
    case "javascript": {
      const encoded = jsonHexEncode(str);
      if (encoded.length >= 2 && encoded.startsWith('"') && encoded.endsWith('"')) {
        return encoded.slice(1, -1);
      }
      return encoded;
    }
    default:
      throw new Error(`Unsupported output format: '${outputFormat}'`);
  }
}

/** JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE */
function jsonHexEncode(value: string): string {
  const senders: Array<[RegExp, string]> = [
    [/</g, "\u0001"],
    [/>/g, "\u0002"],
    [/&/g, "\u0003"],
    [/'/g, "\u0004"],
    [/"/g, "\u0005"],
  ];
  let replaced = value;
  for (const [pattern, placeholder] of senders) {
    replaced = replaced.replace(pattern, placeholder);
  }

  const encoded = JSON.stringify(replaced);
  return encoded
    .replace(/\\u0001/g, "\\u003C")
    .replace(/\\u0002/g, "\\u003E")
    .replace(/\\u0003/g, "\\u0026")
    .replace(/\\u0004/g, "\\u0027")
    .replace(/\\u0005/g, "\\u0022");
}

const RAND_CHARS = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

export function make_rand_str(length = 32, uppercase = false): string {
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += RAND_CHARS[bytes[i] % RAND_CHARS.length];
  }
  return uppercase ? result.toUpperCase() : result;
}

export function replace_html_tags(
  content: string,
  specifications: {
    opening_string_before?: string;
    close_string_before?: string;
    opening_string_after?: string;
    close_string_after?: string;
  }
): string {
  const openBefore = specifications.opening_string_before ?? "";
  const closeBefore = specifications.close_string_before ?? "";
  const openAfter = specifications.opening_string_after ?? "";
  const closeAfter = specifications.close_string_after ?? "";

  const pattern = new RegExp(
    escape_regexp(openBefore) + "([\\s\\S]*?)" + escape_regexp(closeBefore),
    "g"
  );
  return content.replace(pattern, openAfter + "$1" + closeAfter);
}

export function remove_html_code(
  content: string,
  openingPattern: string,
  closingPattern: string
): string {
  const pattern = new RegExp(
    "(" + escape_regexp(openingPattern) + ")([\\s\\S]*?)(\\s*" + escape_regexp(closingPattern) + ")",
    "gis"
  );
  return content.replace(pattern, "");
}

export function filter_str(str: string, allowedTags: string[] = []): string {
  let filtered = strip_tags(str, allowedTags);
  filtered = filtered.replace(/[^\S\r\n]+/g, " ");
  return filtered.trim();
}

export function filter_string(str: string, allowedTags: string[] = []): string {
  return filter_str(str, allowedTags);
}

export function filter_name(name: string, allowedChars: string[] = []): string {
  name = strip_tags(name);
  name = escape_html(name);

  const extra = allowedChars.map((c) => escape_regexp(c)).join("");
  const pattern = new RegExp(`[^a-zA-Z0-9\\s${extra}]`, "gu");
  name = name.replace(pattern, "");
  name = name.replace(/\s+/g, " ");
  return name.trim();
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

export function escape_html(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function escape_regexp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function decode_html_entities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: "\u00a0",
    copy: "\u00a9",
    reg: "\u00ae",
    hellip: "\u2026",
    mdash: "\u2014",
    ndash: "\u2013",
  };

  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = parseInt(entity.slice(2), 16);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    if (entity.startsWith("#")) {
      const code = parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return named[entity.toLowerCase()] ?? match;
  });
}
export function strip_tags(str: string, allowedTags: string[] = []): string {
  let result = str.replace(/<\?[\s\S]*?\?>/g, "");
  const allowed = new Set(
    allowedTags.map((t) => t.replace(/[<>\s/]/g, "").toLowerCase()).filter(Boolean)
  );

  result = result.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag: string) => {
    return allowed.has(tag.toLowerCase()) ? match : "";
  });

  return result;
}
export function uniqid(): string {
  return (
    Date.now().toString(16) +
    crypto.randomBytes(5).toString("hex").slice(0, 8)
  );
}
