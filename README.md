# fathom-rebuild

A rebuild of [fathom.video](https://fathom.video) — the AI meeting notetaker — built for the 8x
take-home assignment.

**Live:** <https://fathom-rebuild.sarthak-fathom.workers.dev>
**Walkthrough:** `docs/WALKTHROUGH-SCRIPT.md` — timed shot-by-shot script (recorded separately, camera on, under 5 minutes)
**Product recon:** `docs/RECON.md` — what real Fathom does, feature by feature, with sources and what maps to what here
**Settings reference:** `docs/SETTINGS.md` — what every toggle does and where to see it
**Agent capture log:** [`.agent-logs/`](.agent-logs/) — every prompt and final response from the build
**Capture verification:** [`CAPTURE-TEST.md`](CAPTURE-TEST.md) — read this first
**Plan and trade-offs:** [`docs/PLAN.md`](docs/PLAN.md)

---

## What this is

An AI meeting notetaker: meetings recorded, transcribed, summarised with switchable templates,
action items extracted with owners and due dates, moments highlighted mid-call, clips shared with
people who were never on the call, and search across every word anyone said.

Eight meetings are seeded with real content — **2,773 transcript lines, 32,069 words, 48 summaries
across 6 templates, 222 action items**, including a **61-minute, eight-speaker leadership sync**,
which is the case the brief says actually matters.

## The capture layer: stubbed for the seeded meetings, REAL for anything you bring it

The eight seeded meetings were never recorded — no bot joins a real Zoom, Meet or Teams call. But the
capture layer is no longer purely simulated: with a `GEMINI_API_KEY` in Worker secrets there are two
genuinely real paths.

1. **Upload a recording** (`Upload a recording` on the meetings list) → `gemini-3.5-transcribe`
   transcribes the file (~3s for a 2-minute call) → a meeting is built exactly like a seeded one: six
   pre-generated summaries, jumpable action items, shareable clips. Verified against ground truth in
   `scripts/verify-asr.mjs`: transcribing this project's own synthesized audio reproduces the authored
   transcript at **95.2% word F1** — a check on the ASR path and, incidentally, on the TTS.
2. **Transcribe your microphone** (`Live` → "Transcribe my microphone") → the browser streams 16 kHz PCM
   over a WebSocket to this Worker, which relays it to `gemini-3.5-transcribe-live` on the Live API.
   Interim hypotheses render as you speak; finalised lines become a saved meeting when you stop. The key
   never reaches the browser, because the Worker holds it.

What is still stubbed, said plainly as the brief requires:

- No bot dials into a real Zoom/Meet/Teams call. The *source* of audio is you, not a meeting platform.
- The eight seeded meetings are authored + synthesized, not recorded.
- Uploaded and live-transcribed audio is **not stored**: timings are distributed proportionally by word
  count (the transcribe models return text, not word-level timestamps), speakers come from whatever
  labels the model emits, and every such meeting says so in its own `audio_note`.

For the seeded meetings themselves:

- **Transcripts** are authored and generated (see [How the seed data was made](#how-the-seed-data-was-made)).
- **Audio** is synthesized from the transcript with per-speaker neural TTS, so playback and transcript
  genuinely stay in sync rather than a progress bar pretending to.
- **The live meeting view** streams a seeded transcript over Server-Sent Events, so the notetaker
  "joins", lines arrive as they are spoken, and a highlight taken mid-call persists to the database.
- **Calendar connect** is stubbed OAuth. Real Google/Microsoft OAuth needs verified client IDs, a
  consent screen and an approved redirect domain. The states, scopes and screens are the real ones.

The time that would have gone into meeting SDKs and OAuth review went into everything downstream of
capture, which is where the product actually lives.

**Recon limitation, also stated plainly:** I could not create a real fathom.video account — this
build environment has no email inbox to verify a signup with. Recon came from Fathom's public site,
help centre and Chrome Web Store listing (`docs/RECON.md`, with sources).

`docs/screenshots/` holds fifteen captures from `npm run browser:shots`, taken in real Chromium at
1440×900 and 390×844.

## How to look at it

Start here, in this order:

1. **The meetings list** — eight recordings, grouped by date, with headline summaries and speaker stacks.
2. **Weekly Leadership Sync (61 min, 8 people)** — the load-bearing case. Scrub the player and watch
   the transcript follow; click any line to seek. The list is virtualised, so an hour of transcript
   scrolls smoothly. It is keyboard-driven too: `space` play/pause, `←`/`→` 10s (`shift` 30s), `j`/`k`
   previous/next line, `h` highlight here.
3. **Switch templates** in the right rail — Standard → Executive brief changes the output
   materially, not just the headings. All six templates are pre-generated for all eight meetings, so
   switching is a database read and feels instant.
4. **Action items** — owners, spoken due dates ("by Friday", "end of October"), and a timestamp that
   seeks the recording to the moment it was said. Tick one; it persists.
5. **Highlight this moment** while playing — it lands in the highlights tab and on the timeline.
6. **Share** → a link that opens for somebody with no account, where the token is the only auth.
7. **Ask** — the "Ask" tab asks one meeting; the panel on Search asks all eight. Try
   *"What is blocking the Halcyon deal?"* or *"What did we decide about the comp band?"* Every answer
   is quoted verbatim with a timestamp, a speaker and a meeting, and clicking a citation seeks the
   recording. Gibberish gets an honest "nothing matches" rather than a confident bluff.
8. **Search** — every word of all 2,178 lines, plus titles, actions and highlights. Try
   "region pinning", "rollback", "forty-seven minutes".
9. **Live** — start a simulated call and take a highlight mid-stream.
10. **Settings** — seven controls, every one wired to something you can go and look at: turn off
    action-item extraction and the tab explains itself rather than going mysteriously empty, switch
    transcript density, force Ask onto retrieval-only, or auto-share a summary link per meeting.
    `docs/SETTINGS.md` says what each does.

## Architecture

One Cloudflare Worker serving both the API and the SPA. One URL, no CORS, no second service, and
no cold start — which matters because the brief's first submission check is that the link opens for
somebody who is not signed in as you.

```
Cloudflare Worker (Hono)  ── worker/src/index.ts
├── /api/*        JSON API + SSE live stream
├── static assets React SPA (Vite) ── web/
├── D1 (SQLite)   meetings, segments, speakers, chapters, summaries,
│                 summary_sections, action_items, highlights, clips,
│                 share_links, share_views, calendar_*
└── shared/ai/    deterministic summariser + template definitions,
                  imported by BOTH the Worker and the seed build
```

| Choice | Why |
|---|---|
| Cloudflare Workers + D1 | Free, no card, persistent SQL, no cold starts. Render's free tier sleeps; Fly needs a card for a volume; Vercel's filesystem is ephemeral so persistence needs a second vendor. |
| API + SPA in one Worker | One deployable, one URL, no CORS, nothing to fall out of sync. |
| `shared/ai/` imported by seed build *and* Worker | The summary generated at build time and the one generated on request come from the same code, so they cannot drift. |
| Summaries pre-generated for every template | Template switching is a read. No spinner, no model call, no cost, no failure mode. |
| Deterministic summariser as the default provider | A judge on a stranger's machine must never meet a 429, a quota or a missing key. Extractive: every line it produces was actually said, with a timestamp back into the recording. |
| LLM providers optional | If `GROQ_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY` is set in Worker secrets, Ask composes prose over the retrieved passages behind the same interface, and falls back to cited retrieval on any error. |
| Retrieval before generation | Ask always retrieves first, so answers are citable whether or not a model is involved. A model that cannot point at the line it came from is not useful in a notetaker. |
| Intent expansion, not just keywords | "did anyone commit to a date" shares no words with "we will have the full response by the fourteenth of October". A question matching a known intent (commitment, deadline, money, risk, accountability, security, hiring, customer, metrics) pulls in the vocabulary that answers it at 0.4 weight, and the UI says which intent it read — so the mechanism is visible rather than magic. |
| Virtualised transcript | The one-hour meeting has 692 segments. Rendering all of them is how a rebuild like this falls over. |
| Worker does its own Range slicing | Cloudflare's asset server ignores `Range` and answers 200 with the whole file. An `<audio>` element that cannot range-request cannot seek, so clicking a transcript line at minute 50 would stall. `run_worker_first: true` plus a `/media/:file` handler returns proper 206 + `Content-Range`. |
| `not_found_handling: "none"` | With SPA handling at the asset layer, a *missing* asset returns `index.html` with status 200 — which served HTML as audio at `/media/nope.mp3` and made unknown `/api/*` paths return 200. The Worker does the SPA fallback instead, where it can tell the two apart. |

## How the seed data was made

A one-hour meeting is roughly 700 transcript segments. Hand-writing all of them would consume the
entire time budget on prose, so:

- **Authored:** every decision, number, name, disagreement, action item and tangent. The leadership
  sync has a real argument about how pipeline is defined, an accountability moment about a
  Friday-evening deploy, a comp-band disagreement between the CFO and CTO, and a pricing tangent
  that goes nowhere and gets parked — because real meetings have those and fake ones don't.
- **Generated:** pacing, pauses, overlap (`[crosstalk]`), low-confidence segments, filler, and the
  connective chatter between authored moments. Durations derive from word count and a realistic
  speaking rate, which is what keeps synthesized audio in sync with the transcript.
- **Calibrated:** `target_duration_ms` is hit within ~0.3% by a two-pass measurement, so a meeting
  labelled 61 minutes actually runs 61 minutes.
- **Deterministic:** a seeded PRNG means the committed `db/seed.sql` is byte-identical to what was
  loaded into the deployed database.

Hand-written summaries override the extractive ones for the meetings a reviewer will read first
(the leadership sync, the Halcyon customer call, the interview, the solo test). Everywhere else the
extractive summariser does the work.

## Running it locally

```bash
npm install
bash scripts/bootstrap.sh          # restores git identity + the capture commit-gate
pip3 install piper-tts imageio-ffmpeg   # only needed to regenerate audio
npm run build:db                   # regenerate db/seed.sql from seed/
npm run db:local                   # schema + seed into local D1 (.wrangler/state)
npx wrangler dev                   # API + SPA on http://localhost:8787

# Regenerate the meeting audio (downloads ~800 MB of voice models, ~40 min of CPU
# for all eight meetings at ~7x realtime). Already committed, so this is optional:
python3 scripts/synthesize-audio.py --all
python3 scripts/synthesize-audio.py --meeting m-leadership-sync   # just one
```

Audio is only needed if you change a transcript. The MP3s are committed so a fresh
clone deploys without the TTS step.

Deploy:

```bash
npm run build && npx wrangler deploy
npx wrangler d1 execute fathom-db --remote --file=db/schema.sql
npx wrangler d1 execute fathom-db --remote --file=db/seed.sql
```

## Tests and integrity checks

```bash
npm test                     # 14 capture-harness tests + 20 AI-layer tests
npm run test:ai              # just the AI layer (node:test, no framework dependency)
npm run smoke                # 62 checks against the deployed URL, as a logged-out stranger
npm run capture:validate     # .agent-logs/ conforms to the 8x format
python3 tools/capture/secret_scan.py --tracked
npx tsc --noEmit             # type-clean
```

`scripts/smoke-test.py` is the one to run after any deploy. It writes (creates a highlight, creates and
revokes a share link, flips settings) and cleans up after itself; `--keep-writes` leaves them for
inspection. It exits non-zero so it can gate a release.

The AI tests assert the properties that matter rather than string equality: that stemming lets
"blocking" find "blocker", that a `[crosstalk]` marker can never be returned as an answer, that a
question with no discriminating term says so instead of bluffing, that switching template changes the
*body* and not just the headings, that every quoted line exists in the transcript it came from, and
that a failing model provider degrades to cited retrieval instead of throwing.

CI (`.github/workflows/agent-log-ci.yml`) re-runs all three on every push, so the log's integrity is
machine-checked on the remote rather than taken on trust.

## What is not here

Real meeting SDKs, real ASR, CRM/Slack/Notion sync, teams and seats, billing, SSO, mobile,
transcript correction, comments. Reasoning for each cut is in `docs/PLAN.md` §3.

Search is a `LIKE` scan over ~2,200 rows — a few milliseconds here, and the honest next step is an
FTS5 index if the corpus grows. Noted rather than pre-optimised.

**Ask is retrieval-based, not semantic.** TF-IDF over stemmed terms, an exact-phrase bonus, and an
intent lexicon (`shared/ai/expand.mjs`) that adds the vocabulary answering a recognised intent at 0.4
weight. That closes a specific and useful slice of the gap — "did anyone commit to a date" now finds
"we will have the full response by the fourteenth of October" — but it is a lexicon I wrote by hand,
bounded by what I thought of. Embeddings would generalise it and are the first thing I would add.

It is also **one question, one answer**: no follow-up conversation, which real Ask Fathom has.
