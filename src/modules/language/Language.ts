import { Eterc } from "@/engine/controller";
import { get_context } from "@/engine/request-context";
import { session_get, session_set, session_unset } from "@/engine/session";
import { Language_model, type LanguagePhrases } from "./Language_model";
export default class Language extends Eterc {
  private default_language = "en";
  private cookie_name = "app_lang";
  private cookie_lifetime = 2592000;

  constructor(moduleName?: string | null) {
    super(moduleName);
    this.model = new Language_model(this.module_name || "language");
  }

  private languageModel(): Language_model {
    return this.model as Language_model;
  }
  set_language(lang: string): void {
    session_set("app_lang", lang);

    const ctx = get_context();
    if (ctx.canSetCookies) {
      ctx.responseCookies.push({
        name: this.cookie_name,
        value: lang,
        options: { path: "/", maxAge: this.cookie_lifetime },
      });
    }
  }
  get_language(): string {
    const from_session = session_get<string>("app_lang");
    if (typeof from_session === "string") {
      return from_session;
    }

    const ctx = get_context();
    const from_cookie = ctx.cookies[this.cookie_name];
    if (typeof from_cookie === "string") {
      return from_cookie;
    }

    const app_lang = process.env.ET_APP_LANG ?? "";
    if (app_lang !== "") {
      return app_lang;
    }

    return this.default_language;
  }
  reset_language(): void {
    session_unset("app_lang");

    const ctx = get_context();
    if (ctx.cookies[this.cookie_name] !== undefined) {
      if (ctx.canSetCookies) {
        ctx.responseCookies.push({
          name: this.cookie_name,
          value: "",
          options: { path: "/", maxAge: 0 },
        });
      }
      delete ctx.cookies[this.cookie_name];
    }
  }

  /**
   * Load a language phrase file.
   *
   * Example:
   *   modules/validation/language/{lang}/validation_errors.json
   *
   * @returns The phrases keyed by name, or {} when the file is missing.
   */
  load(path: string): LanguagePhrases {
    return this.languageModel().load_phrases(path, this.get_language());
  }

  /**
   * The built-in validation-error catalog for a language, re-keyed for the
   * validation service (see Language_model).
   */
  validation_errors(lang = this.get_language()): LanguagePhrases {
    return this.languageModel().get_validation_rule_catalog(lang);
  }
}
