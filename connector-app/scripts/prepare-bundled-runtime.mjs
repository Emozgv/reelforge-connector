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

// Downloads the official Node build for whichever macOS architecture this
// script's own Node ISN'T (same exact version, so both slices behave
// identically), then combines it with the single-arch binary already at
// `nodePath` into one universal fat binary via `lipo -create`.
async function makeNodeRuntimeUniversal(nodePath) {
  const version = process.version; // e.g. "v20.19.5"
  const thisArch = process.arch === "arm64" ? "arm64" : "x64";
  const otherArch = thisArch === "arm64" ? "x64" : "arm64";

  const alreadyUniversal = execFileSync("lipo", ["-archs", nodePath]).toString().trim();
  if (alreadyUniversal.split(/\s+/).length > 1) {
    console.log(`✓ Bundled Node runtime is already universal (${alreadyUniversal}), nothing to combine.`);
    return;
  }

  const distName = `node-${version}-darwin-${otherArch}`;
  const url = `https://nodejs.org/dist/${version}/${distName}.tar.gz`;
  console.log(`Downloading the missing darwin-${otherArch} Node build (${version}) to make the bundled runtime universal...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url} (HTTP ${res.status}). Bundled Node runtime would stay single-arch (${thisArch}).`);
  }

  const tarPath = path.join(runtimeDir, `${distName}.tar.gz`);
  fs.writeFileSync(tarPath, Buffer.from(await res.arrayBuffer()));

  const extractDir = path.join(runtimeDir, "other-arch-node");
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  execFileSync("tar", ["-xzf", tarPath, "-C", extractDir], { stdio: "inherit" });

  const otherNodeBin = path.join(extractDir, distName, "bin", "node");
  if (!fs.existsSync(otherNodeBin)) {
    throw new Error(`Extracted Node build didn't contain the expected binary at ${otherNodeBin}`);
  }

  const universalTmp = `${nodePath}.universal-tmp`;
  execFileSync("lipo", ["-create", nodePath, otherNodeBin, "-output", universalTmp], { stdio: "inherit" });
  fs.renameSync(universalTmp, nodePath);
  fs.chmodSync(nodePath, 0o755);

  fs.rmSync(tarPath, { force: true });
  fs.rmSync(extractDir, { recursive: true, force: true });

  const finalArchs = execFileSync("lipo", ["-archs", nodePath]).toString().trim();
  console.log(`✓ Bundled Node runtime is now universal: ${finalArchs}`);
}

console.log("ReelForge Connector bundled runtime preflight");
console.log("----------------------------------------------");

fs.copyFileSync(process.execPath, bundledNode);
try {
  fs.chmodSync(bundledNode, 0o755);
} catch {}
console.log(`✓ Bundled Node runtime: ${bundledNode}`);

// The Connector's own Rust/Tauri binary is built as a universal
// (arm64+x86_64) fat binary via `tauri build --target universal-apple-darwin`
// — but this copy of the Node runtime is just whatever single-architecture
// Node happens to be running this script (i.e. whatever `actions/setup-node`
// installed on the CI runner, natively arm64 on current GitHub-hosted macOS
// runners). Bundled as-is, that single-arch Node binary is what the Rust
// host spawns as "the ReelForge login helper" / the live-session server —
// on an Intel Mac that exec() fails outright with "Bad CPU type in
// executable (os error 86)", which is exactly what surfaced once a signed,
// notarized build was finally installable end-to-end. Fixed by downloading
// the one missing official architecture's Node build (same exact version,
// straight from nodejs.org — not a build we produce ourselves) and
// `lipo -create`-combining it with the one just copied above, so the
// bundled binary matches the same universal shape as the app around it.
// Windows has no fat-binary concept and is untouched.
if (process.platform === "darwin") {
  await makeNodeRuntimeUniversal(bundledNode);
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
