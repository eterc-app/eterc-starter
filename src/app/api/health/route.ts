import { NextResponse } from "next/server";
import { activeAuthProvider } from "@/engine/active/auth-provider";
import { activeCacheProvider } from "@/engine/active/cache-provider";
import { activeDbAdapter } from "@/engine/active/db-adapter";
import { activeQueueProvider } from "@/engine/active/queue-provider";
import { activeStorageProvider } from "@/engine/active/storage-provider";

export async function GET() {
  const checks = await Promise.all([
    activeDbAdapter.ping().then((ok) => ({
      name: "database",
      ok,
      message: ok ? "SQLite responded." : "SQLite did not respond.",
    })),
    (activeAuthProvider.healthCheck?.() ?? Promise.resolve({ ok: true, message: "No probe." })).then(
      (check) => ({ name: "auth", ...check }),
    ),
    (activeStorageProvider.healthCheck?.() ?? Promise.resolve({ ok: true, message: "No probe." })).then(
      (check) => ({ name: "storage", ...check }),
    ),
    (activeCacheProvider.healthCheck?.() ?? Promise.resolve({ ok: true, message: "No probe." })).then(
      (check) => ({ name: "cache", ...check }),
    ),
    (activeQueueProvider.healthCheck?.() ?? Promise.resolve({ ok: true, message: "No probe." })).then(
      (check) => ({ name: "jobs", ...check }),
    ),
  ]);

  const ok = checks.every((check) => check.ok);
  return NextResponse.json(
    {
      ok,
      service: "eterc",
      stack: {
        auth: activeAuthProvider.id,
        database: activeDbAdapter.dialect,
        cache: activeCacheProvider.id,
        jobs: activeQueueProvider.id,
        storage: activeStorageProvider.id,
      },
      checks,
      checkedAt: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
