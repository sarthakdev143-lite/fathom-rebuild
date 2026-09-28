// Tests for the AI layer. No test framework dependency - node:test + node:assert,
// run with: npm run test:ai
import { test } from "node:test";
import assert from "node:assert/strict";
import { retrieve, composeFromRetrieval, ask } from "../shared/ai/ask.mjs";
import { generateSummary } from "../shared/ai/summarize.mjs";
import { TEMPLATES } from "../shared/ai/templates.mjs";

const seg = (id, speaker, start, text, extra = {}) => ({
  meeting_id: id, meeting_title: id, speaker_name: speaker, speaker_color: "#000",
  start_ms: start, end_ms: start + 3000, text, words: text.split(/\s+/).length,
  is_crosstalk: 0, confidence: 0.97, ...extra,
});

const CORPUS = [
  seg("halcyon", "Dev", 600000, "The hard questions. Region pinning - can you guarantee our data stays in a named region?"),
  seg("halcyon", "Dan", 660000, "Not today. We are single region in us-east. Regional pinning is on the roadmap for Q1."),
  seg("leadership", "Marcus", 700000, "The blocker is not commercial, it is their security review. Dev Patel sent a forty-one question spreadsheet."),
  seg("leadership", "Dan", 900000, "We decided to allocate two engineers for two weeks on the security pack."),
  seg("leadership", "Priya", 2900000, "Elena, sequence it after Halcyon. Marcus needs that deal more than we need onboarding."),
  seg("leadership", "Sofia", 1500000, "I will write up the post-mortem and send it to the whole company by Friday."),
  seg("allhands", "Priya", 1000, "Welcome to the September all-hands. Nothing is off limits today, so ask anything."),
  seg("allhands", "Dan", 60000, "[crosstalk]", { is_crosstalk: 1 }),
];

test("retrieve finds an exact phrase across meetings", () => {
  const { citations } = retrieve("region pinning", CORPUS, {});
  assert.ok(citations.length >= 2, "expected at least the two region-pinning lines");
  assert.match(citations[0].text, /Region pinning/);
  assert.equal(citations[0].meeting_id, "halcyon");
});

test("retrieve stems: 'blocking' finds 'blocker'", () => {
  const { citations } = retrieve("what is blocking the deal", CORPUS, {});
  assert.ok(citations.some((c) => /blocker is not commercial/.test(c.text)),
    `expected the blocker line, got: ${citations.map((c) => c.text.slice(0, 30)).join(" | ")}`);
});

test("retrieve scopes to one meeting", () => {
  const { citations } = retrieve("region pinning", CORPUS, { meetings: new Set(["leadership"]) });
  assert.ok(citations.every((c) => c.meeting_id === "leadership"));
});

test("crosstalk and noise markers are penalised, not ranked top", () => {
  const { citations } = retrieve("crosstalk", CORPUS, {});
  assert.ok(!citations.some((c) => c.text === "[crosstalk]"), "a bare noise marker should not be an answer");
});

test("pure gibberish returns nothing rather than confident noise", () => {
  const { citations } = retrieve("zzz qqq xxx yyy", CORPUS, {});
  assert.equal(citations.length, 0);
});

test("a question made only of stopwords says so instead of bluffing", async () => {
  const out = await ask("and the the of", CORPUS, { env: {} });
  assert.equal(out.citations.length, 0);
  assert.match(out.answer, /Nothing in/);
});

test("weak matches are labelled retrieval-based and never over-returned", async () => {
  // "nothing" genuinely occurs in the all-hands transcript, so lexical search is
  // entitled to return it. On a 7-segment corpus even common English words are
  // statistically rare, so IDF treats them as informative - that is a property of
  // the tiny fixture, not of the ranking (on the real 400-candidate pool "all" is
  // not rare). What must hold regardless of corpus size: the answer is labelled as
  // retrieval-based rather than passed off as a model answer, and it does not
  // return a full page of confident-looking hits for a question with no signal.
  const out = await ask("zzz qqq nothing matches this at all", CORPUS, { env: {} });
  assert.equal(out.provider, "retrieval-only");
  assert.match(out.answer, /Retrieval-based answer|Nothing in/);
  assert.ok(out.citations.length <= 3, `expected few weak hits, got ${out.citations.length}`);
});

test("composeFromRetrieval tells the truth when nothing matched", () => {
  const out = composeFromRetrieval("qqq zzz", [], {});
  assert.equal(out.provider, "retrieval-only");
  assert.match(out.answer, /Nothing in/);
  assert.match(out.answer, /retrieval-based/);
});

test("ask() degrades to retrieval when no provider key is configured", async () => {
  const out = await ask("region pinning", CORPUS, { env: {} });
  assert.equal(out.provider, "retrieval-only");
  assert.ok(out.citations.length > 0);
  assert.match(out.answer, /Retrieval-based answer/);
});

test("ask() falls back rather than throwing when the provider fails", async () => {
  // A key that will be rejected: the contract is that the reviewer still gets an answer.
  const out = await ask("region pinning", CORPUS, { env: { GROQ_API_KEY: "gsk_invalid_test_key" } });
  assert.ok(out.citations.length > 0, "must still return citations");
  assert.equal(out.fallback_used, true);
  assert.match(out.provider, /retrieval-only \(model groq failed/);
});

test("a failing provider trips the breaker so the next question is not taxed again", async () => {
  const first = await ask("region pinning", CORPUS, { env: { GROQ_API_KEY: "gsk_invalid_test_key" } });
  assert.equal(first.fallback_used, true);
  const second = await ask("region pinning", CORPUS, { env: { GROQ_API_KEY: "gsk_invalid_test_key" } });
  assert.match(second.provider, /in cooldown after a failure/);
  assert.ok(second.citations.length > 0, "still answers while the breaker is open");
});

test("citations always carry a timestamp and speaker so they can be checked", async () => {
  const out = await ask("who writes the post-mortem", CORPUS, { env: {} });
  for (const c of out.citations) {
    assert.equal(typeof c.start_ms, "number");
    assert.ok(c.speaker_name, "citation missing speaker");
  }
  // Single-citation answers put the time in prose ("Sofia at 25:00"); multi-
  // citation answers use "[25:00]" bullets. Either way a clock time must appear.
  assert.match(out.answer, /\d+:\d{2}/, "answer should cite a clock time");
});

// ---- intent expansion ----------------------------------------------------

test("expansion finds a date commitment the question shares no words with", () => {
  const corpus = [
    seg("l", "Marcus", 800000, "Marcus tells Dev we will have the full response by the fourteenth of October."),
    seg("l", "Priya", 900000, "Welcome to the September all-hands. Nothing is off limits today."),
  ];
  const { citations } = retrieve("did anyone commit to a date", corpus, {});
  assert.ok(citations.some((c) => /fourteenth of October/.test(c.text)),
    "the answer uses 'will have ... by the fourteenth' and shares no words with the question");
});

test("retrieve reports which intent it read the question as", () => {
  const { concepts } = retrieve("how much does it cost", CORPUS, {});
  assert.ok(concepts.some((c) => c.id === "money"), `expected the money concept, got ${JSON.stringify(concepts)}`);
});

test("expansion can be turned off, and then the lexical gap reappears", () => {
  const corpus = [seg("l", "Marcus", 800000, "We will have the full response by the fourteenth of October.")];
  const off = retrieve("did anyone commit to a date", corpus, { expand: false });
  const on = retrieve("did anyone commit to a date", corpus, { expand: true });
  assert.equal(off.citations.length, 0, "without expansion nothing matches - that is the gap being closed");
  assert.ok(on.citations.length > 0, "with expansion it is found");
});

test("a passage matched only by inferred vocabulary ranks below one matched by typed words", () => {
  const corpus = [
    seg("l", "A", 1000, "The blocker is blocking everything and the block is blocked."),
    seg("l", "B", 2000, "I am concerned about the exposure and the risk of churn here."),
  ];
  const { citations } = retrieve("what is the risk", corpus, {});
  assert.equal(citations[0].speaker_name, "B", "the typed word 'risk' should outrank inferred matches");
});

// ---- conversation --------------------------------------------------------

test("an elliptical follow-up resolves against the previous question", async () => {
  const corpus = [
    seg("l", "Priya", 100000, "Sofia, write up the post-mortem with dates and send it to the whole company."),
    seg("l", "Sofia", 110000, "I will write up the post-mortem and send it to the whole company by Friday."),
    seg("l", "Dan", 200000, "Completely unrelated discussion about the design system tokens and the empty state."),
  ];
  const history = [
    { role: "user", content: "who writes the post-mortem" },
    { role: "assistant", content: "Sofia does, by Friday." },
  ];
  // "and when is it due?" carries no vocabulary of its own.
  const without = await ask("and when is it due?", corpus, { env: {}, history: [] });
  const withHistory = await ask("and when is it due?", corpus, { env: {}, history });
  assert.ok(withHistory.citations.length >= without.citations.length,
    "history should not reduce what is found");
  assert.ok(withHistory.citations.some((c) => /by Friday/.test(c.text)),
    `expected the Friday line via borrowed context, got: ${withHistory.citations.map((c) => c.text.slice(0, 30)).join(" | ")}`);
});

test("a standalone question is not polluted by unrelated history", async () => {
  const corpus = [
    seg("l", "Dan", 200000, "The design system tokens are blocking the empty state work."),
    seg("l", "Sofia", 110000, "I will write up the post-mortem and send it to the whole company by Friday."),
  ];
  const history = [{ role: "user", content: "who writes the post-mortem" }, { role: "assistant", content: "Sofia." }];
  const out = await ask("what is blocking the empty state", corpus, { env: {}, history });
  assert.ok(out.citations.some((c) => /design system tokens/.test(c.text)),
    "a full question should retrieve on its own terms");
});

// ---- summariser ----------------------------------------------------------

const MEETING = {
  id: "t1", title: "Test sync", duration_ms: 900000, participants: [{ name: "Dan", is_external: 0 }, { name: "Dev", is_external: 1 }],
};
const CHAPTERS = [{ id: "c1", topic: "a", title: "Opening", start_ms: 0, end_ms: 900000, sort_order: 0 }];
const SPEAKERS = [{ id: "s1", name: "Dan", color: "#000", talk_ms: 500000 }, { id: "s2", name: "Dev", color: "#111", talk_ms: 400000 }];

test("every template generates for every meeting without throwing", () => {
  for (const t of TEMPLATES) {
    const out = generateSummary({ meeting: MEETING, segments: CORPUS, chapters: CHAPTERS, speakers: SPEAKERS, templateKey: t.key, templates: TEMPLATES });
    assert.ok(out.headline && out.headline.length > 5, `${t.key}: empty headline`);
    assert.equal(out.sections.length, t.sections.length, `${t.key}: section count mismatch`);
    for (const s of out.sections) assert.equal(typeof s.body, "string");
  }
});

test("switching template changes the output materially, not just headings", () => {
  const std = generateSummary({ meeting: MEETING, segments: CORPUS, chapters: CHAPTERS, speakers: SPEAKERS, templateKey: "standard", templates: TEMPLATES });
  const exe = generateSummary({ meeting: MEETING, segments: CORPUS, chapters: CHAPTERS, speakers: SPEAKERS, templateKey: "executive", templates: TEMPLATES });
  assert.notDeepEqual(std.sections.map((s) => s.title), exe.sections.map((s) => s.title));
  assert.notEqual(std.sections.map((s) => s.body).join("|"), exe.sections.map((s) => s.body).join("|"));
});

test("the summariser only ever quotes lines that exist in the transcript", () => {
  for (const t of TEMPLATES) {
    const out = generateSummary({ meeting: MEETING, segments: CORPUS, chapters: CHAPTERS, speakers: SPEAKERS, templateKey: t.key, templates: TEMPLATES });
    for (const sec of out.sections) {
      for (const line of sec.body.split("\n")) {
        const m = line.match(/\*\*\[(\d+:\d+(?::\d+)?)\]\*\*\s(.+?)\s—/);
        if (!m) continue;
        const quoted = m[2].replace(/^"|"$/g, "");
        const found = CORPUS.some((c) => c.text.toLowerCase().includes(quoted.toLowerCase().slice(0, 30)));
        assert.ok(found, `${t.key}/${sec.section_key} quoted something not in the transcript: ${quoted.slice(0, 60)}`);
      }
    }
  }
});

test("authored sections override extraction, everything else still extracts", () => {
  const authored = { standard: { headline: "AUTHORED HEADLINE", overview: "authored overview", sections: { decisions: "- authored decision" } } };
  const out = generateSummary({ meeting: MEETING, segments: CORPUS, chapters: CHAPTERS, speakers: SPEAKERS, templateKey: "standard", templates: TEMPLATES, authored });
  assert.equal(out.headline, "AUTHORED HEADLINE");
  const dec = out.sections.find((s) => s.section_key === "decisions");
  assert.equal(dec.body, "- authored decision");
  const kp = out.sections.find((s) => s.section_key === "key_points");
  assert.notEqual(kp.body, "- authored decision", "unauthored sections should still extract");
});

test("action items get owners, spoken due dates and a timestamp", () => {
  const out = generateSummary({ meeting: MEETING, segments: [
    seg("t1", "Sofia", 1500000, "I will write up the post-mortem and send it to the whole company by Friday."),
    seg("t1", "Dan", 1600000, "Dan owns the written security position, due the fourteenth of October."),
  ], chapters: CHAPTERS, speakers: [{ id: "s", name: "Sofia", color: "#000", talk_ms: 1 }, { id: "d", name: "Dan", color: "#000", talk_ms: 1 }], templateKey: "standard", templates: TEMPLATES });
  const items = out.action_items;
  assert.ok(items.length >= 1, "expected at least one action item");
  const dated = items.find((a) => a.due_text);
  assert.ok(dated, "expected a due date to be picked up");
  assert.ok(items.every((a) => typeof a.start_ms === "number"));
});

// ---- embedding math -------------------------------------------------------
import { quantizeInt8, fromHex, toHex, similarity, rrfMerge, semanticReady, MIN_SEMANTIC_VECTORS } from "../shared/ai/embed.mjs";

test("int8 quantisation preserves cosine ordering", () => {
  const a = [1, 2, 3, 4, 5, 6, 7, 8].map((x) => x / 10);
  const near = [1.1, 2, 3, 4, 5, 6, 7, 8].map((x) => x / 10);
  const far = [8, 7, 6, 5, 4, 3, 2, 1].map((x) => x / 10);
  const qa = quantizeInt8(a), qn = quantizeInt8(near), qf = quantizeInt8(far);
  assert.ok(similarity(qa, qn) > similarity(qa, qf), "near must outrank far after quantisation");
  assert.ok(similarity(qa, qn) > 0.98, `expected ~1.0, got ${similarity(qa, qn)}`);
});

test("hex round-trip is lossless for int8 vectors", () => {
  const q = quantizeInt8([0.1, -0.7, 0.4, 0.9, -0.2, 0.05, 0.33, -0.51]);
  const back = fromHex(toHex(q));
  assert.deepEqual([...back], [...q]);
});

test("rrf fusion ranks an item both lists agree on above either list's sole favourite", () => {
  const lex = [{ key: "a" }, { key: "shared" }, { key: "b" }];
  const sem = [{ key: "c" }, { key: "shared" }, { key: "d" }];
  const fused = rrfMerge([lex, sem], 60, 10);
  assert.equal(fused[0].key, "shared", "agreement between rankers should win");
});

test("semantic ranking is available from the first vector, and coverage is reported not gated", () => {
  // The design embeds key moments within a 1000-requests/day free quota; partial is
  // the expected state and the UI states the scope. Gating on full coverage would
  // have switched the feature off forever.
  assert.equal(semanticReady(0, 2161), false, "no vectors, no semantic claims");
  assert.equal(semanticReady(9, 2161), false, "nine vectors is a token gesture, not a semantic layer");
  assert.equal(semanticReady(200, 2161), true, "partial coverage of key moments is the designed state");
  assert.equal(semanticReady(2161, 2161), true);
});
