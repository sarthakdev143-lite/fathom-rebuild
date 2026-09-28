#!/usr/bin/env node
// Embed every transcript segment once, at build time, into db/embeddings.sql.
//
//   GEMINI_API_KEY=... node scripts/build-embeddings.mjs
//
// Why at build time: the corpus is fixed (2,178 segments) and embedding it costs
// ~22 batched calls. Doing it once and committing the result means the deployed
// Worker never pays for it, never rate-limits on a cold start, and the vectors in
// the database are the same ones a reviewer can regenerate and diff.
//
// Vectors are L2-normalised then quantised to int8 at 768 dims: ~770 bytes a row,
// ~1.7 MB for the corpus. That is small enough to cache per isolate and scan in
// milliseconds, which is what makes semantic ranking free at request time.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { quantizeInt8, toHex, EMBED_MODEL, EMBED_DIM } from "../shared/ai/embed.mjs";
// gemini-embedding-001 is the stable model; -2 preview is quota-starved on free tier.

const HERE = dirname(fileURLToPath(import.meta.url));
const SEG_DIR = join(HERE, "..", "media", "segments");
const OUT = join(HERE, "..", "db", "embeddings.sql");

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("GEMINI_API_KEY required");
  process.exit(2);
}

const args = process.argv.slice(2);
const maxSeconds = Number((args.includes("--max-seconds") ? args[args.indexOf("--max-seconds") + 1] : 0) || 0);
const startedAt = Date.now();

// The free embedding quota is roughly one batch a minute, so this is a resumable
// job, not a script: progress lives in a gitignored sidecar and a 429 means sleep
// and retry, never abort. --max-seconds bounds one invocation so it fits inside a
// shell that must not run forever.
const PROGRESS = join(HERE, "..", "db", "embeddings.progress.json");
// Keyed by meeting:ord AND hashed by text. Keys alone are not enough: adding an
// authored beat shifts every ord after it, so a resume by key silently attached
// vectors to the wrong sentences. A hash mismatch discards the row.
const hash = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h);
};
const banked = new Map(); // key -> { hash, sql }
try {
  const pr = JSON.parse(readFileSync(PROGRESS, "utf8"));
  for (const [k, v] of Object.entries(pr.rows || {})) banked.set(k, v);
} catch { /* fresh start */ }

// Selection policy, and why: Gemini's free embedding quota is 1000 requests a day
// and a 100-content batch burns ~100 of them with multi-minute windows between, so
// the full 2,161-line corpus cannot be embedded inside the submission window. What
// CAN be embedded is the part semantic search is actually for: the authored key
// moments (decisions, numbers, disagreements - the lines a question means), plus
// every line of the short meetings, which are cheap. The rest stays lexical. The UI
// says exactly this: "semantic over key moments + lexical over everything".
const SHORT_MEETING_MS = 20 * 60 * 1000;
const all = [];
const selected = [];
for (const f of readdirSync(SEG_DIR).sort()) {
  const d = JSON.parse(readFileSync(join(SEG_DIR, f), "utf8"));
  d.segments.forEach((s, i) => {
    const row = { meeting_id: d.id, ord: i, text: s.text, h: hash(s.text) };
    all.push(row);
    if (s.beat || d.duration_ms <= SHORT_MEETING_MS) selected.push(row);
  });
}
for (const [k, v] of [...banked]) {
  const cur = all.find((r) => `${r.meeting_id}:${r.ord}` === k);
  if (!cur || cur.h !== v.hash) banked.delete(k);
}
const rows = selected.filter((r) => !banked.has(`${r.meeting_id}:${r.ord}`));
console.log(`selected ${selected.length} of ${all.length} segments (key moments + short meetings)`);
console.log(`embedding ${rows.length} of them (${banked.size} verified banked) with ${EMBED_MODEL} @ ${EMBED_DIM}d`);

const BATCH = 100;
let processed = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  if (maxSeconds && (Date.now() - startedAt) / 1000 > maxSeconds) {
    console.log(`\n  time budget reached after ${processed} segments`);
    break;
  }
  const chunk = rows.slice(i, i + BATCH);
  let embs = null;
  for (let attempt = 0; attempt < 40 && !embs; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requests: chunk.map((r) => ({
            model: `models/${EMBED_MODEL}`,
            content: { parts: [{ text: r.text }] },
            outputDimensionality: EMBED_DIM,
          })),
        }),
      }
    );
    if (res.ok) {
      const d = await res.json();
      if ((d.embeddings || []).length === chunk.length) embs = d.embeddings;
      else { console.error(`batch returned ${(d.embeddings || []).length} for ${chunk.length}`); process.exit(1); }
    } else if (res.status === 429) {
      // The budget check must live INSIDE this loop: a quota streak previously
      // slept straight past the caller's timeout, because max-seconds was only
      // inspected between batches.
      if (maxSeconds && (Date.now() - startedAt) / 1000 > maxSeconds - 5) {
        console.log("\n  quota window outlasted the time budget");
        break;
      }
      process.stdout.write(`\r  quota window - sleeping 62s (attempt ${attempt + 1})   `);
      await new Promise((r) => setTimeout(r, 62000));
    } else {
      console.error(`\nbatch failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
      process.exit(1);
    }
  }
  if (!embs) { console.log("\n  gave up waiting for quota"); break; }
  chunk.forEach((r, j) => {
    const hex = toHex(quantizeInt8(embs[j].values));
    banked.set(`${r.meeting_id}:${r.ord}`, {
      hash: r.h,
      sql: `INSERT INTO segment_embeddings (meeting_id, ord, vec, model) VALUES ('${r.meeting_id}', ${r.ord}, X'${hex}', '${EMBED_MODEL}');`,
    });
  });
  processed += chunk.length;
  writeFileSync(PROGRESS, JSON.stringify({ rows: Object.fromEntries(banked) }));
  process.stdout.write(`\r  ${banked.size}/${all.length} embedded, progress saved      `);
}
console.log("");
if (banked.size === selected.length) {
  const header = ["-- Generated by scripts/build-embeddings.mjs. Do not edit by hand.",
    `-- model: ${EMBED_MODEL}  dims: ${EMBED_DIM}  quantisation: int8 (unit-normalised)`,
    "-- rows are keyed by (meeting_id, ord) and verified against a text hash at build time",
    "DELETE FROM segment_embeddings;"];
  const lines = selected.map((r) => banked.get(`${r.meeting_id}:${r.ord}`).sql);
  writeFileSync(OUT, header.concat(lines).join("\n") + "\n");
  console.log(`wrote ${OUT} (${(lines.join("\n").length / 1048576).toFixed(1)} MB, ${banked.size} vectors)`);
} else {
  // Emit what exists rather than holding the feature hostage to a quota window.
  // Partial coverage is the designed state, not a broken one: semantic ranks the
  // embedded key moments, lexical ranks everything, RRF fuses them.
  const have = selected.filter((r) => banked.has(`${r.meeting_id}:${r.ord}`));
  if (have.length) {
    const header = ["-- Generated by scripts/build-embeddings.mjs. Do not edit by hand.",
      `-- model: ${EMBED_MODEL}  dims: ${EMBED_DIM}  quantisation: int8 (unit-normalised)`,
      `-- PARTIAL: ${have.length} of ${selected.length} selected key moments (free-tier quota window);`,
      "-- re-run the build script to complete; the app fuses whatever exists with lexical.",
      "DELETE FROM segment_embeddings;"];
    writeFileSync(OUT, header.concat(have.map((r) => banked.get(`${r.meeting_id}:${r.ord}`).sql)).join("\n") + "\n");
    console.log(`wrote PARTIAL ${OUT}: ${have.length} vectors`);
  }
  console.log(`incomplete: ${banked.size}/${selected.length} selected - re-run to resume`);
}
