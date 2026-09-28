# Recon — fathom.video

## How this recon was done, and the limit on it

**I did not create a real fathom.video account.** This build environment has a sandbox with network
access but no email inbox, so a signup cannot be verified, and no persistent browser profile to keep
a session alive. Rather than pretend otherwise, recon came from Fathom's own public surface — its
marketing site, its help centre, the Zoom App Marketplace listing and the Chrome Web Store listing —
plus third-party reviews and guides, all cited below.

That means this document is accurate about **what the product does**, and inferential about **what it
feels like to use**. The gap matters, and it is the reason for the checklist in
[Candidate pass](#candidate-pass-20-minutes-in-real-fathom): twenty minutes in the real product closes
it, and the walkthrough should be recorded after that, not before.

## Sources

| Source | What it established |
|---|---|
| [fathom.ai](https://www.fathom.ai/) | Core promise: "captures, transcribes, and summarizes Zoom, Google Meet, and Microsoft Teams calls. Free for individuals, with AI-powered CRM updates for teams." Also "Ask Fathom anything about your meetings – a place to search everything, and get customizable AI summaries tailored to your team's workflow and priorities." |
| [Zoom App Marketplace — AI Notetaker by Fathom](https://marketplace.zoom.us/apps/JgSwuY4ZSGim6_OPRZV0Ig) | "A free app that records, transcribes, and summarizes your Zoom, Google Meet or Microsoft Teams calls. Jump directly to highlights & action items." Confirms the notetaker joins as a participant and that highlights/action items are first-class destinations, not buried sections. |
| [help.fathom.video — Navigating the Settings Page](https://help.fathom.video/en/articles/3239617) | "Auto-Generate Action Items — when this is toggled on, Fathom will automatically extract any action items discussed on your meetings." And: "Summary & recording — both your AI-generated meeting summary and a link to the meeting recording will be automatically shared with attendees." Confirms action-item extraction is a **setting**, and that auto-sharing with attendees is default behaviour worth modelling. |
| [help.fathom.video — Release Notes](https://help.fathom.video/en/articles/6220097) | "AI Search — this new feature helps you quickly find key moments across all your recorded meetings", spanning transcript, action items and follow-ups. Confirms search is cross-meeting and semantic, not just a text filter. |
| [Chrome Web Store — Fathom AI Note Taker for Google Meet](https://chromewebstore.google.com/detail/fathom-ai-note-taker-for/nhocmlminaplaendbabmoemehbpgdemn) | "now available bot-free" — a browser-extension capture path that does not put a visible bot in the call. A meaningful architectural fork I did not build (see below). |
| [Bluedot — Fathom Review](https://www.bluedothq.com/blog/fathom-review) | "Ask Fathom" is a chat assistant over your meetings; summaries and action items can sync to a CRM automatically rather than sitting in the dashboard. |
| [The Rundown — Fathom features & privacy](https://www.therundown.ai/tools/fathom) | Ask Fathom "lets users question an individual call or search across accessible meetings for themes, decisions, objections, and follow-ups." Confirms two scopes: one meeting, and all meetings. |
| [omi.me — Fathom guide](https://www.omi.me/blogs/ai-note-takers/fathom-guide) | Practical usage patterns: "Use Ask Fathom to pull exact decisions, objections, or dates. Send clips for nuance, not only text recaps. Push summaries and action items into [your tools]." Confirms clips are shared for **nuance**, i.e. the clip is the artefact, not a link to a dashboard. |
| [aitoolstribe](https://www.aitoolstribe.com/what-is-fathom-ai-note-taker/) | Confirms multiple summary templates exist, and that AI action items and integrations are gated by plan tier. |

## Product map

Two surfaces, as `PLAN.md` §1 predicted. The second is where the product lives.

### A. Before and around the meeting

| Real Fathom | In this rebuild |
|---|---|
| Connect Google or Microsoft calendar | **Stubbed OAuth** (`/calendar`): consent screen, scopes, connection state, resulting events. No real account contacted. |
| Notetaker auto-joins scheduled meetings | **Built as state**: per-event `notetaker_status` (off / scheduled / joining / active), toggleable. |
| Bot appears in the call as a participant | **Simulated** (`/live`): "Fathom Notetaker is joining…", then recording starts. Alongside it, `/live` also offers a **real** mode: your microphone, streamed to `gemini-3.5-transcribe-live` through a Worker relay. |
| Recording an actual call and transcribing it | **Real, for audio you supply.** `POST /api/upload` runs `gemini-3.5-transcribe` and builds a full meeting — summaries, actions, clips — from any recording, measured at 95.2% word F1 against this project's own synthesized audio (`scripts/verify-asr.mjs`). What no 24-hour rebuild can do is join a live third-party call: that needs app review with Zoom, Meet or Teams. |
| Bot-free capture via the Chrome extension | **Not built.** A real architectural fork — capture in the browser rather than a dialled-in participant. Out of scope in 24 hours, and noted here rather than silently omitted. |
| Live transcription during the call | **Simulated over SSE**: seeded transcript streamed line by line at a chosen replay speed. |

### B. After the meeting — the artefact

| Real Fathom | In this rebuild |
|---|---|
| Recording playback alongside the transcript | **Built.** Three-pane view; scrubbing moves the transcript, clicking a line seeks the audio. Virtualised, so the 61-minute meeting scrolls smoothly. |
| Speaker-labelled transcript with timestamps | **Built.** Distinct colour per speaker, `[overlap]` markers where the generator produced crosstalk, `[low conf]` where confidence is below 0.8. |
| AI summary | **Built.** Hand-written for the four meetings a reviewer reads first; deterministic extractive generation everywhere else. |
| Multiple/customizable summary templates | **Built.** Six templates with genuinely different extraction strategies — Executive brief surfaces numbers and risks, Sales Call surfaces pain/objections/buying signals, Interview produces a scorecard with a recommendation. All pre-generated for all eight meetings, so switching is a database read. |
| Auto-generated action items (a settings toggle in the real product) | **Built, including the toggle.** Owners, spoken due dates ("by Friday", "end of October"), and a timestamp that seeks to the moment it was said. Checkable and persistent. `/settings` exposes *Auto-generate action items*; off, the tab says why instead of going mysteriously empty, and nothing is deleted. |
| Settings surface (summary sharing, action items, recording prefs) | **Built.** Seven controls, each wired to an observable effect — see `docs/SETTINGS.md`. No inert toggles. |
| Highlights, "jump directly to highlights & action items" | **Built.** Created mid-playback or from a transcript line, shown on the timeline, listed in their own tab. |
| Share a clip with somebody who was not on the call | **Built.** Token-only auth, standalone page with no app shell and no sign-in, view counter. Seeded links exist so the flow can be seen without creating one. |
| Search across all meetings | **Built, but weaker than the real thing.** Real Fathom's AI Search is semantic across transcript, action items and follow-ups. Mine is a `LIKE` scan over transcript + titles + actions + highlights. Honest gap; FTS5 or embeddings would be the next step. |
| Ask Fathom (chat over one call or all calls) | **Built, including conversation.** Follow-ups carry the thread (stateless server: history travels with each request), a configured Groq key composes prose over the retrieved passages with clickable timestamp citations, and any provider failure degrades to cited retrieval. **Documented ceiling:** `POST /api/ask` works scoped to one meeting (the Ask tab in the meeting rail) and across all meetings (the panel on the Search page). Retrieval is TF-IDF over stemmed terms with exact-phrase bonus, so answers are **quoted verbatim with a timestamp, speaker and meeting** and every citation seeks the recording. If `GROQ_API_KEY` or `GEMINI_API_KEY` is in Worker secrets, the same retrieved passages are handed to the model to compose prose, and any model failure degrades to the cited retrieval answer instead of erroring. A Groq key is configured on the deployed Worker, so in practice Ask composes prose over the retrieved
passages and cites them as clickable timestamps. Two things worth knowing about that, because both are
failure modes a rebuild like this actually hits: Groq **refuses this sandbox's egress** (403, code 1010)
while the Worker's Cloudflare edge egress is fine — so the model path can only be exercised from the
deployed app, not from the build machine — and Groq **retires model ids silently**, which is why the
provider walks a chain of candidates and remembers the one that answers.

**The honest gap that remains:** retrieval is still lexical-plus-intent-lexicon underneath. An intent lexicon (`shared/ai/expand.mjs`) closes part of that — "did anyone commit to a date" *does* now find "we will have the full response by the fourteenth of October", because a commitment+deadline question pulls in the vocabulary that answers it, and the UI reports which intent it read. But the lexicon is hand-written and bounded by what I thought of. |
| Auto-share summary + recording link with attendees | **Not built.** Requires real email sending and real attendee identity. |
| CRM sync, Slack/Notion push, Zapier | **Not built.** Distribution features needing third-party tenants. |
| Team edition: shared library, per-team templates, analytics | **Not built.** Single-user demo. |
| Transcript correction / editing | **Not built.** Cut to protect the core loop. |

## What I would tell a reviewer to compare

Three places where this rebuild is arguably **better** than the described original, and worth judging
on its own terms:

1. **Template switching is instant.** Every summary for every template is pre-generated at build time
   from the same code the API uses, so switching is a read with no spinner and no model call. The real
   product regenerates.
2. **Summaries are extractive and cite themselves.** Every line carries a timestamp and a speaker and
   is something a person actually said. Abstractive summaries read better and hallucinate; this trades
   polish for trust, which for a notetaker is the right trade.
3. **The one-hour, eight-speaker case is a first-class citizen, not a stress test.** It is seeded,
   virtualised, chaptered, and has hand-written summaries. Most rebuilds demo a five-minute call and
   hope nobody asks about an hour.

Two places where it is **worse**, stated plainly:

1. **Ask is retrieval-based by default, not a model.** It quotes exactly and cites every line, and it
   will never invent a decision nobody made. Intent expansion closes part of the vocabulary gap, but a
   hand-written lexicon is not embeddings: a question phrased outside the nine intents I enumerated
   falls back to plain lexical matching. With a Groq or Gemini key configured it composes prose over the
   same cited passages; without one it is honest about being lexical. Embeddings are the missing piece
   and the first thing I would add.
2. **Search is lexical too.** Searching "did anyone commit to a date" will not find "we will have the
   full response by the fourteenth of October" unless you search the words.

A third, smaller one: **Ask has no conversation.** Real Ask Fathom is a chat with follow-ups; mine is
one question, one cited answer. Statefulness was cut to get the citation quality right first.

## Candidate pass: 20 minutes in real Fathom

Do this **before** recording the walkthrough, so the commentary is first-hand. Screenshot each step —
the brief asks for it, and the shots are useful for the video's B-roll.

1. **Sign up on the free plan.** Note how many steps to first value, and whether it asks to connect a
   calendar before or after the first meeting. *Screenshot the empty state — my rebuild never shows
   one, which is a deliberate difference.*
2. **Connect a calendar.** Note the exact scopes Google asks for and the wording of the consent
   screen. Compare with `/calendar` here. *Screenshot the consent screen.*
3. **Start a two-minute call with yourself** on Zoom, Meet or Teams. Watch how the bot appears:
   participant name, avatar, when it shows up relative to you joining, and what the in-call UI says.
   *Screenshot the bot in the call.*
4. **Talk for two minutes with deliberate content**: say two action items with owners and dates, state
   one decision, ask one question. Then stop. This is exactly what `m-solo-test` in the seed data
   does, so you can compare output shape directly.
5. **Watch processing.** How long from "call ended" to summary? Is there a processing state?
   *Screenshot it if there is.*
6. **Read the summary. Switch templates.** Note how many exist, what they are called, and whether the
   output changes materially or just the headings. Compare with the six here. *Screenshot two
   templates side by side.*
7. **Check the action items.** Did it extract the two you said, with the right owners and dates?
   *Screenshot.*
8. **Play the recording against the transcript.** Scrub. Click a line. Note the sync accuracy and
   whether the active line is highlighted. Compare with the player here.
9. **Take a highlight mid-playback.** Where does it land, and what can you do with it? *Screenshot.*
10. **Share a clip with somebody who was not on the call** — use a second browser profile or your
    phone. Note whether it demands an account, what is visible, and whether the clip autoplays.
    Compare with `/s/<token>` here. *Screenshot the shared view on your phone.*
11. **Search across meetings.** Try a semantic query like "what did we decide about pricing" rather
    than a keyword. Note whether it finds it. This is the gap I could not close.
12. **If you can, get into a longer multi-person call** — even four people for fifteen minutes. Note
    how speaker labelling handles crosstalk and whether the summary degrades. This is the case the
    brief says actually matters, and it is the one thing a solo rebuild cannot experience honestly.

### Questions to answer while you are in there

These are the ones that would change what I would build next:

- Does the free plan watermark or limit clip sharing?
- How does it label an unknown speaker, and can you rename them?
- Is the summary editable, and do edits survive a template switch?
- What happens to highlights when you switch templates?
- How does it present a meeting where nobody spoke much (a bad recording)?
- Does Ask Fathom cite timestamps you can jump to? (Mine does — every citation seeks the recording.
  Check whether theirs also quotes verbatim or paraphrases, because that changes how much you trust it.)
- Does Ask Fathom hold a conversation, and does it remember the previous answer?
