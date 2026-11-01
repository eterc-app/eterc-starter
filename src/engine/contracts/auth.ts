export interface AuthUser {
  id: string;
  email: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  roles: string[];
  metadata?: Record<string, unknown>;
}

export interface AuthSession {
  user: AuthUser;
  token?: string;
  expiresAt?: Date | string;
}

export interface IAuthProvider {
  readonly id: string;
  readonly name: string;

  /** Resolves the current authenticated session from cookies / headers. */
  getSession(): Promise<AuthSession | null>;

  /** Retrieves a user by their unique platform ID. */
  getUser(userId: string): Promise<AuthUser | null>;

  /** Logs out the current user and clears session state. */
  signOut(): Promise<void>;

  /** Protects a server action or route, verifying roles if specified. */
  protectRoute(roles?: string[]): Promise<AuthUser>;

  /** Generates a sign-in or authorization URL when using redirect-based OAuth / SSO. */
  generateAuthUrl?(options?: { returnTo?: string }): Promise<string>;
}

