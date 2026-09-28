// Creates a meeting row (and every dependent row) from an arbitrary transcript.
//
// Used by two very different inputs that must produce the same kind of artefact:
//   - POST /api/upload          real audio -> gemini-3.5-transcribe -> segments
//   - POST /api/meetings/from-transcript   segments captured live in the browser
//     from the gemini-3.5-transcribe-live relay
//
// Summaries for all six templates are generated at creation time with the same
// deterministic summariser the seed build uses, so an uploaded meeting behaves
// exactly like a seeded one: template switching is a read, actions are jumpable.

import { generateSummary } from "../../shared/ai/summarize.mjs";
import { TEMPLATES, DEFAULT_TEMPLATE } from "../../shared/ai/templates.mjs";

export type NewSegment = {
  speaker: string;
  text: string;
  start_ms: number;
  end_ms: number;
  words?: number;
};

const PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#84cc16"];

export async function createMeetingFromSegments(
  env: any,
  opts: { title: string; platform: string; segments: NewSegment[]; durationMs: number; source: string; note?: string }
): Promise<{ id: string; segment_count: number; speaker_count: number }> {
  const id = `m-${opts.source}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const now = new Date().toISOString();
  const started = new Date(Date.now() - opts.durationMs).toISOString();
  const ended = new Date().toISOString();

  const speakerNames = [...new Set(opts.segments.map((s) => s.speaker))];
  const colors = Object.fromEntries(speakerNames.map((n, i) => [n, PALETTE[i % PALETTE.length]]));
  const talk = Object.fromEntries(speakerNames.map((n) => [n, 0]));
  const counts = Object.fromEntries(speakerNames.map((n) => [n, 0]));
  for (const s of opts.segments) {
    talk[s.speaker] += Math.max(0, s.end_ms - s.start_ms);
    counts[s.speaker] += 1;
  }
  const wordCount = opts.segments.reduce((a, s) => a + (s.words || s.text.split(/\s+/).length), 0);

  await env.DB.prepare(
    `INSERT INTO meetings (id, title, organizer_id, platform, status, started_at, ended_at, duration_ms,
       participant_count, speaker_count, segment_count, word_count, audio_key, audio_duration_ms,
       audio_synthesized, audio_note, bot_name, bot_joined_ms, active_template, recording_quality,
       is_pinned, is_read, created_at, updated_at)
     VALUES (?1,?2,?3,?4,'recorded',?5,?6,?7,?8,?9,?10,?11,NULL,?12,0,?13,?14,0,?15,'mixed',0,0,?16,?16)`
  ).bind(
    id, opts.title, "u-priya", opts.platform, started, ended, opts.durationMs,
    speakerNames.length, speakerNames.length, opts.segments.length, wordCount,
    opts.durationMs,
    opts.note || "Real recording transcribed with Gemini ASR. Timings are distributed proportionally by word count: the transcribe models return text, not word-level timestamps.",
    "Gemini ASR",
    DEFAULT_TEMPLATE,
    now
  ).run();

  for (const name of speakerNames) {
    const spId = `${id}-${name.replace(/\W+/g, "-").toLowerCase()}`;
    await env.DB.prepare(
      `INSERT INTO speakers (id, meeting_id, name, color, talk_ms, segment_ct) VALUES (?1,?2,?3,?4,?5,?6)`
    ).bind(spId, id, name, colors[name], talk[name], counts[name]).run();
    await env.DB.prepare(
      `INSERT INTO participants (meeting_id, person_name, person_email, role, company, color, is_external, joined_ms, left_ms, talk_ms)
       VALUES (?1,?2,NULL,?3,'Uploaded recording',?4,1,0,?5,?6)`
    ).bind(id, name, opts.source === "live-asr" ? "Live speaker" : "Speaker", colors[name], opts.durationMs, talk[name]).run();
  }
  const speakerIds = Object.fromEntries(
    speakerNames.map((n) => [n, `${id}-${n.replace(/\W+/g, "-").toLowerCase()}`])
  );
  for (const s of opts.segments) {
    await env.DB.prepare(
      `INSERT INTO segments (meeting_id, speaker_id, start_ms, end_ms, text, words, is_crosstalk, is_filler, confidence)
       VALUES (?1,?2,?3,?4,?5,?6,0,0,0.9)`
    ).bind(id, speakerIds[s.speaker], s.start_ms, s.end_ms, s.text, s.words || s.text.split(/\s+/).length).run();
  }

  // Chapters: one per 5 minutes, or a single chapter for short uploads.
  const chapterMs = Math.max(60000, Math.round(opts.durationMs / Math.max(1, Math.min(8, Math.round(opts.durationMs / 300000)))));
  let ci = 0;
  for (let start = 0; start < opts.durationMs; start += chapterMs, ci++) {
    await env.DB.prepare(
      `INSERT INTO chapters (id, meeting_id, title, topic, start_ms, end_ms, sort_order) VALUES (?1,?2,?3,?4,?5,?6,?7)`
    ).bind(`${id}-ch${ci}`, id, `Part ${ci + 1}`, `part-${ci + 1}`, start, Math.min(opts.durationMs, start + chapterMs), ci).run();
  }
  const chapters = (await env.DB.prepare(`SELECT * FROM chapters WHERE meeting_id = ?1 ORDER BY start_ms`).bind(id).all()).results as any[];

  // Summaries + action items for every template, same code path as the seed.
  const speakersRows = (await env.DB.prepare(`SELECT * FROM speakers WHERE meeting_id = ?1`).bind(id).all()).results as any[];
  const meetingRow = {
    id, title: opts.title, duration_ms: opts.durationMs, participants: speakerNames.map((n) => ({ name: n, is_external: 1 })),
    segment_count: opts.segments.length, word_count: wordCount,
  };
  const segsWithMeta = opts.segments.map((s) => ({ ...s, speaker_name: s.speaker, is_external: 0 }));
  for (const tpl of TEMPLATES) {
    const out: any = generateSummary({
      meeting: meetingRow, segments: segsWithMeta, chapters, speakers: speakersRows,
      templateKey: tpl.key, templates: TEMPLATES as any[],
    });
    const summaryId = `${id}-${tpl.key}`;
    await env.DB.prepare(
      `INSERT INTO summaries (id, meeting_id, template_key, headline, overview, generated_at, generated_by, tokens_in, tokens_out, latency_ms)
       VALUES (?1,?2,?3,?4,?5,?6,'local-deterministic',?7,?8,0)`
    ).bind(summaryId, id, tpl.key, out.headline, out.overview, now, wordCount, Math.round(out.overview.length / 4)).run();
    for (const sec of out.sections) {
      await env.DB.prepare(
        `INSERT INTO summary_sections (summary_id, section_key, title, body, sort_order) VALUES (?1,?2,?3,?4,?5)`
      ).bind(summaryId, sec.section_key, sec.title, sec.body, sec.sort_order).run();
    }
    const items = (out.action_items || []).slice(0, 12);
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      await env.DB.prepare(
        `INSERT INTO action_items (id, meeting_id, summary_id, text, owner_name, due_text, start_ms, segment_id, done, confidence, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,NULL,0,?8,?9)`
      ).bind(`${summaryId}-ai${i}`, id, summaryId, a.text, a.owner_name, a.due_text, a.start_ms || 0, Number((a.confidence || 0.7).toFixed(2)), now).run();
    }
  }

  return { id, segment_count: opts.segments.length, speaker_count: speakerNames.length };
}
