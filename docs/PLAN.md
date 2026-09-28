# Build plan — fathom.video rebuild

Written before any product code. This is the "what I chose to build first, and
what I left out" record the brief asks to be judged on.

---

## 0. Constraints I am working under, stated up front

| Constraint | Consequence |
|---|---|
| No email inbox or persistent browser session in this sandbox | **I cannot create a real fathom.video account.** Recon comes from public sources (fathom.ai, help.fathom.video, the Chrome Web Store listing, third-party reviews) and is cited in `docs/RECON.md`. The candidate should spend ~20 minutes in real Fathom before recording the walkthrough; `docs/RECON.md` includes the click-through checklist. |
| The brief explicitly permits stubbing capture | The recording bot is **simulated, not real**. No Zoom/Meet/Teams SDK, no real ASR. Said plainly in the README and the walkthrough script. Time goes into everything downstream of capture, which is where the product actually lives. |
| No camera, no Loom | I cannot record the walkthrough. `docs/WALKTHROUGH-SCRIPT.md` is a shot-by-shot, timed script the candidate records. |

## 1. What the product actually is

Two surfaces that barely touch:

- **Before/around the meeting** — calendar connected, notetaker scheduled or
  auto-joining, bot appears in the call, recording state visible.
- **After the meeting** — the artefact. Player + transcript in sync, AI summary,
  template switching, action items, highlights/clips, sharing, search.

The second surface is where all the value and all the judgement is. The first is
plumbing a judge will click once. So: **plumbing gets stubbed but must look
real; the artefact gets built properly.**

The brief names the case that matters: *an eight-person call that runs an hour.*
That is the load-bearing test of the whole thing — 60 minutes of audio, several
thousand transcript segments, eight speakers, a summary that is still useful,
and a UI that does not fall over. It is seeded as a first-class meeting, not
bolted on.

## 2. Priority order

| # | Build | Why here |
|---|---|---|
| 1 | **Meeting detail: synced player + transcript** | The core loop. If scrubbing the audio does not move the transcript and clicking a line does not seek the audio, nothing else matters. Virtualised list so the 1-hour meeting scrolls at 60fps. |
| 2 | **AI summary + template switching + action items** | The reason the product exists. Templates must produce *visibly different* output, not the same text with a different heading. |
| 3 | **Highlights & clips** | "Highlight a moment mid-call and see where it lands" + "share a clip with someone who was not on the call". Share links must work for a logged-out stranger — that is an explicit judging criterion. |
| 4 | **Search across meetings** | Cross-meeting full-text, speaker-aware, instant. This is what turns a pile of recordings into a company memory. |
| 5 | **Live meeting simulation** | The bot joins, transcript streams in in real time, highlight button works *during* the call. Stubbed capture, real-time behaviour. |
| 6 | **Calendar connect + upcoming/auto-join** | Stubbed OAuth that behaves like the real thing (connect → permissions → calendars → events → notetaker scheduled). |
| 7 | **Perf instrumentation on the 1-hour case** | Visible in the UI, because the brief asks about that case specifically. |

## 3. Explicitly left out

| Left out | Why |
|---|---|
| Real Zoom/Meet/Teams bot, real meeting SDKs | Permitted to stub; each is weeks of work and OAuth review. |
| Real ASR/transcription | Same. Seeded transcripts are authored and synthesized to audio instead. |
| CRM sync (Salesforce/HubSpot), Slack/Notion push | Real Fathom has it; it is a *distribution* feature, not the core loop, and needs third-party tenants. |
| Teams, admin console, billing, seats, SSO | Multi-tenant plumbing. A judge evaluates one user's experience. |
| Mobile apps | Web only. |
| Real OAuth against Google/Microsoft | Needs verified client IDs and redirect URIs on an approved domain. Simulated with the same states and screens. |
| Editing/transcript correction UI, comments, chapters | Nice-to-have; cut to protect items 1–5. |

## 4. Architecture

```
Cloudflare Worker (Hono)
├── /api/*        JSON API + SSE for the live-meeting stream
├── static assets React SPA (Vite build) served from the same Worker
├── D1 (SQLite)   meetings, segments, speakers, summaries, action_items,
│                 highlights, clips, share_links, search index
└── R2            synthesized meeting audio
```

- **React 18 + TypeScript + Vite + Tailwind.** Client-rendered transcript with
  windowing (`@tanstack/react-virtual`) — a 1-hour meeting has thousands of
  segments and DOM size is the thing that kills it.
- **One deployable.** API and SPA on the same Worker → no CORS, no second
  service, one URL, no cold start. This is why Cloudflare and not a free-tier
  container that sleeps: **a judge's first click must work instantly.**
- **Data layer behind a repository interface.** Local dev runs the identical SQL
  against `better-sqlite3`; prod runs it against D1. Swapping stores is one file.
- **AI layer behind a provider interface.** Deterministic local generator by
  default; `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` in Worker secrets upgrades it
  to a live LLM. **The deployed demo never depends on a key being present or a
  quota not being exhausted**, because the link is judged by a stranger.
- **Share links are self-contained** (signed token in the URL) so a clip opens
  for someone who was never on the call and has no account.

## 5. Seeded data — "an empty meetings list tells us nothing"

Eight meetings, deliberately spanning the shapes that stress different parts:

| Meeting | Shape | What it proves |
|---|---|---|
| Solo test call | 2 min, 1 speaker | The onboarding path the brief describes |
| 1:1 customer call | 23 min, 2 speakers | Sales template, action items |
| Candidate interview | 41 min, 3 speakers | Interview template, scorecard-style summary |
| Product design review | 33 min, 5 speakers | Crosstalk, overlapping speech |
| **Weekly leadership sync** | **61 min, 8 speakers** | **The case that matters** |
| All-hands | 47 min, 6 speakers | Long monologue segments, chapters |
| Quick standup | 9 min, 6 speakers | Short-form, high speaker turnover |
| Investor update | 18 min, 4 speakers | Sharing with an outsider, redaction |

Transcripts are authored to be *real*: filler words, false starts, interruptions,
"[crosstalk]" and "[inaudible]" markers, speakers talking over each other, a
tangent that goes nowhere, numbers and names that later show up in action items.
Not clean prose — clean prose is what makes a fake transcript obvious.

Audio is synthesized locally with **Piper** (offline neural TTS), one distinct
voice per speaker, stitched per meeting with `ffmpeg-static`, uploaded to R2.
So playback↔transcript sync is genuinely real rather than a progress bar
pretending. Where a meeting is too long to synthesize in full, that is stated in
the meeting record rather than hidden.

## 6. Time budget (24h window; target ≈ 10–12h)

| Block | Hours | Output |
|---|---|---|
| Capture harness + this plan | 0.75 | done |
| Recon from public sources | 0.75 | `docs/RECON.md` |
| Schema + repositories + seed generator | 1.5 | data layer, seeded DB |
| Transcript/player sync + virtualisation | 2.0 | core loop |
| Summary engine + templates + action items | 1.5 | the AI surface |
| Highlights, clips, share links | 1.25 | share-with-outsider flow |
| Search | 0.75 | cross-meeting |
| Live meeting simulation + calendar stub | 1.25 | before/around surface |
| Deploy, seed prod, verify logged-out | 1.0 | live link |
| Perf pass on the 1-hour meeting | 0.5 | the case that matters |
| Walkthrough script + README | 0.5 | handover |
| Buffer | ~1.0 | |

## 7. Definition of done — self-check against the brief

Each line is a brief requirement and where it will be demonstrable:

- [ ] connect a calendar → Settings → Calendars, stubbed OAuth, events appear
- [ ] notetaker into a real meeting → Live Meeting view, bot joins, recording state
- [x] let it record → SSE for the simulated script; WebSocket relay to the Live API for real microphone audio
- [ ] watch playback against transcript → meeting detail, bidirectional sync
- [ ] read the AI summary → summary panel
- [ ] switch templates → template picker, output changes materially
- [ ] pull the action items → action items with owner + timestamp jump
- [ ] highlight a moment mid-call → live highlight button → lands in meeting
- [ ] search across meetings → global search, speaker + text + date filters
- [ ] share a clip with someone not on the call → share link, opens logged-out
- [ ] eight-person call, one hour → seeded, virtualised, instrumented
- [ ] seeded with real data → 8 meetings, never an empty list
- [ ] live link opens logged-out → verified in a clean context before handover
- [ ] public repo with `.agent-logs/` → CI-enforced
- [ ] walkthrough ≤ 5 min, camera on → candidate records from the script
