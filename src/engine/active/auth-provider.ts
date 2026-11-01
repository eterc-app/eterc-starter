import type { AuthSession, AuthUser, IAuthProvider } from "../contracts/auth";
import { Eterc_tokens } from "../Eterc_tokens";
import { sqlite } from "../db";

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

      const tokenRow = sqlite()
        .prepare("SELECT user_id FROM eterc_tokens WHERE token = ? AND expiry_date > ?")
        .get(validToken, Math.floor(Date.now() / 1000)) as { user_id: number | string } | undefined;

      if (!tokenRow) return null;
      const user = await this.getUser(String(tokenRow.user_id));
      if (!user) return null;

      return { user, token: validToken };
    } catch {
      return null;
    }
  }

  async getUser(userId: string): Promise<AuthUser | null> {
    try {
      const row = sqlite()
        .prepare("SELECT id, username, email FROM eterc_users WHERE id = ?")
        .get(userId) as { id: number | string; username: string; email: string } | undefined;
      if (!row) return null;
      return {
        id: String(row.id),
        email: row.email,
        username: row.username,
        roles: ["user"],
      };
    } catch {
      return null;
    }
  }

  async signOut(): Promise<void> {
    const tokens = this.tokenService.gather_user_tokens();
    if (tokens.length > 0) {
      this.tokenService.delete_tokens(tokens);
    }
  }

  async protectRoute(roles?: string[]): Promise<AuthUser> {
    const session = await this.getSession();
    if (!session || !session.user) {
      throw new Error("Unauthorized: Authentication required.");
    }
    if (roles && roles.length > 0) {
      const hasRole = roles.some((r) => session.user.roles.includes(r));
      if (!hasRole) throw new Error("Forbidden: Insufficient privileges.");
    }
    return session.user;
  }
}

export const activeAuthProvider: IAuthProvider = new BuiltinAuthProvider();
