// Turns authored conversation beats into timed transcript segments.
//
// WHY A GENERATOR AND NOT 4,700 HAND-WRITTEN LINES
// ------------------------------------------------
// The brief says the case that matters is an eight-person call that runs an
// hour: roughly 4,700 transcript segments. Hand-writing all of them would burn
// the entire time budget on prose and produce worse dialogue than writing the
// moments that actually matter.
//
// So every decision, number, name, disagreement, action item and tangent is
// AUTHORED in `beats`. The generator owns the mechanics around them: pacing,
// pauses, overlap, filler, turn-taking, and the connective chatter between
// authored moments. Durations derive from word count and a realistic speaking
// rate, which is what keeps synthesized audio and transcript in sync.
//
// `target_duration_ms` is hit by distributing connective talk across the gaps
// between beats, weighted per beat. Nothing is duplicated to pad: variety comes
// from `pools` of composable lines with slot substitution.
//
// Documented in README.md ("how the seed data was made"). The capture layer is
// stubbed - the brief allows that, as long as it is said out loud.

const MS_PER_WORD = 400; // ~150 wpm
const PAUSE_SHORT = [220, 620];
const PAUSE_LONG = [900, 2200];
const OVERLAP_CHANCE = 0.07;
const OVERLAP_MS = [180, 720];

const NOISE = ["[crosstalk]", "[inaudible]", "[laughs]", "[people talking over each other]", "[background noise]"];

export function rand(seed) {
  // mulberry32. Seeded data must be reproducible: the deployed DB and the
  // committed db/seed.sql have to match byte for byte or nothing is verifiable.
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
const between = (r, [lo, hi]) => Math.round(lo + r() * (hi - lo));

export function escapeSql(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(Number.isFinite(v) ? v : 0);
  if (typeof v === "boolean") return v ? "1" : "0";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

/** Slot substitution: "we're {status} on {project}" -> real variety from small pools. */
function fillTemplate(r, tpl, slots) {
  return tpl.replace(/\{(\w+)\}/g, (_, key) => {
    const slot = slots?.[key];
    if (slot === undefined || slot === null) return `{${key}}`;
    // A slot is either a POOL (array, pick from it) or a VALUE (string, use it).
    // Treating a string value as a pool indexed it with a random float and
    // returned a single random CHARACTER - "{other}" became "n". This bug has
    // been live since the first seed build; it only surfaced once composites
    // started using {other} on most lines.
    if (Array.isArray(slot)) return pick(r, slot);
    return String(slot);
  });
}

function rateFor(name) {
  return MS_PER_WORD * (0.9 + ((name.length % 5) + 1) * 0.04);
}

export function buildMeeting(meeting) {
  // Iterative calibration. Scaling the connective-talk budget by target/actual is
  // only an approximation, because pauses, noise markers and beat gaps are FIXED
  // overhead that does not scale - a single correction left the flagship at 63:00
  // against a 61:00 target, and the authored headline said 61. assemble() is pure
  // arithmetic (no synthesis), so iterate until the label and the player agree.
  const target = meeting.target_duration_ms;
  let scale = null;
  let result = assemble(meeting, null);
  if (target && result.duration_ms > 0) {
    for (let pass = 0; pass < 6; pass++) {
      const err = result.duration_ms / target;
      if (Math.abs(err - 1) <= 0.004) break;
      scale = (scale ?? 1) / err;
      result = assemble(meeting, scale);
    }
  }
  return result;
}

function assemble(meeting, talkScale) {
  const r = rand(meeting.seed ?? 12345);
  const speakers = meeting.participants.map((p, i) => ({
    id: `${meeting.id}-sp${i}`,
    meeting_id: meeting.id,
    name: p.name,
    color: p.color,
    talk_ms: 0,
    segment_ct: 0,
  }));
  const byName = Object.fromEntries(speakers.map((s) => [s.name, s]));
  const names = speakers.map((s) => s.name);
  // meeting.slots may add meeting-specific vocabulary on top of the shared set.
  const globalSlots = meeting.slots || {};

  const segments = [];
  let cursor = meeting.start_offset_ms ?? 900;

  const emit = (name, text, opts = {}) => {
    const sp = byName[name] || byName[pick(r, names)];
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const dur = Math.max(650, Math.round(words * rateFor(sp.name) * (opts.slow ? 1.3 : 1)));
    const prev = segments[segments.length - 1];
    let start = cursor;
    let crosstalk = 0;
    if (prev && !opts.noOverlap && r() < OVERLAP_CHANCE) {
      start = Math.max(0, prev.start_ms + (prev.end_ms - prev.start_ms) - between(r, OVERLAP_MS));
      crosstalk = 1;
    }
    const seg = {
      meeting_id: meeting.id,
      speaker_id: sp.id,
      speaker_name: sp.name,
      start_ms: Math.round(start),
      end_ms: Math.round(start + dur),
      text: text.trim(),
      words,
      is_crosstalk: crosstalk,
      is_filler: /\b(um|uh|you know|like|I mean|sort of|basically|kind of)\b/i.test(text) ? 1 : 0,
      confidence: opts.lowConfidence ? 0.68 + r() * 0.14 : 0.93 + r() * 0.06,
      beat: opts.beat ?? null,
      topic: opts.topic ?? meeting.default_topic ?? null,
    };
    segments.push(seg);
    sp.talk_ms += dur;
    sp.segment_ct += 1;
    cursor = seg.end_ms + (opts.pause === "long" ? between(r, PAUSE_LONG) : between(r, PAUSE_SHORT));
    return seg;
  };

  const emitBeat = (beat) => {
    for (const line of beat.lines) {
      const [name, text, opts] = Array.isArray(line) ? line : [line[0], line[1], {}];
      emit(name, text, { ...(opts || {}), beat: beat.id, topic: beat.topic, pause: beat.pause });
      recentFiller.push(text);
      if (recentFiller.length > RECENT_WINDOW) recentFiller.shift();
    }
  };

  // Connective talk draws from a pool, and an unguarded uniform pick repeats a
  // line within seconds - which in the flagship transcript looked like the same
  // person saying the same sentence twice, six seconds apart. A sliding window of
  // recently used lines makes that effectively impossible without shrinking the
  // pools.
  const recentFiller = [];
  const RECENT_WINDOW = 14;

  const pickFresh = (pool) => {
    // The window is bounded by the pool, not a constant. Bounding it by a constant
    // larger than the pool DISABLED dedup exactly where it mattered most: the
    // 10-line casual pool repeated itself every few turns, which is how the
    // flagship transcript ended up with the same sentence six seconds apart.
    const win = Math.min(RECENT_WINDOW, Math.max(0, pool.length - 1));
    const recent = recentFiller.slice(-win);
    for (let attempt = 0; attempt < 24; attempt++) {
      const line = pick(r, pool);
      if (!recent.includes(line)) return line;
    }
    return pick(r, pool); // pool genuinely exhausted inside the window
  };

  const COMPOSITES = meeting.composites || [];

  // Composites and authored pool lines in roughly equal measure. Composites give
  // the variety a long meeting needs; authored lines give it texture composites
  // cannot ("Sorry, you are on mute"). The dedup window only guards the authored
  // pool - composites are unique by construction.
  const COMPOSITE_SHARE = meeting.composite_share ?? 0.55;

  const emitFiller = (spec) => {
    const pool = spec.pool || [];
    const slots = { ...(globalSlots || {}), ...(spec.slots || meeting.slots || {}) };
    const who = spec.speakers || names;
    for (let i = 0; i < spec.turns; i++) {
      const name = pick(r, who);
      const others = who.filter((n) => n !== name);
      // speaker/other are per-turn slots. Losing them here is how literal
      // "{other}" reached a transcript for one build.
      const turnSlots = { ...slots, speaker: name, other: pick(r, others.length ? others : who) };
      let text;
      if (COMPOSITES.length && r() < COMPOSITE_SHARE) {
        text = fillTemplate(r, pick(r, COMPOSITES), turnSlots);
      } else {
        const chosen = pickFresh(pool);
        recentFiller.push(chosen);
        if (recentFiller.length > RECENT_WINDOW) recentFiller.shift();
        text = fillTemplate(r, chosen, turnSlots);
      }
      if (/\{(\w+)\}/.test(text)) {
        // A composite referenced a slot this meeting does not define. Drop the
        // line rather than ship a template artefact into a transcript.
        continue;
      }
      if (r() < 0.045) {
        emit(name, pick(r, NOISE), { lowConfidence: true, noOverlap: true, topic: spec.topic });
      }
      emit(name, text, { pause: i % 5 === 4 ? "long" : "short", topic: spec.topic });
    }
  };

  const beats = meeting.beats || [];

  if (Array.isArray(meeting.script)) {
    for (const chunk of meeting.script) {
      if (chunk.type === "beat") emitBeat(beats[chunk.index ?? 0]);
      else if (chunk.type === "talk") emitFiller(chunk);
      else if (chunk.type === "gap") cursor += chunk.ms ?? between(r, [1500, 6000]);
      else throw new Error(`${meeting.id}: unknown script chunk "${chunk.type}"`);
    }
  } else {
    // Auto-interleave: beat -> connective talk -> beat -> ... sized so the
    // meeting lands on target_duration_ms.
    const target = meeting.target_duration_ms ?? null;
    const gaps = beats.length + (meeting.trailing_talk ? 1 : 0);
    const weights = beats.map((b, i) => b.gap_weight ?? (i === 0 ? 0.5 : 1));
    if (meeting.trailing_talk) weights.push(meeting.trailing_talk.gap_weight ?? 0.8);
    const wSum = weights.reduce((a, b) => a + b, 0) || 1;

    // Rough cost of one connective turn, so ms budgets convert to turn counts.
    const avgWords = meeting.pools?.default?.length
      ? meeting.pools.default.reduce((a, t) => a + t.split(/\s+/).length, 0) / meeting.pools.default.length
      : 14;
    const msPerTurn = avgWords * MS_PER_WORD + 450;

    // Estimate authored-beat cost.
    let authored = 0;
    for (const b of beats) {
      for (const line of b.lines) {
        const text = Array.isArray(line) ? line[1] : line;
        authored += Math.max(650, text.trim().split(/\s+/).length * MS_PER_WORD) + 400;
      }
    }
    let remaining = target ? Math.max(gaps * msPerTurn * 2, target - authored) : gaps * msPerTurn * 6;
    if (talkScale) remaining *= talkScale;

    beats.forEach((beat, i) => {
      emitBeat(beat);
      const budget = (remaining * weights[i]) / wSum;
      const turns = Math.max(2, Math.round(budget / msPerTurn));
      const poolName = beat.followup_pool || "default";
      emitFiller({
        turns,
        pool: meeting.pools?.[poolName] || meeting.pools?.default || [],
        slots: beat.slots || meeting.slots,
        speakers: beat.followup_speakers,
        topic: beat.topic,
      });
    });

    if (meeting.trailing_talk) {
      const budget = (remaining * weights[weights.length - 1]) / wSum;
      emitFiller({
        turns: Math.max(2, Math.round(budget / msPerTurn)),
        pool: meeting.pools?.[meeting.trailing_talk.pool || "default"] || meeting.pools?.default || [],
        slots: meeting.slots,
        topic: meeting.trailing_talk.topic,
      });
    }
  }

  // Chapters: one per topic, boundaries at the first segment of each topic.
  const chapters = [];
  let cur = null;
  for (const s of segments) {
    if (!cur || cur.topic !== s.topic) {
      if (cur) cur.end_ms = s.start_ms;
      cur = { topic: s.topic, title: s.topic || "Meeting", start_ms: s.start_ms, end_ms: s.end_ms };
      chapters.push(cur);
    } else {
      cur.end_ms = s.end_ms;
    }
  }
  const topicTitles = Object.fromEntries((meeting.topics || []).map((t) => [t.id, t.title]));
  chapters.forEach((c, i) => {
    c.id = `${meeting.id}-ch${i}`;
    c.title = topicTitles[c.topic] || c.title;
    c.sort_order = i;
  });

  const duration_ms = segments.length ? segments[segments.length - 1].end_ms : 0;
  const word_count = segments.reduce((a, s) => a + s.words, 0);

  const sql = [];
  for (const s of speakers) {
    sql.push(
      `INSERT INTO speakers (id, meeting_id, name, color, talk_ms, segment_ct) VALUES (` +
        [s.id, s.meeting_id, s.name, s.color, s.talk_ms, s.segment_ct].map(escapeSql).join(", ") + `);`
    );
  }
  for (const s of segments) {
    sql.push(
      `INSERT INTO segments (meeting_id, speaker_id, start_ms, end_ms, text, words, is_crosstalk, is_filler, confidence) VALUES (` +
        [s.meeting_id, s.speaker_id, s.start_ms, s.end_ms, s.text, s.words, s.is_crosstalk, s.is_filler,
          Number(s.confidence.toFixed(3))].map(escapeSql).join(", ") + `);`
    );
  }
  for (const c of chapters) {
    sql.push(
      `INSERT INTO chapters (id, meeting_id, title, topic, start_ms, end_ms, sort_order) VALUES (` +
        [c.id, meeting.id, c.title, c.topic, c.start_ms, c.end_ms, c.sort_order]
          .map(escapeSql).join(", ") + `);`
    );
  }

  return {
    segments, speakers, chapters, sql, target_duration_ms: meeting.target_duration_ms ?? null,
    duration_ms, word_count,
    segment_count: segments.length,
    speaker_count: speakers.length,
    participant_count: meeting.participants.length,
  };
}

export { NOISE };
