// ReelForge Research Account Connector
//
// The real "complete login" half of Connect Research Account. Client OS
// (a web app) can't open a real, visible browser on your machine by
// itself — so this small script does exactly what ReelForge's own
// Internal system already does for its own Instagram accounts: open a
// real Chromium window to the platform's real login page and wait for you
// to finish logging in yourself, however that actually goes (password,
// 2FA, SMS code, a security challenge, a CAPTCHA — whatever the platform
// asks for). Nothing here ever sees or asks for your password; it just
// watches for the session cookie that only appears once you're genuinely
// logged in, then hands that session to ReelForge.
//
// Usage (the Research Accounts page gives you this exact command,
// pre-filled, right after you start connecting an account):
//   npm install   (first time only)
//   npm run connect -- --platform=instagram --account=<id> --token=<token>
//
// What happens:
//   1. A real browser window opens to the real login page.
//   2. You log in normally, completing any verification the platform asks for.
//   3. As soon as this script detects a real logged-in session, it captures
//      it and sends it straight to ReelForge — the browser window closes
//      and the account goes "active" on the Research Accounts page.
//   4. If you close the window before logging in, or ten minutes pass with
//      no session, this fails safely and nothing is marked connected.
import { chromium } from "playwright";

const SUBMIT_URL = process.env.REELFORGE_SUBMIT_URL
  ?? "https://vbnilccvnygeedkdfbvd.supabase.co/functions/v1/submit-research-account-session";

const LOGIN_URL = {
  instagram: "https://www.instagram.com/accounts/login/",
  tiktok: "https://www.tiktok.com/login/phone-or-email/email",
};

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
  if (!platform || !account || !token) {
    console.error("Usage: npm run connect -- --platform=instagram|tiktok --account=<id> --token=<token>");
    process.exit(1);
  }
  if (!LOGIN_URL[platform]) {
    console.error(`Unsupported platform: ${platform}`);
    process.exit(1);
  }

  console.log(`Opening a real ${platform} login window — log in as you normally would.`);
  console.log("Complete any verification step the platform asks for. This window will close itself once you're in.");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(LOGIN_URL[platform], { waitUntil: "domcontentloaded", timeout: 60000 });

  const startedAt = Date.now();
  const TIMEOUT_MS = 10 * 60 * 1000;
  let connected = false;

  while (Date.now() - startedAt < TIMEOUT_MS) {
    if (!browser.isConnected()) {
      console.error("Login cancelled — the browser window was closed before a session was detected.");
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
    console.error("Timed out waiting for login. Run this again when you're ready.");
    process.exit(1);
  }

  const storageState = await context.storageState();
  await browser.close();

  console.log("Session detected — sending it to ReelForge...");

  const res = await fetch(SUBMIT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: account, token, platform, storageState }),
  });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error(`ReelForge couldn't finish connecting this account: ${body.error ?? res.statusText}`);
    process.exit(1);
  }

  console.log("Connected. This Research Account is now active in ReelForge.");
}

main().catch((err) => {
  console.error("Unexpected error:", err.message ?? err);
  process.exit(1);
});
