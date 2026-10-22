"use server";

import { redirect } from "next/navigation";
import { build_request, run_in_context, flush_response_cookies } from "@/engine/dispatch";
import { run_with_context } from "@/engine/request-context";
import { EtHttpError, EtRedirectSignal } from "@/engine/signals";
import type { EtActionReply } from "@/engine/action-types";
import { EtUiProvider } from "@/engine/ui/EtUiProvider";

/**
 * etSubmit — the server action behind <EtForm> and <EtButton>.
 *
 * Mirrors a Eterc POST to `{module}/{method}`: the controller runs inside a
 * full framework context and its reply replaces the calling component's
 * subtree. `redirect()` inside controller code performs real navigation.
 */
export async function etSubmit(formData: FormData): Promise<EtActionReply> {
  const actionValue = String(formData.get("_et_action") ?? "").trim();

  let params: Array<string | number> = [];
  try {
    const parsed: unknown = JSON.parse(String(formData.get("_et_params") ?? "[]"));
    if (Array.isArray(parsed)) params = parsed;
  } catch {
    /* keep defaults */
  }

  let query: Record<string, string> = {};
  try {
    const parsed: unknown = JSON.parse(String(formData.get("_et_query") ?? "{}"));
    if (parsed && typeof parsed === "object") {
      query = Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
          key,
          String(value),
        ])
      );
    }
  } catch {
    /* keep defaults */
  }

  const segments = [...actionValue.split("/").filter(Boolean), ...params.map(String)];
  if (segments.length === 0) {
    return { kind: "error", status: 400, message: "No action specified." };
  }

  const options = {
    segments,
    formData,
    query,
    isAjax: true,
    canSetCookies: true,
    method: "POST",
  };
  const context = await build_request(options);

  try {
    const result = await run_with_context(context, () => run_in_context(options));
    await flush_response_cookies(context);
    return {
      kind: "node",
      node: (
        <EtUiProvider
          errors={result.errors}
          flash={result.flash}
          csrf_token={result.csrf_token}
        >
          {result.node}
        </EtUiProvider>
      ),
      errors: result.errors,
      flash: result.flash,
      csrf_token: result.csrf_token,
      status: result.status,
    };
  } catch (error) {
    await flush_response_cookies(context);

    if (error instanceof EtRedirectSignal) {
      redirect(error.url);
    }
    if (error instanceof EtHttpError) {
      return { kind: "error", status: error.status, message: error.message };
    }
    throw error;
  }
}
