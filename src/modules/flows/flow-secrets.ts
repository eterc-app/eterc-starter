import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { DATA_DIR } from "@/engine/paths";

const SECRET_FILE_NAME = "flows-secret";

function read_or_create_app_secret(): string {
  const configured =
    process.env.ETERC_FLOW_SECRET?.trim() ||
    process.env.ETERC_APP_SECRET?.trim();
  if (configured) return configured;

  const file = path.join(DATA_DIR, "settings", SECRET_FILE_NAME);
  try {
    if (fs.existsSync(file)) {
      const value = fs.readFileSync(file, "utf8").trim();
      if (value) return value;
    }
  } catch {
    // Fall through to creating a new secret.
  }

  const generated = randomBytes(48).toString("hex");
  try {
    fs.mkdirSync(file.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
    fs.writeFileSync(file, generated, { encoding: "utf8", mode: 0o600 });
  } catch {
    // The process can still sign and verify within this instance.
  }
  return generated;
}

let cached: string | null = null;

/** Stable application secret used to HMAC flow webhook secrets. */
export function flow_app_secret(): string {
  if (!cached) cached = read_or_create_app_secret();
  return cached;
}

export function hash_flow_secret(secret: string): string {
  return createHmac("sha256", flow_app_secret()).update(secret).digest("hex");
}

export function generate_flow_secret(): {
  secret: string;
  hash: string;
  prefix: string;
} {
  const secret = `etf_${randomBytes(32).toString("base64url")}`;
  return {
    secret,
    hash: hash_flow_secret(secret),
    prefix: secret.slice(0, 12),
  };
}

export function verify_flow_secret(secret: string, hash: string | null): boolean {
  if (!secret || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = Buffer.from(hash_flow_secret(secret), "hex");
  if (expected.length !== actual.length || expected.length === 0) return false;
  return timingSafeEqual(expected, actual);
}

/** Secret used by the external cron/worker endpoint. Null means not configured. */
export function flow_cron_secret(): string | null {
  const configured = process.env.FLOW_CRON_SECRET?.trim();
  return configured || null;
}

export function verify_cron_secret(value: string | null): boolean {
  const expected = flow_cron_secret();
  if (!expected) return process.env.FLOWS_ALLOW_UNSECURED_CRON === "1";
  if (!value) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Header used by webhook callers. */
export const FLOW_SECRET_HEADER = "x-et-flow-secret";
