// Records a captioned screen-capture tour of the live product.
//
//   npm run demo            -> docs/demo-tour.mp4
//   npm run demo -- --base http://localhost:8787
//
// PURPOSE
// -------
// The brief wants a walkthrough under five minutes with the candidate's camera on.
// A camera cannot be faked and should not be: this video is the *screen* half. It
// is captioned scene by scene and each scene is timed to reading speed, so the
// candidate can press record in Loom, play this full-screen, read the captions
// aloud (or paraphrase them), and bookend with twenty seconds of face at each end.
// Total lands under four minutes, leaving headroom under the five-minute limit.
//
// It is silent on purpose. A synthetic voiceover would put words in the
// candidate's mouth that they did not choose; captions leave the voice theirs.

import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

// ffmpeg ships with the Python imageio-ffmpeg wheel in this environment; resolve
// its binary rather than adding a second copy via npm.
const FFMPEG = execSync(`python3 -c "import imageio_ffmpeg as m; print(m.get_ffmpeg_exe())"`).toString().trim();

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "docs");
const TMP = join(OUT_DIR, ".video-tmp");

const args = process.argv.slice(2);
const BASE = (args.includes("--base") ? args[args.indexOf("--base") + 1] : null)
  || "https://fathom-rebuild.sarthak-fathom.workers.dev";

const CAPTION_CSS = `
  #demo-caption {
    position: fixed; left: 50%; transform: translateX(-50%);
    bottom: 28px; max-width: 74%;
    background: rgba(13,16,23,.92); color: #f4f6fb;
    font: 500 17px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    padding: 10px 18px; border-radius: 12px; letter-spacing: .01em;
    box-shadow: 0 10px 34px rgba(0,0,0,.45); z-index: 2147483647;
    text-align: center; pointer-events: none;
  }
`;

// Each scene: a caption (spoken length drives timing) and the clicks that show it.
const SCENES = [
  {
    caption: "A rebuild of Fathom, the AI meeting notetaker. Eight seeded meetings — including a sixty-one minute, eight-person leadership sync.",
    run: async (page) => { await page.goto(BASE + "/", { waitUntil: "networkidle" }); await page.mouse.wheel(0, 260); await page.waitForTimeout(600); },
  },
  {
    caption: "The seeded meetings are authored and synthesized — the capture layer for them is stubbed, and the product says so.",
    run: async (page) => { await page.mouse.wheel(0, -260); },
  },
  {
    caption: "Sixty-one minutes, eight speakers. The waveform is real amplitude data; chapters and highlights ride on it.",
    run: async (page) => { await page.getByRole("link", { name: /Weekly Leadership Sync/ }).first().click(); await page.waitForTimeout(1800); },
  },
  {
    caption: "Playback and transcript stay in sync. Click any line and the recording seeks to that millisecond.",
    run: async (page) => { await page.getByTestId("seg-14").locator("button").first().click(); await page.waitForTimeout(900); },
  },
  {
    caption: "Six templates. Switching changes the output, not the heading — and it is instant, because every summary is pre-generated.",
    run: async (page) => {
      await page.getByTestId("rail").getByRole("button", { name: /^Executive brief$/ }).click();
      await page.waitForTimeout(1400);
      await page.getByTestId("rail").getByRole("button", { name: /^Standard summary$/ }).click();
      await page.waitForTimeout(900);
    },
  },
  {
    caption: "Action items carry owners and the due date as it was spoken — and each one jumps to the moment it was said.",
    run: async (page) => {
      await page.getByTestId("rail").getByRole("button", { name: /^Actions \(\d+\)$/ }).click();
      await page.waitForTimeout(900);
    },
  },
  {
    caption: "Ask quotes the transcript and cites timestamps, so an answer can be checked rather than trusted. Follow-ups work.",
    run: async (page) => {
      await page.getByTestId("rail").getByRole("button", { name: /^Ask$/ }).click();
      await page.waitForTimeout(600);
      const box = page.locator('input[placeholder*="Ask anything"]').first();
      await box.fill("What did we decide about the comp band?");
      await box.press("Enter");
      await page.waitForTimeout(2600);
    },
  },
  {
    caption: "Share links open for someone who was never on the call. No account — the token is the only auth.",
    run: async (page) => {
      await page.getByRole("button", { name: /^Share$/ }).click();
      await page.waitForTimeout(1600);
      await page.keyboard.press("Escape");
    },
  },
  {
    caption: "And capture can be real: upload any recording, or let the browser extension read the captions Meet, Zoom and Teams already render. No bot, no key.",
    run: async (page) => { await page.goto(BASE + "/live", { waitUntil: "networkidle" }); await page.waitForTimeout(900); await page.mouse.wheel(0, 300); },
  },
  {
    caption: "Public repo, full agent log, five test suites. This is the screen half — the face half is mine.",
    run: async (page) => { await page.goto(BASE + "/", { waitUntil: "networkidle" }); },
  },
];

const run = async () => {
  mkdirSync(TMP, { recursive: true });
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: TMP, size: { width: 1440, height: 900 } },
  });
  // The caption bar must survive navigation, so it is created on every document.
  await context.addInitScript((css) => {
    const make = () => {
      if (document.getElementById("demo-caption")) return;
      const s = document.createElement("style");
      s.textContent = css;
      const d = document.createElement("div");
      d.id = "demo-caption";
      document.documentElement.append(s, d);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", make);
    else make();
  }, CAPTION_CSS);

  const page = await context.newPage();
  let total = 0;
  for (const [i, scene] of SCENES.entries()) {
    const words = scene.caption.split(/\s+/).length;
    const dur = Math.max(6500, Math.round((words / 2.3) * 1000) + 1400);
    const t0 = Date.now();
    await page.evaluate((t) => { document.getElementById("demo-caption").textContent = t; }, scene.caption);
    await scene.run(page);
    const left = dur - (Date.now() - t0);
    if (left > 0) await page.waitForTimeout(left);
    total += Date.now() - t0;
    console.log(`  scene ${i + 1}/${SCENES.length}  ${(Date.now() - t0) / 1000 | 0}s  ${scene.caption.slice(0, 52)}…`);
  }

  const video = page.video();
  await context.close();
  await browser.close();
  const webm = await video.path();
  const mp4 = join(OUT_DIR, "demo-tour.mp4");
  execFileSync(FFMPEG, [
    "-y", "-loglevel", "error", "-i", webm,
    "-vf", "scale=1280:800,fps=24",
    "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", mp4,
  ], { stdio: "inherit" });
  rmSync(TMP, { recursive: true, force: true });
  console.log(`\nwrote ${mp4}  (~${Math.round(total / 1000)}s of scenes; file duration may differ by a second or two)`);
};

run().catch((e) => { console.error("demo recording failed:", e); process.exit(1); });
