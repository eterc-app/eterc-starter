import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "eterc-uploads-"));
const sourceDb = path.join(projectRoot, "prisma", "dev.db");
const tempDb = path.join(temp, "dev.db");
fs.copyFileSync(sourceDb, tempDb);
for (const suffix of ["-wal", "-shm"]) {
  const sidecar = `${sourceDb}${suffix}`;
  if (fs.existsSync(sidecar)) fs.copyFileSync(sidecar, `${tempDb}${suffix}`);
}

process.env.ET_SQLITE_FILE = tempDb;
process.env.ET_DATABASE_PROVIDER = "sqlite";
process.env.ET_DATA_DIR = path.join(temp, "data");
process.env.ET_UPLOADS_DIR = path.join(temp, "uploads");
process.env.ET_STORAGE_PROVIDER = "local";
process.env.ET_DEPLOYMENT_PROVIDER = "docker-vps";
process.env.ET_MEDIA_MAX_IMAGE_MB = "2";
process.env.ET_MEDIA_MAX_FILE_MB = "2";
process.env.ET_MEDIA_UPLOADS_PER_HOUR = "0";
process.env.ET_SECRET = crypto.randomBytes(32).toString("hex");

const sharp = (await import("sharp")).default;
const service = await import("../src/modules/media/upload-service");
const registry = await import("../src/modules/media/media-registry");
const policy = await import("../src/engine/active/storage-policy");
const providerModule = await import("../src/engine/active/storage-provider");
import type { CmsPrincipal } from "../src/modules/cms/cms-types";

const principal: CmsPrincipal = {
  kind: "user",
  role: {
    id: 1,
    user_level_id: 1,
    name: "Admin",
    slug: "admin",
    description: "",
    app_access: true,
    api_access: true,
    admin_access: true,
    is_system: true,
    parent_role_id: null,
    created_at: 0,
    updated_at: 0,
  },
  user_id: 1,
  user_email: "admin@example.com",
  user_username: "admin",
  api_key_id: null,
  label: "Admin",
};

function assertRejects(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  return promise.then(
    () => {
      throw new Error(`Expected rejection matching ${pattern}`);
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, pattern);
    },
  );
}

async function upload_image(input: {
  filename: string;
  bytes: Buffer;
  visibility: "public" | "private";
  mime?: string;
}) {
  const init = await service.init_upload({
    principal,
    kind: "image",
    filename: input.filename,
    content_type: input.mime ?? "image/png",
    size: input.bytes.byteLength,
    folder: "",
    visibility: input.visibility,
  });
  const token = init.upload.headers["x-upload-token"];
  assert.ok(token, "local uploads must receive an upload token");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(input.bytes));
      controller.close();
    },
  });
  await service.receive_local_upload({
    token,
    stream,
    contentLength: input.bytes.byteLength,
  });
  return await service.complete_upload({
    principal,
    asset_id: init.asset.id,
  });
}

await service.ensure_uploads_ready();

const png = await sharp({
  create: {
    width: 32,
    height: 24,
    channels: 3,
    background: { r: 30, g: 90, b: 160 },
  },
})
  .png()
  .toBuffer();

const privateImage = await upload_image({
  filename: "private-photo.png",
  bytes: png,
  visibility: "private",
});
assert.equal(privateImage.asset.status, "ready");
assert.equal(privateImage.asset.visibility, "private");
assert.match(privateImage.asset.url, /^\/api\/media\/download\//);
assert.ok(privateImage.asset.variants.length >= 1, "thumbnail variant expected");
const privatePath = path.join(
  temp,
  "data",
  "private-uploads",
  privateImage.asset.object_key.replace(/^private\//, ""),
);
assert.ok(fs.existsSync(privatePath), "private bytes must not live under public/uploads");

const publicImage = await upload_image({
  filename: "public-photo.png",
  bytes: png,
  visibility: "public",
});
assert.equal(publicImage.asset.status, "ready");
assert.match(publicImage.asset.url, /^\/uploads\//);
assert.ok(
  fs.existsSync(path.join(temp, "uploads", publicImage.asset.object_key)),
  "public bytes must be published under public/uploads",
);

const dedupe = await upload_image({
  filename: "public-copy.png",
  bytes: png,
  visibility: "public",
});
assert.equal(dedupe.deduplicated, true, "identical bytes should deduplicate");
assert.equal(dedupe.asset.id, publicImage.asset.id);

const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");
const document = await service.init_upload({
  principal,
  kind: "file",
  filename: "contract.pdf",
  content_type: "application/pdf",
  size: pdf.byteLength,
  folder: "documents",
  visibility: "public",
});
const documentToken = document.upload.headers["x-upload-token"] ?? "";
const documentStream = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new Uint8Array(pdf));
    controller.close();
  },
});
await service.receive_local_upload({
  token: documentToken,
  stream: documentStream,
  contentLength: pdf.byteLength,
});
const documentAsset = await service.complete_upload({
  principal,
  asset_id: document.asset.id,
});
assert.equal(documentAsset.asset.status, "ready");
assert.equal(documentAsset.asset.kind, "file");

await assertRejects(
  service.init_upload({
    principal,
    kind: "image",
    filename: "too-big.png",
    content_type: "image/png",
    size: 3 * 1024 * 1024,
    folder: "",
    visibility: "public",
  }),
  /too large/i,
);
await assertRejects(
  service.init_upload({
    principal,
    kind: "file",
    filename: "payload.html",
    content_type: "text/html",
    size: 10,
    folder: "",
    visibility: "public",
  }),
  /not supported/i,
);
await assertRejects(
  service.init_upload({
    principal,
    kind: "image",
    filename: "escape.png",
    content_type: "image/png",
    size: png.byteLength,
    folder: "../escape",
    visibility: "public",
  }),
  /(invalid|unsafe|folder)/i,
);

const spoof = await service.init_upload({
  principal,
  kind: "image",
  filename: "spoof.png",
  content_type: "image/png",
  size: 64,
  folder: "",
  visibility: "public",
});
const spoofStream = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new TextEncoder().encode("<html><script>alert(1)</script>"));
    controller.close();
  },
});
await service.receive_local_upload({
  token: spoof.upload.headers["x-upload-token"] ?? "",
  stream: spoofStream,
  contentLength: 64,
});
await assertRejects(
  service.complete_upload({ principal, asset_id: spoof.asset.id }),
  /supported image|not a supported/i,
);

const download = await service.download_upload({
  principal: { ...principal, role: { ...principal.role, admin_access: false } },
  key: privateImage.asset.object_key,
});
assert.ok("file" in download || "redirect" in download);

await service.delete_upload({
  principal,
  asset_id: privateImage.asset.id,
});
assert.equal(await providerModule.activeStorageProvider.exists(privateImage.asset.object_key), false);
assert.equal(
  fs.existsSync(path.join(temp, "uploads", publicImage.asset.object_key)),
  true,
);

const previousTarget = process.env.ET_DEPLOYMENT_PROVIDER;
process.env.ET_DEPLOYMENT_PROVIDER = "ubuntu";
assert.throws(() => policy.assert_storage_policy(), /only allowed/i);
const health = await providerModule.activeStorageProvider.healthCheck?.();
assert.equal(health?.ok, false);
process.env.ET_DEPLOYMENT_PROVIDER = previousTarget;

const tampered = `${documentToken.split(".")[0]}.deadbeef`;
await assertRejects(
  service.receive_local_upload({
    token: tampered,
    stream: new ReadableStream({ start(controller) { controller.close(); } }),
  }),
  /invalid/i,
);

const stats = await registry.list_media_items("image");
assert.ok(stats.some((item) => item.file === path.basename(publicImage.asset.object_key)));

console.log("✓ uploads integration checks passed");
try {
  fs.rmSync(temp, { recursive: true, force: true });
} catch {
  /* SQLite keeps the temp DB open until the process exits */
}
