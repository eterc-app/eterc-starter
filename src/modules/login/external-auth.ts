import * as crypto from "node:crypto";
import { current_url_with_query, site_url } from "@/engine/Url";
import { session_get, session_set } from "@/engine/session";
import {
  complete_external_login,
  OAuthError,
  type OAuthProfile,
} from "./oauth";

const TRANSACTION_KEY = "external_auth_transactions";
const TRANSACTION_TTL_SECONDS = 10 * 60;
const MAX_TRANSACTIONS = 5;
const PROVIDER_TIMEOUT_MS = 15_000;

export type ExternalAuthProviderId =
  | "clerk"
  | "auth0"
  | "workos"
  | "supabase";

interface ExternalAuthTransaction {
  state: string;
  provider: ExternalAuthProviderId;
  level_slug: string;
  verifier: string;
  redirect_uri: string;
  created_at: number;
}

interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

const discoveryCache = new Map<
  string,
  { expires: number; document: OidcDiscovery }
>();

function now_seconds(): number {
  return Math.floor(Date.now() / 1000);
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

export function is_external_auth_provider(
  value: unknown,
): value is ExternalAuthProviderId {
  return (
    value === "clerk" ||
    value === "auth0" ||
    value === "workos" ||
    value === "supabase"
  );
}

export function external_auth_provider(): ExternalAuthProviderId | null {
  const value = process.env.ET_AUTH_PROVIDER?.trim().toLowerCase();
  return is_external_auth_provider(value) ? value : null;
}

export function external_auth_label(provider: ExternalAuthProviderId): string {
  switch (provider) {
    case "clerk":
      return "Clerk";
    case "auth0":
      return "Auth0";
    case "workos":
      return "WorkOS AuthKit";
    case "supabase":
      return "Supabase Auth";
  }
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function is_transaction(value: unknown): value is ExternalAuthTransaction {
  if (!is_record(value)) return false;
  return (
    typeof value.state === "string" &&
    is_external_auth_provider(value.provider) &&
    typeof value.level_slug === "string" &&
    typeof value.verifier === "string" &&
    typeof value.redirect_uri === "string" &&
    typeof value.created_at === "number"
  );
}

async function store_transaction(transaction: ExternalAuthTransaction): Promise<void> {
  const stored = await session_get<Record<string, ExternalAuthTransaction>>(
    TRANSACTION_KEY,
  );
  const current = is_record(stored) ? stored : {};
  const cutoff = now_seconds() - TRANSACTION_TTL_SECONDS;
  const next = Object.fromEntries(
    Object.entries(current)
      .filter(([, value]) => is_transaction(value) && value.created_at >= cutoff)
      .slice(-(MAX_TRANSACTIONS - 1)),
  );
  next[transaction.state] = transaction;
  await session_set(TRANSACTION_KEY, next);
}

async function consume_transaction(
  state: string,
): Promise<ExternalAuthTransaction | null> {
  if (!state || state.length > 200) return null;
  const stored = await session_get<Record<string, ExternalAuthTransaction>>(
    TRANSACTION_KEY,
  );
  if (!is_record(stored)) return null;
  const transaction = stored[state];
  if (!is_transaction(transaction)) return null;
  delete stored[state];
  await session_set(TRANSACTION_KEY, stored);
  if (transaction.created_at < now_seconds() - TRANSACTION_TTL_SECONDS) {
    return null;
  }
  return transaction;
}

async function discover_oidc(issuer: string): Promise<OidcDiscovery> {
  const base = issuer.trim().replace(/\/+$/, "");
  if (!base) throw new OAuthError("oauth_unavailable");

  const cached = discoveryCache.get(base);
  if (cached && cached.expires > Date.now()) return cached.document;

  const response = await fetch(`${base}/.well-known/openid-configuration`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!response.ok) throw new OAuthError("oauth_unavailable");

  const payload = (await response.json()) as unknown;
  if (
    !is_record(payload) ||
    typeof payload.authorization_endpoint !== "string" ||
    typeof payload.token_endpoint !== "string" ||
    typeof payload.userinfo_endpoint !== "string"
  ) {
    throw new OAuthError("oauth_unavailable");
  }

  const document: OidcDiscovery = {
    authorization_endpoint: payload.authorization_endpoint,
    token_endpoint: payload.token_endpoint,
    userinfo_endpoint: payload.userinfo_endpoint,
  };
  discoveryCache.set(base, {
    expires: Date.now() + 15 * 60 * 1000,
    document,
  });
  return document;
}

function normalize_profile(
  subject: unknown,
  email: unknown,
  name: unknown,
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

async function fetch_json(
  url: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!response.ok) throw new OAuthError("oauth_failed");
  const payload = (await response.json()) as unknown;
  if (!is_record(payload)) throw new OAuthError("oauth_failed");
  return payload;
}

function require_env(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new OAuthError("oauth_unavailable");
  return value;
}

function redirect_uri(): string {
  return (
    process.env.AUTH_REDIRECT_URI?.trim() ||
    absolute_url("api/auth/external/callback")
  );
}

export async function start_external_auth(
  level_slug: string,
): Promise<string> {
  const provider = external_auth_provider();
  if (!provider) throw new OAuthError("oauth_unavailable");

  const state = random_urlsafe(32);
  const verifier = random_urlsafe(48);
  const challenge = pkce_challenge(verifier);
  const callback = redirect_uri();

  let authorize_url: string;

  if (provider === "clerk" || provider === "auth0") {
    const issuer = require_env("AUTH_ISSUER");
    const client_id = require_env("AUTH_CLIENT_ID");
    const discovery = await discover_oidc(issuer);
    const params = new URLSearchParams({
      client_id,
      redirect_uri: callback,
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    authorize_url = `${discovery.authorization_endpoint}?${params.toString()}`;
  } else if (provider === "workos") {
    const client_id = require_env("WORKOS_CLIENT_ID");
    const params = new URLSearchParams({
      client_id,
      redirect_uri: callback,
      response_type: "code",
      state,
    });
    authorize_url = `https://api.workos.com/user_management/authorize?${params.toString()}`;
  } else {
    const project_url = require_env("SUPABASE_URL").replace(/\/+$/, "");
    const upstream = process.env.SUPABASE_AUTH_PROVIDER?.trim() || "google";
    const params = new URLSearchParams({
      provider: upstream,
      redirect_to: callback,
      code_challenge: challenge,
      code_challenge_method: "s256",
    });
    authorize_url = `${project_url}/auth/v1/authorize?${params.toString()}`;
  }

  await store_transaction({
    state,
    provider,
    level_slug,
    verifier,
    redirect_uri: callback,
    created_at: now_seconds(),
  });

  return authorize_url;
}

export async function complete_external_auth(
  state: string,
  code: string,
): Promise<string> {
  if (!code || code.length > 4096) throw new OAuthError("oauth_failed");
  const transaction = await consume_transaction(state);
  if (!transaction) throw new OAuthError("oauth_state");

  const provider = transaction.provider;
  let profile: OAuthProfile;

  if (provider === "clerk" || provider === "auth0") {
    const issuer = require_env("AUTH_ISSUER");
    const client_id = require_env("AUTH_CLIENT_ID");
    const client_secret = require_env("AUTH_CLIENT_SECRET");
    const discovery = await discover_oidc(issuer);

    const token_payload = await fetch_json(discovery.token_endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id,
        client_secret,
        code,
        redirect_uri: transaction.redirect_uri,
        code_verifier: transaction.verifier,
      }).toString(),
    });
    const access_token = String(token_payload.access_token ?? "");
    if (!access_token) throw new OAuthError("oauth_failed");

    const userinfo = await fetch_json(discovery.userinfo_endpoint, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: "application/json",
      },
    });
    profile = normalize_profile(
      userinfo.sub,
      userinfo.email,
      userinfo.name ??
        [userinfo.given_name, userinfo.family_name].filter(Boolean).join(" "),
    );
  } else if (provider === "workos") {
    const client_id = require_env("WORKOS_CLIENT_ID");
    const api_key = require_env("WORKOS_API_KEY");
    const payload = await fetch_json(
      "https://api.workos.com/user_management/authenticate",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id,
          client_secret: api_key,
          grant_type: "authorization_code",
          code,
        }),
      },
    );
    const user = is_record(payload.user) ? payload.user : null;
    if (!user || user.email_verified !== true) {
      throw new OAuthError("oauth_email");
    }
    profile = normalize_profile(
      user.id,
      user.email,
      [user.first_name, user.last_name].filter(Boolean).join(" "),
    );
  } else {
    const project_url = require_env("SUPABASE_URL").replace(/\/+$/, "");
    const anon_key = require_env("SUPABASE_ANON_KEY");
    const payload = await fetch_json(
      `${project_url}/auth/v1/token?grant_type=pkce`,
      {
        method: "POST",
        headers: {
          apikey: anon_key,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          auth_code: code,
          code_verifier: transaction.verifier,
        }),
      },
    );
    const user = is_record(payload.user) ? payload.user : null;
    if (!user) throw new OAuthError("oauth_failed");
    const metadata = is_record(user.user_metadata) ? user.user_metadata : {};
    profile = normalize_profile(
      user.id,
      user.email,
      metadata.full_name ?? metadata.name ?? metadata.user_name,
    );
  }

  return complete_external_login(provider, profile, transaction.level_slug);
}


