import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { run_request, type EtRunResult } from "@/engine/dispatch";
import { EtRedirectSignal } from "@/engine/signals";
import { EtUiProvider } from "@/engine/ui/EtUiProvider";

// This is a classic server-side router: every request must run on the server
// (it reads cookies/headers and dispatches dynamically), so opt the segment
// out of instant-navigation validation.
export const instant = false;
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

  let result: EtRunResult;

  try {
    result = await run_request({ segments, query, canSetCookies: false });
  } catch (error) {
    if (error instanceof EtRedirectSignal) {
      redirect(error.url);
    }
    throw error;
  }

  if (result.status === 404) {
    notFound();
  }

  return (
    <EtUiProvider
      errors={result.errors}
      flash={result.flash}
      csrf_token={result.csrf_token}
    >
      {result.node}
    </EtUiProvider>
  );
}
