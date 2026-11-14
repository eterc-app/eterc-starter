export type AuthLoginProviderId =
  | "builtin"
  | "clerk"
  | "auth0"
  | "workos"
  | "supabase"
  | "better-auth";

export type AuthLoginKind = "builtin" | "external" | "local";

/**
 * Login provider contract.
 *
 * The runtime session remains the Eterc token table. A provider only decides how
 * the user proves identity and where the login UI lives. This mirrors a C#
 * interface: the login module depends on the contract, not on a concrete vendor.
 */
export interface AuthLoginProvider {
  readonly id: AuthLoginProviderId;
  readonly label: string;
  readonly kind: AuthLoginKind;
  /** Framework-relative path for this provider's login entry point. */
  loginPath(levelSlug: string): string;
}

const BUILTIN: AuthLoginProvider = {
  id: "builtin",
  label: "Built-in Accounts",
  kind: "builtin",
  loginPath: (levelSlug) => `login/login/${levelSlug}`,
};

function external(
  id: AuthLoginProviderId,
  label: string,
): AuthLoginProvider {
  return {
    id,
    label,
    kind: "external",
    loginPath: (levelSlug) => `login/external/${levelSlug}`,
  };
}

function local(
  id: AuthLoginProviderId,
  label: string,
): AuthLoginProvider {
  return {
    id,
    label,
    kind: "local",
    loginPath: (levelSlug) => `login/better-auth/${levelSlug}`,
  };
}

const PROVIDERS: Record<string, AuthLoginProvider> = {
  builtin: BUILTIN,
  clerk: external("clerk", "Clerk"),
  auth0: external("auth0", "Auth0"),
  workos: external("workos", "WorkOS AuthKit"),
  supabase: external("supabase", "Supabase Auth"),
  "better-auth": local("better-auth", "Better Auth"),
};

export function login_auth_provider(): AuthLoginProvider {
  const value = process.env.ET_AUTH_PROVIDER?.trim().toLowerCase() ?? "";
  return PROVIDERS[value] ?? BUILTIN;
}
