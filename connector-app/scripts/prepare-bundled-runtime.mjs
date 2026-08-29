// Bundles the exact Node runtime that runs this script, plus a real
// Playwright Chromium, directly into the app's resources — the same
// self-contained technique ReelForge Internal already ships in production.
// A VA installing ReelForge Connector never needs Node, npm, or Playwright
// on their own machine.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const root = process.cwd();
const runtimeDir = path.join(root, "runtime");
const bundledNode = path.join(runtimeDir, "node");

fs.mkdirSync(runtimeDir, { recursive: true });

console.log("ReelForge Connector bundled runtime preflight");
console.log("----------------------------------------------");

fs.copyFileSync(process.execPath, bundledNode);
try {
  fs.chmodSync(bundledNode, 0o755);
} catch {}
console.log(`✓ Bundled Node runtime: ${bundledNode}`);

// macOS never bundles a downloaded Chromium — Apple's notarization service
// consistently rejects Chromium's own nested Framework as invalidly signed,
// independent of how carefully it's re-signed (a known limitation, not
// something fixable on our end). Research on macOS instead drives the VA's
// own already-installed Google Chrome via Playwright's `channel: "chrome"`
// (see connect-worker.mjs/session-server.mjs's IS_MAC), so no local browser
// needs to be downloaded or packaged at all. The playwright/playwright-core
// npm packages are still bundled (via tauri.conf.json's resources) since
// their JS API is what actually drives real Chrome — only the browser
// binary download is skipped. Windows is untouched.
if (process.platform === "darwin") {
  console.log("macOS: Research drives the VA's own installed Google Chrome — skipping bundled Chromium download.");
  console.log("✓ Self-contained ReelForge Connector runtime is ready.");
  process.exit(0);
}

const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: "0" };

console.log("Ensuring Playwright Chromium is installed for bundling...");
execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["playwright", "install", "chromium"],
  { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" }
);

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const executable = chromium.executablePath();

if (!executable || !fs.existsSync(executable)) {
  throw new Error(`Chromium preflight failed. Expected executable at: ${executable || "(empty)"}`);
}
console.log(`✓ Bundled Chromium executable: ${executable}`);

const coreDir = path.resolve(root, "node_modules", "playwright-core");
const relative = path.relative(coreDir, executable);
if (relative.startsWith("..") || path.isAbsolute(relative)) {
  throw new Error(
    `Chromium was installed outside playwright-core (${executable}). ` +
      `ReelForge Connector requires PLAYWRIGHT_BROWSERS_PATH=0 for self-contained packaging.`
  );
}

console.log("✓ Chromium is inside playwright-core and will be packaged.");
console.log("✓ Self-contained ReelForge Connector runtime is ready.");
