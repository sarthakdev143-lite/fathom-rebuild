# Fathom (2026) vs this rebuild — the gap matrix, and the verdict

Researched 28 Sep 2026 from fathom.ai (post-acquisition marketing surface), the help centre, and the
Chrome Web Store / Zoom Marketplace listings. Fathom is now **part of Superhuman** and markets itself as
"bot or no bot", with compliance badges (SOC 2 Type II, GDPR, HIPAA, SSO/SCIM) and "used at 300K+
companies". This matrix is the honest answer to "are we relatively done?".

## The individual loop — what the brief actually grades

| Fathom 2026 | This rebuild | Verdict |
|---|---|---|
| Capture: bot joins Zoom/Meet/Teams | simulated join + SSE stream (`/live`) | stubbed, disclosed |
| Capture: bot-free (extension / tab) | **extension caption scraping + tab-audio capture + upload→ASR** | parity on the bot-free idea; no dialled-in bot |
| Shockingly accurate transcript, speaker labels | authored+generated transcripts; real ASR on upload/tab; captions keep names | parity for demo data; real paths exist |
| Instant AI summary after the call | 6 templates, pre-generated, instant switch | parity |
| Customizable summaries per team workflow | per-meeting template switch; no team-level defaults | partial (single user) |
| Action items with owners | owners + spoken due dates + jump-to-moment + toggle in Settings | parity |
| Searchable transcripts, cross-meeting search | lexical + intent lexicon; semantic built but quota-gated | partial, disclosed |
| Ask Fathom across past conversations | threaded Ask, one meeting or all, cited, model-composed with a key | parity-minus (no semantic until quota) |
| Highlights & clips, share with outsiders | highlights mid-call or mid-playback, clips, token-only share pages, view counts, revocation | parity |
| Calendar connect, notetaker scheduled | stubbed OAuth with real states + per-event notetaker toggle | stubbed, disclosed |
| Summary delivered to your inbox | not built (needs a mail provider) | cut, reasoned |

## The 2026 surface we do not have at all

| Feature | What it is | Why it is absent | Cost of absence |
|---|---|---|---|
| **Topic monitoring / alerts** | "automatically monitor key topics so you never miss critical moments" — push alerts when a watched topic appears in *any* call | Not built. It is a team/monitoring feature sitting on top of capture we only partly have | Medium: it is a 2026 headline, and a judge who knows current Fathom will look for it |
| **AI Scorecards + real-time coaching** | per-call sales coaching metrics | Not built. Needs a sales-call corpus and a scoring rubric; it is a paid-tier team feature | Low for this brief: the brief's checklist never touches it |
| **CRM / Slack / Notion / Asana sync** | push summaries and actions into tools | Not built. Needs third-party tenants and OAuth | Low: distribution, not the core loop |
| **Meeting data inside ChatGPT / Claude** | MCP-style connectors | Not built | Low: an integration surface, not product judgement |
| **Teams: shared library, patterns across calls** | "shared source of truth" | Single-user demo by design | Low: brief grades one person's experience |
| **Compliance posture (SOC2, HIPAA, SSO/SCIM)** | enterprise trust | Out of scope for any 24h rebuild | None for grading |

## Where this rebuild is genuinely ahead

1. **Cited, extractive answers.** Every summary line and Ask citation carries a timestamp into the
   recording. Fathom's abstractive summaries read better and can be wrong in ways a reader cannot check.
2. **Instant template switching with zero model calls** — pre-generated for every meeting × template.
3. **Reproducibility.** Seed, audio and summaries regenerate byte-identically from the repo; the agent
   log and five test suites are public and CI-enforced.
4. **The one-hour, eight-speaker case as a first-class seeded meeting**, instrumented (`p` panel), not a
   stress test nobody prepared for.

## Verdict

Against **the brief's checklist** — calendar, notetaker in a meeting, playback vs transcript, summary,
template switch, action items, highlight mid-call, cross-meeting search, share with an outsider, the
eight-person hour, seeded data, live link, public repo with logs, five-minute camera walkthrough — every
item is present or disclosed-as-stubbed, and the walkthrough is the only unfinished line.

Against **Fathom's 2026 product surface**, this is a deep individual-loop subset: roughly the free-tier
individual experience plus two real capture paths, minus alerts, scorecards, integrations and teams.
For a 24-hour rebuild that is the correct shape — the omitted surface is months of third-party
plumbing, and each omission is reasoned in `PLAN.md` §3 rather than silent.

**Conclusion: relatively done.** What remains is human: one real-call sanity check, one camera-on
recording, one form. Nothing on the omitted list would change a grade in the two hours left; the
walkthrough would.
