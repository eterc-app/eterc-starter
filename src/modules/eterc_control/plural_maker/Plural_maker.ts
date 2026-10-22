import type { ReactNode } from "react";
import { Eterc } from "@/engine/controller";
import { csrf_check, csrf_token } from "@/engine/csrf";
import { post } from "@/engine/post";
import { EtHttpError } from "@/engine/signals";
import type { EtTemplateData } from "@/engine/Templates";
import {
  Language_model,
  type LanguagePhrases,
} from "@/modules/language/Language_model";
import type { Eterc_security } from "@/modules/eterc_security/Eterc_security";

const MAX_WORD_LENGTH = 120;
const MAX_BATCH_WORDS = 500;
const SHIPPED_LOCALES = ["en", "es", "fr"] as const;

export default class Plural_maker extends Eterc {

  /** Unchanging / uncountable nouns (singular === plural). */
  private readonly unchanging: string[] = [
    "abdomen", "adulthood", "advice", "agenda", "aid", "alcohol", "anime",
    "blood", "bronchitis", "butter", "candelabra", "canvas", "carp", "cash",
    "chalice", "chaos", "charles", "chess", "clothing", "cod", "commerce",
    "contact lens", "criteria", "cyclamen", "data", "deer", "digestion",
    "dolman", "elk", "energy", "equipment", "fish", "fun", "garbage",
    "goldfish", "grouse", "health", "homework", "hovercraft",
    "housework", "information", "james", "jellyfish", "justice", "kingfish",
    "labour", "laryngitis", "lens", "literature", "machinery",
    "mail", "mathematics", "measles", "media", "music", "news", "pancreas",
    "people", "physics", "pike", "police", "politics", "pollution", "rain",
    "reindeer", "research", "rhinoceros", "rice", "salmon", "scissors",
    "series", "sheep", "shrimp", "slice", "squid", "staff",
    "stamen", "subconscious", "swordfish", "tennis", "thomas", "traffic",
    "trellis", "trout", "tuna", "wealth", "welfare", "whereas",
    "wildlife", "zebrafish", "blackfish", "crayfish", "hair",
  ];

  /** Words that are already plural and end in 's'. */
  private readonly already_plural_s: string[] = [
    "acoustics", "athletics", "barracks", "bellows", "bifocals",
    "bloomers", "boots", "briefs", "castanets", "children", "clogs",
    "clothes", "crackers", "cuff-links", "cymbals", "dishes",
    "dungarees", "earmuffs", "earrings", "economics", "ethics",
    "eyebrows", "eyeglasses", "eyelashes", "eyelids", "facilities",
    "fairies", "fatigues", "feet", "flip-flops", "gaiters", "galoshes",
    "geese", "genetics", "glasses", "gloves", "goggles", "gumshoes",
    "gymnastics", "hobbies", "hops", "hydraulics", "in-laws",
    "intestines", "jeans", "jodhpurs", "kidneys", "klomps", "knickers",
    "linguistics", "maracas", "men", "mice", "moccasins", "others",
    "oxen", "pajamas", "panties", "pants", "parentheses", "cherries",
    "sandals", "savings", "shears", "shoes", "shorts", "sideburns",
    "slippers", "sneakers", "socks", "spectacles", "steps", "stockings",
    "sunglasses", "suspenders", "sweats", "sweets", "teeth", "thanks",
    "thermals", "thongs", "tights", "togs", "trousers", "underclothes",
    "underpants", "upstairs", "women", "yours",
    "yourselves", "ourselves", "themselves",
  ];

  /** Irregular plurals: singular → plural. */
  private readonly irregular: Record<string, string> = {
    child: "children", person: "people", man: "men",
    woman: "women", mouse: "mice", foot: "feet",
    tooth: "teeth", goose: "geese", ox: "oxen",
    louse: "lice", die: "dice",
    chairperson: "chairpeople", congressperson: "congresspeople",
    councilperson: "councilpeople", "ex-wife": "ex-wives",
    midwife: "midwives", worklife: "worklives",
    cactus: "cacti", focus: "foci", octopus: "octopi",
    virus: "viri", index: "indices", appendix: "appendices",
    whiskey: "whiskies",
    blouse: "blice", money: "monies", golf: "golves",
    dolman: "dolmen", "pince-nez": "pince-nezs", quartz: "quartzs",
    who: "whos",
    this: "these", that: "those",
    he: "they", she: "they", me: "us",
    we: "we", they: "they", you: "you", us: "us",
    them: "them",
    myself: "ourselves", himself: "themselves",
    herself: "themselves", itself: "themselves",
    yourself: "yourselves",
    hers: "hers", his: "his", its: "its",
    ours: "ours", theirs: "theirs",
  };

  /** Compound nouns ending in -man that take -men. */
  private readonly man_to_men: string[] = [
    "bondsman", "boogeyman", "chairman", "congressman", "councilman",
    "craftsman", "fireman", "fisherman", "lumberman", "mailman",
    "marksman", "middleman", "plowman", "policeman", "salesman",
    "snowman", "wingman", "sportsman", "workman",
  ];

  /**
   * Plurals formed by adding -s to an -ie stem (movie → movies).
   *
   * Checked as an explicit reverse dictionary lookup (step 0e) so the -ie
   * singular wins for known stems; the generic rule still covers
   * consonant + y words (babies → baby).
   */
  private readonly ies_from_ie: Record<string, string> = {
    movies: "movie", ties: "tie", pies: "pie",
    lies: "lie", dies: "die", calories: "calorie",
    cookies: "cookie", brownies: "brownie", zombies: "zombie",
    rookies: "rookie", hoodies: "hoodie", aunties: "auntie",
    cuties: "cutie", genies: "genie", smoothies: "smoothie",
    veggies: "veggie", selfies: "selfie", walkies: "walkie",
  };

  /**
   * Greek -sis nouns whose plural is -ses (analysis → analyses) — the reverse
   * lookup for the -sis → -ses rule in pluralize_single().
   */
  private readonly ses_to_sis: Record<string, string> = {
    analyses: "analysis", diagnoses: "diagnosis",
    parentheses: "parenthesis", prognoses: "prognosis",
    synopses: "synopsis", theses: "thesis", crises: "crisis",
    hypotheses: "hypothesis", emphases: "emphasis",
    neuroses: "neurosis", paralyses: "paralysis",
    scleroses: "sclerosis", apotheoses: "apotheosis",
    ellipses: "ellipsis", metamorphoses: "metamorphosis",
    mitoses: "mitosis", osmoses: "osmosis",
    psychoses: "psychosis", photosyntheses: "photosynthesis",
  };

  /**
   * Plurals whose -es suffix must be stripped whole, where only a dictionary
   * can tell them apart from -e nouns that take a plain -s
   * (license → licenses, where the 'e' must be kept):
   *
   *   - nouns ending in a single 's' (bus → buses)
   *   - the handful of -oe nouns (shoe → shoes)
   */
  private readonly es_singulars: Record<string, string> = {
    // Single-'s' stems.
    buses: "bus", gases: "gas", lenses: "lens",
    statuses: "status", aliases: "alias", viruses: "virus",
    campuses: "campus", bonuses: "bonus", pluses: "plus",
    corpuses: "corpus", octopuses: "octopus",
    cactuses: "cactus", focuses: "focus", geniuses: "genius",
    prospectuses: "prospectus", syllabuses: "syllabus",
    // -oe nouns.
    shoes: "shoe", canoes: "canoe", toes: "toe",
    hoes: "hoe", foes: "foe", oboes: "oboe",
    aloes: "aloe", woes: "woe", floes: "floe",
    throes: "throe", mistletoes: "mistletoe",
  };

  /** Words ending in -o that take -s rather than -oes. */
  private readonly o_adds_s: string[] = [
    "alto", "armadillo", "banjo", "bolero", "bongo", "bronco",
    "calico", "cappuccino", "cargo", "casino", "cello", "chino",
    "congo", "disco", "dynamo", "fresco", "gazebo", "go", "gyro",
    "hello", "helo", "judo", "jumbo", "kendo", "kimono",
    "limo", "maestro", "mambo", "metro", "mosquito", "octavo",
    "photo", "piano", "piccolo", "pinto", "polo", "silo",
    "sombrero", "soprano", "stiletto", "tempo", "torso",
    "tuxedo", "vertigo", "two", "poncho",
  ];

  /** Latin -um → -a nouns. */
  private readonly um_to_a: Record<string, string> = {
    datum: "data", millennium: "millennia", medium: "media",
    bacterium: "bacteria", curriculum: "curricula",
    memorandum: "memoranda", stratum: "strata",
  };

  /** Latin/Greek -on → -a nouns. */
  private readonly on_to_a: Record<string, string> = {
    automaton: "automata", criterion: "criteria",
    phenomenon: "phenomena",
  };

  /** f/fe → ves mappings. */
  private readonly f_to_ves: Record<string, string> = {
    leaf: "leaves", life: "lives", wife: "wives",
    knife: "knives", wolf: "wolves", shelf: "shelves",
    half: "halves", calf: "calves", elf: "elves",
    loaf: "loaves", thief: "thieves", self: "selves",
    hoof: "hooves", scarf: "scarves", wharf: "wharves",
    dwarf: "dwarves",
  };

  // ============================================
  // Public API
  // ============================================
  private plural_to_singular: Record<string, string> | null = null;
  private ves_to_f: Record<string, string> | null = null;
  private a_to_um: Record<string, string> | null = null;
  private a_to_on: Record<string, string> | null = null;

  constructor(moduleName?: string | null) {
    super(moduleName);
  }
  async index(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();

    const model = this.languageModel();
    const locale = "en";
    const builtin = model.get_builtin_catalog(locale);
    const overrides = model.read_overrides(locale);
    const catalog: LanguagePhrases = { ...builtin, ...overrides };

    const example_words = [
      "tooth",
      "child",
      "box",
      "knife",
      "sheep",
      "person",
      "category",
      "analysis",
    ];

    const data: EtTemplateData = {
      viewModule: "plural_maker",
      viewFile: "localization",
      pageTitle: "Localization Studio",
      examples: example_words.map((word) => {
        const plural = this.make_plural(word);
        return {
          singular: word,
          plural,
          round_trip: this.get_singular(plural),
        };
      }),
      locale,
      locales: this.localeList(model),
      builtin,
      catalog,
      overrides,
      csrf_token: csrf_token(),
      api_root: "/api/xhr/eterc_control-plural_maker",
    };

    return this.templates.admin(data);
  }

  // ============================================
  // Interactive pluralizer + phrasebook API
  // ============================================

  /** Convert one word or phrase in either direction. */
  async convert(): Promise<Record<string, unknown>> {
    this.securityService().make_sure_allowed();

    const input = String(post("word") ?? "").trim();
    const direction = String(post("direction") ?? "plural").toLowerCase();

    if (input === "") {
      throw new EtHttpError(400, "Enter a word to convert.");
    }
    if (input.length > MAX_WORD_LENGTH) {
      throw new EtHttpError(
        400,
        `Words and phrases must be ${MAX_WORD_LENGTH} characters or fewer.`
      );
    }

    const to_singular = direction === "singular";
    const output = to_singular
      ? this.get_singular(input)
      : this.make_plural(input);
    const round_trip = to_singular
      ? this.make_plural(output)
      : this.get_singular(output);

    return {
      ok: true,
      input,
      output,
      round_trip,
      direction: to_singular ? "singular" : "plural",
    };
  }

  /** Convert a pasted list of words, one per line. */
  async batch(): Promise<Record<string, unknown>> {
    this.securityService().make_sure_allowed();

    const raw = post("words");
    const direction = String(post("direction") ?? "plural").toLowerCase();
    const to_singular = direction === "singular";

    let words: string[] = [];
    if (Array.isArray(raw)) {
      words = raw.map((value) => String(value));
    } else {
      words = String(raw ?? "").split(/\r?\n|,/);
    }

    words = words
      .map((word) => word.trim())
      .filter((word) => word !== "")
      .slice(0, MAX_BATCH_WORDS);

    if (words.length === 0) {
      throw new EtHttpError(400, "Paste at least one word.");
    }

    const results = words.map((word) => {
      const input = word.slice(0, MAX_WORD_LENGTH);
      const output = to_singular
        ? this.get_singular(input)
        : this.make_plural(input);
      return { input, output };
    });

    return {
      ok: true,
      direction: to_singular ? "singular" : "plural",
      count: results.length,
      results,
    };
  }

  /** Load the shipped catalog and overrides for one locale. */
  async load_catalog(): Promise<Record<string, unknown>> {
    this.securityService().make_sure_allowed();

    const locale = this.validLocale(String(post("locale") ?? "en"));
    const model = this.languageModel();
    const builtin = model.get_builtin_catalog(locale);
    const overrides = model.read_overrides(locale);

    return {
      ok: true,
      locale,
      builtin,
      overrides,
      catalog: { ...builtin, ...overrides },
      locales: this.localeList(model),
    };
  }

  /** Persist phrase overrides for one locale. */
  async save_catalog(): Promise<Record<string, unknown>> {
    this.securityService().make_sure_allowed();
    this.assertCsrf();

    const locale = this.validLocale(String(post("locale") ?? "en"));
    const raw = post("phrases");
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new EtHttpError(400, "The phrase list is not valid.");
    }

    const phrases: LanguagePhrases = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      phrases[key] = String(value ?? "");
    }

    const model = this.languageModel();
    let saved: LanguagePhrases;
    try {
      saved = model.write_overrides(locale, phrases);
    } catch (error) {
      throw new EtHttpError(
        400,
        error instanceof Error ? error.message : "The phrases could not be saved."
      );
    }

    const builtin = model.get_builtin_catalog(locale);
    return {
      ok: true,
      locale,
      overrides: saved,
      builtin,
      catalog: { ...builtin, ...saved },
      locales: this.localeList(model),
    };
  }

  /** Remove all overrides for one locale. */
  async reset_catalog(): Promise<Record<string, unknown>> {
    this.securityService().make_sure_allowed();
    this.assertCsrf();

    const locale = this.validLocale(String(post("locale") ?? "en"));
    const model = this.languageModel();
    model.delete_overrides(locale);
    const builtin = model.get_builtin_catalog(locale);

    return {
      ok: true,
      locale,
      overrides: {},
      builtin,
      catalog: builtin,
      locales: this.localeList(model),
    };
  }

  private languageModel(): Language_model {
    return new Language_model("language");
  }

  private localeList(model: Language_model): string[] {
    return Array.from(
      new Set([...SHIPPED_LOCALES, ...model.list_override_locales()])
    ).sort();
  }

  private validLocale(value: string): string {
    const locale = value.trim().toLowerCase();
    if (!/^[a-z]{2}(?:-[a-z0-9]{2,8})?$/.test(locale)) {
      throw new EtHttpError(400, "Choose a valid locale such as en, es, or fr.");
    }
    return locale;
  }

  private assertCsrf(): void {
    const token = String(post("csrf_token") ?? "");
    if (!csrf_check(token)) {
      throw new EtHttpError(403, "CSRF token validation failed");
    }
  }

  private securityService(): Eterc_security {
    return (this as unknown as { eterc_security: Eterc_security })
      .eterc_security;
  }

  /**
   * Convert a singular word (or phrase) to its plural form.
   *
   * Handles multi-word names by pluralising only the last word.
   * Preserves the capitalisation pattern of the input.
   */
  make_plural(word: string): string {
    const trimmed = word.trim();

    // Handle multi-word: pluralise only the LAST word.
    const parts = trimmed.split(" ");
    if (parts.length > 1) {
      const full_lower = trimmed.toLowerCase();
      // Check if the full phrase is unchanging.
      if (this.unchanging.includes(full_lower)) {
        return trimmed;
      }
      const last = parts.pop() as string;
      parts.push(this.pluralize_single(last));
      return parts.join(" ");
    }

    return this.pluralize_single(trimmed);
  }

  /**
   * Convert a plural word (or phrase) back to its singular form.
   *
   * Handles multi-word names by singularising only the last word.
   * Preserves the capitalisation pattern of the input.
   */
  get_singular(word: string): string {
    const trimmed = word.trim();

    this.reverseLookups();

    // Handle multi-word: singularise only the LAST word.
    const parts = trimmed.split(" ");
    if (parts.length > 1) {
      const full_lower = trimmed.toLowerCase();
      // Check if the full phrase is unchanging.
      if (this.unchanging.includes(full_lower)) {
        return trimmed;
      }
      const last = parts.pop() as string;
      parts.push(this.singularize_single(last));
      return parts.join(" ");
    }

    return this.singularize_single(trimmed);
  }


  /** Pluralise a single word. */
  private pluralize_single(word: string): string {
    const lower = word.toLowerCase();

    // 0. Already plural.
    if (this.already_plural_s.includes(lower)) {
      return word;
    }

    // 1. Unchanging.
    if (this.unchanging.includes(lower)) {
      return word;
    }

    // 2. Irregulars.
    if (Object.prototype.hasOwnProperty.call(this.irregular, lower)) {
      return preserve_case(word, this.irregular[lower]);
    }

    // 3. -sis → -ses.
    if (/sis$/i.test(word)) {
      return word.slice(0, -2) + "es";
    }

    // 4. -man → -men (known compounds only).
    if (/man$/i.test(word) && this.man_to_men.includes(lower)) {
      return word.slice(0, -3) + "men";
    }

    // 5. -um → -a.
    if (/um$/i.test(word) && Object.prototype.hasOwnProperty.call(this.um_to_a, lower)) {
      return preserve_case(word, this.um_to_a[lower]);
    }

    // 6. -on → -a.
    if (/on$/i.test(word) && Object.prototype.hasOwnProperty.call(this.on_to_a, lower)) {
      return preserve_case(word, this.on_to_a[lower]);
    }

    // 7. f/fe → ves.
    if (/fe?$/i.test(word)) {
      for (const [singular, plural] of Object.entries(this.f_to_ves)) {
        if (lower === singular || lower === singular + "e") {
          return preserve_case(word, plural);
        }
      }
    }

    // 8. s, x, z, ch, sh → es.
    if (/(s|x|z|ch|sh)$/i.test(word)) {
      return preserve_case(word, lower + "es");
    }

    // 9. consonant + y → ies.
    if (/[bcdfghjklmnpqrstvwxz]y$/i.test(word)) {
      return preserve_case(word, lower.slice(0, -1) + "ies");
    }

    // 10. -o ending.
    if (/o$/i.test(word)) {
      if (this.o_adds_s.includes(lower)) {
        return word + "s";
      }
      if (/[bcdfghjklmnpqrstvwxz]o$/i.test(word)) {
        return word + "es";
      }
      return word + "s";
    }

    // 11. Default: add 's'.
    return word + "s";
  }
  private reverseLookups(): {
    plural_to_singular: Record<string, string>;
    ves_to_f: Record<string, string>;
    a_to_um: Record<string, string>;
    a_to_on: Record<string, string>;
  } {
    if (this.plural_to_singular === null) {
      this.plural_to_singular = flip(this.irregular);
      this.ves_to_f = flip(this.f_to_ves);
      this.a_to_um = flip(this.um_to_a);
      this.a_to_on = flip(this.on_to_a);
    }
    return {
      plural_to_singular: this.plural_to_singular,
      ves_to_f: this.ves_to_f as Record<string, string>,
      a_to_um: this.a_to_um as Record<string, string>,
      a_to_on: this.a_to_on as Record<string, string>,
    };
  }

  /** Derive the singular form of a single plural word. */
  private singularize_single(word: string): string {
    const lower = word.toLowerCase();
    const rev = this.reverseLookups();

    // 0. Check ALL explicit dictionary reverse lookups before unchanging.
    //    Some words (people, data, criteria) exist in both the unchanging
    //    list AND a reverse mapping — the explicit reverse wins.

    // 0a. Reverse irregular lookup.
    if (Object.prototype.hasOwnProperty.call(rev.plural_to_singular, lower)) {
      return preserve_case(word, rev.plural_to_singular[lower]);
    }

    // 0b. Reverse -ves → -f/-fe (known dictionary mappings).
    if (/ves$/i.test(word) && Object.prototype.hasOwnProperty.call(rev.ves_to_f, lower)) {
      return preserve_case(word, rev.ves_to_f[lower]);
    }

    // 0c. Reverse -a → -um (Latin).
    if (/a$/i.test(word) && Object.prototype.hasOwnProperty.call(rev.a_to_um, lower)) {
      return preserve_case(word, rev.a_to_um[lower]);
    }

    // 0d. Reverse -a → -on (Greek).
    if (/a$/i.test(word) && Object.prototype.hasOwnProperty.call(rev.a_to_on, lower)) {
      return preserve_case(word, rev.a_to_on[lower]);
    }

    // 0e. Reverse -ies → -ie (known -ie stems: movie → movies).
    if (/ies$/i.test(word) && Object.prototype.hasOwnProperty.call(this.ies_from_ie, lower)) {
      return preserve_case(word, this.ies_from_ie[lower]);
    }

    // 1. Unchanging (singular === plural).
    if (this.unchanging.includes(lower)) {
      return word;
    }

    // 2. Reverse -men → -man (known compounds only).
    if (/men$/i.test(word)) {
      const candidate = word.slice(0, -3) + "man";
      if (this.man_to_men.includes(candidate.toLowerCase())) {
        return candidate;
      }
    }

    // 3. Reverse -ses → -sis (Greek -sis stems only).
    if (Object.prototype.hasOwnProperty.call(this.ses_to_sis, lower)) {
      return preserve_case(word, this.ses_to_sis[lower]);
    }

    // 3b. -es stripped whole from known -s/-oe stems (bus → buses).
    if (Object.prototype.hasOwnProperty.call(this.es_singulars, lower)) {
      return preserve_case(word, this.es_singulars[lower]);
    }

    // 4. Reverse -ices → -ex/-ix.
    if (/ices$/i.test(word)) {
      // Try -ex ending: index → indices.
      const candidate = word.slice(0, -4) + "ex";
      // Try -ix ending: appendix → appendices.
      const candidate2 = word.slice(0, -4) + "ix";
      const lower_candidate = candidate.toLowerCase();
      const lower_candidate2 = candidate2.toLowerCase();
      // Prefer whichever exists in irregulars.
      if (Object.prototype.hasOwnProperty.call(this.irregular, lower_candidate)) {
        return candidate;
      }
      if (Object.prototype.hasOwnProperty.call(this.irregular, lower_candidate2)) {
        return candidate2;
      }
    }

    // 5. Reverse -ies → -y (consonant + y).
    if (/ies$/i.test(word) && word.length > 3) {
      return word.slice(0, -3) + "y";
    }

    // 6. Reverse -ves → -ve (general pattern).
    if (/ves$/i.test(word) && word.length > 3) {
      return word.slice(0, -1);
    }

    // 7. Reverse -oes → -o (for consonant+o words).
    if (/oes$/i.test(word) && word.length > 3) {
      const candidate = word.slice(0, -3) + "o";
      if (!this.o_adds_s.includes(candidate.toLowerCase())) {
        return candidate;
      }
    }

    // 8. Reverse -es → -∅ (stems ending in a sibilant: ss, ch, sh, x, z).
    if (/(ss|ch|sh|x|z)es$/i.test(word) && word.length > 3) {
      return word.slice(0, -2);
    }

    // 8b. Already-singular nouns ending in a bare -ss (business, address).
    if (/ss$/i.test(word) && word.length > 2) {
      return word;
    }

    // 9. Reverse -s → -∅ (default regular plural).
    if (/s$/i.test(word) && word.length > 1) {
      return word.slice(0, -1);
    }

    // 10. Default: return word as-is.
    return word;
  }
}
function preserve_case(original: string, transformed: string): string {
  if (original.length > 0 && /^[A-Z]+$/.test(original)) {
    return transformed.toUpperCase();
  }
  if (original.length > 0 && /^[A-Z]$/.test(original[0])) {
    return transformed.charAt(0).toUpperCase() + transformed.slice(1);
  }
  return transformed;
}
function flip(source: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    result[value] = key;
  }
  return result;
}
