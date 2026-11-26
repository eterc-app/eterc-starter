import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import semver from "semver";

const projectRoot = path.resolve(import.meta.dirname, "..");
const packagePath = path.join(projectRoot, "package.json");
const manifestPath = path.join(projectRoot, "channels.json");
const args = new Set(process.argv.slice(2));
const shouldWrite = args.has("--write");
const shouldValidate = args.has("--validate");
const shouldUpdateManifest = args.has("--manifest") || shouldWrite;
const packumentUrl = "https://registry.npmjs.org/next";
const maxPackumentBytes = 64 * 1024 * 1024;

function fail(message) {
  console.error(`channel-check: ${message}`);
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function run(command, commandArgs) {
  console.log(`channel-check: ${command} ${commandArgs.join(" ")}`);
  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    fail(`${command} ${commandArgs.join(" ")} exited with ${result.status ?? "unknown"}`);
  }
}

const starter = readJson(packagePath);
const framework = starter.eterc;
if (!framework || typeof framework !== "object") {
  fail("package.json must declare an `eterc` framework object.");
}
const channel = String(framework.channel ?? "").trim();
if (!/^\d+$/.test(channel)) {
  fail("`eterc.channel` must be a Next.js major, for example \"16\".");
}
if (typeof framework.nextRange !== "string" || !semver.validRange(framework.nextRange)) {
  fail("`eterc.nextRange` must be a valid semver range.");
}
const minimum = semver.minVersion(framework.nextRange);
if (!minimum || minimum.major !== Number(channel)) {
  fail(`\`eterc.nextRange\` does not belong to channel ${channel}.x.`);
}
const nextRange = starter.dependencies?.next ?? starter.devDependencies?.next;
if (!nextRange || !semver.validRange(nextRange)) {
  fail("package.json must declare a valid Next.js dependency range.");
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 90_000);
let packument;
try {
  const response = await fetch(packumentUrl, {
    headers: {
      Accept: "application/vnd.npm.install-v1+json",
      "User-Agent": "Eterc-Starter-Channel-Check",
    },
    signal: controller.signal,
  });
  if (!response.ok) fail(`npm registry returned HTTP ${response.status}.`);
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxPackumentBytes) {
    fail("npm registry response is larger than the safety limit.");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxPackumentBytes) {
    fail("npm registry response is larger than the safety limit.");
  }
  packument = JSON.parse(buffer.toString("utf8"));
} catch (error) {
  if (controller.signal.aborted) fail("npm registry request timed out.");
  fail(error instanceof Error ? error.message : String(error));
} finally {
  clearTimeout(timer);
}

const versions = Object.entries(packument.versions ?? {})
  .filter(([version, info]) => {
    if (semver.valid(version) !== version) return false;
    if (semver.prerelease(version)) return false;
    if (semver.major(version) !== Number(channel)) return false;
    if (!semver.satisfies(version, framework.nextRange)) return false;
    if (typeof info.deprecated === "string" && info.deprecated.trim()) return false;
    return true;
  })
  .map(([version]) => version)
  .sort(semver.rcompare);

const latest = versions[0];
if (!latest) {
  fail(`no stable Next.js ${channel}.x release satisfies ${framework.nextRange}.`);
}
if (!semver.satisfies(latest, nextRange)) {
  fail(
    `the latest Next.js ${channel}.x release (${latest}) is outside the starter dependency ` +
      `range (${nextRange}).`,
  );
}

const pinned = semver.minVersion(nextRange)?.version ?? nextRange;
console.log(`channel-check: channel ${channel}.x`);
console.log(`channel-check: latest ${latest}`);
console.log(`channel-check: pinned ${pinned}`);

let versionChanged = false;
if (pinned !== latest) {
  if (!shouldWrite) {
    fail(
      `the starter is behind ${latest}. Run \`npm run channel:update\` to pin it, ` +
        "then validate and open a PR.",
    );
  }
  starter.dependencies = starter.dependencies ?? {};
  starter.dependencies.next = latest;
  if (starter.devDependencies?.next !== undefined) {
    delete starter.devDependencies.next;
  }
  if (starter.devDependencies?.["eslint-config-next"] !== undefined) {
    starter.devDependencies["eslint-config-next"] = latest;
  }
  writeJson(packagePath, starter);
  run("npm", ["install", "--package-lock-only", "--ignore-scripts"]);
  versionChanged = true;
}

if (shouldUpdateManifest) {
  const manifest = fs.existsSync(manifestPath)
    ? readJson(manifestPath)
    : { schema: 1, generatedAt: new Date().toISOString(), channels: [] };
  if (manifest.schema !== 1 || !Array.isArray(manifest.channels)) {
    fail("channels.json is not a schema 1 manifest.");
  }
  const maximumNext = `${Number(channel) + 1}.0.0`;
  const existing = manifest.channels.find((entry) => entry.id === channel);
  const entry = {
    id: channel,
    label: existing?.label ?? `Next.js ${channel}`,
    status: existing?.status ?? "active",
    nextMajor: Number(channel),
    minimumNext: minimum.version,
    maximumNext,
    starterUrl: existing?.starterUrl ?? null,
    starterSha256: existing?.starterSha256 ?? null,
    notes:
      existing?.notes ??
      "Projects stay on this channel and receive verified patches.",
  };
  const previous = existing ? JSON.stringify(existing) : null;
  const next = JSON.stringify(entry);
  if (previous !== next) {
    if (existing) {
      Object.assign(existing, entry);
    } else {
      manifest.channels.push(entry);
    }
    manifest.generatedAt = new Date().toISOString();
    manifest.channels.sort((left, right) => Number(left.id) - Number(right.id));
    writeJson(manifestPath, manifest);
    console.log(`channel-check: updated ${path.relative(projectRoot, manifestPath)}`);
  } else {
    console.log(`channel-check: ${path.relative(projectRoot, manifestPath)} is current`);
  }
}

if (shouldValidate) {
  if (versionChanged) {
    run("npm", ["install", "--no-audit", "--no-fund"]);
  }
  run("npm", ["run", "validate"]);
}

console.log("channel-check: ok");
