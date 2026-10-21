import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { run_request, type TgRunResult } from "@/engine/dispatch";
import { TgRedirectSignal } from "@/engine/signals";
import { TgUiProvider } from "@/engine/ui/TgUiProvider";

// This is a classic server-side router: every request must run on the server
// (it reads cookies/headers and dispatches dynamically), so opt the segment
// out of instant-navigation validation.
export const instant = false;

/**
 * The router entry point — every GET is addressed as
 * `{module}/{method}/{params...}` exactly like engine/Core.php.
 */
export default async function EtercPage({
  params,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>;
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const { segments = [] } = await params;
  const query = await searchParams;

  // Ensure request-time rendering before any framework code runs.
  await connection();

  let result: TgRunResult;

  try {
    result = await run_request({ segments, query, canSetCookies: false });
  } catch (error) {
    if (error instanceof TgRedirectSignal) {
      redirect(error.url);
    }
    throw error;
  }

  if (result.status === 404) {
    notFound();
  }

  return (
    <TgUiProvider
      errors={result.errors}
      flash={result.flash}
      csrf_token={result.csrf_token}
    >
      {result.node}
    </TgUiProvider>
  );
}
