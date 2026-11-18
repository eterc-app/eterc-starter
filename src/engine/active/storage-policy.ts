/**
 * Deployment-aware storage policy.
 *
 * Local disk is only acceptable when the deployment target provides a
 * persistent filesystem (Docker/Ubuntu/Local Node). Every serverless or
 * ephemeral target must use an object-storage service; the application fails
 * closed instead of silently writing uploads to a scratch disk.
 */

export type DeploymentTarget =
  | "local"
  | "docker-vps"
  | "ubuntu"
  | "other"
  | "vercel";

const PERSISTENT_TARGETS: ReadonlySet<string> = new Set(["local", "docker-vps"]);

export interface StoragePolicy {
  deployment: DeploymentTarget;
  provider: string;
  localAllowed: boolean;
  error: string | null;
}

export class StoragePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoragePolicyError";
  }
}

function normalizeTarget(value: string | undefined): DeploymentTarget {
  const target = String(value ?? "local").trim().toLowerCase();
  if (
    target === "local" ||
    target === "docker-vps" ||
    target === "ubuntu" ||
    target === "other" ||
    target === "vercel"
  ) {
    return target;
  }
  return "other";
}

export function storage_policy(
  env: NodeJS.ProcessEnv = process.env
): StoragePolicy {
  const deployment = normalizeTarget(env.ET_DEPLOYMENT_PROVIDER);
  const provider = String(env.ET_STORAGE_PROVIDER ?? "local").trim() || "local";
  const localAllowed = PERSISTENT_TARGETS.has(deployment);
  const error =
    provider === "local" && !localAllowed
      ? `Local uploads are only allowed on the local development host and Docker deployments. ` +
        `The '${deployment}' target must use an object-storage service (S3, R2, MinIO, ` +
        "Supabase Storage, Google Cloud Storage or Azure Blob)."
      : null;
  return { deployment, provider, localAllowed, error };
}

export function assert_storage_policy(
  env: NodeJS.ProcessEnv = process.env
): StoragePolicy {
  const policy = storage_policy(env);
  if (policy.error) throw new StoragePolicyError(policy.error);
  return policy;
}

/** True when uploads may be written to the local filesystem. */
export function local_storage_allowed(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return storage_policy(env).localAllowed;
}
