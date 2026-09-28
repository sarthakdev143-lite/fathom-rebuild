# Submission checklist — copy-paste ready

Everything below is verified as of the commit it ships with. Tick in order; the two
items marked **YOU** are the only ones that cannot be done from the sandbox.

## The fields

**Links field** (label each one, exactly as the brief asks):

```
Live app: https://fathom-rebuild.sarthak-fathom.workers.dev
Repository: https://github.com/sarthakdev143-lite/fathom-rebuild
```

**Walkthrough field:** your recorded video (below). Host on Loom/Drive/Vimeo and
paste the link. Under five minutes, camera on.

## Before you record (**YOU**, ~12 minutes)

1. **Real-call capture test** — `docs/EXTENSION-TEST.md`. Five minutes. (Fallback if captions are a
   problem: on `/live`, use **Capture the meeting tab's audio** and tick "Share tab audio" - it hears
   everyone without captions, at the cost of speaker names.) Load
   unpacked, one call with any second voice, captions on, one deliberate action
   sentence, leave, check the library. If a selector has rotted, screenshot the
   popup and the captions DOM and send it; the fix is a selector list edit.
2. **Twenty minutes in real Fathom** — `docs/RECON.md` §"Candidate pass". Optional
   for submission, transformative for commentary. At minimum do steps 4, 6, 8 and 10
   (solo call, template switch, playback sync, share to your phone).
3. Rotate nothing yet. Rotate all three keys **after** submitting.

## Recording the walkthrough (**YOU**, ~10 minutes of effort, 4:55 of tape)

Two options, easiest first:

- **Talk over the tour video.** Run `npm run demo` (or use the committed
  `docs/demo-tour.mp4`): a captioned screen capture of the product, ~2:30, timed
  scene by scene. Record your camera + screen in Loom, play the tour full-screen,
  read the captions aloud or paraphrase them, and bookend with 20s of face at each
  end saying who you are and what is stubbed. Total < 4:00.
- **Follow the script live.** `docs/WALKTHROUGH-SCRIPT.md` is timed to 4:55 with
  say-this / click-that columns and a recovery table.

Either way, open with the sentence the brief asks for: *the capture layer for the
seeded meetings is stubbed; uploads and the browser extension are real capture.*

## If you want me to edit it

Record two clips on any camera — a 20-second intro and a 20-second sign-off — and
put them in the workspace (or send them). I will stitch them around the tour with
ffmpeg and hand back one file under 5:00 with audio normalised. The command I use:

    ffmpeg -i intro.mov -i docs/demo-tour.mp4 -i outro.mov \
      -filter_complex "[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[v][a]" \
      -map "[v]" -map "[a]" walkthrough.mp4

## Pre-flight, right before you paste the links

    npm run preflight

Runs, in order: capture-log validation, 14 capture-harness tests, 27 AI tests,
`tsc --noEmit`, 65 smoke checks against the live URL as a logged-out stranger, 48
browser checks in real Chromium, 12 extension checks. All must pass. If any fail,
stop and fix; a red suite in CI on submission day is a worse look than a missing
feature.

## The four sentences to say out loud on camera

1. "The seeded meetings are authored and synthesized; the capture layer for them is
   stubbed, and it says so in the product."
2. "Uploads and the browser extension are real capture: real audio in, real
   transcript out, no bot and no key in the extension."
3. "Summaries are extractive - every line quotes the recording with a timestamp, so
   it cannot invent a decision."
4. "The agent log is in the repo, including the turn where a credential nearly
   leaked past my own redactor and the turn the VM ate the git history."

## After submitting

- Rotate: Cloudflare API token, GitHub PAT, Groq key, Gemini key. All four passed
  through chat; all four were redacted before reaching the public log, but chat is
  not a secrets manager.
- Keep the Cloudflare token's expiry in mind (it was issued short-lived); the
  deployed Worker does not need it to keep serving, only to redeploy.
