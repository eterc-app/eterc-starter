"use client";

import { useCallback, useState } from "react";
import type { WizardProperty } from "./Module_builder";
import { EnterModNameStep } from "./views/enter_mod_name";
import { AddNavLabelStep } from "./views/add_nav_label";
import { LetsAddPropertiesConfStep } from "./views/lets_add_properties_conf";
import { ChooseUrlColumnStep } from "./views/choose_url_column";
import { ChooseOrderByStep } from "./views/choose_order_by";
import { ConfGenerateModStep } from "./views/conf_generate_mod";
import { GenerateModuleStep } from "./views/generate_module";

/**
 * Module Builder wizard — client driver for
 * modules/trongate_control/module_builder.
 *
 * Mirrors the Flo shell flow: every step calls the original controller method
 * through the JSON API and advances on the method's response. The step views
 * are presentational and keep the original copy/markup.
 */

type Step =
  | "enter_mod_name"
  | "add_nav_label"
  | "lets_add_properties_conf"
  | "choose_url_column"
  | "choose_order_by"
  | "conf_generate_mod"
  | "generate_module";

const API_ROOT = "/api/xhr/trongate_control-module_builder";

export function ModuleBuilderWizard({ data }: { data: Record<string, unknown> }) {
  const initialStep = (data.initialStep as Step | undefined) ?? "enter_mod_name";
  const [step, setStep] = useState<Step>(initialStep);
  const [recordNamePlural, setRecordNamePlural] = useState(
    String(data.record_name_plural ?? "")
  );
  const [properties, setProperties] = useState<WizardProperty[]>(
    Array.isArray(data.properties) ? (data.properties as WizardProperty[]) : []
  );
  const [moduleUrl, setModuleUrl] = useState(
    String(data.module_url ?? "")
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(String(data.error ?? ""));
  const [moreInfoUrl, setMoreInfoUrl] = useState("");

  /**
   * POST a controller method and unwrap the JSON API envelope.
   * Returns the `data` payload, or null when the request failed.
   */
  const call = useCallback(
    async (
      method: string,
      payload: Record<string, unknown> | unknown[] = {}
    ): Promise<Record<string, unknown> | null> => {
      setBusy(true);
      setError("");

      try {
        const response = await fetch(`${API_ROOT}/${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const envelope = (await response.json()) as {
          status?: string;
          data?: Record<string, unknown> | null;
          errors?: Record<string, string[]>;
          message?: string;
          redirect?: string;
        };

        if (envelope.status === "redirect") {
          window.location.href = envelope.redirect ?? "/";
          return null;
        }

        if (envelope.status === "error") {
          setError(envelope.message ?? "The request could not be completed.");
          return null;
        }

        const result = envelope.data ?? {};
        if (result.ok === false || result.success === false) {
          setError(
            String(result.error ?? result.message ?? "The request could not be completed.")
          );
          return null;
        }

        return result;
      } catch {
        setError("A network error occurred. Please try again.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    []
  );

  /** Reset the shared wizard session and return to step 1 (PHP doReset). */
  const reset = useCallback(async () => {
    await call("enter_mod_name");
    setStep("enter_mod_name");
    setRecordNamePlural("");
    setProperties([]);
    setModuleUrl("");
    setError("");
    setMoreInfoUrl("");
  }, [call]);

  const submitModName = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await call("submit_mod_name", {
      mod_name: String(form.get("mod_name") ?? ""),
    });
    if (!result) return;

    setRecordNamePlural(String(result.record_name_plural ?? ""));
    setStep("add_nav_label");
  };

  const submitNavLabel = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await call("submit_nav_label", {
      nav_label: String(form.get("nav_label") ?? ""),
    });
    if (!result) return;
    setStep("lets_add_properties_conf");
  };

  const openPropertiesBuilder = () => {
    // Original: parent.postMessage('open_properties_builder', '*').
    window.parent.postMessage("open_properties_builder", "*");
  };

  const storeProperties = async (propertiesJson: string) => {
    setError("");

    let parsed: unknown;
    try {
      parsed = JSON.parse(propertiesJson);
    } catch {
      setError("Properties must be valid JSON.");
      return;
    }

    if (!Array.isArray(parsed)) {
      setError("Properties must be a JSON array.");
      return;
    }

    const result = await call("store_properties", parsed);
    if (!result || result.success !== true) return;

    setProperties(parsed as WizardProperty[]);
    // PHP's store_properties contract points at choose_order_by.
    setStep("choose_order_by");
  };

  const selectUrlColumn = async (selected: string) => {
    const result = await call("submit_url_col", { selected });
    if (!result) return;
    if (Array.isArray(result.properties)) {
      setProperties(result.properties as WizardProperty[]);
    }
    setStep("choose_order_by");
  };

  const selectOrderBy = async (selected: string) => {
    const result = await call("submit_order_by", { selected });
    if (!result) return;
    setError("");
    setStep("conf_generate_mod");
  };

  const generate = async () => {
    setMoreInfoUrl("");
    const result = await call("run_gen");
    if (!result) return;

    setModuleUrl(String(result.module_url ?? ""));
    setStep("generate_module");
  };

  const viewModuleDetails = () => {
    const url = "/trongate_control-module_builder/module_details/web";
    window.parent.postMessage(`reload_iframe:${url}|1000|800`, "*");
    if (typeof window !== "undefined" && window.parent === window) {
      window.location.href = url;
    }
  };

  const viewModule = () => {
    window.open(moduleUrl, "_blank");
    setTimeout(() => {
      void reset();
    }, 1000);
  };

  switch (step) {
    case "add_nav_label":
      return (
        <AddNavLabelStep
          recordNamePlural={recordNamePlural}
          onSubmit={submitNavLabel}
          busy={busy}
          error={error}
        />
      );

    case "lets_add_properties_conf":
      return (
        <LetsAddPropertiesConfStep
          initialProperties={JSON.stringify(properties)}
          onOkay={openPropertiesBuilder}
          onContinue={storeProperties}
          busy={busy}
          error={error}
        />
      );

    case "choose_url_column":
      return (
        <ChooseUrlColumnStep
          properties={properties}
          onSelect={selectUrlColumn}
          busy={busy}
        />
      );

    case "choose_order_by":
      return (
        <>
          {error ? <p className="text-destructive">{error}</p> : null}
          <ChooseOrderByStep
            properties={properties}
            onSelect={selectOrderBy}
            busy={busy}
          />
        </>
      );

    case "conf_generate_mod":
      return (
        <ConfGenerateModStep
          onGenerate={generate}
          onViewDetails={viewModuleDetails}
          busy={busy}
          error={error}
          moreInfoUrl={moreInfoUrl}
        />
      );

    case "generate_module":
      return (
        <GenerateModuleStep
          onView={viewModule}
          onOkay={() => void reset()}
        />
      );

    case "enter_mod_name":
    default:
      return (
        <EnterModNameStep
          onSubmit={submitModName}
          busy={busy}
          error={error}
        />
      );
  }
}
