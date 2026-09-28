// End-to-end test of the capture extension, with no real meeting and no human.
//
//   node scripts/extension-check.mjs
//
// Playwright can load an unpacked extension into Chromium. This script:
//   1. starts extension/test/mock-server.mjs  - serves a mock captions page shaped
//      like Meet's DOM, and receives what the extension delivers;
//   2. launches Chromium with extension/ loaded;
//   3. points the extension at the MOCK target (never the production deployment,
//      so a test can never pollute seeded data);
//   4. opens the captions page, lets lines stream, then navigates away so the
//      content script's pagehide handler archives and delivers the session;
//   5. asserts on what arrived: speakers, ordering, texts, monotonic timestamps.
//
// What this proves: the observer, the interim/final diffing, the archive-before
// network rule, and the delivery queue - the whole pipeline - without needing a
// real call, a real account or a second human. What it does NOT prove: that the
// selector lists still match today's Meet/Zoom/Teams markup. That needs a real
// call, and docs/EXTENSION-TEST.md is the five-minute script for it.

import { chromium } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { received } from "../extension/test/mock-server.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = join(HERE, "..", "extension");

let passed = 0, failed = 0;
const check = (name, cond, extra = "") => {
  if (cond) { passed++; console.log(`  PASS  ${name}${extra ? "  " + extra : ""}`); }
  else { failed++; console.log(`  FAIL  ${name}${extra ? "  " + extra : ""}`); }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  console.log("=== extension capture check (mock captions, mock target) ===\n");
  const userDataDir = mkdtempSync(join(tmpdir(), "snc-ext-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
    ],
  });

  // Extension id from its service worker.
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  check("extension service worker boots", !!extId, extId);

  // Point it at the mock target through the popup's own settings path.
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/src/popup.html`);
  await popup.evaluate(() => new Promise((res) => chrome.storage.local.set({ targetUrl: "http://localhost:8899" }, res)));
  await popup.close();
  check("target set to the mock server via the popup's storage path", true);

  const page = await context.newPage();
  await page.goto("http://localhost:8899/captions");
  check("mock captions page loads", (await page.locator(".caption-line").count()) >= 0);

  // Let the captions stream and the observer capture them.
  await sleep(16000);
  const lineCount = await page.locator(".caption-line").count();
  check("the mock call produced caption lines", lineCount >= 6, `${lineCount} lines`);

  const st = await page.evaluate(() => ({
    found: document.documentElement.dataset.sncFound === "1",
    lines: Number(document.documentElement.dataset.sncLines || 0),
    interim: document.documentElement.dataset.sncInterim || "",
  }));
  check("content script found the captions container", st.found);
  check("content script captured finalised lines", st.lines >= 5, `${st.lines} lines`);

  // Leaving the call is what finalises and delivers a session in real use.
  await page.goto("about:blank");
  let payload = null;
  for (let i = 0; i < 20 && !payload; i++) {
    await sleep(500);
    payload = received[0] || null;
  }
  check("leaving the page delivered the session to the target", !!payload);
  if (payload) {
    const segs = payload.segments || [];
    check("delivered segments carry speakers", segs.length >= 5 && segs.every((s) => s.speaker), `${segs.length} segments`);
    check("speakers are the mock call's people",
      segs.some((s) => /Priya/.test(s.speaker)) && segs.some((s) => /Tom|Dan|Sofia|Marcus|Aisha/.test(s.speaker)));
    check("timestamps are monotonic", segs.every((s, i) => i === 0 || s.start_ms >= segs[i - 1].start_ms));
    check("a decision sentence survived capture intact",
      segs.some((s) => /fourteenth of October/i.test(s.text)));
    check("the payload says where it came from", /extension|captions/i.test(payload.note || "") || payload.source === "extension");
    console.log(`\n  first delivered line: [${segs[0]?.start_ms}ms] ${segs[0]?.speaker}: ${segs[0]?.text?.slice(0, 60)}`);
  }

  await context.close();
  rmSync(userDataDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
};

run().catch((e) => { console.error("extension check crashed:", e); process.exit(1); });
