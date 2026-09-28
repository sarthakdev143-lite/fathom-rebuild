# Walkthrough script — 5 minutes, camera on

Timed shot by shot. Total runtime target **4:55** so you are inside the limit with margin. If you are running long, the
Settings stop is the first thing to cut — the line about inert toggles can go in the closing instead.
Column 1 is the clock, column 2 is what to say, column 3 is what to click.

**Record at 1080p, camera in a corner, Loom or Screen.studio.** Do the
[20-minute Fathom pass](RECON.md#candidate-pass-20-minutes-in-real-fathom) first so your
commentary is first-hand — that is worth more than anything in this script.

---

## Prep (before you hit record)

- [ ] Open `https://fathom-rebuild.sarthak-fathom.workers.dev` in one tab, warmed up (click into the
      leadership sync once so the 14 MB audio is cached).
- [ ] Open a **second browser profile or your phone** for the share-link shot. It must be a context
      that is not signed in as you — that is literally one of the submission checks.
- [ ] Close everything else. Notifications off.
- [ ] Have the repo open in a tab: `github.com/sarthakdev143-lite/fathom-rebuild`.
- [ ] Copy the share link beforehand if you want to skip creating one on camera (but creating it live
      is more convincing — see 3:00).

---

## 0:00 – 0:22 · Face to camera

> "This is a rebuild of Fathom, the AI meeting notetaker, built in about [X] hours. It's live, it's
> deployed on Cloudflare Workers with D1, and it's seeded with eight meetings — about 2,800 transcript
> lines and 32,000 words — including a 61-minute, eight-person leadership sync, because the brief says
> that's the case that actually matters.
>
> One thing up front: **the capture layer is stubbed.** No bot joins a real call. The transcripts are
> authored and generated, and the audio is synthesized from them with per-speaker neural TTS — so
> playback and transcript genuinely stay in sync, but nothing was recorded from a live meeting."

*Camera only. Do not share the screen yet.*

## 0:22 – 0:55 · The meetings list

> "Every flow starts here. This is not an empty state — that was a specific instruction."

**Click:** land on `/`. Scroll slowly.

> "Eight meetings, grouped by date, each with a one-line AI headline, the speaker stack, and action and
> highlight counts. The banner at the top says the capture layer is stubbed — I'd rather that be
> visible in the product than only in the video."

**Hover** one card to show it's clickable. **Do not** click yet.

## 0:55 – 2:10 · The flagship: 61 minutes, eight people

**Click:** "Weekly Leadership Sync".

> "This is the meeting that matters. Sixty-one minutes, eight speakers, 692 transcript lines."

**Do, in order:**
1. **Press play.** Let it run ~5 seconds so they hear eight distinct voices.
   > "That's synthesized audio — one voice per speaker. It's not a real recording, but the timeline is
   > real: every segment sits at its actual transcript millisecond."
2. **Click a transcript line near the bottom of the visible list.**
   > "Click any line and it seeks. The transcript is virtualised, so an hour of scrolling is smooth —
   > that's the first thing that falls over in a rebuild like this if you render all 692 rows."
3. **Drag the scrubber to about minute 40.**
   > "Seeking works because I had to implement HTTP range requests myself — Cloudflare's asset server
   > ignores Range and returns 200, so an audio element can't seek. The Worker slices the bytes and
   > returns 206. Without that, clicking a line at minute 50 stalls."
4. **Point at the chapter ticks and the amber marks on the timeline.**
   > "Those ticks are chapters, derived from the topics in the transcript. The amber marks are
   > highlights."
5. **Set speed to 2×** and let it play briefly.
6. **Hit `j` three times, then `h`.**
   > "It's keyboard-driven, because the transcript is where you actually live: j and k move line to
   > line, h drops a highlight, space plays. Nobody wants to mouse around a 61-minute recording."

## 2:10 – 2:55 · Templates and action items

**Click:** the "Executive brief" template pill in the right rail.

> "Six templates. This is the one I'd point at, because switching changes the *output*, not just the
> heading. Standard gives decisions and questions. Executive brief gives a bottom line, every number
> mentioned, risks, and what needs a decision above this group."

**Click:** "Sales call" — *if you opened the Halcyon meeting instead, use this one there.*

> "All six are pre-generated for all eight meetings at build time, from the same code the API uses, so
> switching is a database read. No spinner, no model call, no way for it to fail on a reviewer's
> machine."

**Click:** the "Actions" tab.

> "Action items come with owners, the due date as it was *spoken* — 'by Friday', 'end of October' — and
> a timestamp." **Click one timestamp.** "Which jumps to the moment in the recording where it was said.
> Ticking one persists."

**Tick one action item.**

## 2:55 – 3:35 · Highlight mid-call, then share it with an outsider

**While playing**, click **"Highlight this moment"**.

> "That's the brief's 'highlight a moment mid-call and see where it lands'. It lands here, in the
> highlights tab, and on the timeline."

**Click** the Highlights tab. **Click** one of the seeded highlights — e.g. *"Dan refuses to fudge the
region answer"*.

> "The seeded ones have notes, because in the real product a highlight is where you put the thing you
> want to remember."

**Click** "share clip" on that highlight. **Copy the link. Paste it into your phone or the second
profile. Show it on camera.**

> "This opens for somebody who was never on the call and has no account. The token is the only auth,
> the page has no app shell and no sign-in prompt, and the view is counted so the owner can see it was
> opened."

## 3:35 – 4:05 · Ask, then search

**Click:** Search in the sidebar. **Click** the suggested question
*"What has anyone said about region pinning?"*

> "Ask is the feature I'd flag first, because my own recon said it was the biggest thing missing from a
> Fathom rebuild. It works on one meeting from the Ask tab, or across all eight from here. Watch what it
> does: it finds the moment in the customer call where our CTO says **no** to region pinning, and the
> moment in the leadership sync where the same question is decided."

**Click** one citation to show it seeks the recording to that millisecond.

> "Every answer is quoted verbatim with a timestamp, a speaker and a meeting, and clicking a citation
> takes you to that point in the audio. That's a deliberate choice: my summaries are **extractive**, so
> they can't invent a decision nobody made. With a Groq or Gemini key it composes prose over these same
> passages — and if the model call fails, it degrades to this rather than erroring."

**Type in the keyword box:** `rollback`

> "Keyword search underneath is a `LIKE` scan over all 2,178 lines plus titles, actions and highlights.
> Honest gap: Ask is retrieval, not semantic. 'Did anyone commit to a date' won't find 'we'll have the
> full response by the fourteenth of October' unless you search the words. Embeddings are what I'd add
> next."

## 4:05 – 4:35 · The stubbed capture layer and settings, shown not hidden

**Click:** Live in the sidebar. **Click** "Join and start recording".

> "This is the part I faked, and I want to show it rather than describe it. The notetaker joins, and
> the transcript streams in line by line over server-sent events at whatever replay speed you pick —
> so a 61-minute call can run in five. I can take a highlight mid-call and it persists to the
> database."

**Take one highlight mid-stream.** Then **click** "End" and **"Open the recording"**.

> "Ending it drops you into the recording. In the real product that's where the bot produced the
> transcript; here it's the seeded meeting the script came from."

**Click:** Calendar. **Then:** Settings, and flick *Auto-generate action items* off.

> "Calendar connect is stubbed OAuth — a real Google consent screen needs verified client IDs and an
> approved redirect domain. The scopes, states and the notetaker-scheduled toggle are the real ones.
>
> Settings is the other thing worth ten seconds: seven controls and every one does something. Watch —
> I've turned off action-item extraction." **Click back into the leadership sync, open Actions.**
> "It doesn't just go empty, it tells you why, and nothing was deleted — turn it back on and all nine
> are there. A toggle that does nothing is worse than no toggle, so there aren't any."

## 4:35 – 4:55 · Face to camera: judgement

> "What I'd do differently with another day: make Ask **semantic** and conversational. It quotes and
> cites well, but it matches words rather than intent, and it's one question, one answer — real Ask
> Fathom holds a conversation. Embeddings over the same corpus is the single highest-value change left.
>
> The deliberate trade I'd defend: my summaries and answers are **extractive**. Every line carries a
> timestamp and a speaker and is something a person actually said. It reads worse than an abstractive
> summary and it cannot invent a decision nobody made. For a notetaker, I'd take that trade.
>
> The repo is public with the full agent log committed — every prompt, every response, including the
> turn where I leaked a credential past my own redactor and the one where the response got captured
> before the work was finished. Link's in the submission. Thanks."

---

## If something breaks on camera

| Symptom | Say this, keep going |
|---|---|
| Audio won't play | "Browser autoplay policy — it needs a click first." Click play again. |
| A long meeting is slow to start | "That's a 14 megabyte asset; it range-loads, so seeking works before it's fully buffered." |
| API error | "Free-tier edge, give it a second." Refresh once. Do not narrate the failure twice. |
| You lose your place | Jump to 4:25 and do the judgement section. It stands alone. |

## Timing discipline

- The temptation is to demo everything. **Cut** the standup, the interview and the design review —
  they exist to make the list real, not to be shown.
- If you are over 4:30 at the Ask section, drop the Calendar stop and shorten Settings to one toggle.
- Nothing in this script requires you to be on camera for more than the first 22 seconds and the last
  20 — but the brief says camera on, so leave it on throughout.
