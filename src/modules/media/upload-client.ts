"use client";

export interface UploadInitAsset {
  id: string;
  status: string;
  kind: "image" | "file";
  folder: string;
  visibility: "public" | "private";
  original_name: string;
  mime: string;
  max_bytes: number;
  expires_at: number;
}

export interface UploadTarget {
  url: string;
  method: "PUT" | "POST";
  headers: Record<string, string>;
  fields?: Record<string, string>;
  expires_at: string;
}

export interface UploadInitResponse {
  asset: UploadInitAsset;
  upload: UploadTarget;
}

export interface UploadedAsset {
  id: string;
  file: string;
  original_name: string;
  title: string;
  alt: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  created_at: string;
  url: string;
  thumbnail_url: string;
  has_thumbnail: boolean;
  visibility: "public" | "private";
  folder: string;
  kind: "image" | "file";
}

interface Envelope {
  status?: string;
  data?: unknown;
  message?: string;
  redirect?: string;
}

async function post_json(
  url: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let envelope: Envelope;
  try {
    envelope = (await response.json()) as Envelope;
  } catch {
    throw new Error("The upload service returned an invalid response.");
  }
  if (envelope.status === "redirect") {
    window.location.assign(String(envelope.redirect ?? "/"));
    throw new Error("Redirecting...");
  }
  if (!response.ok || envelope.status === "error") {
    throw new Error(
      String(envelope.message ?? "The upload could not be completed.")
    );
  }
  const data = envelope.data;
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return envelope as Record<string, unknown>;
}

function absolute(url: string): string {
  try {
    return new URL(url, window.location.origin).href;
  } catch {
    throw new Error("The upload target is invalid.");
  }
}

function send_bytes(
  target: UploadTarget,
  file: File,
  on_progress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = absolute(target.url);
    xhr.open(target.method, url);
    xhr.responseType = "text";

    for (const [name, value] of Object.entries(target.headers ?? {})) {
      try {
        xhr.setRequestHeader(name, value);
      } catch {
        /* some browser-managed headers cannot be set */
      }
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !on_progress) return;
      on_progress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let message = `Storage rejected the upload (HTTP ${xhr.status}).`;
      try {
        const parsed = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        message = parsed.message ?? parsed.error ?? message;
      } catch {
        /* keep the HTTP message */
      }
      reject(new Error(message));
    };
    xhr.onerror = () =>
      reject(new Error("The upload could not reach the storage service."));
    xhr.ontimeout = () => reject(new Error("The upload timed out."));
    xhr.timeout = 120_000;

    const abort = () => {
      xhr.abort();
      reject(new Error("The upload was cancelled."));
    };
    if (signal) {
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
    }

    if (target.method === "POST" && target.fields) {
      const body = new FormData();
      for (const [name, value] of Object.entries(target.fields)) {
        body.append(name, value);
      }
      body.append("file", file);
      xhr.send(body);
    } else {
      xhr.send(file);
    }
  });
}

function asset_from_payload(payload: Record<string, unknown>): UploadedAsset {
  if (payload.media !== null && typeof payload.media === "object") {
    return payload.media as UploadedAsset;
  }
  if (payload.asset !== null && typeof payload.asset === "object") {
    return payload.asset as UploadedAsset;
  }
  return payload as unknown as UploadedAsset;
}

/**
 * Three-step upload: init (server validation + presigned target), direct PUT to
 * storage, then complete (server verification + variants). Works identically
 * for local relay and remote object storage.
 */
export async function upload_asset(input: {
  apiRoot: string;
  csrfToken: string;
  file: File;
  kind: "image" | "file";
  folder?: string;
  visibility?: "public" | "private";
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}): Promise<UploadedAsset> {
  if (!input.csrfToken) {
    throw new Error("The upload security token is missing. Refresh and try again.");
  }
  if (input.file.size <= 0) {
    throw new Error("The selected file is empty.");
  }

  const init = (await post_json(`${input.apiRoot}/asset_init`, {
    csrf_token: input.csrfToken,
    kind: input.kind,
    name: input.file.name,
    content_type: input.file.type,
    size: input.file.size,
    folder: input.folder ?? "",
    visibility: input.visibility ?? "public",
  })) as unknown as UploadInitResponse;

  if (!init?.asset?.id || !init?.upload?.url) {
    throw new Error("The upload service did not return a target.");
  }

  await send_bytes(init.upload, input.file, input.onProgress, input.signal);

  const completed = await post_json(`${input.apiRoot}/asset_complete`, {
    csrf_token: input.csrfToken,
    asset_id: init.asset.id,
  });
  return asset_from_payload(completed);
}
