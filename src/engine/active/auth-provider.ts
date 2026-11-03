import type { AuthSession, AuthUser, IAuthProvider } from "../contracts/auth";
import { Eterc_tokens } from "../Eterc_tokens";
import { sqlite } from "../db";

interface AccountRow {
  user_id: number | string;
  eterc_user_id: number | string | null;
  username: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  level_title: string | null;
}

export class BuiltinAuthProvider implements IAuthProvider {
  readonly id = "builtin";
  readonly name = "Built-in Accounts";

  private tokenService = new Eterc_tokens();

  async getSession(): Promise<AuthSession | null> {
    try {
      const tokens = this.tokenService.gather_user_tokens();
      if (tokens.length === 0) return null;
      const validToken = this.tokenService.validate_token_any_level(tokens);
      if (!validToken) return null;
      const user = await this.getUser(String(this.tokenService.get_user_id(validToken) ?? ""));
      if (!user) return null;
      return { user, token: validToken };
    } catch {
      return null;
    }
  }

  async getUser(userId: string): Promise<AuthUser | null> {
    try {
      const row = sqlite()
        .prepare(
          `SELECT u.id AS user_id, a.id AS administrator_id, a.eterc_user_id, a.username,
                  a.email, a.first_name, a.last_name, ul.level_title
             FROM eterc_users u
             LEFT JOIN eterc_administrators a ON a.eterc_user_id = u.id
             LEFT JOIN eterc_user_levels ul ON ul.id = u.user_level_id
            WHERE u.id = ? LIMIT 1`,
        )
        .get(userId) as AccountRow | undefined;
      if (!row) return null;
      return {
        id: String(row.user_id),
        email: row.email ?? "",
        username: row.username ?? undefined,
        firstName: row.first_name ?? undefined,
        lastName: row.last_name ?? undefined,
        roles: row.level_title ? [row.level_title] : ["user"],
      };
    } catch {
      return null;
    }
  }

  async signOut(): Promise<void> {
    this.tokenService.destroy();
  }

  async protectRoute(roles?: string[]): Promise<AuthUser> {
    const session = await this.getSession();
    if (!session) throw new Error("Unauthorized: authentication required.");
    if (roles && roles.length > 0) {
      const allowed = roles.some((role) => session.user.roles.includes(role));
      if (!allowed) throw new Error("Forbidden: insufficient privileges.");
    }
    return session.user;
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: "Built-in account storage is available." };
  }
}

export const activeAuthProvider: IAuthProvider = new BuiltinAuthProvider();
