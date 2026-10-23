import * as fs from "node:fs";
import * as net from "node:net";
import * as tls from "node:tls";
import * as path from "node:path";
import Database from "better-sqlite3";
import { PROJECT_ROOT } from "@/engine/paths";
import type {
  CmsProviderDefinition,
  CmsRuntimeAuthConfig,
  CmsRuntimeDatabaseConfig,
} from "./cms-types";

export interface ProviderTestResult {
  ok: boolean;
  message: string;
  details?: Record<string, string>;
}

export const DATABASE_PROVIDERS: CmsProviderDefinition[] = [
  {
    id: "sqlite",
    name: "SQLite",
    badge: "Default",
    description:
      "A zero-configuration database stored beside the project. The fastest way to start and the default for local development.",
    fields: [
      {
        key: "file",
        label: "Database file",
        placeholder: "prisma/dev.db",
        help: "Relative to the project root. The file and its folder are created automatically.",
      },
    ],
    notes: [
      "Works on a VPS or any persistent disk.",
      "For Vercel, use Neon, Supabase or another managed Postgres database.",
    ],
  },
  {
    id: "neon",
    name: "Neon",
    badge: "Postgres",
    description:
      "Serverless Postgres with branching and scale-to-zero. A strong fit for Next.js on Vercel.",
    fields: [
      {
        key: "connectionString",
        label: "Connection string",
        placeholder: "postgresql://user:password@ep-...neon.tech/neondb?sslmode=require",
        secret: true,
        required: true,
        help: "Copy the pooled connection string from the Neon dashboard.",
      },
    ],
    notes: ["Use the pooled connection string for serverless deployments."],
  },
  {
    id: "supabase",
    name: "Supabase",
    badge: "Postgres",
    description:
      "Hosted Postgres with auth, storage and realtime APIs. You can use Supabase for the database, auth, or both.",
    fields: [
      {
        key: "connectionString",
        label: "Postgres connection string",
        placeholder: "postgresql://postgres:password@db....supabase.co:5432/postgres",
        secret: true,
        required: true,
        help: "Find this under Project Settings → Database → Connection string.",
      },
      {
        key: "projectUrl",
        label: "Project URL",
        placeholder: "https://your-project.supabase.co",
        help: "Optional. Used to verify the project and build auth callbacks.",
      },
    ],
    notes: ["Use the connection pooler on port 6543 for serverless deployments."],
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    badge: "Self-hosted",
    description:
      "Any standard PostgreSQL 14+ server, including RDS, Railway, Render and a VPS.",
    fields: [
      {
        key: "connectionString",
        label: "Connection string",
        placeholder: "postgresql://user:password@host:5432/database",
        secret: true,
        required: true,
      },
    ],
  },
  {
    id: "turso",
    name: "Turso",
    badge: "libSQL",
    description:
      "Distributed SQLite-compatible database with HTTP and WebSocket access. Useful when you want SQLite semantics at the edge.",
    fields: [
      {
        key: "url",
        label: "Database URL",
        placeholder: "libsql://your-database.turso.io",
        required: true,
      },
      {
        key: "authToken",
        label: "Auth token",
        placeholder: "eyJhbGciOi...",
        secret: true,
        required: true,
      },
    ],
  },
  {
    id: "mysql",
    name: "MySQL",
    badge: "Self-hosted",
    description:
      "MySQL 8+ or MariaDB. Use this when your infrastructure already runs MySQL.",
    fields: [
      {
        key: "connectionString",
        label: "Connection string",
        placeholder: "mysql://user:password@host:3306/database",
        secret: true,
        required: true,
      },
    ],
  },
  {
    id: "firebase",
    name: "Firebase",
    badge: "Firestore",
    description:
      "Google Firestore through a service account. Best when the rest of your stack already uses Firebase.",
    fields: [
      {
        key: "projectId",
        label: "Project ID",
        placeholder: "my-firebase-project",
        required: true,
      },
      {
        key: "serviceAccountJson",
        label: "Service account JSON",
        placeholder: '{ "type": "service_account", ... }',
        secret: true,
        required: true,
        help: "Create a service account key in Firebase Project Settings → Service accounts.",
      },
    ],
    notes: ["Firestore is a document database, so relational relations are stored as references."],
  },
];

export const AUTH_PROVIDERS: CmsProviderDefinition[] = [
  {
    id: "builtin",
    name: "Built-in accounts",
    badge: "Default",
    description:
      "Eterc's own email/password accounts, sessions and tokens. No third-party account is required.",
    fields: [],
    notes: ["Admin accounts are managed in Manage Users.", "API keys work with every auth provider."],
  },
  {
    id: "clerk",
    name: "Clerk",
    badge: "Drop-in",
    description:
      "Hosted sign-in, user management and organizations. Good when you want a complete auth UI without building it.",
    fields: [
      {
        key: "publishableKey",
        label: "Publishable key",
        placeholder: "pk_test_...",
        required: true,
      },
      {
        key: "secretKey",
        label: "Secret key",
        placeholder: "sk_test_...",
        secret: true,
        required: true,
      },
      {
        key: "frontendApiUrl",
        label: "Frontend API URL",
        placeholder: "https://your-app.clerk.accounts.dev",
        help: "Used for OIDC discovery and the sign-in callback.",
      },
    ],
  },
  {
    id: "auth0",
    name: "Auth0",
    badge: "Enterprise",
    description:
      "OIDC identity platform with social logins, enterprise connections and fine-grained rules.",
    fields: [
      {
        key: "domain",
        label: "Tenant domain",
        placeholder: "your-tenant.us.auth0.com",
        required: true,
      },
      {
        key: "clientId",
        label: "Client ID",
        required: true,
      },
      {
        key: "clientSecret",
        label: "Client secret",
        secret: true,
        required: true,
      },
      {
        key: "audience",
        label: "API audience",
        placeholder: "https://your-api.example.com",
        help: "Optional. Leave empty to use the default Auth0 audience.",
      },
    ],
    notes: ["Add {origin}/login/oauth_callback to the allowed callback URLs in Auth0."],
  },
  {
    id: "supabase",
    name: "Supabase Auth",
    badge: "Postgres",
    description:
      "Email/password and social auth from Supabase. Pairs naturally with a Supabase database.",
    fields: [
      {
        key: "url",
        label: "Project URL",
        placeholder: "https://your-project.supabase.co",
        required: true,
      },
      {
        key: "anonKey",
        label: "Anon key",
        placeholder: "eyJhbGciOi...",
        secret: true,
        required: true,
      },
      {
        key: "serviceRoleKey",
        label: "Service role key",
        placeholder: "eyJhbGciOi...",
        secret: true,
        help: "Optional. Used for admin operations and account provisioning.",
      },
      {
        key: "jwtSecret",
        label: "JWT secret",
        placeholder: "super-secret",
        secret: true,
        help: "Found under Project Settings → API → JWT Settings.",
      },
    ],
  },
  {
    id: "firebase",
    name: "Firebase Auth",
    badge: "Google",
    description:
      "Email/password and federated sign-in through Firebase Authentication.",
    fields: [
      {
        key: "apiKey",
        label: "Web API key",
        placeholder: "AIza...",
        required: true,
      },
      {
        key: "authDomain",
        label: "Auth domain",
        placeholder: "your-project.firebaseapp.com",
        required: true,
      },
      {
        key: "projectId",
        label: "Project ID",
        placeholder: "your-project",
        required: true,
      },
      {
        key: "serviceAccountJson",
        label: "Service account JSON",
        placeholder: '{ "type": "service_account", ... }',
        secret: true,
        help: "Optional. Required only for server-side account provisioning.",
      },
    ],
  },
];

export function get_database_provider(id: string): CmsProviderDefinition {
  return DATABASE_PROVIDERS.find((provider) => provider.id === id) ?? DATABASE_PROVIDERS[0];
}

export function get_auth_provider_definition(id: string): CmsProviderDefinition {
  return AUTH_PROVIDERS.find((provider) => provider.id === id) ?? AUTH_PROVIDERS[0];
}

function field_keys(provider: CmsProviderDefinition): string[] {
  return provider.fields.map((field) => field.key);
}

export function sanitize_provider_values(
  provider: CmsProviderDefinition,
  values: Record<string, string> | undefined
): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const key of field_keys(provider)) {
    const value = values?.[key];
    if (typeof value === "string") clean[key] = value;
  }
  return clean;
}

export function missing_required_fields(
  provider: CmsProviderDefinition,
  values: Record<string, string>
): string[] {
  return provider.fields
    .filter((field) => field.required && !String(values[field.key] ?? "").trim())
    .map((field) => field.label);
}

function timeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("The connection timed out.")), milliseconds)
    ),
  ]);
}

function test_tcp(host: string, port: number, secure: boolean): Promise<void> {
  return timeout(
    new Promise<void>((resolve, reject) => {
      const socket = secure
        ? tls.connect({ host, port, servername: host, rejectUnauthorized: false })
        : net.connect({ host, port });
      const finish = (error?: Error) => {
        socket.removeAllListeners();
        socket.destroy();
        if (error) reject(error);
        else resolve();
      };
      socket.once("connect", () => finish());
      socket.once("secureConnect", () => finish());
      socket.once("error", (error) => finish(error));
    }),
    6000
  );
}

function parse_url(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function service_account_details(value: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed.type !== "service_account") return null;
    if (typeof parsed.project_id !== "string") return null;
    if (typeof parsed.client_email !== "string") return null;
    if (typeof parsed.private_key !== "string") return null;
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
    };
  } catch {
    return null;
  }
}

export async function test_database_connection(
  providerId: string,
  values: Record<string, string>
): Promise<ProviderTestResult> {
  const provider = get_database_provider(providerId);
  const missing = missing_required_fields(provider, values);
  if (missing.length > 0) {
    return { ok: false, message: `Fill in: ${missing.join(", ")}.` };
  }

  if (provider.id === "sqlite") {
    const file = String(values.file ?? "prisma/dev.db").trim() || "prisma/dev.db";
    const absolute = path.isAbsolute(file)
      ? file
      : path.join(/* turbopackIgnore: true */ PROJECT_ROOT, file);
    try {
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      const database = new Database(absolute);
      database.prepare("SELECT 1").get();
      database.close();
      return {
        ok: true,
        message: "SQLite is ready.",
        details: { file: absolute },
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Could not open the SQLite file.",
      };
    }
  }

  if (provider.id === "firebase") {
    const details = service_account_details(String(values.serviceAccountJson ?? ""));
    if (!details) {
      return {
        ok: false,
        message: "Paste a Firebase service account JSON containing project_id, client_email and private_key.",
      };
    }
    return {
      ok: true,
      message: "The service account JSON is valid.",
      details: {
        projectId: details.projectId,
        clientEmail: details.clientEmail,
      },
    };
  }

  if (provider.id === "turso") {
    const url = parse_url(String(values.url ?? ""));
    if (!url) return { ok: false, message: "Enter a valid libSQL URL." };
    if (!String(values.authToken ?? "").trim()) {
      return { ok: false, message: "An auth token is required for Turso." };
    }
    return {
      ok: true,
      message: "The Turso URL and token are present. The adapter verifies them on first query.",
      details: { host: url.hostname },
    };
  }

  const connection = parse_url(String(values.connectionString ?? ""));
  if (!connection) {
    return { ok: false, message: "Enter a valid connection string." };
  }
  if (!connection.hostname) {
    return { ok: false, message: "The connection string is missing a host." };
  }
  const port = Number(connection.port || (provider.id === "mysql" ? 3306 : 5432));
  const secure = provider.id !== "mysql" || connection.searchParams.get("ssl") === "true";
  try {
    await test_tcp(connection.hostname, port, secure);
    return {
      ok: true,
      message: `Connected to ${connection.hostname}:${port}. Credentials are checked by the data adapter at runtime.`,
      details: {
        host: connection.hostname,
        port: String(port),
        database: connection.pathname.replace(/^\//, ""),
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The database server could not be reached.",
    };
  }
}

async function fetch_json(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await timeout(fetch(url, init), 8000);
  if (!response.ok) {
    throw new Error(`The provider returned HTTP ${response.status}.`);
  }
  return (await response.json()) as Record<string, unknown>;
}

export async function test_auth_connection(
  providerId: string,
  values: Record<string, string>
): Promise<ProviderTestResult> {
  const provider = get_auth_provider_definition(providerId);
  const missing = missing_required_fields(provider, values);
  if (missing.length > 0) {
    return { ok: false, message: `Fill in: ${missing.join(", ")}.` };
  }

  if (provider.id === "builtin") {
    return { ok: true, message: "Built-in accounts are ready." };
  }

  try {
    if (provider.id === "auth0") {
      const domain = String(values.domain ?? "")
        .trim()
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
      const data = await fetch_json(`https://${domain}/.well-known/openid-configuration`);
      if (!data.issuer) throw new Error("The tenant did not return an OIDC issuer.");
      return {
        ok: true,
        message: "Auth0 OIDC discovery succeeded.",
        details: { issuer: String(data.issuer) },
      };
    }

    if (provider.id === "clerk") {
      const frontend = String(values.frontendApiUrl ?? "")
        .trim()
        .replace(/\/+$/, "");
      if (frontend) {
        const data = await fetch_json(`${frontend}/.well-known/openid-configuration`);
        if (!data.issuer && !data.authorization_endpoint) {
          throw new Error("Clerk did not return an OIDC configuration.");
        }
        return {
          ok: true,
          message: "Clerk OIDC discovery succeeded.",
          details: { issuer: String(data.issuer ?? frontend) },
        };
      }
      const secret = String(values.secretKey ?? "");
      if (!secret.startsWith("sk_")) {
        return { ok: false, message: "Clerk secret keys start with sk_." };
      }
      return {
        ok: true,
        message: "Clerk keys are present. Add the Frontend API URL to verify OIDC discovery.",
      };
    }

    if (provider.id === "supabase") {
      const url = String(values.url ?? "")
        .trim()
        .replace(/\/+$/, "");
      const data = await fetch_json(`${url}/auth/v1/settings`, {
        headers: {
          apikey: String(values.anonKey ?? ""),
          Authorization: `Bearer ${String(values.anonKey ?? "")}`,
        },
      });
      return {
        ok: true,
        message: "Supabase Auth responded successfully.",
        details: {
          external: data.external ? "configured" : "not configured",
        },
      };
    }

    if (provider.id === "firebase") {
      const apiKey = String(values.apiKey ?? "");
      if (!apiKey.startsWith("AIza")) {
        return { ok: false, message: "Firebase web API keys usually start with AIza." };
      }
      return {
        ok: true,
        message: "Firebase configuration looks valid. Enable Email/Password in the Firebase console.",
        details: {
          authDomain: String(values.authDomain ?? ""),
          projectId: String(values.projectId ?? ""),
        },
      };
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The auth provider could not be reached.",
    };
  }

  return { ok: false, message: "Unknown auth provider." };
}

export function provider_values_from_env(providerId: string): Record<string, string> {
  if (providerId === "neon" || providerId === "supabase" || providerId === "postgres") {
    return { connectionString: process.env.DATABASE_URL ?? "" };
  }
  if (providerId === "firebase") {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID ?? "",
      serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT ?? "",
    };
  }
  return {};
}

export function env_preview(
  database: CmsRuntimeDatabaseConfig,
  auth: CmsRuntimeAuthConfig
): Record<string, string> {
  const values: Record<string, string> = {};
  const db = database.values ?? {};
  const authValues = auth.values ?? {};

  if (database.provider === "sqlite") {
    values.DATABASE_URL = `file:./${String(db.file ?? "prisma/dev.db").replace(/^\.?\//, "")}`;
  } else if (database.provider === "neon" || database.provider === "supabase" || database.provider === "postgres") {
    values.DATABASE_URL = String(db.connectionString ?? "");
  } else if (database.provider === "turso") {
    values.TURSO_DATABASE_URL = String(db.url ?? "");
    values.TURSO_AUTH_TOKEN = String(db.authToken ?? "");
  } else if (database.provider === "mysql") {
    values.DATABASE_URL = String(db.connectionString ?? "");
  } else if (database.provider === "firebase") {
    values.FIREBASE_PROJECT_ID = String(db.projectId ?? "");
    values.FIREBASE_SERVICE_ACCOUNT = String(db.serviceAccountJson ?? "");
  }

  if (auth.provider === "clerk") {
    values.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = String(authValues.publishableKey ?? "");
    values.CLERK_SECRET_KEY = String(authValues.secretKey ?? "");
    values.CLERK_FRONTEND_API_URL = String(authValues.frontendApiUrl ?? "");
  } else if (auth.provider === "auth0") {
    values.AUTH0_DOMAIN = String(authValues.domain ?? "");
    values.AUTH0_CLIENT_ID = String(authValues.clientId ?? "");
    values.AUTH0_CLIENT_SECRET = String(authValues.clientSecret ?? "");
    values.AUTH0_AUDIENCE = String(authValues.audience ?? "");
  } else if (auth.provider === "supabase") {
    values.NEXT_PUBLIC_SUPABASE_URL = String(authValues.url ?? "");
    values.NEXT_PUBLIC_SUPABASE_ANON_KEY = String(authValues.anonKey ?? "");
    values.SUPABASE_SERVICE_ROLE_KEY = String(authValues.serviceRoleKey ?? "");
    values.SUPABASE_JWT_SECRET = String(authValues.jwtSecret ?? "");
  } else if (auth.provider === "firebase") {
    values.NEXT_PUBLIC_FIREBASE_API_KEY = String(authValues.apiKey ?? "");
    values.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = String(authValues.authDomain ?? "");
    values.NEXT_PUBLIC_FIREBASE_PROJECT_ID = String(authValues.projectId ?? "");
    values.FIREBASE_SERVICE_ACCOUNT = String(authValues.serviceAccountJson ?? "");
  }

  values.ET_AUTH_PROVIDER = auth.provider;
  values.ET_DATABASE_PROVIDER = database.provider;
  return values;
}
