// Hand-authored summary overrides + seeded highlights/clips/shares.
//
// The deterministic extractive summariser (shared/ai/summarize.mjs) handles every
// meeting and every template. These overrides exist for the meetings a reviewer
// will actually read, where a human-quality summary beats a good extractive one.
// Anything not listed here falls through to extraction, so template switching
// works everywhere.
//
// Action items reference `at_beat` so their timestamp is taken from the real
// transcript rather than hardcoded - if the generator re-paces the meeting, the
// jump-to-moment links stay correct.

export const AUTHORED = {
  "m-leadership-sync": {
    standard: {
      headline: "8 decisions across 61 minutes — September numbers and Halcyon Freight",
      overview:
        "Weekly leadership sync covering September's close (ARR $4.82m, NRR 112%, gross churn 1.9%), the Halcyon Freight security review blocking a $180k deal, the September 18 outage post-mortem, a comp-band exception for the staff engineer role, and the onboarding v3 results. Marcus left early for a customer call, so sales came before the rest of the agenda. Eight people spoke; the meeting produced eight owned action items and one item explicitly parked.",
      sections: {
        key_points: `- **[04:12]** September closed at **$4.82m ARR**, up $81k on August, NRR **112%**, gross churn **1.9%** against a plan of 2.2% — *Tom Whitfield*
- **[06:40]** New logos came in at **4 against a target of 9**; two of the six "customers" were expansions, so the underlying new-business number is four — *Aisha Bello*
- **[11:05]** Halcyon Freight is a **$180k ACV, three-year** deal blocked on a 41-question security review, not on price — *Marcus Lee*
- **[14:30]** Northwind is **single-region in us-east**; regional pinning is a Q1 roadmap item and Dan will not imply otherwise — *Dan Okafor*
- **[23:15]** The Sept 18 outage ran **47 minutes** (~20 fully down, ~1,100 customers affected); root cause was an untested rollback approved on a Friday evening — *Dan Okafor*
- **[26:50]** The status page went **11 minutes without an update** while nine tickets arrived — customers found out from their own dashboards — *Aisha Bello*
- **[33:20]** Staff engineer band approved as a **one-off exception up to $250k**; the published band is not moving until Q4 planning has real offer data — *Priya Raman*
- **[41:05]** Onboarding v3 lifted activation **31% → 44%** in beta, but two of fourteen accounts were hand-held; the honest self-serve number is **38%** — *Elena Petrova*`,
        decisions: `- **Halcyon:** two engineers for two weeks on the security pack; Dan owns the written position on the five hard questions; full response promised for **14 October**, deliberately not earlier — *Priya Raman*
- **Outage:** rollback tested in staging becomes a **hard gate**, not a checkbox; second on-call with **15-minute escalation**; status page automation tied to the ingest health check; **two release trains a week** — *Sofia Marchetti*
- **Comp:** band exception to **$250k** for this one role, with internal comms co-written by Tom and Dan so it does not land as a surprise — *Priya Raman*
- **Hiring:** make the offer to the $245k candidate **today**, not at the next sync — *Priya Raman*
- **Sequencing:** onboarding work goes **after** the Halcyon security pack, holding an **end of October** date for self-serve activation above 40% — *Priya Raman*
- **Board reporting:** Halcyon stays in pipeline but on a separate **committed vs best-case** line — *Tom Whitfield*
- **Pricing:** usage-based pricing is **parked** — one-pager into Q1 planning, no build commitment — *Priya Raman*`,
        open_questions: `- **[05:20]** Is the Q4 pipeline figure committed or a forecast? — *Priya Raman*
- **[08:10]** Why did a Friday-evening deploy feel like the only option? — *Priya Raman*
- **[24:30]** Is there financial exposure from the outage, and who approves credits? — *Tom Whitfield*
- **[38:40]** Can onboarding hold an end-of-October date if it is sequenced after Halcyon? — *Elena Petrova*
- **[43:15]** Has any customer actually asked for usage-based pricing? — *Marcus Lee*`,
      },
      action_items: [
        { text: "Own the written security position for Halcyon's five hard questions (region pinning, pen test summary, sub-processor notice, key rotation, data residency)", owner_name: "Dan Okafor", due_text: "14 October", at_beat: "b-halcyon" },
        { text: "Deliver the Halcyon security pack with two engineers for two weeks", owner_name: "Sofia Marchetti", due_text: "14 October", at_beat: "b-halcyon" },
        { text: "Agree committed-vs-best-case pipeline wording with Tom and send it to Priya", owner_name: "Marcus Lee", due_text: "before Friday", at_beat: "b-metrics" },
        { text: "Write up the Sept 18 post-mortem with dated commitments and send it to the whole company, not just leadership", owner_name: "Sofia Marchetti", due_text: "Friday", at_beat: "b-incident" },
        { text: "Bring the 5% credit request from the $90k account to Tom before agreeing it", owner_name: "Aisha Bello", due_text: null, at_beat: "b-incident" },
        { text: "Co-write the internal comms on the comp-band exception so it does not land as a surprise", owner_name: "Tom Whitfield", due_text: null, at_beat: "b-hiring" },
        { text: "Make the offer to the $245k staff engineer candidate today rather than waiting for the next sync", owner_name: "Dan Okafor", due_text: "today", at_beat: "b-hiring" },
        { text: "Get self-serve onboarding activation above 40%, sequenced after the Halcyon pack", owner_name: "Elena Petrova", due_text: "end of October", at_beat: "b-onboarding" },
        { text: "Write the usage-based pricing one-pager for the Q1 planning doc; talk to five customers first", owner_name: "Ben Nakamura", due_text: null, at_beat: "b-pricing" },
      ],
    },
    executive: {
      headline: "Exec brief — $4.82m ARR, one $180k deal gated on security, one outage with dated fixes",
      overview:
        "September closed ahead of plan on retention (NRR 112%, churn 1.9% vs 2.2% planned) and behind on new logos (4 vs 9). The largest open item is Halcyon Freight at $180k ACV, gated entirely on a security review rather than price, with $40k of engineering cost being spent ahead of signature. The Sept 18 outage cost 47 minutes and produced four dated process changes. One comp-band exception was approved to unblock an eleven-week-open staff role. Runway is 19 months.",
      sections: {
        bottom_line: `**Where the business is**
- ARR **$4.82m** (+$81k MoM), NRR **112%**, gross churn **1.9%** vs 2.2% planned.
- New logos **4 vs a target of 9**. Pipeline is healthy at **$2.1m**; the problem is conversion speed, not demand — deals are taking ~14 days longer than in spring.
- Runway **19 months** at current burn; ~14 months if six roles are added.

**The one number to watch**
New-logo conversion. Marcus attributes it to procurement latency moving upmarket. Nina Alvarez (Brightpath) independently flagged the same pattern in the Q3 investor call and named the likely cause: moving upmarket without changing how the company sells.`,
        risks: `- **Concentration in one deal.** $340k of the $2.1m Q4 pipeline is Halcyon, unsigned. Reporting it unflagged would move the board number if it slips to November.
- **Spending ahead of signature.** ~$40k of engineering cost is committed to the Halcyon security pack before contract. Recorded as a deliberate bet by Priya, not an oversight.
- **On-call thinness.** A single on-call with no escalation path turned a 20-minute failure into a 47-minute outage. This is the highest-leverage fix in the post-mortem.
- **Customer credit exposure.** A $90k account requested a 5% credit after the outage; not yet agreed, routed to Tom before any commitment.
- **Single-region dependency.** No region pinning until Q1. This is the specific thing that could lose Halcyon, and it was answered honestly rather than optimistically.
- **Key-person risk on hiring.** The staff engineer role has been open 11 weeks and two finalists have competing offers; one is expected to be lost if the offer waits for the next sync.`,
        escalations: `- **Comp band policy.** A one-off exception to $250k was approved. The published band has not moved, which means the next staff-level hire re-opens the same argument. Needs a real decision at Q4 planning with offer data, not another exception.
- **Board deck framing.** Committed vs best-case pipeline split needs Tom and Marcus aligned before Friday so board time is not spent on a definitions argument.
- **Release cadence change.** Two trains a week removes the Friday-deploy pressure that caused the outage, but it is a permanent process change with on-call implications.`,
      },
    },
  },

  "m-halcyon-discovery": {
    sales: {
      headline: "Halcyon Freight — $180k ACV, blocked on security not price; pilot proposed",
      overview:
        "Technical discovery with Rachel Kim (VP Data) and Dev Patel (Security Lead) at Halcyon Freight. They have four vendors down to two and the other is ~30% cheaper. The evaluation is being decided by security-review survivability, not feature or price. Northwind's single-region limitation was disclosed proactively and landed well. Next step is a written security response by 14 October, then a paid four-week pilot against one region of their fleet.",
      sections: {
        customer_context: `- Nine thousand trucks, telemetry arriving in bursts; current pipeline **drops ~2% of data under load** and nobody notices until a customer disputes a delivery window.
- Buffer holds ~4 seconds today; they need **at least 30 seconds** without degradation.
- Four vendors evaluated, **two remain**. The other is ~30% cheaper.
- Rachel's stated deciding factor: whether the vendor can survive their security review "without a six month detour". They have been **burned twice** by vendors who said yes to everything and failed in procurement.`,
        pain_points: `- **2% data loss at ingest** under burst load — a correctness problem that surfaces as customer disputes, not as an outage.
- **No honest answer on region pinning** from competitors; one vendor said yes and their own documentation said otherwise.
- Vendor evaluation fatigue: they are optimising for a security review that does not become a detour.`,
        objections: `- **"The other one is cheaper"** → Marcus did not dispute it. Reframed against the two engineers Halcyon keeps spending on ingest reliability, and offered a reduced first-quarter rate rather than a discount.
- **"Can you guarantee region pinning?"** → Dan said no, explained single-region us-east today, offered a contractual data-location commitment plus a dated Q1 roadmap item. Dev called it "the first honest answer I have had all week" and confirmed it is **not a blocker if it is in writing with a date**.
- **"What is your p95 at that volume?"** → ~180ms, offered as a live dashboard rather than a slide. Rachel: "if it is real I will believe it."`,
        buying_signals: `- Security lead volunteering that a competitor's documentation contradicted their verbal answer — they are comparing vendors on honesty, which favours disclosure.
- "That last part matters more than the discount" in response to putting an engineer in their Slack during the pilot.
- Asking "what happens next" unprompted, and accepting a **paid** pilot rather than pushing for a free trial.
- Two of five evaluation stakeholders on the call, including the security decision-maker.`,
        next_steps: `- [14 Oct] **Dan Okafor** — send the written security position covering the five hard questions, as a document rather than a slide.
- [14 Oct] **Sofia Marchetti** — deliver the six engineering answers from the 41-question spreadsheet.
- [This week] **Dan Okafor** — send the live ingest latency dashboard.
- [After review] **Marcus Lee** — set up the paid four-week pilot against one region of the fleet, with an engineer in Halcyon's Slack.`,
      },
      action_items: [
        { text: "Send the written security position on region pinning, pen test summary, sub-processors, key rotation and data residency", owner_name: "Dan Okafor", due_text: "14 October", at_beat: "b-hd-3" },
        { text: "Send the live ingest latency dashboard rather than a slide", owner_name: "Dan Okafor", due_text: "this week", at_beat: "b-hd-2" },
        { text: "Scope the paid four-week pilot against one fleet region, with an engineer embedded in their Slack", owner_name: "Marcus Lee", due_text: null, at_beat: "b-hd-4" },
      ],
    },
  },

  "m-interview": {
    interview: {
      headline: "Yuki Tanaka — strong hire on system design and incident judgement; comp is the risk",
      overview:
        "Round 3 for the staff platform engineer role: system design plus incident leadership, then an internal debrief after the candidate left. Yuki Tanaka has three years on the streaming side of a logistics platform at ~400k events/sec at peak. Both interviewers independently landed on strong hire. The only concern is comp: she named $265k with a competing Series C offer, against an approved band of $200–225k.",
      sections: {
        recommendation: `**Strong hire** — both interviewers, independently, before comparing notes.

- **Technical depth: 4/5.** The metadata-scaling answer ("everyone plans for the bytes and nobody plans for the key space") was unprompted and, in Sofia's words, "not rehearsed, you cannot fake that". She identified what breaks first at 10x load before being asked about failure modes.
- **Judgement: 5/5.** Her incident story was about authority and rehearsal rather than heroics. She moved failover authority to the on-call engineer, then proved the blast radius survivable by letting on-call make a bad call in a rehearsal. That is staff-level reasoning about systems of people.
- **Communication: 4/5.** Answered the question asked, then extended it. Did not oversell.
- **Concern — comp.** Named $265k with a competing offer against a $200–225k band. Dan's read: "if we wait for the next leadership sync we lose her." Sofia committed to logging strong hire by end of day so the delay is not on the panel.
- **Hiring risk if slow: high.** Two finalists are in play and this one has an offer elsewhere.`,
      },
      action_items: [
        { text: "Log strong hire in the interview system by end of day so the decision is not waiting on the panel", owner_name: "Sofia Marchetti", due_text: "end of day", at_beat: "b-iv-4" },
        { text: "Raise the comp-band question with Tom on Thursday rather than at the next leadership sync", owner_name: "Dan Okafor", due_text: "Thursday", at_beat: "b-iv-4" },
      ],
    },
  },

  "m-solo-test": {
    standard: {
      headline: "Solo recording test — 2 minutes, 2 action items picked up",
      overview:
        "A two-minute solo call recorded specifically to test the notetaker end to end: does the transcript carry a speaker label, does the summary say anything, do action items get extracted, and can a moment be highlighted. Three things were said deliberately so extraction would have something to find — two action items and one decision.",
      sections: {
        key_points: `- **[00:09]** Audio check performed because a previous recording captured forty minutes of silence — *Priya Raman*
- **[00:26]** Success criteria stated out loud: speaker labels on the transcript, a summary that says something, and the ability to highlight a moment — *Priya Raman*
- **[00:47]** Two action items spoken deliberately so extraction has signal to find — *Priya Raman*
- **[01:03]** One decision recorded: the second vendor was chosen for the penetration test — *Priya Raman*`,
        decisions: `- Chose the **second vendor** for the penetration test — *Priya Raman*`,
      },
      action_items: [
        { text: "Send the board deck to Tom", owner_name: "Priya Raman", due_text: "by Friday", at_beat: "b-solo-2" },
        { text: "Book the offsite venue", owner_name: "Priya Raman", due_text: "before the end of the month", at_beat: "b-solo-2" },
      ],
    },
  },
};

// Seeded highlights: "highlight a moment mid-call and see where it lands".
// start_ms/end_ms are resolved from beat ids at build time so they always match
// the generated transcript.
export const HIGHLIGHTS = {
  "m-leadership-sync": [
    { at_beat: "b-halcyon", offset_ms: 42000, span_ms: 51000, label: "Dan refuses to fudge the region answer", note: "This is the moment the deal stopped being about price.", source: "playback" },
    { at_beat: "b-incident", offset_ms: 18000, span_ms: 38000, label: "Dan takes the call as his own", note: "\"Mine. I approved it at four fifty on a Friday.\"", source: "playback" },
    { at_beat: "b-metrics", offset_ms: 6000, span_ms: 34000, label: "Aisha corrects the new-logo number", note: "Two of the six were expansions. Nobody had said this out loud.", source: "transcript-select" },
    { at_beat: "b-pricing", offset_ms: 4000, span_ms: 30000, label: "The tangent that went nowhere", note: "Parked in about four minutes, which is the correct outcome.", source: "playback" },
  ],
  "m-halcyon-discovery": [
    { at_beat: "b-hd-3", offset_ms: 12000, span_ms: 44000, label: "\"First honest answer I have had all week\"", note: "Dev Patel, after Dan said no to region pinning. Clip shared with the deal channel.", source: "playback" },
    { at_beat: "b-hd-4", offset_ms: 20000, span_ms: 36000, label: "Paid pilot, not a free trial", note: "Rachel agreed without pushing back.", source: "playback" },
  ],
  "m-interview": [
    { at_beat: "b-iv-2", offset_ms: 26000, span_ms: 40000, label: "The metadata answer", note: "Sofia's debrief line: you cannot fake that.", source: "playback" },
    { at_beat: "b-iv-3", offset_ms: 14000, span_ms: 46000, label: "Incident story — authority and rehearsal", note: "Staff-level reasoning about systems of people.", source: "playback" },
  ],
  "m-solo-test": [
    { at_beat: "b-solo-2", offset_ms: 1500, span_ms: 26000, label: "The two action items I said out loud", note: "Testing whether extraction picks them up. It did.", source: "live" },
  ],
};
// Standard-template headlines and overviews for the six meetings that do not have
// a fully hand-written summary. The extractive fallback produced "discussion
// without a recorded decision" for meetings that plainly recorded decisions -
// accurate as a regex outcome, wrong as a sentence about a real meeting. The
// sections beneath these still come from extraction.
export const STANDARD_HEADLINES = {
  "m-halcyon-discovery": {
    headline: "Security review is the deal: $180k ACV gated on five hard questions, paid pilot agreed",
    overview:
      "Technical discovery with Halcyon Freight's VP Data and Security Lead. They are down to two vendors and the other is ~30% cheaper; the decision turns on whether Northwind survives their security review without a six-month detour. Region pinning was answered with a honest no plus a dated contractual commitment, which landed better than a yes would have. Next: written security response by 14 October, then a paid four-week pilot against one region of their fleet.",
  },
  "m-interview": {
    headline: "Strong hire on system design and incident judgement; the comp band is the only blocker",
    overview:
      "Round three for the staff platform engineer role, then a debrief once the candidate left. Yuki Tanaka's metadata-scaling answer and her incident story - authority moved to on-call, then proven survivable in rehearsal - read as staff-level to both interviewers independently. The open risk is compensation: $265k named against a $200-225k band, with a competing offer, and a decision that cannot wait for the next leadership sync.",
  },
  "m-design-review": {
    headline: "Onboarding v3 lifts activation 31% to 38% self-serve; the sample-data question goes to a two-week test",
    overview:
      "Walkthrough of onboarding v3 with the beta numbers corrected in the room: 44% including two hand-held accounts, 38% self-serve, and Elena insisted on showing the lower figure. The one unresolved argument - sample data in the empty state - was settled the right way, with a two-week A/B test and a kill criterion written down before anyone could re-argue it.",
  },
  "m-allhands": {
    headline: "September all-hands: $4.82m ARR, an unvarnished outage post-mortem, and 19 months of runway stated plainly",
    overview:
      "Company-wide update covering the September close (four new logos against a target of nine, named rather than buried), the 47-minute outage of the 18th with its four dated process changes, and an open questions section where runway and customer credits were answered directly. The tone is the point: the failure was explained as a staffing and process failure, not an individual one.",
  },
  "m-standup": {
    headline: "Nine minutes, six engineers: migration flips Tuesday, the alerting spec needs actual readers, onboarding waits on design tokens",
    overview:
      "A real standup - round the room, hard stop, one blocker escalated in the last thirty seconds. The migration rollback was tested this time (fourteen seconds), which is the post-mortem change already paying for itself, and the only unresolved dependency is Elena's empty-state work waiting on design-system tokens, owned live by Sofia.",
  },
  "m-investor": {
    headline: "Q3 update to Brightpath: strong retention, four new logos against nine, and a straight answer on the outage",
    overview:
      "Priya and Tom with Nina Alvarez from Brightpath. The good numbers led but so did the bad one - four new logos against a target of nine - and Nina's two concerns (runway assumptions and the outage) were answered with the full post-mortem and dated changes rather than a summary of it. No raise planned for Q1; the intention is to raise from strength in the second half.",
  },
};

