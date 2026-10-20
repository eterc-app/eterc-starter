"use client";

import { useCallback, useState } from "react";
import type { UploaderModuleChoice } from "./types";
import { ChooseModStep } from "./views/choose_mod";
import { ConfGenerateUploaderStep } from "./views/conf_generate_uploader";
import { GenerateResultStep } from "./views/generate_result";

/**
 * Image Uploader Builder wizard — client driver for
 * modules/trongate_control/image_uploader_builder.
 *
 * Every step posts to the original controller method through the JSON API and
 * advances on the method's `next_step`. The views are presentational and keep
 * the original copy/markup.
 */

type Step = "choose_mod" | "conf_generate_uploader" | "generate_result";

const API_ROOT = "/api/xhr/trongate_control-image_uploader_builder";

interface StepResult extends Record<string, unknown> {
  ok?: boolean;
  success?: boolean;
  error?: string;
  message?: string;
  headline?: string;
  next_step?: string;
  modules?: UploaderModuleChoice[];
  module_label?: string;
  module_url?: string;
  uploader_details_url?: string;
}

export function ImageUploaderBuilderWizard({
  data,
}: {
  data: Record<string, unknown>;
}) {
  const initialStep = (data.initialStep as Step | undefined) ?? "choose_mod";

  const [step, setStep] = useState<Step>(initialStep);
  const [modules, setModules] = useState<UploaderModuleChoice[]>(
    Array.isArray(data.modules)
      ? (data.modules as UploaderModuleChoice[])
      : []
  );
  const [moduleLabel, setModuleLabel] = useState(
    String(data.module_label ?? "")
  );
  const [moduleUrl, setModuleUrl] = useState(String(data.module_url ?? ""));
  const [uploaderDetailsUrl, setUploaderDetailsUrl] = useState(
    String(
      data.uploader_details_url ??
        "/trongate_control-image_uploader_builder/uploader_details/web"
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

  const advance = useCallback((result: StepResult) => {
    if (Array.isArray(result.modules)) {
      setModules(result.modules as UploaderModuleChoice[]);
    }
    if (result.module_label !== undefined) {
      setModuleLabel(String(result.module_label));
    }
    if (result.module_url !== undefined) {
      setModuleUrl(String(result.module_url));
    }
    if (result.uploader_details_url !== undefined) {
      setUploaderDetailsUrl(String(result.uploader_details_url));
    }

    const next = String(result.next_step ?? "");
    if (next !== "") setStep(next as Step);
  }, []);

  /** Reset the shared wizard session and return to step 1 (PHP doReset). */
  const reset = useCallback(async () => {
    const result = await call("choose_mod");
    setStep("choose_mod");
    setModuleLabel("");
    setModuleUrl("");
    setGenerationHeadline("");
    setError("");
    if (result && Array.isArray(result.modules)) {
      setModules(result.modules as UploaderModuleChoice[]);
    }
  }, [call]);

  const selectModule = async (selected: string) => {
    const result = await call("submit_mod", { selected });
    if (result) advance(result);
  };

  const generate = async () => {
    const result = await call("run_gen", {}, true);
    if (!result) return;

    if (result.ok === false) {
      setGenerationHeadline(String(result.headline ?? "Generation Error"));
      setError(
        String(result.message ?? "The image uploader could not be created.")
      );
      setStep("generate_result");
      return;
    }

    advance(result);
    setGenerationHeadline("");
    setError("");
    setStep("generate_result");
  };

  const openDetails = () => {
    window.parent.postMessage(
      `reload_iframe:${uploaderDetailsUrl}|1000|800`,
      "*"
    );
    if (typeof window !== "undefined" && window.parent === window) {
      window.location.href = uploaderDetailsUrl;
    }
  };

  const viewModule = (url: string) => {
    if (url !== "") window.open(url, "_blank");
    setTimeout(() => {
      void reset();
    }, 1000);
  };

  switch (step) {
    case "conf_generate_uploader":
      return (
        <ConfGenerateUploaderStep
          onGenerate={generate}
          onViewDetails={openDetails}
          busy={busy}
          error={error}
        />
      );

    case "generate_result":
      return (
        <GenerateResultStep
          error={error}
          headline={generationHeadline}
          moduleLabel={moduleLabel}
          moduleUrl={moduleUrl}
          onViewModule={viewModule}
          onOkay={() => void reset()}
        />
      );

    case "choose_mod":
    default:
      return (
        <ChooseModStep
          modules={modules}
          onSelect={selectModule}
          busy={busy}
          error={error}
        />
      );
  }
}
