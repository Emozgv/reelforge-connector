// Runs inside ReelForge Connector's bundled Node + Playwright runtime — the
// VA never sees this file or a terminal. It opens a real, visible Chromium
// window on the real platform's login page and waits for the VA to actually
// finish logging in (password, 2FA, SMS code, checkpoint, CAPTCHA — whatever
// the platform asks for; this script never sees or asks for a password
// itself). The moment a genuine session cookie appears, it captures the
// browser's full storage state and hands it to ReelForge, which is the only
// thing that ever flips a Research Account to "active" (see
// submit-research-account-session). Each stdout line is one JSON progress
// event that the Rust host relays straight to the ReelForge Connector window.
import { chromium } from "playwright";

const SUBMIT_URL = process.env.REELFORGE_SUBMIT_URL
  ?? "https://vbnilccvnygeedkdfbvd.supabase.co/functions/v1/submit-research-account-session";

const LOGIN_URL = {
  instagram: "https://www.instagram.com/accounts/login/",
  tiktok: "https://www.tiktok.com/login/phone-or-email/email",
};

function emit(event, extra = {}) {
  console.log(JSON.stringify({ event, ...extra }));
}

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([a-z]+)=(.*)$/i);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function hasRealSession(platform, cookies) {
  if (platform === "instagram") {
    return cookies.some((c) => c.domain.includes("instagram.com") && c.name === "sessionid" && c.value);
  }
  if (platform === "tiktok") {
    return cookies.some(
      (c) => c.domain.includes("tiktok.com") && (c.name === "sessionid" || c.name === "sid_tt") && c.value
    );
  }
  return false;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { platform, account, token } = parseArgs();
  if (!platform || !account || !token || !LOGIN_URL[platform]) {
    emit("error", { message: "ReelForge Connector was opened with an invalid connection link." });
    process.exit(1);
  }

  emit("opening", { platform });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(LOGIN_URL[platform], { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (err) {
    await browser.close();
    emit("error", { message: `Couldn't open the ${platform} login page. Check your internet connection and try again.` });
    process.exit(1);
  }

  emit("waiting");

  const startedAt = Date.now();
  const TIMEOUT_MS = 10 * 60 * 1000;
  let connected = false;

  while (Date.now() - startedAt < TIMEOUT_MS) {
    if (!browser.isConnected()) {
      emit("error", { message: "The login window was closed before you finished logging in." });
      process.exit(1);
    }
    const cookies = await context.cookies();
    if (hasRealSession(platform, cookies)) {
      connected = true;
      break;
    }
    await sleep(700);
  }

  if (!connected) {
    if (browser.isConnected()) await browser.close();
    emit("error", { message: "This took too long. Go back to ReelForge and press Reconnect to try again." });
    process.exit(1);
  }

  const storageState = await context.storageState();
  await browser.close();

  emit("submitting");

  let res;
  try {
    res = await fetch(SUBMIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: account, token, platform, storageState }),
    });
  } catch {
    emit("error", { message: "Logged in, but couldn't reach ReelForge to finish connecting. Check your internet connection and press Reconnect." });
    process.exit(1);
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    emit("error", { message: body.error ?? "ReelForge couldn't finish connecting this account." });
    process.exit(1);
  }

  emit("connected");
}

main().catch((err) => {
  emit("error", { message: err?.message ?? "Something unexpected went wrong." });
  process.exit(1);
});
