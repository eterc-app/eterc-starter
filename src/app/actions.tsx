"use server";

import { redirect } from "next/navigation";
import { buildRequest, runInContext, flushResponseCookies } from "@/engine/dispatch";
import { runWithContext } from "@/engine/request-context";
import { TgHttpError, TgRedirectSignal } from "@/engine/signals";
import type { TgActionReply } from "@/engine/action-types";
import { TgUiProvider } from "@/engine/ui/TgUiProvider";

/**
 * tgSubmit — the server action behind <TgForm> and <TgButton>.
 *
 * Mirrors a Trongate POST to `{module}/{method}`: the controller runs inside a
 * full framework context and its reply replaces the calling component's
 * subtree. `redirect()` inside controller code performs real navigation.
 */
export async function tgSubmit(formData: FormData): Promise<TgActionReply> {
  const actionValue = String(formData.get("_tg_action") ?? "").trim();

  let params: Array<string | number> = [];
  try {
    const parsed: unknown = JSON.parse(String(formData.get("_tg_params") ?? "[]"));
    if (Array.isArray(parsed)) params = parsed;
  } catch {
    /* keep defaults */
  }

  let query: Record<string, string> = {};
  try {
    const parsed: unknown = JSON.parse(String(formData.get("_tg_query") ?? "{}"));
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
  const context = await buildRequest(options);

  try {
    const result = await runWithContext(context, () => runInContext(options));
    await flushResponseCookies(context);
    return {
      kind: "node",
      node: (
        <TgUiProvider
          errors={result.errors}
          flash={result.flash}
          csrfToken={result.csrfToken}
        >
          {result.node}
        </TgUiProvider>
      ),
      errors: result.errors,
      flash: result.flash,
      csrfToken: result.csrfToken,
      status: result.status,
    };
  } catch (error) {
    await flushResponseCookies(context);

    if (error instanceof TgRedirectSignal) {
      redirect(error.url);
    }
    if (error instanceof TgHttpError) {
      return { kind: "error", status: error.status, message: error.message };
    }
    throw error;
  }
}
