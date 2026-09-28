// Shared seed universe: the people, the company, and the connective-talk pools.
//
// The demo account is a PERSONA (Priya Raman, CEO of Northwind Labs), not a real
// person. Everything here is invented. It is written to be specific - real
// numbers, real-sounding dates, named customers - because vague seed data is what
// makes a rebuild look like a mockup.

export const COMPANY = {
  name: "Northwind Labs",
  product: "Northwind Signal (B2B analytics infrastructure)",
  headcount: 61,
  demoUser: "u-priya",
};

export const PALETTE = [
  "#6366f1", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6",
  "#f97316", "#84cc16",
];

export const PEOPLE = {
  priya:  { id: "u-priya",  name: "Priya Raman",      email: "priya@northwindlabs.example",  role: "CEO",                initials: "PR", color: PALETTE[0] },
  dan:    { id: "u-dan",    name: "Dan Okafor",       email: "dan@northwindlabs.example",    role: "CTO",                initials: "DO", color: PALETTE[1] },
  sofia:  { id: "u-sofia",  name: "Sofia Marchetti",  email: "sofia@northwindlabs.example",  role: "VP Engineering",     initials: "SM", color: PALETTE[2] },
  marcus: { id: "u-marcus", name: "Marcus Lee",       email: "marcus@northwindlabs.example", role: "Head of Sales",      initials: "ML", color: PALETTE[3] },
  elena:  { id: "u-elena",  name: "Elena Petrova",    email: "elena@northwindlabs.example",  role: "Head of Design",     initials: "EP", color: PALETTE[4] },
  tom:    { id: "u-tom",    name: "Tom Whitfield",    email: "tom@northwindlabs.example",    role: "CFO",                initials: "TW", color: PALETTE[5] },
  aisha:  { id: "u-aisha",  name: "Aisha Bello",      email: "aisha@northwindlabs.example",  role: "Head of Customer Success", initials: "AB", color: PALETTE[6] },
  ben:    { id: "u-ben",    name: "Ben Nakamura",     email: "ben@northwindlabs.example",    role: "Product Manager",    initials: "BN", color: PALETTE[7] },
  // external
  rachel: { id: "u-rachel", name: "Rachel Kim",       email: "rachel.kim@halcyonfreight.example", role: "VP Data, Halcyon Freight", initials: "RK", color: PALETTE[8], external: true, company: "Halcyon Freight" },
  dev:    { id: "u-dev",    name: "Dev Patel",        email: "dev.patel@halcyonfreight.example",  role: "Security Lead, Halcyon Freight", initials: "DP", color: PALETTE[9], external: true, company: "Halcyon Freight" },
  nina:   { id: "u-nina",   name: "Nina Alvarez",     email: "nina@brightpathvc.example",         role: "Partner, Brightpath", initials: "NA", color: PALETTE[2], external: true, company: "Brightpath VC" },
  callum: { id: "u-callum", name: "Callum Reid",      email: "callum.reid@meridianhealth.example", role: "Director of IT, Meridian Health", initials: "CR", color: PALETTE[5], external: true, company: "Meridian Health" },
  yuki:   { id: "u-yuki",   name: "Yuki Tanaka",      email: "yuki.tanaka@example.com",           role: "Staff Engineer candidate", initials: "YT", color: PALETTE[6], external: true, company: "Candidate" },
};

export const p = (...keys) => keys.map((k) => PEOPLE[k]);
export const names = (...keys) => keys.map((k) => PEOPLE[k].name);

// Connective-talk pools. Composable with {speaker}/{other} so a 61-minute call
// does not visibly repeat itself.
export const POOLS = {
  leadership: [
    "Sorry, can you say that again? You cut out for a second.",
    "Yep, that matches what I saw in the dashboard this morning.",
    "Can we take that offline? I do not want to burn the whole hour on it.",
    "I will follow up with {other} after this and put it in writing.",
    "Just to make sure I understood - is that committed or is that a forecast?",
    "Hang on, I am still in another call, give me ten seconds.",
    "That is fair. I would push back a little on the timeline though.",
    "Do we have a number for that, or is it a feeling?",
    "Sorry, you are on mute.",
    "I think we are agreeing with each other here, actually.",
    "Can someone drop the link in the chat?",
    "Let us park that and come back to it if we have time at the end.",
    "Quick flag - {other} is out next week, so anything needing them has to move.",
    "That is the third time this has come up this month, which tells me something.",
    "I am happy to own that if nobody else wants it.",
    "Is this a decision or are we still discussing?",
    "My concern is less the what and more the when.",
    "Agreed. Let us not re-litigate it, we decided this in August.",
    "Someone should write that down before we all forget.",
    "Sorry, dog is barking - continue.",
  ],
  sales: [
    "They asked about SOC 2 again, which is usually a good sign.",
    "Procurement is the bottleneck, not the technical evaluation.",
    "I can get them on a call this week if that helps.",
    "The champion is engaged but their budget cycle does not start until January.",
    "Honestly the competitor is cheaper and they know it.",
    "Can we get a reference customer in the same vertical?",
    "They want a pilot, but a paid one, not a free trial.",
    "I would rather lose it on price than discount forty percent.",
    "Legal redlined the MSA, nothing unusual.",
    "The deal slipped again. I do not love it but it is still alive.",
  ],
  eng: [
    "The migration is done, we just have not flipped the flag yet.",
    "It is a two-day change, not two weeks, but the testing is the long part.",
    "We have had three of those alerts this week and two were noise.",
    "I would rather not touch that service until the new owner is hired.",
    "Latency is down to about 180 milliseconds at p95 on the ingest path.",
    "The on-call rotation is thin. That is the real risk.",
    "We can ship it behind a flag and roll back in five minutes if it goes wrong.",
    "Nobody has reproduced it, which is its own kind of answer.",
    "That is technical debt we took on deliberately in March and it is due.",
    "The test suite takes eleven minutes and it is getting worse.",
  ],
  casual: [
    "How was everyone's weekend?",
    "I cannot believe it is already October.",
    "Is anyone else's wifi terrible today?",
    "Can everyone see my screen?",
    "I will keep this quick, I know we are tight on time.",
    "Sorry I am late, the previous thing ran over.",
    "Let me share the doc real quick.",
    "Before we start - any birthdays this week?",
    "I am going to be hard-stopping at the top of the hour.",
    "Great, looks like everyone is here.",
  ],
  solo: [
    "Right, so what else do I need to say to make this useful.",
    "Let me just keep talking so the transcript is not empty.",
    "Okay, that sounds like it is picking up.",
    "I wonder if it will get the names right with only one speaker.",
    "This is the bit where I would normally be writing something down.",
    "Let me pause for a second and see if it handles silence.",
    "Right. Anything else before I stop the recording.",
  ],
};

// Sentence skeletons for connective talk. A 10-line pool cannot fill 350 turns of
// a 41-minute interview without visibly repeating, and a dedup window over a tiny
// pool just turns the repetition into a mechanical cycle. Composing sentences from
// slots gives thousands of distinct lines from a page of fragments.
export const COMPOSITES = [
  "On {project}, we are {progress} - {blocker} is the thing holding it up.",
  "{project} is {progress}. I would not call it at risk yet, but {risk} is real.",
  "I looked at the numbers this morning and {metric} moved {direction}.",
  "If we do not sort {risk} this quarter, {consequence}.",
  "{other} and I talked about {project} yesterday and landed on {approach}.",
  "The honest status on {project}: {progress}, with {blocker} still open.",
  "I would rather ship {project} late than ship it with {risk} in it.",
  "Can {other} take {project}? It has been sitting without a name on it.",
  "{metric} is where I would look first to understand how this is going.",
  "We have {timeframe} before {risk} stops being a paper problem.",
  "Nothing changed on {project} since last week, which is itself a signal about {blocker}.",
  "I am less worried about {risk} than about {blocker}, if I am honest.",
  "{metric} looks fine until you split it by {dimension}, and then it does not.",
  "If {other} agrees, I would start {approach} on {project} next week.",
  "{project} needs a decision, not another conversation - {approach} is good enough.",
  "I will take {blocker} away and come back with {metric} attached to it.",
  "Somebody should write down what we mean by {dimension}, because we all mean something different.",
  "{timeframe} is optimistic for {project} given {blocker}, but it is not impossible.",
];

export const SLOTS = {
  number: ["$4.82 million", "112 percent", "$180k", "1.9 percent", "$2.1 million", "61 people", "fourteen days", "38 percent"],
  adj: ["strong", "soft", "better than plan", "concerning", "flat"],
  project: ["the ingest rewrite", "the Halcyon integration", "the pricing page", "onboarding v3", "the SOC 2 evidence pack", "the design system"],
  blocker: ["waiting on legal", "the staging environment", "nobody owning it", "a dependency on the data team", "the migration window", "the review queue", "a vendor who will not answer"],
  progress: ["roughly where we planned", "a week behind", "ahead of where I expected", "stalled", "moving again after two dead weeks", "ninety percent done and stuck on the last ten", "further along than the dashboard suggests"],
  risk: ["the thin on-call rotation", "single-region hosting", "the untested rollback path", "key-person knowledge", "the release train pressure", "unwritten runbooks", "a test suite nobody trusts"],
  metric: ["p95 ingest latency", "activation", "gross churn", "qualified pipeline", "new logo count", "time to first value", "support ticket volume", "net revenue retention"],
  direction: ["the right way", "the wrong way", "less than I hoped", "more than the forecast said", "barely at all"],
  consequence: ["it stops being an engineering problem and becomes a sales one", "we will be explaining it to the board instead of fixing it", "the next incident writes its own post-mortem", "customers find out before we do", "the roadmap slips a quarter and takes two things with it"],
  approach: ["the boring option", "the flag-first rollout", "a two-week spike with a hard stop", "pairing someone senior on it", "doing it in the open with a written position", "the smallest version that teaches us something"],
  timeframe: ["Two weeks", "A month", "The rest of the quarter", "Ten days", "The run-up to the board meeting"],
  dimension: ["customer size", "region", "cohort", "plan tier", "week of signup"],
};
