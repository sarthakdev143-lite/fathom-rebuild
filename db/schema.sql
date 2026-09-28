-- fathom-rebuild schema (SQLite / Cloudflare D1)
--
-- Design notes:
--   * All times are integer milliseconds from the start of the recording, so
--     player<->transcript sync is pure arithmetic with no Date parsing on the
--     hot path. The one-hour, eight-speaker meeting is ~4,700 segments; the
--     indexes below are chosen for the two queries that dominate: the
--     virtualised transcript window (meeting_id, start_ms) and search.
--   * `summaries` holds one row per (meeting, template). Switching template is a
--     read, never a regeneration, which is why it feels instant.
--   * Nothing here is multi-tenant. One demo user, seeded. See docs/PLAN.md §3.

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS segment_embeddings;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS chapters;
DROP TABLE IF EXISTS share_views;
DROP TABLE IF EXISTS share_links;
DROP TABLE IF EXISTS clips;
DROP TABLE IF EXISTS highlights;
DROP TABLE IF EXISTS action_items;
DROP TABLE IF EXISTS summary_sections;
DROP TABLE IF EXISTS summaries;
DROP TABLE IF EXISTS segments;
DROP TABLE IF EXISTS speakers;
DROP TABLE IF EXISTS participants;
DROP TABLE IF EXISTS meetings;
DROP TABLE IF EXISTS calendar_events;
DROP TABLE IF EXISTS calendar_connections;
DROP TABLE IF EXISTS templates;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT '#6366f1',
  initials      TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'free',
  created_at    TEXT NOT NULL
);

-- Summary templates. Seeded, user-switchable per meeting.
CREATE TABLE templates (
  key           TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  tagline       TEXT NOT NULL,
  icon          TEXT NOT NULL DEFAULT 'doc',
  section_keys  TEXT NOT NULL,            -- JSON array of section ids this template emits
  is_default    INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE meetings (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  organizer_id      TEXT NOT NULL REFERENCES users(id),
  platform          TEXT NOT NULL DEFAULT 'zoom',   -- zoom | meet | teams
  status            TEXT NOT NULL DEFAULT 'recorded', -- upcoming | recording | processing | recorded | failed
  started_at        TEXT NOT NULL,                  -- ISO8601 UTC wall clock
  ended_at          TEXT,
  duration_ms       INTEGER NOT NULL DEFAULT 0,
  participant_count INTEGER NOT NULL DEFAULT 1,
  speaker_count     INTEGER NOT NULL DEFAULT 1,
  segment_count     INTEGER NOT NULL DEFAULT 0,
  word_count        INTEGER NOT NULL DEFAULT 0,
  audio_key         TEXT,                           -- static-asset path for the recording
  audio_duration_ms INTEGER NOT NULL DEFAULT 0,
  audio_synthesized INTEGER NOT NULL DEFAULT 0,     -- capture layer is stubbed: this is TTS
  audio_note        TEXT,
  bot_name          TEXT NOT NULL DEFAULT 'Fathom Notetaker',
  bot_joined_ms     INTEGER,
  active_template   TEXT NOT NULL DEFAULT 'standard' REFERENCES templates(key),
  recording_quality TEXT NOT NULL DEFAULT 'good',
  is_pinned         INTEGER NOT NULL DEFAULT 0,
  is_read           INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX idx_meetings_started ON meetings(started_at DESC);
CREATE INDEX idx_meetings_status  ON meetings(status);

CREATE TABLE participants (
  meeting_id   TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  person_name  TEXT NOT NULL,
  person_email TEXT,
  role         TEXT,                     -- e.g. 'Organizer', 'Customer', 'Candidate'
  company      TEXT,
  color        TEXT NOT NULL DEFAULT '#6366f1',
  is_external  INTEGER NOT NULL DEFAULT 0,
  joined_ms    INTEGER,
  left_ms      INTEGER,
  talk_ms      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (meeting_id, person_name)
);

-- Distinct voice in the transcript. Usually 1:1 with a participant, but kept
-- separate because real recordings contain 'Unknown Speaker' and the same human
-- can appear on two calls.
CREATE TABLE speakers (
  id          TEXT PRIMARY KEY,
  meeting_id  TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#6366f1',
  talk_ms     INTEGER NOT NULL DEFAULT 0,
  segment_ct  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_speakers_meeting ON speakers(meeting_id);

CREATE TABLE segments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id  TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  speaker_id  TEXT NOT NULL REFERENCES speakers(id),
  start_ms    INTEGER NOT NULL,
  end_ms      INTEGER NOT NULL,
  ord         INTEGER NOT NULL DEFAULT 0,   -- index within its meeting; the stable key embeddings hang off
  text        TEXT NOT NULL,
  words       INTEGER NOT NULL DEFAULT 0,
  is_crosstalk INTEGER NOT NULL DEFAULT 0,   -- overlapping speech
  is_filler    INTEGER NOT NULL DEFAULT 0,   -- "um", "you know"
  edited       INTEGER NOT NULL DEFAULT 0,   -- a human corrected this line
  confidence   REAL NOT NULL DEFAULT 0.97
);
CREATE INDEX idx_segments_window ON segments(meeting_id, start_ms);
CREATE INDEX idx_segments_speaker ON segments(speaker_id);

CREATE TABLE summaries (
  id            TEXT PRIMARY KEY,
  meeting_id    TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  template_key  TEXT NOT NULL REFERENCES templates(key),
  headline      TEXT NOT NULL,
  overview      TEXT NOT NULL,
  generated_at  TEXT NOT NULL,
  generated_by  TEXT NOT NULL DEFAULT 'local-deterministic',  -- or 'groq:llama-3.3-70b' etc
  tokens_in     INTEGER NOT NULL DEFAULT 0,
  tokens_out    INTEGER NOT NULL DEFAULT 0,
  latency_ms    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (meeting_id, template_key)
);
CREATE INDEX idx_summaries_meeting ON summaries(meeting_id);

CREATE TABLE summary_sections (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  summary_id    TEXT NOT NULL REFERENCES summaries(id) ON DELETE CASCADE,
  section_key   TEXT NOT NULL,      -- decisions | action_items | risks | ...
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,      -- markdown-ish
  sort_order    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_sections_summary ON summary_sections(summary_id);

CREATE TABLE action_items (
  id           TEXT PRIMARY KEY,
  meeting_id   TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  summary_id   TEXT REFERENCES summaries(id) ON DELETE CASCADE,
  text         TEXT NOT NULL,
  owner_name   TEXT,
  due_text     TEXT,               -- 'by Friday', 'EOW' - kept as spoken, not parsed
  start_ms     INTEGER NOT NULL DEFAULT 0,   -- jump-to-moment in the recording
  segment_id   INTEGER,
  done         INTEGER NOT NULL DEFAULT 0,
  confidence   REAL NOT NULL DEFAULT 0.9,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_ai_meeting ON action_items(meeting_id);

CREATE TABLE highlights (
  id           TEXT PRIMARY KEY,
  meeting_id   TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  start_ms     INTEGER NOT NULL,
  end_ms       INTEGER NOT NULL,
  label        TEXT,
  note         TEXT,
  source       TEXT NOT NULL DEFAULT 'playback',  -- playback | live | transcript-select
  created_by   TEXT NOT NULL DEFAULT 'demo-user',
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_hl_meeting ON highlights(meeting_id, start_ms);

CREATE TABLE clips (
  id            TEXT PRIMARY KEY,
  meeting_id    TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  highlight_id  TEXT REFERENCES highlights(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  start_ms      INTEGER NOT NULL,
  end_ms        INTEGER NOT NULL,
  transcript    TEXT NOT NULL DEFAULT '',   -- denormalised so a share page needs one query
  created_at    TEXT NOT NULL
);

-- Share links must open for somebody who was never on the call and has no
-- account, so the token is the only auth and the payload is self-contained.
CREATE TABLE share_links (
  token         TEXT PRIMARY KEY,
  meeting_id    TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  clip_id       TEXT REFERENCES clips(id) ON DELETE CASCADE,
  scope         TEXT NOT NULL DEFAULT 'clip',   -- clip | summary | transcript | meeting
  title         TEXT NOT NULL,
  created_by    TEXT NOT NULL DEFAULT 'demo-user',
  created_at    TEXT NOT NULL,
  expires_at    TEXT,
  view_count    INTEGER NOT NULL DEFAULT 0,
  allow_download INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_share_meeting ON share_links(meeting_id);

-- Derived at seed time from the authored beats, so the transcript is navigable
-- by topic instead of being one 4,700-row scroll.
-- Int8-quantised unit vectors, 768 dims, one per segment. ~770 bytes a row, so the
-- whole corpus is ~1.7 MB - small enough to hold in an isolate-level cache and scan
-- in milliseconds, which is what makes semantic search free at request time.
CREATE TABLE segment_embeddings (
  meeting_id  TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  ord         INTEGER NOT NULL,
  vec         BLOB NOT NULL,
  model       TEXT NOT NULL,
  PRIMARY KEY (meeting_id, ord)
);

CREATE TABLE chapters (
  id          TEXT PRIMARY KEY,
  meeting_id  TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  topic       TEXT,
  start_ms    INTEGER NOT NULL,
  end_ms      INTEGER NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_chapters_meeting ON chapters(meeting_id, start_ms);

CREATE TABLE share_views (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token       TEXT NOT NULL REFERENCES share_links(token) ON DELETE CASCADE,
  viewed_at   TEXT NOT NULL,
  referrer    TEXT,
  ua_family   TEXT
);

-- Product settings. Single-user demo, so these are global rather than per-user.
-- Every key here is wired to a real effect; see docs/SETTINGS.md for what each
-- one actually does, because a toggle that does nothing is worse than no toggle.
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE calendar_connections (
  id            TEXT PRIMARY KEY,
  provider      TEXT NOT NULL,      -- google | microsoft
  email         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'connected',  -- disconnected | connected | error
  scopes        TEXT NOT NULL DEFAULT '',
  connected_at  TEXT,
  is_stub       INTEGER NOT NULL DEFAULT 1          -- real OAuth needs verified client ids
);

CREATE TABLE calendar_events (
  id               TEXT PRIMARY KEY,
  connection_id    TEXT NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE,
  external_id      TEXT NOT NULL,
  title            TEXT NOT NULL,
  starts_at        TEXT NOT NULL,
  ends_at          TEXT NOT NULL,
  organizer        TEXT,
  attendee_json    TEXT NOT NULL DEFAULT '[]',
  platform         TEXT NOT NULL DEFAULT 'zoom',
  join_url         TEXT,
  notetaker_status TEXT NOT NULL DEFAULT 'scheduled',  -- off | scheduled | joining | active
  meeting_id       TEXT REFERENCES meetings(id) ON DELETE SET NULL
);
CREATE INDEX idx_events_start ON calendar_events(starts_at);
