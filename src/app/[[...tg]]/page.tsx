import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { runRequest, type TgRunResult } from "@/engine/dispatch";
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
export default async function TrongatePage({
  params,
  searchParams,
}: {
  params: Promise<{ tg?: string[] }>;
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const { tg } = await params;
  const query = await searchParams;
  const segments = tg ?? [];

  // Ensure request-time rendering before any framework code runs.
  await connection();

  let result: TgRunResult;

  try {
    result = await runRequest({ segments, query, canSetCookies: false });
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
      csrfToken={result.csrfToken}
    >
      {result.node}
    </TgUiProvider>
  );
}
