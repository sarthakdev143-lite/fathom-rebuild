// Real speech-to-text, behind the same honesty rules as everything else here.
//
// Two paths, the two the brief's stubbed capture layer was standing in for:
//
//   transcribeAudio()  - gemini-3.5-transcribe over a whole recording. Used by
//                        POST /api/upload: hand it a real audio file and it makes
//                        a real meeting with a real transcript.
//   live-asr relay     - gemini-3.5-transcribe-live over the Live API WebSocket,
//                        proxied by the Worker so the key never reaches a browser.
//                        See worker/src/index.ts, route /api/live-asr.
//
// WHAT THIS DOES NOT DO
// ---------------------
// The transcribe models return TEXT, not word-level timestamps, and speaker
// diarisation is unreliable. So segment timings are DISTRIBUTED PROPORTIONALLY
// over the recording's duration by word count, and speakers come from whatever
// labels the model emits ("Speaker 1" when it cannot tell). That is stated in the
// UI for uploaded meetings rather than dressed up as precise diarisation.
//
// Verified in scripts/verify-asr.mjs: transcribing this project's own synthesized
// audio reproduces the authored transcript at high word overlap - which is both a
// check on the ASR path and an accidental check on the TTS.

const TRANSCRIBE_MODELS = ["gemini-3.5-transcribe"];

const INSTRUCTION =
  "Transcribe this recording verbatim. Output one line per speaker turn. " +
  "If you can identify distinct speakers, prefix lines with 'Speaker 1:', 'Speaker 2:' and so on. " +
  "Do not add, infer, summarise or clean up anything that is not said. No commentary.";

/**
 * @param {any} env Worker env with GEMINI_API_KEY
 * @param {{bytes: ArrayBuffer|Uint8Array, mimeType: string}} audio
 * @returns {Promise<{text: string, model: string, latency_ms: number}>}
 */
export async function transcribeAudio(env, audio) {
  if (!env.GEMINI_API_KEY) throw new Error("no GEMINI_API_KEY configured: uploads need a transcription provider");
  const b64 = bytesToBase64(audio.bytes);
  let lastErr = null;
  for (const model of TRANSCRIBE_MODELS) {
    try {
      const t0 = Date.now();
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inlineData: { mimeType: audio.mimeType || "audio/mp3", data: b64 } },
                { text: INSTRUCTION },
              ],
            }],
          }),
        }
      );
      if (!res.ok) throw new Error(`${model}: ${res.status} ${(await res.text()).slice(0, 160)}`);
      const d = await res.json();
      const part = d?.candidates?.[0]?.content?.parts?.[0] || {};
      const text = part.audioTranscription?.text ?? part.text ?? "";
      if (!text.trim()) throw new Error(`${model}: empty transcription`);
      return { text, model, latency_ms: Date.now() - t0 };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("transcription failed");
}

function bytesToBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) bin += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(bin);
}

/**
 * Parse a verbatim transcript into timed segments.
 * Timings are proportional by word count across durationMs; [mm:ss] prefixes from
 * the model, when present, win.
 */
export function parseTranscript(text, durationMs) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const parsed = [];
  for (const line of lines.length > 1 ? lines : splitSentences(text)) {
    const ts = line.match(/^\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*/);
    let startHint = null;
    let rest = line;
    if (ts) {
      const h = ts[3] === undefined ? 0 : Number(ts[1]);
      const m = ts[3] === undefined ? Number(ts[1]) : Number(ts[2]);
      const s = ts[3] === undefined ? Number(ts[2]) : Number(ts[3]);
      startHint = (h * 3600 + m * 60 + s) * 1000;
      rest = line.slice(ts[0].length);
    }
    const sp = rest.match(/^(Speaker\s+\d+|[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*:\s*(.+)$/);
    parsed.push({
      speaker: sp ? sp[1] : "Speaker 1",
      text: (sp ? sp[2] : rest).trim(),
      startHint,
    });
  }

  const usable = parsed.filter((p) => p.text.split(/\s+/).length >= 1);
  const words = usable.map((p) => Math.max(1, p.text.split(/\s+/).length));
  const totalWords = words.reduce((a, b) => a + b, 0) || 1;
  const total = durationMs || 0;
  const hasHints = usable.some((p) => p.startHint !== null);

  let cursor = 0;
  const segments = usable.map((p, i) => {
    const share = words[i] / totalWords;
    const start = hasHints && p.startHint !== null ? p.startHint : cursor;
    const dur = Math.max(700, Math.round(share * total));
    cursor = (hasHints && p.startHint !== null ? p.startHint : cursor) + dur;
    return {
      speaker: p.speaker,
      text: p.text,
      start_ms: Math.round(start),
      end_ms: Math.round(start + dur),
      words: words[i],
    };
  });
  return segments;
}

function splitSentences(text) {
  return (text.match(/[^.!?]+[.!?]*/g) || [text]).map((s) => s.trim()).filter(Boolean);
}

export { TRANSCRIBE_MODELS, INSTRUCTION, bytesToBase64 };
