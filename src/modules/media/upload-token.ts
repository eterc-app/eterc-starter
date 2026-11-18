import crypto from "node:crypto";

export interface UploadTokenPayload {
  v: 1;
  assetId: string;
  userId: number;
  kind: "image" | "file";
  key: string;
  maxBytes: number;
  mime: string;
  visibility: "public" | "private";
  exp: number;
}

function secret(): Buffer {
  const env = process.env.ET_SECRET;
  if (env && env.length >= 16) {
    return crypto.createHash("sha256").update(`upload:${env}`).digest();
  }
  return crypto
    .createHash("sha256")
    .update("eterc-dev-upload-secret")
    .digest();
}

function base64url(value: Buffer): string {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

function sign(payload: string): string {
  return base64url(crypto.createHmac("sha256", secret()).update(payload).digest());
}

export function create_upload_token(
  payload: Omit<UploadTokenPayload, "v" | "exp">,
  ttlSeconds = 900
): { token: string; expiresAt: string } {
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, ttlSeconds);
  const body: UploadTokenPayload = { v: 1, ...payload, exp };
  const encoded = base64url(Buffer.from(JSON.stringify(body), "utf8"));
  return {
    token: `${encoded}.${sign(encoded)}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export type UploadTokenResult =
  | { ok: true; payload: UploadTokenPayload }
  | { ok: false; error: string };

export function verify_upload_token(token: string): UploadTokenResult {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, error: "The upload token is malformed." };
  }
  const [encoded, signature] = parts;
  const expected = sign(encoded);
  try {
    if (
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      return { ok: false, error: "The upload token is invalid." };
    }
  } catch {
    return { ok: false, error: "The upload token is invalid." };
  }

  let payload: UploadTokenPayload;
  try {
    payload = JSON.parse(fromBase64url(encoded).toString("utf8")) as UploadTokenPayload;
  } catch {
    return { ok: false, error: "The upload token is invalid." };
  }

  if (
    payload.v !== 1 ||
    typeof payload.assetId !== "string" ||
    typeof payload.key !== "string" ||
    typeof payload.userId !== "number" ||
    (payload.kind !== "image" && payload.kind !== "file") ||
    (payload.visibility !== "public" && payload.visibility !== "private") ||
    typeof payload.maxBytes !== "number" ||
    typeof payload.exp !== "number"
  ) {
    return { ok: false, error: "The upload token is invalid." };
  }

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    return { ok: false, error: "The upload token has expired." };
  }

  return { ok: true, payload };
}
