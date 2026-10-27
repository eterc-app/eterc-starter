import * as crypto from "node:crypto";
import { db, type Row } from "@/engine/db";
import { LOGIN_CONFIG, type LoginUserLevel } from "@/engine/config";
import { current_url_with_query, site_url } from "@/engine/Url";
import { rotate_session_id, session_get, session_set } from "@/engine/session";
import { ensure_cms_schema } from "@/modules/cms/cms-schema";
import { Login_model } from "./Login_model";
import {
  get_login_settings,
  is_login_provider_configured,
} from "./login-settings";
import type {
  LoginProviderId,
  LoginRuntimeSettings,
} from "./login-types";

const TRANSACTION_KEY = "oauth_transactions";
const TRANSACTION_TTL_SECONDS = 10 * 60;
const MAX_TRANSACTIONS = 5;
const PROVIDER_TIMEOUT_MS = 15_000;

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";
const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

interface OAuthTransaction {
  state: string;
  provider: LoginProviderId;
  level_id: number;
  level_slug: string;
  verifier: string;
  redirect_uri: string;
  created_at: number;
}

interface OAuthProfile {
  subject: string;
  email: string;
  name: string;
}

interface ResolvedLevel {
  level_id: number;
  level_slug: string;
  config: LoginUserLevel;
}

export class OAuthError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "OAuthError";
  }
}

function now_seconds(): number {
  return Math.floor(Date.now() / 1000);
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parse_provider(value: string): LoginProviderId | null {
  const provider = value.trim().toLowerCase();
  return provider === "github" || provider === "google" ? provider : null;
}

function require_provider(value: string): LoginProviderId {
  const provider = parse_provider(value);
  if (!provider) throw new OAuthError("oauth_unavailable");
  return provider;
}

function random_urlsafe(bytes: number): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

function pkce_challenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function absolute_url(path: string): string {
  return new URL(site_url(path), current_url_with_query()).toString();
}

function resolve_level(level_slug: string): ResolvedLevel {
  const slug = level_slug.trim();
  if (!slug) throw new OAuthError("oauth_unavailable");

  const model = new Login_model("login");

  for (const [level_id, config] of Object.entries(LOGIN_CONFIG.user_levels)) {
    const numeric_id = Number(level_id);
    if (model.get_login_url(numeric_id) === slug) {
      return {
        level_id: numeric_id,
        level_slug: slug,
        config,
      };
    }
  }

  throw new OAuthError("oauth_unavailable");
}

function email_column(config: LoginUserLevel): string {
  const column = Object.values(config.fields.identifiers).find(
    (identifier) => identifier.column.toLowerCase() === "email"
  )?.column;

  if (!column) throw new OAuthError("oauth_unavailable");
  return column;
}

function is_transaction(value: unknown): value is OAuthTransaction {
  if (!is_record(value)) return false;
  return (
    typeof value.state === "string" &&
    (value.provider === "github" || value.provider === "google") &&
    typeof value.level_id === "number" &&
    Number.isInteger(value.level_id) &&
    typeof value.level_slug === "string" &&
    typeof value.verifier === "string" &&
    typeof value.redirect_uri === "string" &&
    typeof value.created_at === "number"
  );
}

function store_transaction(transaction: OAuthTransaction): void {
  const stored = session_get<Record<string, OAuthTransaction>>(TRANSACTION_KEY);
  const current = is_record(stored) ? stored : {};
  const cutoff = now_seconds() - TRANSACTION_TTL_SECONDS;
  const next = Object.fromEntries(
    Object.entries(current)
      .filter(([, value]) => is_transaction(value) && value.created_at >= cutoff)
      .slice(-(MAX_TRANSACTIONS - 1))
  );

  next[transaction.state] = transaction;
  session_set(TRANSACTION_KEY, next);
}

/**
 * Consume a transaction exactly once. The state value is the lookup key and is
 * never accepted after expiry, provider mismatch, or a previous callback.
 */
export function consume_oauth_transaction(
  provider_value: string,
  state: string
): OAuthTransaction | null {
  const provider = parse_provider(provider_value);
  if (!provider || !state || state.length > 200) return null;

  const stored = session_get<Record<string, OAuthTransaction>>(TRANSACTION_KEY);
  if (!is_record(stored)) return null;

  const transaction = stored[state];
  if (!is_transaction(transaction)) return null;

  delete stored[state];
  session_set(TRANSACTION_KEY, stored);

  if (transaction.provider !== provider) return null;
  if (transaction.created_at < now_seconds() - TRANSACTION_TTL_SECONDS) return null;
  return transaction;
}

/** Build the provider authorization URL and persist state/PKCE server-side. */
export function start_oauth(provider_value: string, level_slug: string): string {
  const provider = require_provider(provider_value);
  const settings = get_login_settings();

  if (!is_login_provider_configured(provider, settings)) {
    throw new OAuthError("oauth_unavailable");
  }

  const level = resolve_level(level_slug);
  email_column(level.config);

  const provider_settings = settings.social[provider];
  const redirect_uri = absolute_url(`api/auth/oauth/${provider}/callback`);
  const state = random_urlsafe(32);
  const verifier = random_urlsafe(48);
  const challenge = pkce_challenge(verifier);

  store_transaction({
    state,
    provider,
    level_id: level.level_id,
    level_slug: level.level_slug,
    verifier,
    redirect_uri,
    created_at: now_seconds(),
  });

  const params = new URLSearchParams({
    client_id: provider_settings.client_id,
    redirect_uri,
    response_type: "code",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  if (provider === "github") {
    params.set("scope", "read:user user:email");
    params.set("allow_signup", "false");
    return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
  }

  params.set("scope", "openid email profile");
  params.set("access_type", "online");
  params.set("include_granted_scopes", "true");
  params.set("prompt", "select_account");
  return `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
}

function normalize_profile(
  subject: unknown,
  email: unknown,
  name: unknown
): OAuthProfile {
  const clean_subject = String(subject ?? "").trim();
  const clean_email = String(email ?? "").trim().toLowerCase();
  const clean_name = String(name ?? "").trim().slice(0, 200);

  if (!clean_subject || clean_subject.length > 255) {
    throw new OAuthError("oauth_failed");
  }
  if (
    !clean_email ||
    clean_email.length > 320 ||
    !clean_email.includes("@") ||
    /[\s<>]/.test(clean_email)
  ) {
    throw new OAuthError("oauth_email");
  }

  return {
    subject: clean_subject,
    email: clean_email,
    name: clean_name || clean_email,
  };
}

async function request_access_token(
  url: string,
  body: URLSearchParams
): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Eterc",
    },
    body: body.toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  if (!response.ok) throw new OAuthError("oauth_failed");

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OAuthError("oauth_failed");
  }

  if (!is_record(payload)) throw new OAuthError("oauth_failed");
  const token = payload.access_token;

  if (typeof token !== "string" || !token || token.length > 4096) {
    throw new OAuthError("oauth_failed");
  }
  return token;
}

async function github_profile(
  provider_settings: LoginRuntimeSettings["social"]["github"],
  code: string,
  redirect_uri: string,
  verifier: string
): Promise<OAuthProfile> {
  const access_token = await request_access_token(
    GITHUB_TOKEN_URL,
    new URLSearchParams({
      client_id: provider_settings.client_id,
      client_secret: provider_settings.client_secret,
      code,
      redirect_uri,
      code_verifier: verifier,
    })
  );

  const headers = {
    Authorization: `Bearer ${access_token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Eterc",
  };

  const user_response = await fetch(GITHUB_USER_URL, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!user_response.ok) throw new OAuthError("oauth_failed");

  const user = (await user_response.json()) as unknown;
  if (!is_record(user) || user.id === undefined || user.id === null) {
    throw new OAuthError("oauth_failed");
  }

  const emails_response = await fetch(GITHUB_EMAILS_URL, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!emails_response.ok) throw new OAuthError("oauth_email");

  const emails = (await emails_response.json()) as unknown;
  if (!Array.isArray(emails)) throw new OAuthError("oauth_email");

  const verified = emails.find(
    (entry) => is_record(entry) && entry.primary === true && entry.verified === true
  );
  const fallback = emails.find(
    (entry) => is_record(entry) && entry.verified === true
  );
  const email = is_record(verified)
    ? verified.email
    : is_record(fallback)
      ? fallback.email
      : "";

  if (typeof email !== "string" || !email) {
    throw new OAuthError("oauth_email");
  }

  return normalize_profile(
    user.id,
    email,
    typeof user.name === "string" ? user.name : user.login
  );
}

async function google_profile(
  provider_settings: LoginRuntimeSettings["social"]["google"],
  code: string,
  redirect_uri: string,
  verifier: string
): Promise<OAuthProfile> {
  const access_token = await request_access_token(
    GOOGLE_TOKEN_URL,
    new URLSearchParams({
      client_id: provider_settings.client_id,
      client_secret: provider_settings.client_secret,
      code,
      redirect_uri,
      code_verifier: verifier,
      grant_type: "authorization_code",
    })
  );

  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${access_token}`,
      Accept: "application/json",
      "User-Agent": "Eterc",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!response.ok) throw new OAuthError("oauth_failed");

  const profile = (await response.json()) as unknown;
  if (!is_record(profile) || profile.email_verified !== true) {
    throw new OAuthError("oauth_email");
  }

  return normalize_profile(profile.sub, profile.email, profile.name);
}

function user_ref_id(user: Row, config: LoginUserLevel): number {
  const value = user[config.user_ref_field];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function is_active(user: Row): boolean {
  return Number(user.active ?? 1) === 1;
}

function user_level_matches(user_id: number, level_id: number): boolean {
  if (user_id <= 0) return false;

  const rows = db.query_bind(
    "SELECT user_level_id FROM eterc_users WHERE id = :id LIMIT 1",
    { id: user_id },
    "object"
  ) as Array<{ user_level_id: number }>;

  return rows.length === 1 && Number(rows[0].user_level_id) === level_id;
}

function find_target_user(user_id: number, level: ResolvedLevel): Row | false {
  if (user_id <= 0) return false;
  if (!user_level_matches(user_id, level.level_id)) return false;

  const user = db.get_one_where(level.config.user_ref_field, user_id, level.config.target_table);
  if (user === false || !is_active(user)) return false;
  return user;
}

function link_or_find_user(
  provider: LoginProviderId,
  profile: OAuthProfile,
  level: ResolvedLevel,
  settings: LoginRuntimeSettings
): Row {
  ensure_cms_schema();

  const identities = db.query_bind(
    `SELECT * FROM eterc_identities
      WHERE provider = :provider AND subject = :subject
      LIMIT 1`,
    { provider, subject: profile.subject },
    "object"
  ) as Row[];

  const identity = identities[0];

  if (identity) {
    const user_id = Number(identity.user_id);
    const user = find_target_user(user_id, level);
    if (user === false) throw new OAuthError("oauth_no_account");

    if (identity.email !== profile.email || identity.name !== profile.name) {
      db.update(
        Number(identity.id),
        { email: profile.email, name: profile.name },
        "eterc_identities"
      );
    }
    return user;
  }

  if (!settings.social.link_by_email) {
    throw new OAuthError("oauth_no_account");
  }

  const model = new Login_model("login");
  const user = model.find_user_by_email(profile.email, level.level_id);
  if (user === false) throw new OAuthError("oauth_no_account");

  const user_id = user_ref_id(user, level.config);
  if (user_id <= 0 || !user_level_matches(user_id, level.level_id) || !is_active(user)) {
    throw new OAuthError("oauth_no_account");
  }

  try {
    db.insert(
      {
        user_id,
        provider,
        subject: profile.subject,
        email: profile.email,
        name: profile.name,
        created_at: now_seconds(),
      },
      "eterc_identities"
    );
  } catch {
    // A concurrent callback may have linked the same provider subject first.
    const existing = db.query_bind(
      `SELECT * FROM eterc_identities
        WHERE provider = :provider AND subject = :subject
        LIMIT 1`,
      { provider, subject: profile.subject },
      "object"
    ) as Row[];

    if (!existing[0] || Number(existing[0].user_id) !== user_id) {
      throw new OAuthError("oauth_identity");
    }
  }

  return user;
}

/**
 * Complete the provider exchange, link an existing account, rotate the
 * session, and create the authentication token. Returns a framework redirect
 * target (not an absolute URL).
 */
export async function complete_oauth(
  transaction: OAuthTransaction,
  code: string
): Promise<string> {
  if (!code || code.length > 2048) throw new OAuthError("oauth_failed");

  const provider = transaction.provider;
  const level = resolve_level(transaction.level_slug);
  if (level.level_id !== transaction.level_id) {
    throw new OAuthError("oauth_failed");
  }

  const settings = get_login_settings();
  if (!is_login_provider_configured(provider, settings)) {
    throw new OAuthError("oauth_unavailable");
  }

  const provider_settings = settings.social[provider];
  const profile =
    provider === "github"
      ? await github_profile(
          provider_settings,
          code,
          transaction.redirect_uri,
          transaction.verifier
        )
      : await google_profile(
          provider_settings,
          code,
          transaction.redirect_uri,
          transaction.verifier
        );

  const user = link_or_find_user(provider, profile, level, settings);
  const model = new Login_model("login");

  rotate_session_id();
  const token = model.login_user_row(user, level.level_id, 0);
  if (token === false) throw new OAuthError("oauth_failed");

  model.clear_failed_attempts(profile.email, level.level_id);
  return level.config.redirect_on_success;
}
