# Settings — what each one actually does

Every control on `/settings` is wired. This exists because a toggle that does nothing is worse than no
toggle: a reviewer will flick it, see nothing happen, and stop trusting everything else on the page.
Each entry below says where to go to see the effect.

| Key | Values | What it does | Where to see it |
|---|---|---|---|
| `default_template` | any template key | The template new views open with. Changing it does **not** silently rewrite existing meetings — that would destroy the record of what each meeting was summarised as. | Meetings list headline updates only after applying. |
| *(action)* apply to all | — | Bulk `UPDATE meetings SET active_template`. Explicit, because it is the only setting whose effect is not immediate. | Open any meeting: the rail shows the new template. |
| `auto_generate_action_items` | `0` / `1` | Off, the Actions tab is empty **and says why**. Nothing is deleted — the rows are still in the database and come back when it is re-enabled. This is the toggle real Fathom exposes as *Auto-Generate Action Items* ([help centre](https://help.fathom.video/en/articles/3239617)). | Any meeting → Actions tab. |
| `ask_use_model` | `auto` / `retrieval` | `retrieval` forces the cited, key-free path even when a model key is present, so the two behaviours can be compared side by side. `auto` composes prose with Groq or Gemini and falls back to retrieval on any failure. | Search page or a meeting's Ask tab: the provider badge changes. |
| `transcript_timestamps` | `0` / `1` | Hides the clock beside every line. Off, the transcript reads like a script; on, it reads like evidence. With timestamps hidden the whole row becomes clickable to seek, so nothing is lost. | Any meeting → transcript. |
| `transcript_density` | `comfortable` / `compact` | Compact fits roughly a third more lines on screen and re-estimates the virtualiser's row height. Matters on an hour-long call. | Any meeting → transcript. |
| `auto_share_with_attendees` | `0` / `1` | Creates a stable summary link per meeting (`auto_<meeting-id>`), the way real Fathom emails one to attendees after the call. **No email is sent** — that needs a real mail provider and real attendee identity — but the link is real, opens with no account, and counts its views. Turning it off stops creating links; it does not silently delete one already sent to somebody. | Any meeting → Highlights tab → "Auto-shared with attendees". |
| `show_stub_banner` | `0` / `1` | The amber "the capture layer is stubbed" banner on the meetings list. On by default, because the brief asks that stubbing be said out loud rather than discovered. | Meetings list. |

## Validation

`PATCH /api/settings` rejects an unknown key and rejects a value outside the allowed set for that key,
both with `400` and a message naming the allowed values. The smoke test asserts both, plus that turning
`auto_generate_action_items` off and on again returns the same item count — i.e. that the toggle gates
the response rather than destroying data.

## Deliberately absent

Account and team settings, seats and billing, SSO, notification routing, CRM and Slack connections,
transcript correction, and per-meeting recording consent. Real Fathom has most of these. They are
multi-tenant plumbing, and a judge evaluates one person's experience. Reasoning in `PLAN.md` §3.
