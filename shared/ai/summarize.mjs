// Deterministic extractive summariser.
//
// WHY THIS EXISTS
// ---------------
// The live link is judged by a stranger who has no account, no key and no
// patience. If summaries required an LLM at request time, the demo would depend
// on a quota, a network hop and a secret being present in the deployment. So the
// default provider is this: real extraction over the real transcript, which
// produces a genuinely useful summary for ANY meeting and ANY template, offline.
//
// It runs in two places from one module: at seed time (Node, to pre-compute
// summaries for the eight seeded meetings so template switching is instant) and
// at request time (Worker, for anything created during a live session).
//
// If GROQ_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY is present in Worker secrets,
// shared/ai/providers.mjs upgrades generation to a live model behind the same
// interface and falls back to this on any error. See docs/PLAN.md §4.
//
// It is extractive, not abstractive: every line it produces is a line somebody
// actually said, with a timestamp back into the recording. That is a deliberate
// trust choice - a notetaker that paraphrases into confident nonsense is worse
// than one that quotes.

const DECISION = /\b(we decided|decision is|we'?re going to|we are going to|let'?s go with|approved|i'?m happy with|we agreed|go ahead|do it today|that'?s the call|we'?ll do)\b/i;
const ACTION = /\b(i'?ll|i will|we'?ll|someone should|need to|i can|owns?|owning|take that|send it|write it up|follow up|bring that to|put it in|book|schedule)\b/i;
const RISK = /\b(risk|risky|concern|concerned|worried|worry|blocker|blocked|slip|slipped|churn|exposure|problem|issue|falls over|lose the deal|not where we want)\b/i;
const NUMBER = /(\$?\d[\d,]*(?:\.\d+)?\s?(?:%|percent|k|m\b|million|thousand|bn|days?|weeks?|months?|people|accounts?|hours?|minutes?|seconds?)|\b\d+\.\d+\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|nineteen|thirty|forty|fifty|sixty|ninety)\s+(?:percent|days?|weeks?|months?|people|accounts?|minutes?))/i;
const QUESTION = /\?\s*$/;
const ESCALATION = /\b(board|investor|above this group|to me before|bring that to me|legal|procurement|comms)\b/i;
const OBJECTION = /\b(but|however|concern|push back|not exactly|that'?s more expensive|cheaper|i would rather|problem is|what about)\b/i;
const SIGNAL = /\b(good sign|they want|budget|signed|renewal|champion|procurement|quote|discount|pilot|reference)\b/i;
const CANDIDATE_STRENGTH = /\b(strong|good answer|impressive|you cannot fake|exactly what i want|not rehearsed)\b/i;

const FILLER_ONLY = /^\[(crosstalk|inaudible|laughs|people talking over each other|background noise)\]$/i;

function ms(mmss) {
  const s = Math.max(0, Math.round(mmss / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Split a segment into sentences; extraction works at sentence granularity. */
function sentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

function clean(s) {
  return s
    .replace(/\b(um|uh|er)\b[,.]?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,\s]+|[,\s]+$/g, "")
    .trim();
}

function scoreSentence(s) {
  let n = 0;
  if (DECISION.test(s)) n += 5;
  if (ACTION.test(s)) n += 3;
  if (NUMBER.test(s)) n += 2;
  if (RISK.test(s)) n += 2;
  if (ESCALATION.test(s)) n += 1;
  if (SIGNAL.test(s)) n += 2;
  const words = s.split(/\s+/).length;
  if (words >= 8 && words <= 46) n += 2; // substantive but not a monologue
  if (words < 4) n -= 3;
  return n;
}

/** Candidate lines for extraction: substantive, non-filler, scored. */
function candidates(segments) {
  const out = [];
  for (const seg of segments) {
    if (FILLER_ONLY.test(seg.text)) continue;
    for (const raw of sentences(seg.text)) {
      const s = clean(raw);
      if (s.length < 12) continue;
      out.push({ ...seg, sentence: s, score: scoreSentence(s) });
    }
  }
  return out;
}

function dedupe(lines) {
  const seen = new Set();
  return lines.filter((l) => {
    const k = l.sentence.toLowerCase().slice(0, 60);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function bullets(lines, { limit = 6, minScore = 1 } = {}) {
  return dedupe(lines)
    .filter((l) => l.score >= minScore)
    .sort((a, b) => b.score - a.score || a.start_ms - b.start_ms)
    .slice(0, limit)
    .sort((a, b) => a.start_ms - b.start_ms)
    .map((l) => `- **[${ms(l.start_ms)}]** ${cap(l.sentence)} — *${l.speaker_name}*`)
    .join("\n");
}

// ---- action items ----------------------------------------------------------

const DUE = /\b(by|before|due|until)\s+(friday|monday|tuesday|wednesday|thursday|saturday|sunday|the end of the (?:week|month|day)|eod|eow|tomorrow|next week|the \d{1,2}(?:st|nd|rd|th)?(?: of \w+)?|\d{1,2} (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*)/i;
const OWNER_NAMED = /\b([A-Z][a-z]+)\s+(?:owns?|will|is going to|can|should|to)\b/;

function extractActions(segments, knownNames) {
  const out = [];
  for (const seg of segments) {
    if (FILLER_ONLY.test(seg.text)) continue;
    for (const raw of sentences(seg.text)) {
      const s = clean(raw);
      if (!ACTION.test(s) || s.split(/\s+/).length < 5) continue;
      if (!/\b(i'?ll|i will|we'?ll|owns?|need to|should|can|send|write|book|schedule|bring|put)\b/i.test(s)) continue;

      let owner = null;
      const named = s.match(OWNER_NAMED);
      if (named && knownNames.some((n) => n.split(" ")[0] === named[1])) {
        owner = knownNames.find((n) => n.split(" ")[0] === named[1]);
      } else if (/\b(i'?ll|i will|i can|i'?m happy to own)\b/i.test(s)) {
        owner = seg.speaker_name;
      } else if (/\b(we'?ll|we will|someone should)\b/i.test(s)) {
        owner = null;
      } else {
        continue;
      }

      const due = s.match(DUE);
      out.push({
        text: cap(s.replace(/^(okay|right|so|alright|and|well)[,\s]+/i, "")),
        owner_name: owner,
        due_text: due ? due[0].replace(/^(by|before|due|until)\s+/i, "") : null,
        start_ms: seg.start_ms,
        segment_id: seg.id ?? null,
        confidence: (owner ? 0.82 : 0.6) + (due ? 0.1 : 0) + (NUMBER.test(s) ? 0.05 : 0),
      });
    }
  }
  // Rank, then de-duplicate near-identical asks and restore chronological order.
  const seen = new Set();
  return out
    .sort((a, b) => b.confidence - a.confidence)
    .filter((a) => {
      const k = a.text.toLowerCase().slice(0, 42);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.start_ms - b.start_ms);
}

// ---- section strategies ----------------------------------------------------

function topicOf(seg, chapters) {
  if (!chapters?.length) return null;
  return chapters.find((c) => seg.start_ms >= c.start_ms && seg.start_ms < c.end_ms) || chapters[chapters.length - 1];
}

const STRATEGIES = {
  overview: (c) => {
    const mins = Math.round(c.meeting.duration_ms / 60000);
    const who = c.speakers.map((s) => s.name.split(" ")[0]).join(", ");
    const topics = (c.chapters || []).map((ch) => ch.title).filter((t) => t && t !== "Meeting");
    return [
      `${c.meeting.title} ran ${mins} minute${mins === 1 ? "" : "s"} with ${c.speakers.length} ${c.speakers.length === 1 ? "person" : "people"} speaking (${who}).`,
      topics.length ? `Topics covered: ${topics.join("; ")}.` : "",
      `${c.segments.length} transcript segments, ${c.word_count.toLocaleString("en-US")} words.`,
      c.actions.length ? `${c.actions.length} action items were extracted, ${c.actions.filter((a) => a.owner_name).length} with a named owner.` : "",
    ].filter(Boolean).join(" ");
  },

  bottom_line: (c) => {
    const dec = STRATEGIES.decisions(c);
    const risk = STRATEGIES.risks(c);
    return [dec, risk].filter((x) => x && x !== NO_CONTENT).join("\n\n") || NO_CONTENT;
  },

  key_points: (c) => bullets(c.cands.filter((l) => l.score >= 4), { limit: 8 }),

  decisions: (c) =>
    bullets(c.cands.filter((l) => DECISION.test(l.sentence)), { limit: 8, minScore: 0 }) || NO_CONTENT,

  actions: (c) => {
    if (!c.actions.length) return NO_CONTENT;
    return c.actions
      .map((a) => {
        const owner = a.owner_name ? `**${a.owner_name}**` : "**unassigned**";
        const due = a.due_text ? ` _(due ${a.due_text})_` : "";
        return `- [${ms(a.start_ms)}] ${owner} — ${a.text}${due}`;
      })
      .join("\n");
  },

  questions: (c) =>
    bullets(c.cands.filter((l) => QUESTION.test(l.sentence)), { limit: 7, minScore: 0 }) || NO_CONTENT,

  metrics: (c) => {
    const withNum = c.cands.filter((l) => NUMBER.test(l.sentence));
    return bullets(withNum, { limit: 10, minScore: 0 }) || NO_CONTENT;
  },

  risks: (c) => bullets(c.cands.filter((l) => RISK.test(l.sentence)), { limit: 7, minScore: 0 }) || NO_CONTENT,

  escalations: (c) =>
    bullets(c.cands.filter((l) => ESCALATION.test(l.sentence) && (DECISION.test(l.sentence) || RISK.test(l.sentence) || /\b(before|bring|to me)\b/i.test(l.sentence))), { limit: 5, minScore: 0 }) || NO_CONTENT,

  customer_context: (c) => {
    const ext = c.segments.filter((s) => s.is_external);
    const src = (ext.length ? ext : c.segments);
    return bullets(candidates(src).filter((l) => l.score >= 2), { limit: 6 });
  },

  pain_points: (c) =>
    bullets(c.cands.filter((l) => /\b(problem|pain|drops|broken|slow|burned|nobody notices|bottleneck|blocked|worried|falling behind)\b/i.test(l.sentence)), { limit: 7, minScore: 0 }) || NO_CONTENT,

  objections: (c) =>
    bullets(c.cands.filter((l) => OBJECTION.test(l.sentence) && (l.is_external || /\b(cheaper|expensive|concern|blocker|not|push back)\b/i.test(l.sentence))), { limit: 7, minScore: 0 }) || NO_CONTENT,

  buying_signals: (c) =>
    bullets(c.cands.filter((l) => SIGNAL.test(l.sentence) || CANDIDATE_STRENGTH.test(l.sentence)), { limit: 6, minScore: 0 }) || NO_CONTENT,

  next_steps: (c) => STRATEGIES.actions(c),

  candidate: (c) => {
    const ext = c.meeting.participants.filter((p) => p.is_external);
    const who = ext.length ? ext.map((p) => `${p.name} (${p.role}${p.company ? ", " + p.company : ""})`).join(", ") : "not specified";
    const interviewers = c.meeting.participants.filter((p) => !p.is_external).map((p) => p.name).join(", ");
    return `Candidate: ${who}.\nInterviewers: ${interviewers}.\nFormat: ${Math.round(c.meeting.duration_ms / 60000)} minutes, ${c.chapters?.length || 0} sections.`;
  },

  technical_evidence: (c) =>
    bullets(c.cands.filter((l) => l.speaker_name === c.externalSpeaker && (NUMBER.test(l.sentence) || /\b(design|system|architecture|approach|implement|scale|region|queue|buffer)\b/i.test(l.sentence))), { limit: 7, minScore: 0 }) || NO_CONTENT,

  judgement_evidence: (c) =>
    bullets(c.cands.filter((l) => l.speaker_name === c.externalSpeaker && /\b(incident|decision|authority|rehears|blame|went badly|changed|push back|uncomfortable)\b/i.test(l.sentence)), { limit: 6, minScore: 0 }) || NO_CONTENT,

  concerns: (c) =>
    bullets(c.cands.filter((l) => l.speaker_name !== c.externalSpeaker && (RISK.test(l.sentence) || /\b(comp|concern|salary|offer|competing)\b/i.test(l.sentence))), { limit: 6, minScore: 0 }) || NO_CONTENT,

  recommendation: (c) => {
    const debrief = c.cands.filter((l) => l.topic === c.lastTopic && l.speaker_name !== c.externalSpeaker);
    const body = bullets(debrief, { limit: 5, minScore: 0 });
    return body === NO_CONTENT ? NO_CONTENT : `${body}\n\n_Hire signal based on the debrief held after the candidate left the call._`;
  },

  chapters: (c) => {
    if (!c.chapters?.length) return NO_CONTENT;
    return c.chapters
      .map((ch) => {
        const inChapter = c.cands.filter((l) => l.start_ms >= ch.start_ms && l.start_ms < ch.end_ms);
        const top = bullets(inChapter, { limit: 4, minScore: 2 });
        return `### ${ch.title}  _(${ms(ch.start_ms)} – ${ms(ch.end_ms)})_\n${top || "_No substantive moments extracted from this section._"}`;
      })
      .join("\n\n");
  },
};

const NO_CONTENT = "_Nothing matched this section in the transcript._";

// ---- headline --------------------------------------------------------------

function headlineFor(c) {
  const dec = c.cands.filter((l) => DECISION.test(l.sentence)).length;
  const risks = c.cands.filter((l) => RISK.test(l.sentence)).length;
  const mins = Math.round(c.meeting.duration_ms / 60000);
  const topics = (c.chapters || []).map((x) => x.title).filter((t) => t && t !== "Meeting");
  const lead = topics.slice(0, 2).join(" and ");

  if (c.meeting.participants.length === 1) {
    return `Solo recording test — ${mins} min, ${c.actions.length} action item${c.actions.length === 1 ? "" : "s"} picked up`;
  }
  if (dec === 0) return `${mins} minutes, ${c.speakers.length} speakers — discussion without a recorded decision`;
  return `${dec} decision${dec === 1 ? "" : "s"} across ${mins} minutes${lead ? ` — ${lead}` : ""}${risks > 2 ? `, ${risks} risk mentions` : ""}`;
}

/**
 * @param {any} input  { meeting, segments, chapters, speakers, templateKey,
 *                      templates, authored? } - authored is a map keyed by
 *                      template key, whose values may carry headline, overview,
 *                      sections and action_items overrides.
 */
export function generateSummary(input) {
  const { meeting, segments, chapters = [], speakers = [], templateKey } = input;
  const tpl = (input.templates || []).find((t) => t.key === templateKey);
  if (!tpl) throw new Error(`unknown template: ${templateKey}`);

  const knownNames = speakers.map((s) => s.name);
  const external = meeting.participants.filter((pp) => pp.is_external);
  const cands = candidates(segments);
  const actions = extractActions(segments, knownNames);
  const word_count = segments.reduce((a, s) => a + (s.words || s.text.split(/\s+/).length), 0);
  const lastTopic = chapters.length ? chapters[chapters.length - 1].topic || chapters[chapters.length - 1].title : null;

  const ctx = {
    meeting: { ...meeting, duration_ms: meeting.duration_ms || (segments.at(-1)?.end_ms ?? 0) },
    segments, chapters, speakers, cands, actions, word_count, lastTopic,
    externalSpeaker: external[0]?.name ?? null,
  };

  const authored = input.authored?.[templateKey];
  const sections = tpl.sections.map((secDef, i) => {
    const handWritten = authored?.sections?.[secDef.key];
    const body = handWritten ?? (STRATEGIES[secDef.extract] ? STRATEGIES[secDef.extract](ctx) : NO_CONTENT);
    return { section_key: secDef.key, title: secDef.title, body, sort_order: i };
  });

  const overview = authored?.overview ?? STRATEGIES.overview(ctx);
  const headline = authored?.headline ?? headlineFor(ctx);

  return {
    headline,
    overview,
    sections,
    action_items: authored?.action_items
      ? authored.action_items.map((a) => ({
          ...a,
          start_ms: a.start_ms ?? beatTime(segments, a.at_beat),
        }))
      : actions,
    generated_by: authored ? "authored+extractive" : "local-deterministic",
  };
}

function beatTime(segments, beatId) {
  if (!beatId) return 0;
  const s = segments.find((x) => x.beat === beatId);
  return s ? s.start_ms : 0;
}

export { ms, extractActions, candidates, NO_CONTENT };
