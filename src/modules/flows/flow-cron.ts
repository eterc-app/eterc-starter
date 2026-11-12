/**
 * A small, deterministic 5-field CRON parser.
 *
 * Fields: minute hour day-of-month month day-of-week.
 * Supports `*`, lists, ranges, steps and `?` as an alias for `*`.
 * Schedules are evaluated in UTC; the UI labels this explicitly.
 */

export interface ParsedCron {
  expression: string;
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  domRestricted: boolean;
  dowRestricted: boolean;
}

const LIMITS: Array<{ name: string; min: number; max: number }> = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day of month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  { name: "day of week", min: 0, max: 6 },
];

function parse_field(
  raw: string,
  index: number
): { values: Set<number>; restricted: boolean } {
  const limit = LIMITS[index];
  const field = raw.trim();
  if (!field) throw new Error(`The ${limit.name} field is empty.`);
  if (field === "*" || field === "?") {
    return { values: new Set(), restricted: false };
  }

  const values = new Set<number>();
  for (const part of field.split(",")) {
    if (!part) throw new Error(`Invalid ${limit.name} list.`);
    let range = part;
    let step = 1;
    const slash = part.indexOf("/");
    if (slash !== -1) {
      range = part.slice(0, slash);
      step = Number(part.slice(slash + 1));
      if (!Number.isSafeInteger(step) || step < 1) {
        throw new Error(`Invalid step in the ${limit.name} field.`);
      }
    }

    let start: number;
    let end: number;
    if (range === "*") {
      start = limit.min;
      end = limit.max;
    } else if (range.includes("-")) {
      const [left, right] = range.split("-");
      start = Number(left);
      end = Number(right);
    } else {
      start = Number(range);
      end = start;
    }

    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < limit.min ||
      end > limit.max ||
      start > end
    ) {
      throw new Error(`The ${limit.name} field is outside its allowed range.`);
    }

    for (let value = start; value <= end; value += step) {
      values.add(index === 4 && value === 7 ? 0 : value);
    }
  }

  if (values.size === 0) {
    throw new Error(`The ${limit.name} field matches no values.`);
  }
  return { values, restricted: true };
}

export function parse_cron(expression: string): ParsedCron {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error("Use a five-field CRON expression: minute hour day month weekday.");
  }
  const [minute, hour, dom, month, dow] = parts.map((part, index) =>
    parse_field(part, index)
  );
  return {
    expression: expression.trim(),
    minutes: minute.values,
    hours: hour.values,
    daysOfMonth: dom.values,
    months: month.values,
    daysOfWeek: dow.values,
    domRestricted: dom.restricted,
    dowRestricted: dow.restricted,
  };
}

export function validate_cron(expression: string): string | null {
  try {
    parse_cron(expression);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid CRON expression.";
  }
}

function day_matches(parsed: ParsedCron, date: Date): boolean {
  const dom = parsed.domRestricted
    ? parsed.daysOfMonth.has(date.getUTCDate())
    : null;
  const dow = parsed.dowRestricted
    ? parsed.daysOfWeek.has(date.getUTCDay())
    : null;
  if (dom === null && dow === null) return true;
  if (dom !== null && dow !== null) return dom || dow;
  return dom ?? dow ?? true;
}

/**
 * Return the next matching instant strictly after `after` (UTC), or null when
 * nothing matches within the next two years.
 */
export function next_cron_run(
  expression: string,
  after: Date = new Date()
): Date | null {
  const parsed = parse_cron(expression);
  const candidate = new Date(after.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  // An empty set means the field was `*`/`?`, which matches every value.
  const months_match = (value: number) =>
    parsed.months.size === 0 || parsed.months.has(value);
  const hours_match = (value: number) =>
    parsed.hours.size === 0 || parsed.hours.has(value);
  const minutes_match = (value: number) =>
    parsed.minutes.size === 0 || parsed.minutes.has(value);

  const limit = 366 * 2 * 24 * 60;
  for (let i = 0; i < limit; i += 1) {
    if (!months_match(candidate.getUTCMonth() + 1)) {
      candidate.setUTCMonth(candidate.getUTCMonth() + 1, 1);
      candidate.setUTCHours(0, 0, 0, 0);
      continue;
    }
    if (!day_matches(parsed, candidate)) {
      candidate.setUTCDate(candidate.getUTCDate() + 1);
      candidate.setUTCHours(0, 0, 0, 0);
      continue;
    }
    if (!hours_match(candidate.getUTCHours())) {
      candidate.setUTCHours(candidate.getUTCHours() + 1, 0, 0, 0);
      continue;
    }
    if (!minutes_match(candidate.getUTCMinutes())) {
      candidate.setUTCMinutes(candidate.getUTCMinutes() + 1, 0, 0);
      continue;
    }
    return candidate;
  }
  return null;
}

export function next_cron_seconds(
  expression: string,
  after: Date = new Date()
): number | null {
  const next = next_cron_run(expression, after);
  return next ? Math.floor(next.getTime() / 1000) : null;
}

export function cron_is_due(
  expression: string,
  nextRunAt: number | null,
  now = Math.floor(Date.now() / 1000)
): boolean {
  if (nextRunAt !== null && nextRunAt > now) return false;
  return validate_cron(expression) === null;
}
