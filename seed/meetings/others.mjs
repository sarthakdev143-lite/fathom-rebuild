// The other seeded meetings. Depth varies on purpose and that is stated in the
// README: the flagship (leadership-sync.mjs) is authored beat by beat; these have
// fewer authored moments and lean more on the connective-talk pools.
//
// The 2-minute solo call is fully hand-written because it is the first thing the
// brief says to try, and it is the meeting a reviewer will click first.

import { PEOPLE, POOLS, SLOTS, COMPOSITES } from "../content/company.mjs";

const N = (k) => PEOPLE[k].name;

// ---------------------------------------------------------------------------
// 1. The onboarding call the brief describes: two minutes, alone, testing it.
// ---------------------------------------------------------------------------
export const soloTest = {
  id: "m-solo-test",
  title: "Testing the notetaker (just me)",
  seed: 1001,
  platform: "zoom",
  started_at: "2026-09-27T09:12:41Z",
  target_duration_ms: 122 * 1000,
  default_topic: "test",
  participants: [{ ...PEOPLE.priya, role: "Organizer" }],
  topics: [{ id: "test", title: "Audio check" }],
  pools: { default: POOLS.solo },
  slots: SLOTS,
  // No composites here, deliberately. This is one person talking to themselves for
  // two minutes; compositional status-report sentences ("Can Priya Raman take the
  // ingest rewrite?") made her sound like she was chairing a leadership sync. The
  // real-ASR check in scripts/verify-asr.mjs is what caught it: the transcription
  // was accurate, which proved the AUDIO was wrong.
  composites: [],
  composite_share: 0,
  beats: [
    {
      id: "b-solo-1", topic: "test", gap_weight: 0.2,
      lines: [
        [N("priya"), "Okay. Recording test. It is Sunday morning and I am talking to myself, which is a new low."],
        [N("priya"), "The notetaker says it joined. Let me just check the audio is actually coming through, because last time it recorded forty minutes of silence."],
        [N("priya"), "Testing, one two three. The quick brown fox jumps over the lazy dog."],
        [N("priya"), "Um. Right. So the things I want to see when this finishes are - does the transcript have my name on it, does the summary actually say anything, and can I highlight a bit of it."],
      ],
    },
    {
      id: "b-solo-2", topic: "test", gap_weight: 0.4,
      lines: [
        [N("priya"), "Let me say something that would be an action item, so I can see if it picks it up. I need to send the board deck to Tom by Friday, and I should book the offsite venue before the end of the month."],
        [N("priya"), "And a decision, I suppose. We decided to go with the second vendor for the penetration test."],
        [N("priya"), "Okay. That is two minutes. Let us see what comes out the other side."],
        [N("priya"), "If the summary is any good I will stop writing notes in meetings, which would be a genuine quality of life improvement."],
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// 2. Customer discovery with the deal that dominates the leadership sync.
// ---------------------------------------------------------------------------
export const halcyonDiscovery = {
  id: "m-halcyon-discovery",
  title: "Halcyon Freight — technical discovery",
  seed: 2002,
  platform: "meet",
  started_at: "2026-09-22T14:00:12Z",
  // 23.5 rather than 24: the authored beats alone fill ~23.2 minutes, so a 24-minute
  // target was unreachable by scaling connective talk and left the label lying by
  // 46 seconds. 23.5 converges under calibration and still renders as "24 min".
  target_duration_ms: 23.5 * 60 * 1000,
  default_topic: "intro",
  participants: [
    { ...PEOPLE.priya, role: "Organizer" },
    { ...PEOPLE.dan },
    { ...PEOPLE.marcus },
    { ...PEOPLE.rachel, is_external: 1 },
    { ...PEOPLE.dev, is_external: 1 },
  ],
  topics: [
    { id: "intro", title: "Introductions" },
    { id: "problem", title: "Their data problem" },
    { id: "security", title: "Security & residency" },
    { id: "commercial", title: "Commercials & next steps" },
  ],
  pools: { default: POOLS.sales, eng: POOLS.eng },
  slots: SLOTS,
  composites: COMPOSITES,
  beats: [
    {
      id: "b-hd-1", topic: "intro", gap_weight: 0.5, followup_pool: "default",
      lines: [
        [N("marcus"), "Rachel, Dev, thanks for making time. Priya is our CEO and Dan is our CTO, so you have got the two people who can actually answer hard questions rather than me promising things."],
        [N("rachel"), "Appreciated. Let me be upfront about where we are - we have evaluated four vendors and you are two. The other one is cheaper."],
        [N("priya"), "That is useful to know early. What is the thing that would make you pick us despite that?"],
        [N("rachel"), "Honestly, whether your team can survive our security review without a six month detour. We have been burned twice by vendors who said yes to everything and then fell over in procurement."],
      ],
    },
    {
      id: "b-hd-2", topic: "problem", gap_weight: 1.3, followup_pool: "eng",
      lines: [
        [N("dev"), "Our problem is that telemetry from about nine thousand trucks arrives in bursts, and our current pipeline drops roughly two percent of it under load. Nobody notices until a customer disputes a delivery window."],
        [N("dan"), "Two percent dropped is a lot. Is that at ingest or downstream?"],
        [N("dev"), "Ingest. We buffer for about four seconds and then shed. We would need to hold at least thirty seconds without falling over."],
        [N("dan"), "Our ingest path is built for exactly that shape. We hold about ninety seconds in the write-ahead layer and we have run it at four times our current largest customer's peak."],
        [N("rachel"), "What is your p95 on ingest at that volume?"],
        [N("dan"), "About one hundred and eighty milliseconds. I can send you the actual dashboard rather than a slide, with a live window."],
        [N("rachel"), "Send it. If it is real I will believe it."],
      ],
    },
    {
      id: "b-hd-3", topic: "security", gap_weight: 1.4, followup_pool: "default",
      lines: [
        [N("dev"), "The hard questions. Region pinning - can you guarantee our data stays in a named region?"],
        [N("dan"), "Not today, and I would rather tell you that now. We are single region in us-east. What I can offer contractually is that your data does not leave that region, and regional pinning as a product feature is on our roadmap for Q1."],
        [N("dev"), "That is the first honest answer I have had all week. The other vendor said yes and then their own documentation said otherwise."],
        [N("rachel"), "Dev, is that a blocker for us?"],
        [N("dev"), "Not if it is in writing with a date. It is a blocker if it is a verbal yes."],
        [N("priya"), "Then it will be in writing with a date. Dan will send the position document, not a slide."],
        [N("dev"), "Sub-processors, and notice period when you add one."],
        [N("dan"), "Thirty days notice, and the list is on our trust page which we update before we ship, not after."],
      ],
    },
    {
      id: "b-hd-4", topic: "commercial", gap_weight: 0.8, followup_pool: "default",
      lines: [
        [N("marcus"), "Commercials. Based on what Dev described we would put you at a hundred and eighty thousand a year on a three-year term, with the first quarter at a reduced rate while you migrate."],
        [N("rachel"), "That is about thirty percent above the other quote."],
        [N("marcus"), "It is. I am not going to pretend otherwise. What I would say is that the other quote assumes you keep running your own ingest reliability work, and from what Dev described that is two engineers you are not getting back."],
        [N("rachel"), "Fair. What happens next?"],
        [N("marcus"), "We send the security response by the fourteenth of October. You run your review. If it passes we do a paid four-week pilot against one region of your fleet, not a free trial, because a free trial tells us nothing."],
        [N("priya"), "And we would put an engineer in your Slack for the pilot, not just a support ticket queue."],
        [N("rachel"), "That last part matters more than the discount, honestly."],
      ],
    },
  ],
  trailing_talk: { topic: "commercial", pool: "default", gap_weight: 0.4 },
};

// ---------------------------------------------------------------------------
// 3. Daily standup - short, high speaker turnover, mostly status.
// ---------------------------------------------------------------------------
export const standup = {
  id: "m-standup",
  title: "Platform team standup",
  seed: 3003,
  platform: "meet",
  started_at: "2026-09-25T08:31:05Z",
  target_duration_ms: 9 * 60 * 1000,
  default_topic: "status",
  participants: [
    { ...PEOPLE.sofia, role: "Organizer" },
    { ...PEOPLE.dan },
    { ...PEOPLE.ben },
    { ...PEOPLE.priya },
    { ...PEOPLE.elena },
    { ...PEOPLE.aisha },
  ],
  topics: [{ id: "status", title: "Round the room" }],
  pools: { default: POOLS.eng },
  slots: SLOTS,
  composites: COMPOSITES,
  beats: [
    {
      id: "b-su-1", topic: "status", gap_weight: 0.7,
      lines: [
        [N("sofia"), "Standup. Nine minutes, hard stop. Dan first."],
        [N("dan"), "Migration is merged, flag is off. I want to flip it Tuesday, not Monday, because Monday on-call is one person."],
        [N("sofia"), "Tuesday. And the rollback is tested this time?"],
        [N("dan"), "Ran it in staging yesterday. Fourteen seconds."],
        [N("ben"), "Spec for the alerting cleanup is in review. I need two people to actually read it, not approve it."],
        [N("elena"), "I will read it today. Onboarding is blocked on the empty-state illustrations, which are waiting on the design system tokens."],
        [N("aisha"), "Customer side - the Meridian renewal is signed, and two accounts from the outage are still unhappy."],
        [N("sofia"), "Okay. Nobody is blocked except Elena, and that is on me. Done."],
      ],
    },
  ],
  trailing_talk: { topic: "status", pool: "eng", gap_weight: 0.5 },
};

// ---------------------------------------------------------------------------
// 4. Staff engineer interview - three speakers, evaluation afterwards.
// ---------------------------------------------------------------------------
export const interview = {
  id: "m-interview",
  title: "Staff Engineer interview — Yuki Tanaka (round 3)",
  seed: 4004,
  platform: "zoom",
  started_at: "2026-09-23T16:00:22Z",
  target_duration_ms: 41 * 60 * 1000,
  default_topic: "intro",
  participants: [
    { ...PEOPLE.dan, role: "Interviewer" },
    { ...PEOPLE.sofia, role: "Interviewer" },
    { ...PEOPLE.yuki, role: "Candidate", is_external: 1 },
  ],
  topics: [
    { id: "intro", title: "Background" },
    { id: "system", title: "System design" },
    { id: "incident", title: "Incident leadership" },
    { id: "debrief", title: "Debrief (candidate left)" },
  ],
  pools: { default: POOLS.eng },
  slots: SLOTS,
  composites: COMPOSITES,
  beats: [
    {
      id: "b-iv-1", topic: "intro", gap_weight: 0.6,
      lines: [
        [N("dan"), "Yuki, thanks for coming back. This round is system design and then a bit about how you work in incidents. Sofia will drive the design part."],
        [N("yuki"), "Great. Should I share a whiteboard or just talk?"],
        [N("sofia"), "Talk first, draw if it helps. I care more about how you reason than the diagram."],
        [N("yuki"), "Understood. For context, the last three years I have been on the streaming side of a logistics platform doing about four hundred thousand events a second at peak."],
      ],
    },
    {
      id: "b-iv-2", topic: "system", gap_weight: 1.5,
      lines: [
        [N("sofia"), "Design question. Multi-tenant ingest, tenants vary by a factor of about two hundred in volume, and one tenant's burst must not degrade another's. Where do you start?"],
        [N("yuki"), "I would start with the noisy-neighbour problem rather than the ingest problem, because ingest is mostly solved. Two approaches - per-tenant queues with weighted fair scheduling, or admission control at the edge with per-tenant token buckets. I would do both, but the token bucket first because it is cheap and it fails safe."],
        [N("sofia"), "What does fail safe mean there?"],
        [N("yuki"), "It means when the system is confused, it sheds the largest tenant first rather than the smallest. Most implementations get that backwards and end up protecting whoever is shouting loudest."],
        [N("dan"), "That is a good answer. What breaks first at ten times the load?"],
        [N("yuki"), "Metadata, not data. Everyone plans for the bytes and nobody plans for the key space. Tenant count times partition count times retention is usually what falls over, and it falls over as a slow death rather than an outage, which makes it harder to catch."],
        [N("sofia"), "How would you catch it?"],
        [N("yuki"), "A synthetic load test that grows tenant count rather than throughput. Almost nobody runs that because it is boring and it does not look impressive on a slide."],
      ],
    },
    {
      id: "b-iv-3", topic: "incident", gap_weight: 1.2,
      lines: [
        [N("dan"), "Incident question, and I want a real one. Tell me about a time you were the incident commander and it went badly."],
        [N("yuki"), "Last March. We lost a region for about two hours. The technical fix took twenty minutes. The other hundred minutes were us arguing about whether to fail over, because nobody had authority to make the call and the person who did was unreachable."],
        [N("dan"), "What did you change afterwards?"],
        [N("yuki"), "Two things. We wrote down explicitly who can declare a failover, and it is the on-call engineer, not a VP. And we made the failover a rehearsed monthly event so that declaring it is boring. The second one mattered more. People do not take an action in a crisis that they have never taken before."],
        [N("sofia"), "Did anyone push back on giving that authority to on-call?"],
        [N("yuki"), "Enormously. Two directors were genuinely uncomfortable. What settled it was that on-call made a bad call in a rehearsal in month two and it cost us nothing, which proved the blast radius was survivable."],
      ],
    },
    {
      id: "b-iv-4", topic: "debrief", gap_weight: 0.8,
      lines: [
        [N("sofia"), "Okay, she has left. My take - strong hire on system design. The metadata answer was not rehearsed, you cannot fake that."],
        [N("dan"), "Agreed. And the incident answer was about authority and rehearsal rather than about being heroic, which is what I want at staff level."],
        [N("sofia"), "Concern is comp. She said two sixty-five and she has a competing offer."],
        [N("dan"), "Which is exactly the conversation I am having with Tom on Thursday. I would move fast. If we wait for the next leadership sync we lose her."],
        [N("sofia"), "I will put strong hire in the system by end of day so it is not waiting on us."],
      ],
    },
  ],
  trailing_talk: { topic: "debrief", pool: "default", gap_weight: 0.4 },
};

// ---------------------------------------------------------------------------
// 5. Design review, 6. All-hands, 7. Investor update - lighter, still specific.
// ---------------------------------------------------------------------------
export const designReview = {
  id: "m-design-review",
  title: "Design review — onboarding v3",
  seed: 5005,
  platform: "meet",
  started_at: "2026-09-19T13:00:47Z",
  target_duration_ms: 33 * 60 * 1000,
  default_topic: "review",
  participants: [
    { ...PEOPLE.elena, role: "Organizer" },
    { ...PEOPLE.priya },
    { ...PEOPLE.ben },
    { ...PEOPLE.sofia },
    { ...PEOPLE.aisha },
  ],
  topics: [{ id: "review", title: "Walkthrough" }, { id: "debate", title: "The empty state argument" }],
  pools: { default: POOLS.leadership },
  slots: SLOTS,
  composites: COMPOSITES,
  beats: [
    {
      id: "b-dr-1", topic: "review", gap_weight: 1.2,
      lines: [
        [N("elena"), "Sharing my screen. This is onboarding v3. The main change is that we ask for one connection instead of five before showing any value."],
        [N("ben"), "That is the whole thesis, right. Nobody connects five things before they know if they like it."],
        [N("elena"), "Exactly. In the beta, activation went from thirty-one to forty-four percent. But two of those fourteen accounts were hand-held by CS, so the real number is lower."],
        [N("aisha"), "I can confirm. I basically did it with them on a call."],
        [N("priya"), "So what is the self-serve number on its own?"],
        [N("elena"), "Thirty-eight. Still better than thirty-one, but not forty-four. I would rather show you thirty-eight."],
      ],
    },
    {
      id: "b-dr-2", topic: "debate", gap_weight: 1.1,
      lines: [
        [N("sofia"), "Can I push on the empty state. You have got sample data in there. Some customers are going to be confused about whether it is theirs."],
        [N("elena"), "That was the biggest argument we had internally. Sample data converts better but it does create that confusion."],
        [N("ben"), "We could label it aggressively. Big banner, and a one-click remove."],
        [N("sofia"), "A banner nobody reads."],
        [N("elena"), "Which is why I want to test it rather than argue about it. Two weeks, half the new signups, measure activation and measure support tickets containing the word sample."],
        [N("priya"), "That is the right way to settle it. Do that. But if tickets go up at all, we kill it."],
        [N("elena"), "Agreed. Kill criterion written down now so we cannot argue later."],
      ],
    },
  ],
  trailing_talk: { topic: "debate", pool: "default", gap_weight: 0.4 },
};

export const allHands = {
  id: "m-allhands",
  title: "Company all-hands — September",
  seed: 6006,
  platform: "zoom",
  started_at: "2026-09-26T16:00:09Z",
  target_duration_ms: 47 * 60 * 1000,
  default_topic: "update",
  participants: [
    { ...PEOPLE.priya, role: "Organizer" },
    { ...PEOPLE.dan },
    { ...PEOPLE.tom },
    { ...PEOPLE.sofia },
    { ...PEOPLE.marcus },
    { ...PEOPLE.aisha },
  ],
  topics: [
    { id: "update", title: "Company update" },
    { id: "outage", title: "What happened on the 18th" },
    { id: "qa", title: "Open questions" },
  ],
  pools: { default: POOLS.leadership, casual: POOLS.casual },
  slots: SLOTS,
  composites: COMPOSITES,
  beats: [
    {
      id: "b-ah-1", topic: "update", gap_weight: 1.3,
      lines: [
        [N("priya"), "Welcome to the September all-hands. Three things today - where the business is, an honest conversation about the outage on the eighteenth, and then questions with nothing off limits."],
        [N("tom"), "Numbers first. We closed September at four point eight two million ARR. We added six customers, four of which were new logos and two were expansions."],
        [N("priya"), "And I want to be straight with everyone - four new logos against a target of nine is not where we want to be. We are not changing the target mid-quarter, but we are going to talk hard about it in Q4 planning."],
        [N("marcus"), "For context from the sales side, pipeline is healthy at two point one million. The problem is conversion speed, not interest. Deals are taking about fourteen days longer than they did in the spring."],
      ],
    },
    {
      id: "b-ah-2", topic: "outage", gap_weight: 1.5,
      lines: [
        [N("priya"), "The eighteenth. Forty-seven minutes of degraded ingest. About eleven hundred customers were affected. I want to explain what happened and what we are changing, and I want to do it without blaming anyone."],
        [N("dan"), "A schema migration went out without the rollback path being tested in staging. The rollback existed. Nobody ran it. I approved the deploy on a Friday evening because we were chasing the Monday release window, and that is the part I would change."],
        [N("sofia"), "The reason it lasted forty-seven minutes rather than fifteen is that on-call was a single person with no escalation path. That is a staffing and process failure, not an individual one."],
        [N("priya"), "So the changes are - rollback testing becomes a hard gate in the pipeline, second on-call with fifteen minute escalation, automated status page updates, and we are moving to two release trains a week so that missing one does not cost seven days."],
        [N("dan"), "And the Friday-evening pressure disappears once the train runs twice a week. That is the actual root cause, more than the migration."],
      ],
    },
    {
      id: "b-ah-3", topic: "qa", gap_weight: 1.2, followup_pool: "casual",
      lines: [
        [N("aisha"), "Question from the chat that I think a lot of people have. After the outage, are we at risk of losing customers?"],
        [N("priya"), "Two accounts asked for credits. One is significant. We have not agreed anything yet and we are not going to hide it if we do. Nobody has churned because of the outage as of today."],
        [N("tom"), "And to be precise about runway, because I know that is the question underneath the question - we have nineteen months at current burn. An outage does not change that."],
        [N("priya"), "Good. Any other questions? No question is too awkward, I would rather answer it now than have people speculate."],
      ],
    },
  ],
  trailing_talk: { topic: "qa", pool: "casual", gap_weight: 0.6 },
};

export const investorUpdate = {
  id: "m-investor",
  title: "Brightpath — Q3 investor update",
  seed: 7007,
  platform: "meet",
  started_at: "2026-09-18T15:30:33Z",
  // Same reasoning as the Halcyon target: the authored content sets a floor.
  target_duration_ms: 17.5 * 60 * 1000,
  default_topic: "update",
  participants: [
    { ...PEOPLE.priya, role: "Organizer" },
    { ...PEOPLE.tom },
    { ...PEOPLE.nina, is_external: 1 },
    { ...PEOPLE.marcus },
  ],
  topics: [{ id: "update", title: "Q3 update" }, { id: "concerns", title: "Nina's concerns" }],
  pools: { default: POOLS.sales },
  slots: SLOTS,
  composites: COMPOSITES,
  beats: [
    {
      id: "b-inv-1", topic: "update", gap_weight: 1.0,
      lines: [
        [N("priya"), "Nina, thanks for the time. Quick version - ARR four point eight two, net revenue retention a hundred and twelve, gross churn one point nine."],
        [N("nina"), "Those are good. What is the number you are least happy about?"],
        [N("priya"), "New logos. Four against a target of nine. That is the honest answer."],
        [N("nina"), "Thank you for leading with that. Is it demand or is it conversion?"],
        [N("marcus"), "Conversion. Pipeline is two point one million, which is above plan. Deals are taking about fourteen days longer to close than in the spring, mostly in procurement."],
        [N("nina"), "That is a common pattern at your stage. It usually means you are moving upmarket without having changed how you sell."],
      ],
    },
    {
      id: "b-inv-2", topic: "concerns", gap_weight: 1.0,
      lines: [
        [N("nina"), "Two concerns from my side. One - runway. Tom, what does nineteen months assume?"],
        [N("tom"), "Assumes no headcount growth beyond the two open roles, and it assumes we do not raise prices. If we add six people it drops to about fourteen."],
        [N("nina"), "Fourteen is still fine but it is the number where you have to start a raise rather than think about one. My second concern is the outage on the eighteenth."],
        [N("priya"), "Forty-seven minutes. We have the post-mortem written and I will send it to you today, not a summary of it."],
        [N("nina"), "Send the whole thing. Honestly the fact that you have one written is most of the answer. What I want to see is the second-order changes, not the apology."],
        [N("priya"), "Two release trains a week, tested rollback as a hard gate, second on-call with escalation, automated status page. Those are dated, not aspirational."],
        [N("nina"), "Then I am comfortable. One more - are you raising in Q1?"],
        [N("priya"), "Not planning to. I would rather get new logos back to target and raise from strength in the second half."],
      ],
    },
  ],
  trailing_talk: { topic: "concerns", pool: "default", gap_weight: 0.4 },
};

export const allMeetings = [
  soloTest,
  halcyonDiscovery,
  standup,
  interview,
  designReview,
  allHands,
  investorUpdate,
];
