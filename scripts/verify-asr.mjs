// Verifies the real capture path against ground truth we happen to own.
//
//   GEMINI_API_KEY=... node scripts/verify-asr.mjs [meeting-id]
//
// Every seeded meeting has (a) an authored transcript and (b) audio synthesized
// FROM that transcript. Transcribing the audio back with gemini-3.5-transcribe and
// comparing to the authored words therefore measures the ASR path end to end -
// and, incidentally, measures how intelligible the synthesized speech is.
//
// It also doubles as the check that caught a content bug: composites had leaked
// into the 2-minute solo call, and the transcription proved the AUDIO was wrong
// rather than the model hallucinating.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const key = process.env.GEMINI_API_KEY;
if (!key) { console.error("GEMINI_API_KEY required"); process.exit(2); }

const id = process.argv[2] || "m-solo-test";
const seg = JSON.parse(readFileSync(join(HERE, "..", "media", "segments", `${id}.json`), "utf8"));
const audio = readFileSync(join(HERE, "..", "web", "public", "media", `${id}.mp3`));
const b64 = audio.toString("base64");

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-transcribe:generateContent?key=${encodeURIComponent(key)}`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [
        { inlineData: { mimeType: "audio/mp3", data: b64 } },
        { text: "Transcribe this recording verbatim." },
      ] }],
    }),
  }
);
if (!res.ok) { console.error("transcribe failed:", res.status, (await res.text()).slice(0, 300)); process.exit(1); }
const d = await res.json();
const text = d.candidates[0].content.parts[0].audioTranscription?.text || "";

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
const authored = norm(seg.segments.map((s) => s.text).join(" "));
const heard = norm(text);
const set = new Set(authored);
const hit = heard.filter((w) => set.has(w)).length;
const precision = hit / Math.max(1, heard.length);
const recall = hit / Math.max(1, authored.length);
const f1 = (2 * precision * recall) / Math.max(1e-9, precision + recall);

console.log(`\n${id}: ${seg.segments.length} authored segments, ${(seg.duration_ms / 60000).toFixed(1)} min of audio`);
console.log(`  ASR words: ${heard.length}   authored words: ${authored.length}`);
console.log(`  precision ${(precision * 100).toFixed(1)}%   recall ${(recall * 100).toFixed(1)}%   word F1 ${(f1 * 100).toFixed(1)}%`);
const unheard = authored.filter((w) => !new Set(heard).has(w));
const top = [...new Set(unheard)].slice(0, 12);
console.log(`  authored words ASR missed (sample): ${top.join(", ") || "none"}`);
console.log(f1 > 0.75 ? "\n  verdict: the real capture path reproduces the authored transcript.\n"
                      : "\n  verdict: overlap lower than expected - inspect the transcript above.\n");
