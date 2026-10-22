import { Eterc } from "@/engine/controller";
import { get_context } from "@/engine/request-context";
import { session_get, session_set, session_unset } from "@/engine/session";
import { Language_model, type LanguagePhrases } from "./Language_model";

/**
 * Language — port of modules/language/Language.php.
 *
 * Service module (no views, no tables, never addressed from a URL): other
 * modules use it to set/get/reset the current language and to load language
 * phrase files. Public method names and semantics mirror the PHP original.
 *
 * Port notes:
 *  - the APP_LANG constant becomes the ET_APP_LANG environment variable (the
 *    port keeps configuration in src/engine/config.ts, which is not modified
 *    by this module);
 *  - cookies are pushed through the request context and only actually set on
 *    responses that may write cookies (server actions / route handlers), the
 *    same pattern the token service uses;
 *  - load() delegates to Language_model because the PHP original `require`s a
 *    PHP file — the port reads equivalent JSON files instead.
 */
export default class Language extends Eterc {
  /** Default language fallback (PHP: private $default_language). */
  private default_language = "en";

  /** Cookie name (PHP: private $cookie_name). */
  private cookie_name = "app_lang";

  /** Cookie lifetime in seconds — 30 days (PHP: private $cookie_lifetime). */
  private cookie_lifetime = 2592000;

  constructor(moduleName?: string | null) {
    super(moduleName);
    this.model = new Language_model(this.module_name || "language");
  }

  private languageModel(): Language_model {
    return this.model as Language_model;
  }

  /**
   * Set the current language: session + persistent cookie
   * (PHP: Language::set_language()).
   */
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

  /**
   * Get the current language.
   * Priority: Session > Cookie > APP_LANG constant > Default
   * (PHP: Language::get_language()).
   */
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

  /**
   * Reset language to default: clear the session value and expire the cookie
   * (PHP: Language::reset_language()).
   */
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
   * Load a language phrase file (PHP: Language::load()).
   *
   * Example (PHP-era path, also accepted here):
   *   modules/validation/language/{lang}/validation_errors.php
   *
   * @returns The phrases keyed by name, or {} when the file is missing.
   */
  load(path: string): LanguagePhrases {
    return this.languageModel().load_phrases(path, this.get_language());
  }

  /**
   * The built-in validation-error catalog for a language, re-keyed for the
   * port's validation service (see Language_model).
   */
  validation_errors(lang = this.get_language()): LanguagePhrases {
    return this.languageModel().get_port_validation_errors(lang);
  }
}
