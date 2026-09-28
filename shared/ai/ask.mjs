// "Ask" - a question-answering layer over the meeting corpus.
//
// This is the feature my own recon (docs/RECON.md) named as the biggest omission:
// real Fathom leads its marketing with "Ask Fathom anything about your meetings".
//
// DESIGN: retrieval first, model second.
//
//   1. retrieve() scores transcript segments against the question using term
//      frequency, phrase matching and proximity. This always runs, needs no key,
//      and is what makes answers CITABLE - every claim points at a timestamp, a
//      speaker and a meeting.
//   2. If GROQ_API_KEY or GEMINI_API_KEY (or OpenAI/Anthropic) is present in
//      Worker secrets, the retrieved passages are handed to the model to compose
//      prose. If the call fails for ANY reason - no key, 429, timeout, bad JSON -
//      it falls back to the retrieval-only composer.
//
// The fallback matters more than the model. The live link is opened by a stranger
// with no account; a demo that depends on somebody's quota is a demo that breaks.
//
// Both composers return the same shape: { answer, citations, provider }.

import { expandQuery, splitExpansions, EXPANSION_WEIGHT } from "./expand.mjs";

const STOPWORDS = new Set(
  ("a an and are as at be been but by can could did do does for from had has have how i if in into is it its " +
   "me my of on or our so than that the their them then there these they this to was were what when where which " +
   "who why will with would you your about any did anyone somebody something get got make made say said tell " +
   "us we they're dont don't isnt isn't").split(/\s+/)
);

function tokens(text) {
  return (text.toLowerCase().match(/[a-z0-9$%']+/g) || []).filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** A segment that is nothing but an ASR noise marker is never an answer to anything. */
const NOISE_ONLY = /^\s*\[(crosstalk|inaudible|laughs|laughter|people talking over each other|background noise|applause|music)\]\s*$/i;

/** Cheap stemming: "blocking" and "blocker" and "blocked" should be the same term. */
const stem = (t) => (t.length > 5 ? t.slice(0, 5) : t);

function countOcc(hay, needle) {
  let n = 0, i = -1;
  while ((i = hay.indexOf(needle, i + 1)) !== -1 && n < 5) n++;
  return n;
}

/**
 * Retrieve the passages most likely to answer `question`.
 *
 * Ranking is TF-IDF over stemmed terms plus a bonus for exact phrases from the
 * question. IDF matters here: in "what is blocking the Halcyon deal", *halcyon*
 * and *block* are the informative terms and *deal* is not, so a segment matching
 * only "deal" should not outrank one matching "blocker".
 *
 * @param {string} question
 * @param {any[]} segments
 * @param {{limit?: number, meetings?: Set<string>|null}} [opts]
 * @returns {{citations: any[], terms: string[], concepts: {id: string, label: string}[]}}
 */
export function retrieve(question, segments, opts) {
  const { limit = 8, meetings = null, expand = true } = opts || {};
  const q = question.toLowerCase();
  const direct = [...new Set(tokens(question))];

  // 2- and 3-word phrases lifted straight out of the question.
  const words = q.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w && !STOPWORDS.has(w));
  const phrases = [];
  for (let n = 3; n >= 2; n--) {
    for (let i = 0; i + n <= words.length; i++) phrases.push(words.slice(i, i + n).join(" "));
  }

  // Intent expansion: "did anyone commit to a date" carries no overlap with
  // "we will have the full response by the fourteenth of October", but it is
  // unmistakably a commitment+deadline question, and the vocabulary that answers
  // those is knowable without a model.
  const expansion = expand ? expandQuery(question) : { concepts: [], terms: [] };
  const { single: expSingle, phrases: expPhrases } = splitExpansions(expansion.terms);

  const weight = new Map();
  for (const t of direct) weight.set(t, 1);
  for (const t of expSingle) {
    const k = t.toLowerCase();
    if (!weight.has(k)) weight.set(k, EXPANSION_WEIGHT);
  }
  const terms = [...weight.keys()];

  const pool = (meetings && meetings.size ? segments.filter((s) => meetings.has(s.meeting_id)) : segments)
    .filter((s) => !NOISE_ONLY.test(s.text));
  if (!pool.length || !terms.length) return { citations: [], terms: direct, concepts: expansion.concepts };

  // Document frequency per stemmed term, over the candidate pool only.
  const df = new Map();
  const lowered = pool.map((s) => s.text.toLowerCase());
  for (const t of terms) {
    const st = stem(t);
    let n = 0;
    for (const hay of lowered) if (hay.includes(st)) n++;
    df.set(t, n);
  }
  const idf = (t) => Math.log((pool.length + 1) / (df.get(t) || 0) + 1) + 0.35;

  // A term is informative if it is not ubiquitous. The floor of 3 matters: a pure
  // ratio is too strict on a small pool (in 7 segments a term appearing twice is
  // 29%, which would discard "region pinning" - the actual answer).
  // Only DIRECT terms are subject to this: expanded terms were chosen deliberately
  // by an intent match, so filtering them by frequency would undo the point.
  const directSet = new Set(direct);
  const informative = terms.filter(
    (t) => !directSet.has(t) || (df.get(t) || 0) <= Math.max(3, pool.length * 0.2)
  );

  // If every term the person actually typed is ubiquitous AND nothing expanded,
  // the question carries no discriminating signal and there is no honest answer.
  const directInformative = informative.filter((t) => directSet.has(t));
  if (!directInformative.length && !informative.some((t) => !directSet.has(t))) {
    return { citations: [], terms: direct, concepts: expansion.concepts };
  }
  const rankTerms = informative;

  const scored = pool
    .map((seg, idx) => {
      const hay = lowered[idx];
      let score = 0;
      let directHits = 0;
      for (const t of rankTerms) {
        const st = stem(t);
        const n = countOcc(hay, st);
        if (!n) continue;
        const w = weight.get(t) ?? 1;
        if (directSet.has(t)) directHits++;
        score += w * idf(t) * (1 + Math.log2(n + 1));
        if (hay.includes(t) && new RegExp(`\\b${t.replace(/[$%']/g, "")}\\b`).test(hay)) score += w * idf(t);
      }
      for (const ph of phrases) if (hay.includes(ph)) score += 5;
      for (const ph of expPhrases) if (hay.includes(ph)) score += 5 * EXPANSION_WEIGHT;
      // A segment matched only by inferred vocabulary is a weaker answer than one
      // matched by the words that were typed.
      if (directHits === 0 && rankTerms.some((t) => directSet.has(t))) score *= 0.55;
      if (seg.is_crosstalk) score -= 1.5;
      return { ...seg, score };
    })
    .filter((s) => s.score > 0);

  if (!scored.length) return { citations: [], terms: direct, concepts: expansion.concepts };

  scored.sort((a, b) => b.score - a.score || a.start_ms - b.start_ms);

  // Relative threshold: a query whose best match is weak should return nothing
  // rather than eight loosely-related lines.
  const top = scored[0].score;
  const floor = Math.max(2.2, top * 0.22);
  const kept = scored.filter((s) => s.score >= floor);

  // Do not return six lines from the same breath.
  const out = [];
  const perWindow = new Map();
  for (const s of kept) {
    const key = `${s.meeting_id}:${Math.floor(s.start_ms / 20000)}`;
    if ((perWindow.get(key) || 0) >= 2) continue;
    perWindow.set(key, (perWindow.get(key) || 0) + 1);
    out.push(s);
    if (out.length >= limit) break;
  }
  return { citations: out, terms: rankTerms, concepts: expansion.concepts };
}

// --------------------------------------------------------------------------
// retrieval-only composer: no model, no key, still answers
// --------------------------------------------------------------------------

function clock(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * @param {string} question
 * @param {any[]} citations
 * @param {{meetingTitle?: string|null, concepts?: {id: string, label: string}[]|null}} [opts]
 */
export function composeFromRetrieval(question, citations, { meetingTitle = null, concepts = null, modelConfigured = false } = {}) {
  if (concepts?.length && citations.length) {
    citations = citations.map((c, i) => (i === 0 ? { ...c, __concepts: concepts } : c));
  }
  if (!citations.length) {
    return {
      answer: `Nothing in ${meetingTitle ? `"${meetingTitle}"` : "any recorded meeting"} matches "${question}". ` +
        `This answer is retrieval-based (no model key is configured), so it matches words rather than intent — ` +
        `try a phrase someone would literally have said.`,
      citations: [],
      provider: "retrieval-only",
    };
  }
  const byMeeting = new Map();
  for (const c of citations) {
    if (!byMeeting.has(c.meeting_title || c.meeting_id)) byMeeting.set(c.meeting_title || c.meeting_id, []);
    byMeeting.get(c.meeting_title || c.meeting_id).push(c);
  }
  const top = citations[0];
  const lines = [];
  if (citations[0].__concepts?.length) {
    lines.push(`_Read the question as: ${citations[0].__concepts.map((c) => c.label).join(", ")}._`);
    lines.push("");
  }
  lines.push(
    `${citations.length} moment${citations.length === 1 ? "" : "s"} across ${byMeeting.size} meeting${byMeeting.size === 1 ? "" : "s"} match. ` +
    `The strongest is ${top.speaker_name} at ${clock(top.start_ms)}${meetingTitle ? "" : ` in ${top.meeting_title}`}:`
  );
  lines.push("");
  lines.push(`> "${top.text}"`);
  lines.push("");
  const others = citations.slice(1, 4);
  if (others.length) {
    lines.push("Also relevant:");
    for (const c of others) {
      lines.push(`- **[${clock(c.start_ms)}]** ${c.speaker_name}${meetingTitle ? "" : ` (${c.meeting_title})`}: ${c.text}`);
    }
  }
  lines.push("");
  lines.push(modelConfigured
    ? "_Retrieval-based answer: every line above is quoted verbatim from the transcript with a timestamp, " +
      "so it can be checked rather than trusted._"
    : "_Retrieval-based answer: every line above is quoted verbatim from the transcript with a timestamp, " +
      "so it can be checked rather than trusted. Add `GROQ_API_KEY` or `GEMINI_API_KEY` to Worker secrets " +
      "for a composed prose answer over the same passages._");
  return { answer: lines.join("\n"), citations, concepts: concepts || [], provider: "retrieval-only" };
}

// --------------------------------------------------------------------------
// model providers (used only when a key is present; always fall back)
// --------------------------------------------------------------------------

const SYSTEM = `You are the meeting assistant inside a notetaker product. Answer ONLY from the supplied
transcript passages. Every claim must be traceable to a numbered passage; cite as [n]. If the passages do
not contain the answer, say so plainly instead of inferring. Be concise: 2-5 sentences, then a short
bullet list of the specific moments that matter. Never invent names, numbers or dates.`;

function contextBlock(citations) {
  return citations
    .map((c, i) => `[${i + 1}] (${c.meeting_title}, ${clock(c.start_ms)}, ${c.speaker_name}): ${c.text}`)
    .join("\n");
}

/** Follow-up turns pass the conversation so pronouns and ellipsis resolve. */
function historyMessages(history) {
  return (history || [])
    .filter((h) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
    .slice(-8)
    .map((h) => ({ role: h.role, content: h.content.slice(0, 4000) }));
}

/**
 * An elliptical follow-up ("and who owns it?", "what about the date?") carries
 * almost no vocabulary of its own, so retrieval on it alone finds nothing. Borrow
 * terms from the previous question rather than answering "nothing matched" to a
 * perfectly reasonable follow-up.
 */
function retrievalQueryFor(question, history) {
  const own = tokens(question);
  const elliptical = own.length <= 2 || /^(and|but|what about|who|why|when|where|how|which|any|more|same)\b/i.test(question.trim());
  if (!elliptical || !history?.length) return question;
  const prevUser = [...history].reverse().find((h) => h.role === "user");
  return prevUser ? `${question} ${prevUser.content}` : question;
}

// Groq retires model ids without notice: `llama-3.3-70b-versatile` was live when
// this was written and 404s now. A chain means a retired id degrades to the next
// one instead of taking the whole feature down, and the working id is remembered
// per isolate so the cost of discovery is paid once.
const GROQ_MODEL_CHAIN = [
  "llama-3.1-8b-instant",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "llama-3.3-70b-versatile",
];
let groqWorkingModel = null;

async function askGroq(key, question, citations, model = GROQ_MODEL_CHAIN[0], history = []) {
  const chain = groqWorkingModel ? [groqWorkingModel] : GROQ_MODEL_CHAIN;
  let lastErr = null;
  for (const m of chain) {
    try {
      const out = await askGroqOnce(key, question, citations, m, history);
      groqWorkingModel = m;
      return out;
    } catch (err) {
      lastErr = err;
      // A 404 is "that model id is gone", not "your key is bad" - try the next.
      if (!/404|does not exist/.test(String(err.message))) throw err;
    }
  }
  throw lastErr || new Error("groq: no model in the chain was available");
}

async function askGroqOnce(key, question, citations, model, history) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        { role: "system", content: SYSTEM },
        ...historyMessages(history),
        { role: "user", content: `Question: ${question}\n\nTranscript passages:\n${contextBlock(citations)}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("groq returned no content");
  return { text, model: `${data.model || model}`, usage: data.usage };
}

async function askGemini(key, question, citations, model = "gemini-2.0-flash", history = []) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          ...historyMessages(history),
          { role: "user", parts: [{ text: `${SYSTEM}\n\nQuestion: ${question}\n\nTranscript passages:\n${contextBlock(citations)}` }] },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
      }),
    }
  );
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  if (!text) throw new Error("gemini returned no content");
  return { text, model: data?.modelVersion || model, usage: data?.usageMetadata };
}

async function askOpenAI(key, question, citations, model = "gpt-4o-mini", history = []) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model, temperature: 0.2, max_tokens: 700,
      messages: [
        { role: "system", content: SYSTEM },
        ...historyMessages(history),
        { role: "user", content: `Question: ${question}\n\nTranscript passages:\n${contextBlock(citations)}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("openai returned no content");
  return { text, model: data.model || model, usage: data.usage };
}

// Circuit breaker. A key that is rejected (bad key, region restriction, suspended
// account - Groq currently answers this one with 403/1010 on every model) would
// otherwise cost a failed round-trip on EVERY question. Trip for two minutes per
// isolate and the demo stays fast while the label stays honest about why.
const BREAKER_COOLDOWN_MS = 120000;
const breakerTrippedAt = new Map();

export function breakerOpen(name) {
  const t = breakerTrippedAt.get(name);
  return t !== undefined && Date.now() - t < BREAKER_COOLDOWN_MS;
}
export function tripBreaker(name) { breakerTrippedAt.set(name, Date.now()); }

/** Which provider, if any, is available. Never throws. */
export function availableProvider(env) {
  if (env.GROQ_API_KEY) return { name: "groq", model: "llama-3.3-70b-versatile", fn: askGroq, key: env.GROQ_API_KEY };
  if (env.GEMINI_API_KEY) return { name: "gemini", model: "gemini-2.0-flash", fn: askGemini, key: env.GEMINI_API_KEY };
  if (env.OPENAI_API_KEY) return { name: "openai", model: "gpt-4o-mini", fn: askOpenAI, key: env.OPENAI_API_KEY };
  return null;
}

/**
 * Answer a question over a set of segments.
 * Always returns; on any model failure it degrades to retrieval-only.
 * @param {string} question
 * @param {any[]} segments
 * @param {any} [opts]  { env, meetingTitle, meetings, limit, history }
 * @returns {Promise<{answer: string, citations: any[], provider: string, latency_ms?: number, fallback_used?: boolean}>}
 */
export async function ask(question, segments, opts = {}) {
  const history = opts.history || [];
  const { citations, concepts } = retrieve(retrievalQueryFor(question, history), segments, {
    limit: opts.limit ?? 8, meetings: opts.meetings,
  });
  const base = composeFromRetrieval(question, citations, {
    meetingTitle: opts.meetingTitle,
    concepts,
    modelConfigured: !!availableProvider(opts.env || {}),
  });

  const provider = opts.env ? availableProvider(opts.env) : null;
  if (!provider || !citations.length) return base;

  if (breakerOpen(provider.name)) {
    return {
      ...base,
      provider: `retrieval-only (${provider.name} in cooldown after a failure)`,
      fallback_used: true,
      breaker: "open",
    };
  }

  const t0 = Date.now();
  try {
    const out = await provider.fn(provider.key, question, citations, provider.model, history);
    // Rewrite [n] citations into links back to the recording.
    const answer = out.text.replace(/\[(\d+)\]/g, (m, n) => {
      const c = citations[Number(n) - 1];
      return c ? `[${n}](${c.start_ms}ms)` : m;
    });
    return {
      answer,
      citations,
      concepts,
      provider: `${provider.name}:${out.model}`,
      latency_ms: Date.now() - t0,
      fallback_used: false,
    };
  } catch (err) {
    // Degrade rather than fail. The reviewer still gets a cited answer.
    tripBreaker(provider.name);
    return {
      ...base,
      concepts,
      provider: `retrieval-only (model ${provider.name} failed: ${String(err.message).slice(0, 120)})`,
      latency_ms: Date.now() - t0,
      fallback_used: true,
    };
  }
}

export { clock, STOPWORDS };
