import * as fs from "node:fs";
import { api_response, require_api_user } from "@/engine/api";
import { ENV, WEBSITE_NAME } from "@/engine/config";
import { Eterc } from "@/engine/controller";
import { GENERATED_MODULES_DIR, MODULES_DIR } from "@/engine/paths";
import { get_context } from "@/engine/request-context";

interface ModuleEntry {
  name: string;
  generated: boolean;
}

/**
 * Built-in API controller.
 *
 * URL mapping:
 *   GET  /api/v1/system/health
 *   GET  /api/v1/system/me
 *   GET  /api/v1/system/modules
 *   POST /api/v1/system/echo
 *
 * Add more controllers by creating `src/modules/<resource>_api/` and
 * registering it in src/engine/registrations.ts. The public URL becomes
 * `/api/v1/<resource>/<method>`.
 */
export default class System_api extends Eterc {
  health() {
    require_api_user();
    return api_response({
      status: "ok",
      name: WEBSITE_NAME,
      environment: ENV,
      version: process.env.npm_package_version ?? "0.1.0",
      timestamp: new Date().toISOString(),
    });
  }

  echo() {
    require_api_user();
    const context = get_context();
    return {
      method: context.httpMethod,
      path: context.pathname,
      query: context.query,
      body: context.json ?? null,
    };
  }

  me() {
    const user = require_api_user();
    return {
      user: {
        id: user.eterc_user_id,
        code: user.eterc_user_code,
        level_id: user.user_level_id,
        level: user.user_level,
        token_expires: user.expiry_date,
      },
    };
  }

  modules() {
    require_api_user();

    return {
      modules: this._list_modules(),
    };
  }

  private _list_modules(): ModuleEntry[] {
    const read = (directory: string, generated: boolean): ModuleEntry[] => {
      if (!fs.existsSync(directory)) return [];

      return fs
        .readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .filter((entry) => generated || entry.name !== "generated")
        .filter((entry) => !entry.name.startsWith("."))
        .map((entry) => ({ name: entry.name, generated }))
        .sort((a, b) => a.name.localeCompare(b.name));
    };

    const core = read(MODULES_DIR, false);
    const generated = read(GENERATED_MODULES_DIR, true).map((entry) => ({
      ...entry,
      name: `generated/${entry.name}`,
    }));

    return [...core, ...generated];
  }
}
