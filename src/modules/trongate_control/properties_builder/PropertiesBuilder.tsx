"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AddPropertyModal } from "./AddPropertyModal";
import { PropertyAccordion } from "./PropertyAccordion";
import {
  buildInitialValidationRules,
  buildValidationRule,
  cloneCheckboxes,
  cloneValidationRules,
  collapseSpaces,
  isDigits,
  normalizeRuleLabel,
  toStoredProperties,
  validatePropertyTitle,
} from "./properties-logic";
import type {
  BuilderProperty,
  FieldsInfo,
  PropertyCheckbox,
  PropertyTypeDefinition,
  PropertyValidationRule,
  StoredProperty,
} from "./types";

/**
 * Properties Builder — port of
 * modules/trongate_control/properties_builder (views/home.php + js/properties_builder.js).
 *
 * The original was a standalone full-screen document loaded in a Flo iframe.
 * This component keeps the same state and localStorage protocol, while
 * replacing the DOM-string manipulation with React state and the Trongate/W3
 * styling with shadcn/Tailwind.
 *
 * External contract (unchanged):
 *  - `localStorage.properties` holds the reduced property list;
 *  - on submit/cancel the page writes localStorage.tempParams, localStorage.action
 *    and sets document.title, then posts `properties_submitted` or `close` to
 *    the parent window (when the page is embedded).
 */

const DEFAULT_API_BASE = "/api/xhr";
const PROPERTIES_MODULE = "trongate_control-properties";
const ADDRESS_PLACEHOLDER = "Select Address Type...";

interface ApiEnvelope<T> {
  status?: string;
  data?: T;
  message?: string;
  redirect?: string;
}

/** POST a properties-service method and unwrap the JSON API envelope. */
async function callProperties<T>(
  apiBase: string,
  method: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const response = await fetch(
    `${apiBase}/${PROPERTIES_MODULE}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  const envelope = (await response.json()) as ApiEnvelope<T>;

  if (envelope.status === "redirect") {
    if (envelope.redirect) {
      window.location.href = envelope.redirect;
    }
    throw new Error("Redirecting...");
  }

  if (envelope.status !== "ok") {
    throw new Error(
      envelope.message ?? "The properties service could not be reached."
    );
  }

  return envelope.data as T;
}

/** Original: get_last_segment() — used to detect the `/web` entry point. */
function lastPathSegment(href: string): string {
  try {
    const path = new URL(href).pathname;
    const segments = path.replace(/^\/+|\/+$/g, "").split("/");
    return segments.length > 0 ? segments[segments.length - 1] : "";
  } catch {
    return "";
  }
}

function readStoredProperties(): StoredProperty[] {
  try {
    const raw = window.localStorage.getItem("properties");
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as StoredProperty[]) : [];
  } catch {
    return [];
  }
}

function normalizeRule(value: unknown): PropertyValidationRule {
  const rule =
    value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    rule_name: String(rule.rule_name ?? ""),
    rule_label: String(rule.rule_label ?? ""),
    rule_requires_value: String(rule.rule_requires_value ?? "no"),
    rule_default_value:
      rule.rule_default_value === undefined || rule.rule_default_value === null
        ? ""
        : String(rule.rule_default_value),
    selected: String(rule.selected ?? "no"),
  };
}

function normalizeCheckbox(value: unknown): PropertyCheckbox {
  const checkbox =
    value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    name: String(checkbox.name ?? ""),
    label: String(checkbox.label ?? ""),
    checked: String(checkbox.checked ?? "no"),
  };
}

function normalizeFieldsInfo(value: unknown): FieldsInfo {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: FieldsInfo = {};

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;

    const field: PropertyTypeDefinition = {
      property_name: String(record.property_name ?? key),
      property_label: String(record.property_label ?? key),
      validation_rules: Array.isArray(record.validation_rules)
        ? record.validation_rules.map(normalizeRule)
        : [],
      default_col_size: String(record.default_col_size ?? ""),
      checkboxes: Array.isArray(record.checkboxes)
        ? record.checkboxes.map(normalizeCheckbox)
        : [],
      suggestions: Array.isArray(record.suggestions)
        ? record.suggestions.map((suggestion) => String(suggestion))
        : [],
    };

    result[key] = field;
  }

  return result;
}

/** Normalise one address_*.json row into the builder's property shape. */
function normalizeAddressProperty(value: unknown): BuilderProperty {
  const record =
    value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  const available_validation_rules = Array.isArray(
    record.availableValidationRules
  )
    ? record.availableValidationRules.map(normalizeRule)
    : [];

  const validation_rules = Array.isArray(record.validationRules)
    ? record.validationRules.map((rule) => String(rule))
    : [];

  const checkboxes = Array.isArray(record.checkboxes)
    ? record.checkboxes.map(normalizeCheckbox)
    : undefined;

  const property: BuilderProperty = {
    ...(record as Record<string, unknown>),
    propertyName: String(record.propertyName ?? ""),
    propertyType: String(record.propertyType ?? ""),
    availableValidationRules: available_validation_rules,
    validationRules: validation_rules,
    checkboxes,
  };

  return property;
}

export function PropertiesBuilder({
  apiBase = DEFAULT_API_BASE,
}: {
  apiBase?: string;
}) {
  const router = useRouter();
  const [fieldsInfo, setFieldsInfo] = useState<FieldsInfo>({});
  const [error, setError] = useState("");
  const [properties, setProperties] = useState<BuilderProperty[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [ruleOverrides, setRuleOverrides] = useState<
    Record<number, Record<number, string>>
  >({});

  const [modalMode, setModalMode] = useState<"none" | "property" | "address">(
    "none"
  );
  const [headline, setHeadline] = useState("");
  const [instructions, setInstructions] = useState<ReactNode>("");
  const [activeTypeIndex, setActiveTypeIndex] = useState(0);
  const [title, setTitle] = useState("");
  const [addressTypes, setAddressTypes] = useState<string[]>([]);
  const [addressType, setAddressType] = useState(ADDRESS_PLACEHOLDER);
  const [addressLoading, setAddressLoading] = useState(false);

  const [revealed, setRevealed] = useState(false);
  const [shuttingDown, setShuttingDown] = useState(false);
  const [shutdownDone, setShutdownDone] = useState(false);
  const [removedRows, setRemovedRows] = useState<Set<number>>(new Set());

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const usingWebApp = useRef(false);
  const addressRequestId = useRef(0);
  const shuttingDownRef = useRef(false);
  const timers = useRef<number[]>([]);

  const fieldEntries = useMemo(() => Object.entries(fieldsInfo), [fieldsInfo]);
  const activeType =
    activeTypeIndex >= 0 && activeTypeIndex < fieldEntries.length
      ? fieldEntries[activeTypeIndex][1]
      : undefined;

  const schedule = (callback: () => void, delay: number) => {
    const timer = window.setTimeout(callback, delay);
    timers.current.push(timer);
    return timer;
  };

  /* ─── Boot (original: window.onload / window load listener) ───────────── */

  useEffect(() => {
    const previousTitle = document.title;

    // The Properties Builder always starts with a clean slate. This is the
    // single source of truth the Flo parent reads on submit.
    window.localStorage.setItem("properties", "[]");
    usingWebApp.current = lastPathSegment(window.location.href) === "web";

    document.title = "Properties Builder";

    // Reveal on the next frame (the original faded in on window load). Doing
    // this in a callback keeps the effect free of synchronous state updates.
    const revealFrame = window.requestAnimationFrame(() => setRevealed(true));

    let cancelled = false;

    void (async () => {
      try {
        const data = await callProperties<unknown>(apiBase, "get_fields_info");
        if (!cancelled) {
          setFieldsInfo(normalizeFieldsInfo(data));
          setError("");
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load properties fields."
          );
        }
      }
    })();

    const timerList = timers.current;

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(revealFrame);
      for (const timer of timerList) window.clearTimeout(timer);
      timers.current = [];

      document.body.classList.remove("showbg");
      document.body.style.overflow = "";
      document.body.style.overflowY = "";
      document.title = previousTitle;
    };
  }, [apiBase]);

  /* ─── Persist the reduced property list (original: addToLocalStorage) ──── */

  useEffect(() => {
    window.localStorage.setItem(
      "properties",
      JSON.stringify(toStoredProperties(properties))
    );
  }, [properties]);

  useEffect(() => {
    document.body.style.overflowY =
      properties.length > 2 && !shuttingDown ? "auto" : "hidden";
  }, [properties.length, shuttingDown]);

  /* ─── Escape (original: document keydown listener) ─────────────────────── */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      setModalMode("none");
      addressRequestId.current++;
      window.parent.postMessage("close_properties_builder", "*");
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (modalMode === "property") {
      titleInputRef.current?.focus();
    }
  }, [modalMode]);

  /* ─── Modal openers (original: clickLeftBtn / clickAddressBtn) ─────────── */

  const openPropertyModal = (label: string, index: number) => {
    if (label === "date range") {
      const stored = readStoredProperties();
      const already_present =
        properties.some((property) => property.propertyType === "date range") ||
        stored.some((property) => property.propertyType === "date range");

      if (already_present) {
        window.alert(
          "Only one date range may be generated for a single module!"
        );
        return;
      }
    }

    addressRequestId.current++;
    setActiveTypeIndex(index);
    setHeadline(label);
    setInstructions("Enter property title then hit 'Add New Property'");
    setTitle("");
    setAddressTypes([]);
    setAddressType(ADDRESS_PLACEHOLDER);
    setAddressLoading(false);
    setModalMode("property");
  };

  const openAddressModal = async () => {
    const request_id = ++addressRequestId.current;

    setHeadline("Add Address");
    setTitle("");
    setAddressTypes([]);
    setAddressType(ADDRESS_PLACEHOLDER);
    setAddressLoading(true);
    setModalMode("address");
    setInstructions(
      <span className="relative top-12 animate-pulse">
        Fetching Address Types...
      </span>
    );

    try {
      const types = await callProperties<unknown>(
        apiBase,
        "get_address_types"
      );
      if (addressRequestId.current !== request_id) return;

      setAddressTypes(
        Array.isArray(types) ? types.map((type) => String(type)) : []
      );
      setInstructions("Choose an address type then hit 'Add Address'.");
    } catch {
      if (addressRequestId.current !== request_id) return;
      setInstructions("Unable to fetch address types.");
    } finally {
      if (addressRequestId.current === request_id) setAddressLoading(false);
    }
  };

  const closeModal = () => {
    addressRequestId.current++;
    setModalMode("none");
    setAddressLoading(false);
  };

  /* ─── Add property (original: addNewProperty) ──────────────────────────── */

  const addNewProperty = () => {
    if (!activeType) return;

    const property_title = collapseSpaces(title);
    const validation_error = validatePropertyTitle(
      property_title,
      activeType.property_label
    );

    if (validation_error !== "") {
      window.alert(validation_error);
      return;
    }

    const available_checkboxes = cloneCheckboxes(
      activeType.checkboxes ?? []
    );
    const available_validation_rules = cloneValidationRules(
      activeType.validation_rules ?? []
    );
    const validation_rules = buildInitialValidationRules(
      available_validation_rules
    );

    const new_property: BuilderProperty = {
      propertyName: property_title,
      propertyType: activeType.property_label,
      availableCheckboxes: available_checkboxes,
      availableValidationRules: available_validation_rules,
      validationRules: validation_rules,
    };

    for (const checkbox of available_checkboxes) {
      new_property[checkbox.name] = checkbox.checked;
    }

    const next = [...properties, new_property];

    setProperties(next);
    setExpanded(new Set([next.length - 1]));
    setRuleOverrides({});
    setRemovedRows(new Set());
    setModalMode("none");
    setTitle("");
  };

  /* ─── Address selection (original: requestAddressProperties/addAddress) ── */

  const addAddress = async () => {
    if (addressType === ADDRESS_PLACEHOLDER) return;

    const request_id = ++addressRequestId.current;

    setAddressTypes([]);
    setAddressLoading(true);
    setInstructions(
      <span className="relative top-12 animate-pulse">
        Fetching Address Properties...
      </span>
    );

    try {
      const rows = await callProperties<unknown>(
        apiBase,
        "get_address_data",
        { addressType }
      );
      if (addressRequestId.current !== request_id) return;

      const address_properties = Array.isArray(rows)
        ? rows.map(normalizeAddressProperty)
        : [];
      const next = [...properties, ...address_properties];

      setProperties(next);
      setExpanded(next.length > 0 ? new Set([next.length - 1]) : new Set());
      setRuleOverrides({});
      setRemovedRows(new Set());
      setModalMode("none");
      setTitle("");
    } catch {
      if (addressRequestId.current !== request_id) return;
      setInstructions("Unable to fetch address properties.");
    } finally {
      if (addressRequestId.current === request_id) setAddressLoading(false);
    }
  };

  /* ─── Accordion actions ────────────────────────────────────────────────── */

  const toggleProperty = (index: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const deleteProperty = (index: number) => {
    setProperties((current) => current.filter((_, i) => i !== index));
    setExpanded((current) => {
      const next = new Set<number>();
      for (const open_index of current) {
        if (open_index === index) continue;
        next.add(open_index > index ? open_index - 1 : open_index);
      }
      return next;
    });
    setRuleOverrides({});
    setRemovedRows(new Set());
  };

  const toggleCheckbox = (index: number, code: string) => {
    setProperties((current) =>
      current.map((property, property_index) => {
        if (property_index !== index) return property;
        return {
          ...property,
          [code]: property[code] === "yes" ? "no" : "yes",
        };
      })
    );
  };

  /* ─── Validation rules (original: addValidationRule/removeValitionRule) ── */

  const addValidationRule = (index: number, rule_label: string) => {
    if (rule_label === "") {
      window.alert("You did not select a validation rule to add.");
      return;
    }

    const property = properties[index];
    if (!property) return;

    const available_rule = property.availableValidationRules.find(
      (rule) => rule.rule_label === rule_label
    );
    if (!available_rule) return;

    const new_rule = buildValidationRule(available_rule);

    setProperties((current) =>
      current.map((candidate, property_index) => {
        if (property_index !== index) return candidate;

        return {
          ...candidate,
          validationRules: [...candidate.validationRules, new_rule],
          availableValidationRules: candidate.availableValidationRules.map(
            (rule) =>
              rule.rule_label === rule_label
                ? { ...rule, selected: "yes" }
                : rule
          ),
        };
      })
    );

    setRuleOverrides({});
  };

  const removeValidationRule = (index: number, rule_index: number) => {
    const property = properties[index];
    if (!property) return;

    const target_rule = property.validationRules[rule_index];
    if (target_rule === undefined) return;

    const rule_label = normalizeRuleLabel(target_rule);

    setProperties((current) =>
      current.map((candidate, property_index) => {
        if (property_index !== index) return candidate;

        return {
          ...candidate,
          validationRules: candidate.validationRules.filter(
            (_, position) => position !== rule_index
          ),
          availableValidationRules: candidate.availableValidationRules.map(
            (rule) =>
              rule.rule_label === rule_label
                ? { ...rule, selected: "no" }
                : rule
          ),
        };
      })
    );

    setRuleOverrides({});
  };

  /* ─── Rule value editing (original: checkValue) ────────────────────────── */

  const setOverride = (
    property_index: number,
    rule_index: number,
    value: string
  ) => {
    setRuleOverrides((current) => ({
      ...current,
      [property_index]: {
        ...(current[property_index] ?? {}),
        [rule_index]: value,
      },
    }));
  };

  const clearOverride = (property_index: number, rule_index: number) => {
    setRuleOverrides((current) => {
      const next_property = { ...(current[property_index] ?? {}) };
      delete next_property[rule_index];
      return { ...current, [property_index]: next_property };
    });
  };

  const checkValue = (index: number, rule_index: number, value: string) => {
    const property = properties[index];
    if (!property) return;

    const old_rule = property.validationRules[rule_index];
    if (old_rule === undefined) return;

    const property_type = property.propertyType;
    const got_max_length = old_rule.indexOf("max length") === 0;

    if (property_type === "decimal" && got_max_length) {
      let column_error = "";

      if (!value.includes(",")) {
        column_error = "The value needs to contain a comma.";
      } else {
        const value_bits = value.split(",");

        if (value_bits.length !== 2) {
          column_error = "The value should be two numbers separated by a comma.";
        } else {
          for (let i = 0; i < value_bits.length; i++) {
            if (value_bits[i].length === 0) {
              column_error =
                "The col length should be two numbers separated by a comma.";
            }

            if (!isDigits(value_bits[i])) {
              column_error =
                i === 0
                  ? "The string on the left hand side of the comma was not numeric."
                  : "The string on the right hand side of the comma was not numeric.";
            }
          }
        }
      }

      if (column_error !== "") {
        window.alert(column_error);
        setOverride(index, rule_index, "7,2");
        return;
      }

      const new_rule = `max length[${value}]`;

      setProperties((current) =>
        current.map((candidate, property_index) =>
          property_index === index
            ? {
                ...candidate,
                validationRules: candidate.validationRules.map(
                  (rule, position) =>
                    position === rule_index ? new_rule : rule
                ),
              }
            : candidate
        )
      );
      clearOverride(index, rule_index);
      return;
    }

    // Ordinary numeric check.
    if (!isDigits(value)) {
      window.alert("The value must numeric.");
      setOverride(index, rule_index, value.replace(/\D/g, ""));
      return;
    }

    if (value === "") {
      window.alert("The value must numeric.");

      // Resolve by rule label rather than array position: users can remove
      // rules, so validationRules[y] and availableValidationRules[y] do not
      // necessarily describe the same rule (the original indexed blindly).
      const rule_label = normalizeRuleLabel(old_rule);
      const matching_rule = property.availableValidationRules.find(
        (rule) => rule.rule_label === rule_label
      );
      const default_value =
        matching_rule?.rule_default_value ??
        property.availableValidationRules[rule_index]?.rule_default_value ??
        "";

      setOverride(index, rule_index, default_value);
      return;
    }

    const new_rule = old_rule
      .replace(/[0-9]/g, "")
      .replace("[]", `[${value}]`);

    setProperties((current) =>
      current.map((candidate, property_index) =>
        property_index === index
          ? {
              ...candidate,
              validationRules: candidate.validationRules.map((rule, position) =>
                position === rule_index ? new_rule : rule
              ),
            }
          : candidate
      )
    );
    clearOverride(index, rule_index);
  };

  /* ─── Shutdown / submit (original: submitProperties/shutdownPropertiesBuilder) ── */

  const submitProperties = (button_type: "submit" | "cancel") => {
    if (shuttingDownRef.current) return;
    shuttingDownRef.current = true;

    setShuttingDown(true);

    // The Flo parent reads this list from localStorage.
    window.localStorage.setItem(
      "properties",
      JSON.stringify(toStoredProperties(properties))
    );
    window.localStorage.setItem(
      "tempParams",
      JSON.stringify({ previousAction: "submitProperties" })
    );
    window.localStorage.setItem("action", "closeSecondaryWindow");
    document.title = "1";

    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];

    const total = properties.length;

    for (let offset = 0; offset < total; offset++) {
      const row_index = total - 1 - offset;
      schedule(() => {
        setRemovedRows((current) => new Set(current).add(row_index));
      }, (offset + 1) * 24);
    }

    schedule(() => {
      setShutdownDone(true);
      document.body.style.overflow = "hidden";
    }, Math.max(total, 1) * 24);

    schedule(() => {
      if (usingWebApp.current && window.parent !== window) {
        window.parent.postMessage(
          button_type === "submit" ? "properties_submitted" : "close",
          "*"
        );
      } else if (window.parent === window) {
        // Port-only fallback: the dashboard links directly to this page, so
        // return there when the builder is not running inside the iframe.
        router.replace("/trongate_control");
      }
    }, 1200);
  };

  /* ─── Render ───────────────────────────────────────────────────────────── */

  const suggestions =
    modalMode === "property" && activeType !== undefined
      ? activeType.suggestions
      : [];

  // Original shutdownPropertiesBuilder() keeps the close buttons visible while
  // rows are removed one by one, then hideCloseBtns() hides them.
  const closeButtonsVisible = properties.length > 0 && !shutdownDone;

  return (
    <div
      id="particles-div"
      className={cn(
        "transition-opacity duration-500",
        revealed ? "opacity-100" : "pointer-events-none opacity-0"
      )}
    >
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside
          className={cn(
            "space-y-3 transition-opacity",
            revealed && !shuttingDown ? "opacity-100" : "opacity-50"
          )}
        >
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Properties Fields
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose a field to add it to the module.
            </p>
          </div>

          <div className="space-y-2" id="properties_fields">
            {fieldEntries.map(([key, field], index) => (
              <Button
                key={key}
                type="button"
                variant="outline"
                onClick={() => openPropertyModal(field.property_label, index)}
                className="w-full justify-start"
              >
                {field.property_label}
              </Button>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() => void openAddressModal()}
              className="w-full justify-start"
            >
              Address
            </Button>
          </div>

          {error !== "" ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </aside>

        <section className="min-w-0 space-y-4 text-center">
          <div className="space-y-1 text-center">
            <h2 className="text-xl font-semibold tracking-tight">
              Properties Builder
            </h2>
            <p className="text-sm text-muted-foreground">
              Click a property field to add a new property.
            </p>
          </div>

          <div id="current-properties" className="space-y-3 text-left">
            {properties.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/20 px-6 py-10 text-center text-sm text-muted-foreground">
                No properties yet. Select a field on the left to begin.
              </div>
            ) : null}
            {properties.map((property, index) =>
              removedRows.has(index) ? null : (
                <PropertyAccordion
                  key={index}
                  property={property}
                  index={index}
                  expanded={expanded.has(index)}
                  overrides={ruleOverrides[index] ?? {}}
                  onToggle={() => toggleProperty(index)}
                  onDelete={() => deleteProperty(index)}
                  onAddRule={(rule_label) => addValidationRule(index, rule_label)}
                  onRemoveRule={(rule_index) =>
                    removeValidationRule(index, rule_index)
                  }
                  onCheckValue={(rule_index, value) =>
                    checkValue(index, rule_index, value)
                  }
                  onToggleCheckbox={(code) => toggleCheckbox(index, code)}
                />
              )
            )}
          </div>

          {closeButtonsVisible ? (
            <div className="flex flex-col justify-center gap-2 border-t pt-4 sm:flex-row">
              <Button
                type="button"
                onClick={() => submitProperties("submit")}
                id="submit-btn"
              >
                {properties.length < 2
                  ? "Submit Property"
                  : "Submit Properties"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => submitProperties("cancel")}
              >
                Cancel &amp; Close
              </Button>
            </div>
          ) : null}

          <AddPropertyModal
            mode={modalMode}
            headline={headline}
            instructions={instructions}
            title={title}
            suggestions={suggestions}
            onTitleChange={setTitle}
            onAddProperty={addNewProperty}
            addressTypes={addressTypes}
            addressType={addressType}
            addressLoading={addressLoading}
            onAddressTypeChange={setAddressType}
            onAddAddress={() => void addAddress()}
            onClose={closeModal}
            titleInputRef={titleInputRef}
          />
        </section>
      </div>
    </div>
  );
}
