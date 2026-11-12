/**
 * Start background services once per Next.js server process.
 *
 * The embedded flow scheduler is disabled on serverless platforms and can be
 * disabled with FLOWS_ENABLED=0 or FLOW_RUNTIME=worker|serverless.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { boot_flow_runtime } = await import("@/modules/flows/flow-runtime");
  await boot_flow_runtime();
}
