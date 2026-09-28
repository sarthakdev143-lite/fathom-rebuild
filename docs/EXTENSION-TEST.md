# Testing the extension — five minutes, one real call

`scripts/extension-check.mjs` proves the pipeline end to end against a mock
captions page (12 checks: observer, interim/final diffing, speakers, monotonic
timestamps, archive-before-network, delivery). What it **cannot** prove is that the
selector lists still match today's Meet/Zoom/Teams markup. Only a real call can.
This is that test, kept to five minutes.

## Load it

1. `chrome://extensions` → **Developer mode** on.
2. **Load unpacked** → the `extension/` directory of this repo.
3. Pin the extension. Open its popup once and check the target URL is the live
   deployment (it is the default).

## The call (use whichever platform you actually use)

4. Start a call. **You need a second voice**, or captions will never appear:
   - easiest: join from your phone on mute-off and read three sentences aloud, or
   - play a two-minute YouTube video with speech through a speaker near the mic, or
   - invite anyone; a colleague for two minutes is plenty.
5. **Turn captions on** — this is the step everyone misses, and the popup now says
   how per platform after twelve seconds without a container:
   - Meet: the **cc** button, bottom right.
   - Zoom: **View options → Show captions**, or Alt+C.
   - Teams: **More (…) → Language and speech → Turn on live captions**.
6. Watch the extension **badge**: it counts captured lines as people speak. If it
   stays at 0 after thirty seconds of visible captions, open the popup and use
   **Pick the captions element**, click the captions box, and watch the badge move.
7. Speak one deliberate sentence with an action in it: *"I'll send the deck to
   [name] by Friday."*
8. **Leave the call.** The session finalises on leave and delivers itself.

## What good looks like

- Within ~10s of leaving, the meetings list on the live site shows a new meeting
  titled after the call, platform `meet`/`zoom`/`teams`, chip **real capture**.
- Open it: the transcript has both speakers (or you plus the video), your deliberate
  sentence is there, and the Actions tab extracted *"send the deck … by Friday"*
  with you as owner.
- The popup's session list shows the session as **in your library** with a link.

## What to record if it misbehaves

- Popup screenshot (platform / captions element / line count).
- Whether captions were visibly on in the call.
- The platform and whether it was web or desktop. **Desktop Zoom/Teams have no DOM
  to read** - the extension only works on the web clients, and that limit is
  documented in `extension/README.md` rather than papered over.

Then paste all three into whichever channel you're using with the agent; the
selector lists are the only part of this project that rots on a vendor's schedule,
and a screenshot of today's markup is exactly what fixing it needs.
