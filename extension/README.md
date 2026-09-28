# Signal Notes Capture — the browser extension

The capture path a 24-hour rebuild can actually own, and the one this project was
missing: **read the live captions Zoom, Meet and Teams already render in the page.**

The platform has already done speech-to-text and speaker diarisation for every
participant. This extension reads that result out of the DOM and turns it into a
meeting in your Signal Notes library.

| Property | Value |
|---|---|
| Bot joins the call | **No.** Nothing appears in the participant list. |
| Audio recorded | **No.** Text already on the screen is all it touches. |
| API key needed | **No.** There is no speech-to-text call anywhere in this extension. |
| Hears other participants | **Yes** — captions are per-speaker for everyone in the call. |
| Works offline | Captures keep archiving locally; delivery retries when you're back. |

## Load it

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → pick this `extension/` directory.
3. Join a Meet, Zoom-web or Teams-web call and **turn captions on**.
4. The badge counts captured lines. Leave the call and the session saves itself.

## How capture works

- `src/content.js` finds the captions container from an ordered list of candidate
  selectors per platform, then structural heuristics (`aria-live` logs, anything
  whose class mentions captions). Class names rot without notice, so when every
  candidate misses, the popup's **Pick the captions element** lets you click the
  right box once; a stable selector is stored per site.
- A `MutationObserver` diffs caption lines: a line whose text keeps growing is
  interim; a new line finalises the previous one with its timestamp.
- Sessions end on `pagehide`, on leaving the room, or after 45s of caption
  silence (with an 8s grace), and are archived to `chrome.storage.local`
  **before** any network call.
- `src/background.js` delivers the archive to `POST /api/meetings/from-transcript`
  on the web app, retrying every 60s and on reconnect. The built meeting gets six
  pre-generated summaries and jumpable action items like any seeded meeting.

## Honest limits

- Captions must be enabled. If nobody turns them on, there is nothing to read —
  the popup says so rather than capturing silence.
- Speaker names are whatever the platform prints. Zoom web sometimes omits them;
  those lines land as `Speaker`.
- DOM scraping is a contract with no SLA. When a platform ships new markup the
  pick-mode fallback is the fix, and it is one click.
- This captures the *web* clients. Desktop Zoom/Teams have no DOM to read; that is
  exactly the gap Fathom's dialled-in bot fills, and it needs app review with each
  platform — out of reach in 24 hours, and said so rather than faked.
