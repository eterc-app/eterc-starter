import * as fs from "node:fs";
import * as nodePath from "node:path";
import { Model } from "@/engine/model";
import { MODULES_DIR, PROJECT_ROOT } from "@/engine/paths";

export type LanguagePhrases = Record<string, string>;

/** Built-in validation-error catalogs for the supported languages. */
export const VALIDATION_CATALOGS: Record<"en" | "es" | "fr", LanguagePhrases> = {
  en: {
    required_error: "The [label] field is required.",
    integer_error: "The [label] field must be an integer.",
    numeric_error: "The [label] field must be numeric.",
    decimal_error: "The [label] field must be a decimal number.",
    valid_email_error: "The [label] field must contain a valid email address.",
    valid_url_error: "The [label] field must contain a valid URL.",
    valid_ip_error: "The [label] field must contain a valid IP address.",
    valid_date_error:
      "The [label] field must be a valid date in YYYY-MM-DD format.",
    valid_time_error:
      "The [label] field must be a valid time in HH:MM or HH:MM:SS format.",
    valid_datetime_local_error:
      "The [label] field must be a valid datetime in YYYY-MM-DDTHH:MM format.",
    valid_month_error: "The [label] field must be a valid month in YYYY-MM format.",
    valid_week_error: "The [label] field must be a valid week in YYYY-W## format.",
    min_length_error:
      "The [label] field must be at least [param] characters long.",
    max_length_error: "The [label] field cannot exceed [param] characters.",
    exact_length_error:
      "The [label] field must be exactly [param] characters long.",
    greater_than_error: "The [label] field must be greater than [param].",
    less_than_error: "The [label] field must be less than [param].",
    matches_error: "The [label] field must match the [param] field.",
    allowed_types_error:
      "The [label] must be one of the following file types: [param].",
    max_size_error: "The [label] file size must not exceed [param] KB.",
    min_size_error: "The [label] file size must be at least [param] KB.",
    is_image_error: "The [label] must be a valid image file.",
    unsupported_image_type_error:
      "The [label] is a valid image, but this server cannot process that image format.",
    max_width_error: "The [label] image width cannot exceed [param] pixels.",
    min_width_error: "The [label] image width must be at least [param] pixels.",
    max_height_error: "The [label] image height cannot exceed [param] pixels.",
    min_height_error: "The [label] image height must be at least [param] pixels.",
    exact_width_error: "The [label] image width must be exactly [param] pixels.",
    exact_height_error:
      "The [label] image height must be exactly [param] pixels.",
    square_error: "The [label] image must be square (equal width and height).",
    upload_failed_error: "The [label] failed to upload. Please try again.",
    not_an_image_error:
      "The [label] must be a valid image file (JPG, PNG, GIF, or WEBP).",
    invalid_file_error: "The [label] is invalid or has been corrupted.",
    security_threat_error:
      "A security threat was detected in the [label]. The upload has been blocked.",
    title_check: "You cannot be serious",
  },

  es: {
    required_error: "El campo [label] es obligatorio.",
    integer_error: "El campo [label] debe contener un número entero.",
    numeric_error: "El campo [label] debe contener un valor numérico.",
    decimal_error: "El campo [label] debe contener un número decimal.",
    valid_email_error:
      "El campo [label] debe contener una dirección de correo electrónico válida.",
    valid_url_error: "El campo [label] debe contener una URL válida.",
    valid_ip_error: "El campo [label] debe contener una dirección IP válida.",
    valid_date_error:
      "El campo [label] debe ser una fecha válida en formato AAAA-MM-DD.",
    valid_time_error:
      "El campo [label] debe ser una hora válida en formato HH:MM o HH:MM:SS.",
    valid_datetime_local_error:
      "El campo [label] debe ser una fecha y hora válida en formato AAAA-MM-DDTHH:MM.",
    valid_month_error:
      "El campo [label] debe ser un mes válido en formato AAAA-MM.",
    valid_week_error:
      "El campo [label] debe ser una semana válida en formato AAAA-W##.",
    min_length_error:
      "El campo [label] debe tener al menos [param] caracteres.",
    max_length_error:
      "El campo [label] no puede exceder los [param] caracteres.",
    exact_length_error:
      "El campo [label] debe tener exactamente [param] caracteres.",
    greater_than_error: "El campo [label] debe ser mayor que [param].",
    less_than_error: "El campo [label] debe ser menor que [param].",
    matches_error: "El campo [label] debe coincidir con el campo [param].",
    allowed_types_error:
      "El archivo [label] debe ser uno de los siguientes tipos: [param].",
    max_size_error:
      "El tamaño del archivo [label] no puede exceder los [param] KB.",
    min_size_error:
      "El tamaño del archivo [label] debe ser de al menos [param] KB.",
    is_image_error: "El archivo [label] debe ser una imagen válida.",
    unsupported_image_type_error:
      "El archivo [label] es una imagen válida, pero este servidor no puede procesar ese formato de imagen.",
    max_width_error:
      "El ancho de la imagen [label] no puede exceder los [param] píxeles.",
    min_width_error:
      "El ancho de la imagen [label] debe ser de al menos [param] píxeles.",
    max_height_error:
      "El alto de la imagen [label] no puede exceder los [param] píxeles.",
    min_height_error:
      "El alto de la imagen [label] debe ser de al menos [param] píxeles.",
    exact_width_error:
      "El ancho de la imagen [label] debe ser exactamente de [param] píxeles.",
    exact_height_error:
      "El alto de la imagen [label] debe ser exactamente de [param] píxeles.",
    square_error: "La imagen [label] debe ser cuadrada (ancho y alto iguales).",
    upload_failed_error:
      "La carga de [label] ha fallado. Por favor, inténtelo de nuevo.",
    not_an_image_error:
      "El archivo [label] debe ser una imagen válida (JPG, PNG, GIF o WEBP).",
    invalid_file_error: "El archivo [label] no es válido o está dañado.",
    security_threat_error:
      "Se ha detectado una amenaza de seguridad en el archivo [label]. La carga ha sido bloqueada.",
    title_check: "No puedes estar bromeando!",
  },

  fr: {
    required_error: "Le champ [label] est obligatoire.",
    integer_error: "Le champ [label] doit contenir un nombre entier.",
    numeric_error: "Le champ [label] doit contenir une valeur numérique.",
    decimal_error: "Le champ [label] doit contenir un nombre décimal.",
    valid_email_error:
      "Le champ [label] doit contenir une adresse e-mail valide.",
    valid_url_error: "Le champ [label] doit contenir une URL valide.",
    valid_ip_error: "Le champ [label] doit contenir une adresse IP valide.",
    valid_date_error:
      "Le champ [label] doit être une date valide au format AAAA-MM-JJ.",
    valid_time_error:
      "Le champ [label] doit être une heure valide au format HH:MM ou HH:MM:SS.",
    valid_datetime_local_error:
      "Le champ [label] doit être une date et heure valide au format AAAA-MM-JJTHH:MM.",
    valid_month_error:
      "Le champ [label] doit être un mois valide au format AAAA-MM.",
    valid_week_error:
      "Le champ [label] doit être une semaine valide au format AAAA-W##.",
    min_length_error:
      "Le champ [label] doit contenir au moins [param] caractères.",
    max_length_error:
      "Le champ [label] ne doit pas dépasser [param] caractères.",
    exact_length_error:
      "Le champ [label] doit contenir exactement [param] caractères.",
    greater_than_error: "Le champ [label] doit être supérieur à [param].",
    less_than_error: "Le champ [label] doit être inférieur à [param].",
    matches_error: "Le champ [label] doit correspondre au champ [param].",
    allowed_types_error:
      "Le fichier [label] doit être de l'un des types suivants : [param].",
    max_size_error:
      "La taille du fichier [label] ne doit pas dépasser [param] Ko.",
    min_size_error:
      "La taille du fichier [label] doit être d'au moins [param] Ko.",
    is_image_error: "Le fichier [label] doit être une image valide.",
    unsupported_image_type_error:
      "Le fichier [label] est une image valide, mais ce serveur ne peut pas traiter ce format d'image.",
    max_width_error:
      "La largeur de l'image [label] ne peut pas dépasser [param] pixels.",
    min_width_error:
      "La largeur de l'image [label] doit être d'au moins [param] pixels.",
    max_height_error:
      "La hauteur de l'image [label] ne peut pas dépasser [param] pixels.",
    min_height_error:
      "La hauteur de l'image [label] doit être d'au moins [param] pixels.",
    exact_width_error:
      "La largeur de l'image [label] doit être exactement de [param] pixels.",
    exact_height_error:
      "La hauteur de l'image [label] doit être exactement de [param] pixels.",
    square_error:
      "L'image [label] doit être carrée (largeur et hauteur égales).",
    upload_failed_error:
      "Le téléchargement de [label] a échoué. Veuillez réessayer.",
    not_an_image_error:
      "Le fichier [label] doit être une image valide (JPG, PNG, GIF ou WEBP).",
    invalid_file_error: "Le fichier [label] est invalide ou corrompu.",
    security_threat_error:
      "Une menace de sécurité a été détectée dans le fichier [label]. Le téléchargement a été bloqué.",
    title_check: "Tu ne peux pas être sérieux!",
  },
};

export class Language_model extends Model {
  /** Fallback language when no supported locale is selected. */
  default_language = "en";

  /**
   * Resolve a language file path: substitute {lang} and anchor relative paths
   * at the project root.
   */
  resolve_path(file_path: string, lang: string): string {
    const with_lang = file_path.replace(/\{lang\}/g, lang);
    if (nodePath.isAbsolute(with_lang)) return with_lang;
    return nodePath.join(PROJECT_ROOT, with_lang);
  }

  /**
   * Load a JSON language file.
   *
   * Returns {} when the file does not exist, is unreadable, decodes to
   * something other than a JSON object, or resolves outside the project root.
   */
  load_phrases(file_path: string, lang: string): LanguagePhrases {
    const resolved = this.resolve_path(file_path, lang);
    const json_path = to_json_path(resolved);

    const candidates: string[] = [];
    if (is_inside_project(json_path)) candidates.push(json_path);

    // Module paths are written as "modules/…". The source modules live under
    // src/modules, so also try that mapping when the project-root location
    // does not exist.
    const normalized = file_path.replace(/\\/g, "/");
    if (!nodePath.isAbsolute(normalized) && normalized.startsWith("modules/")) {
      const fallback = to_json_path(
        nodePath.join(
          MODULES_DIR,
          normalized.slice("modules/".length).replace(/\{lang\}/g, lang)
        )
      );
      if (is_inside_project(fallback) && !candidates.includes(fallback)) {
        candidates.push(fallback);
      }
    }

    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (found === undefined) return {};

    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(found, "utf8"));
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      const phrases: LanguagePhrases = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        phrases[key] = String(value);
      }
      return phrases;
    } catch {
      return {};
    }
  }

  /**
   * Built-in validation-error catalog for a language. Unknown languages fall
   * back to English.
   */
  get_validation_errors(lang: string): LanguagePhrases {
    const key = lang.toLowerCase();
    if (key === "en" || key === "es" || key === "fr") {
      return { ...VALIDATION_CATALOGS[key] };
    }
    return { ...VALIDATION_CATALOGS.en };
  }

  /**
   * The validation catalog re-keyed for the validation service: the
   * "required_error" key becomes the "required" rule key. Custom rule keys
   * (e.g. "title_check") carry no suffix and pass through unchanged.
   */
  get_validation_rule_catalog(lang: string): LanguagePhrases {
    const catalog = this.get_validation_errors(lang);
    const rules: LanguagePhrases = {};
    for (const [key, value] of Object.entries(catalog)) {
      rules[key.replace(/_error$/, "")] = value;
    }
    return rules;
  }

  /** Whether a language is one of the shipped catalogs. */
  is_supported(lang: string): boolean {
    const key = lang.toLowerCase();
    return key === "en" || key === "es" || key === "fr";
  }
}

/** Ensure a phrase-file path uses the JSON extension. */
function to_json_path(file_path: string): string {
  return file_path.endsWith(".json") ? file_path : `${file_path}.json`;
}

/** Guard against path traversal outside the project root. */
function is_inside_project(file_path: string): boolean {
  const relative = nodePath.relative(PROJECT_ROOT, file_path);
  return !relative.startsWith("..") && !nodePath.isAbsolute(relative);
}
