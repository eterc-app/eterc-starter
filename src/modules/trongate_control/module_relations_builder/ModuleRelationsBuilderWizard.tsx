"use client";

import { useCallback, useState } from "react";
import type {
  RelationModuleChoice,
  RelationsWizard,
} from "./types";
import { ChooseRelationTypeStep } from "./views/choose_relation_type";
import { SelectModuleStep } from "./views/select_module";
import { BridgingQuestionStep } from "./views/bridging_question";
import { ConfGenerateRelationStep } from "./views/conf_generate_relation";
import { GenerateRelationStep } from "./views/generate_relation";

/**
 * Module Relations Builder wizard — client driver for
 * modules/trongate_control/module_relations_builder.
 *
 * Every step posts to the original controller method through the JSON API and
 * advances on the method's `next_step`. The views are presentational and keep
 * the original copy/markup.
 */

type Step =
  | "choose_relation_type"
  | "select_module"
  | "bridging_question"
  | "conf_generate_relation"
  | "generate_relation";

const API_ROOT = "/api/xhr/trongate_control-module_relations_builder";

interface StepResult extends Record<string, unknown> {
  ok?: boolean;
  success?: boolean;
  error?: string;
  message?: string;
  headline?: string;
  next_step?: string;
  heading?: string;
  submit_method?: string;
  modules?: RelationModuleChoice[];
  wizard?: RelationsWizard;
  parent_label?: string;
  child_label?: string;
  module_a_manage_url?: string;
  module_b_manage_url?: string;
  relation_details_url?: string;
}

export function ModuleRelationsBuilderWizard({
  data,
}: {
  data: Record<string, unknown>;
}) {
  const initialStep = (data.initialStep as Step | undefined) ??
    "choose_relation_type";

  const [step, setStep] = useState<Step>(initialStep);
  const [wizard, setWizard] = useState<RelationsWizard>(
    (data.wizard ?? {}) as RelationsWizard
  );
  const [modules, setModules] = useState<RelationModuleChoice[]>(
    Array.isArray(data.modules)
      ? (data.modules as RelationModuleChoice[])
      : []
  );
  const [heading, setHeading] = useState(String(data.heading ?? ""));
  const [submitMethod, setSubmitMethod] = useState(
    String(data.submit_method ?? "submit_parent")
  );
  const [parentLabel, setParentLabel] = useState(
    String(data.parent_label ?? "")
  );
  const [childLabel, setChildLabel] = useState(
    String(data.child_label ?? "")
  );
  const [moduleAManageUrl, setModuleAManageUrl] = useState(
    String(data.module_a_manage_url ?? "")
  );
  const [moduleBManageUrl, setModuleBManageUrl] = useState(
    String(data.module_b_manage_url ?? "")
  );
  const [relationDetailsUrl, setRelationDetailsUrl] = useState(
    String(
      data.relation_details_url ??
        "/trongate_control-module_relations_builder/relation_details/web"
    )
  );
  const [generationHeadline, setGenerationHeadline] = useState(
    String(data.headline ?? "")
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(String(data.error ?? ""));

  /**
   * POST a controller method and unwrap the JSON API envelope.
   * Returns the `data` payload, or null when the request failed.
   */
  const call = useCallback(
    async (
      method: string,
      payload: Record<string, unknown> = {},
      allowFailure = false
    ): Promise<StepResult | null> => {
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
          data?: StepResult | null;
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
        if (
          !allowFailure &&
          (result.ok === false || result.success === false)
        ) {
          setError(
            String(
              result.error ??
                result.message ??
                "The request could not be completed."
            )
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

  /** Merge the server step payload into local state and follow next_step. */
  const advance = useCallback(
    (result: StepResult) => {
      if (result.wizard) setWizard(result.wizard);
      if (result.heading !== undefined) setHeading(String(result.heading));
      if (result.submit_method !== undefined) {
        setSubmitMethod(String(result.submit_method));
      }
      if (Array.isArray(result.modules)) {
        setModules(result.modules as RelationModuleChoice[]);
      }
      if (result.parent_label !== undefined) {
        setParentLabel(String(result.parent_label));
      }
      if (result.child_label !== undefined) {
        setChildLabel(String(result.child_label));
      }
      if (result.module_a_manage_url !== undefined) {
        setModuleAManageUrl(String(result.module_a_manage_url));
      }
      if (result.module_b_manage_url !== undefined) {
        setModuleBManageUrl(String(result.module_b_manage_url));
      }
      if (result.relation_details_url !== undefined) {
        setRelationDetailsUrl(String(result.relation_details_url));
      }

      const next = String(result.next_step ?? "");
      if (next !== "") setStep(next as Step);
    },
    []
  );

  /** Reset the shared wizard session and return to step 1 (PHP doReset). */
  const reset = useCallback(async () => {
    await call("choose_relation_type");
    setStep("choose_relation_type");
    setWizard({});
    setModules([]);
    setHeading("");
    setSubmitMethod("submit_parent");
    setParentLabel("");
    setChildLabel("");
    setModuleAManageUrl("");
    setModuleBManageUrl("");
    setGenerationHeadline("");
    setError("");
  }, [call]);

  const selectRelationType = async (selected: string) => {
    const result = await call("submit_relation_type", { selected });
    if (result) advance(result);
  };

  const selectModule = async (selected: string) => {
    const result = await call(submitMethod, { selected });
    if (result) advance(result);
  };

  const selectBridgingOption = async (selected: string) => {
    const result = await call("submit_bridging_option", { selected });
    if (result) advance(result);
  };

  const generate = async () => {
    const result = await call("run_gen", {}, true);
    if (!result) return;

    if (result.ok === false) {
      setGenerationHeadline(
        String(result.headline ?? "Generation Error")
      );
      setError(String(result.message ?? "The relation could not be created."));
      setStep("generate_relation");
      return;
    }

    advance(result);
    setGenerationHeadline("");
    setError("");
    setStep("generate_relation");
  };

  const openDetails = () => {
    window.parent.postMessage(
      `reload_iframe:${relationDetailsUrl}|1000|800`,
      "*"
    );
    if (typeof window !== "undefined" && window.parent === window) {
      window.location.href = relationDetailsUrl;
    }
  };

  const viewModule = (url: string) => {
    if (url !== "") window.open(url, "_blank");
    setTimeout(() => {
      void reset();
    }, 1000);
  };

  switch (step) {
    case "select_module":
      return (
        <SelectModuleStep
          heading={heading || "Select Module"}
          modules={modules}
          onSelect={selectModule}
          busy={busy}
          error={error}
        />
      );

    case "bridging_question":
      return (
        <BridgingQuestionStep
          wizard={wizard}
          onSelect={selectBridgingOption}
          busy={busy}
          error={error}
        />
      );

    case "conf_generate_relation":
      return (
        <ConfGenerateRelationStep
          onGenerate={generate}
          onViewDetails={openDetails}
          busy={busy}
          error={error}
        />
      );

    case "generate_relation":
      return (
        <GenerateRelationStep
          error={error}
          headline={generationHeadline}
          parentLabel={parentLabel}
          childLabel={childLabel}
          moduleAManageUrl={moduleAManageUrl}
          moduleBManageUrl={moduleBManageUrl}
          onViewModule={viewModule}
          onOkay={() => void reset()}
        />
      );

    case "choose_relation_type":
    default:
      return (
        <ChooseRelationTypeStep
          onSelect={selectRelationType}
          busy={busy}
          error={error}
        />
      );
  }
}
