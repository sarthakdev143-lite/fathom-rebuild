// The case the brief says actually matters: eight people, one hour.
//
// Every decision, number, name, disagreement and action item below is authored.
// The generator handles pacing, overlap and the connective chatter between these
// moments (see seed/generator.mjs for why).
//
// Deliberately included because real meetings have them and fake ones do not:
//   - a bot joining and an audio check
//   - someone on mute, someone late, someone hard-stopping
//   - a genuine disagreement about how a metric is defined
//   - an accountability moment that does not get resolved cleanly
//   - a tangent that goes nowhere and gets parked
//   - action items with owners and spoken due dates, not parsed ones

import { PEOPLE, POOLS, SLOTS, COMPOSITES, names } from "../content/company.mjs";

const PRIYA = PEOPLE.priya.name;
const DAN = PEOPLE.dan.name;
const SOFIA = PEOPLE.sofia.name;
const MARCUS = PEOPLE.marcus.name;
const ELENA = PEOPLE.elena.name;
const TOM = PEOPLE.tom.name;
const AISHA = PEOPLE.aisha.name;
const BEN = PEOPLE.ben.name;

export const leadershipSync = {
  id: "m-leadership-sync",
  title: "Weekly Leadership Sync",
  seed: 90210,
  platform: "zoom",
  started_at: "2026-09-24T15:00:04Z",
  target_duration_ms: 61 * 60 * 1000,
  bot_name: "Fathom Notetaker",
  default_topic: "rollcall",
  participants: [
    { ...PEOPLE.priya,  role: "Organizer" },
    { ...PEOPLE.dan },
    { ...PEOPLE.sofia },
    { ...PEOPLE.marcus },
    { ...PEOPLE.elena },
    { ...PEOPLE.tom },
    { ...PEOPLE.aisha },
    { ...PEOPLE.ben },
  ],
  topics: [
    { id: "rollcall",  title: "Roll call & audio check" },
    { id: "metrics",   title: "September numbers" },
    { id: "halcyon",   title: "Halcyon Freight — security review" },
    { id: "incident",  title: "Sept 18 outage post-mortem" },
    { id: "hiring",    title: "Hiring & comp bands" },
    { id: "pricing",   title: "Usage-based pricing (parked)" },
    { id: "onboarding",title: "Onboarding revamp" },
    { id: "wrap",      title: "Actions & wrap" },
  ],
  slots: SLOTS,
  composites: COMPOSITES,
  pools: {
    default: POOLS.leadership,
    sales: POOLS.sales,
    eng: POOLS.eng,
    casual: POOLS.casual,
  },

  beats: [
    {
      id: "b-rollcall", topic: "rollcall", gap_weight: 0.35, followup_pool: "casual",
      lines: [
        [PRIYA, "Okay, we are recording. The notetaker joined, so nobody has to write anything down."],
        [DAN, "Can everyone see me? I am on the laptop today, not the desk."],
        [MARCUS, "Yep. Loud and clear."],
        [ELENA, "Sorry, I am going to be camera-off, I am on the train and the wifi is not great."],
        [PRIYA, "Fine. Tom, are you here?"],
        [TOM, "Sorry - I was on mute. I am here."],
        [PRIYA, "Alright. Marcus is going to have to drop at twenty past, he has a customer call, so let us do the numbers first and sales second. Agenda is in the doc."],
        [BEN, "Aisha said she might be two minutes late, she is finishing a renewal."],
      ],
    },
    {
      id: "b-metrics", topic: "metrics", gap_weight: 1.4, followup_pool: "default",
      lines: [
        [TOM, "September closed Friday. ARR is four point eight two million, which is up eighty-one thousand on August. Net revenue retention is a hundred and twelve percent. Gross churn came in at one point nine, so slightly better than the two point two we had planned for."],
        [PRIYA, "And the pipeline number?"],
        [TOM, "Two point one million in qualified pipeline for Q4. That is the number I would be careful with, actually."],
        [MARCUS, "Careful how?"],
        [TOM, "Because about three hundred and forty thousand of that is Halcyon, and Halcyon is not signed. If we are reporting pipeline to the board with Halcyon in it and Halcyon slips to November, the number moves."],
        [MARCUS, "That is fair, but Halcyon is in late-stage legal. It is not a hope-and-a-prayer deal. I would rather over-communicate the risk than quietly drop it."],
        [PRIYA, "So what are we actually agreeing? Tom, do you want it in or out?"],
        [TOM, "In, but flagged. Separate line in the board deck that says committed versus best-case. Then nobody is surprised."],
        [PRIYA, "Okay. Marcus, can you and Tom agree the wording before Friday and just send it to me? I do not want to spend board time on a definitions argument."],
        [MARCUS, "Yes, we will sort it."],
        [TOM, "One more thing. New logo count is six for the quarter against a target of nine. That is the number that worries me more than churn."],
        [AISHA, "Can I add context there? Two of the six are expansions, not logos. So the underlying new-business number is four. I would not sugarcoat it."],
        [PRIYA, "Right. Okay, that is genuinely useful. Let us not move the target mid-quarter, but let us talk about what we do about it in the Q4 planning session."],
      ],
    },
    {
      id: "b-halcyon", topic: "halcyon", gap_weight: 1.6, followup_pool: "sales",
      lines: [
        [MARCUS, "Halcyon. One hundred and eighty thousand ACV, three-year term, they want to start in November. The blocker is not commercial, it is their security review. Dev Patel sent over a forty-one question spreadsheet on Thursday."],
        [DAN, "I have seen it. About thirty of those we can answer from the SOC 2 report and the trust page. Six need engineering. And there are five I would call genuinely hard - pen test summary, data residency, sub-processor list with notice periods, encryption key rotation, and their question about whether we can pin a region for their tenant."],
        [MARCUS, "Can we pin a region?"],
        [DAN, "Not today. We are single-region in us-east. Multi-region is on the roadmap for Q1 and it is not a small piece of work."],
        [PRIYA, "So what do we tell them?"],
        [DAN, "The honest answer. We say single-region today, contractual commitment on data location, and a dated roadmap item for regional pinning in Q1. If we fudge it and they find out during the review, we lose the deal and the reference."],
        [SOFIA, "I can have the six engineering answers done in a week. The five hard ones need a written position from you and Dan, not from me - I can draft it but someone has to own the commitment."],
        [PRIYA, "Okay. Decision. Sofia gets two engineers for two weeks on the security pack, Dan owns the written position on the five hard questions, and Marcus tells Dev we will have the full response by the fourteenth of October. Not earlier, because I do not want to promise and miss."],
        [MARCUS, "The fourteenth works. They are not in a rush, they are in a process."],
        [TOM, "If we commit two engineers for two weeks, that is roughly forty thousand dollars of cost against a deal that has not signed. I am not objecting, I just want it recorded that we are spending ahead of the signature."],
        [PRIYA, "Recorded. I think it is the right bet. One-eighty ACV with a three-year term and a logistics reference is worth forty grand of engineering time."],
        [AISHA, "And if we win it, Halcyon becomes the case study that unlocks the rest of that vertical. There are maybe fifteen companies that look like them."],
      ],
    },
    {
      id: "b-incident", topic: "incident", gap_weight: 1.5, followup_pool: "eng",
      lines: [
        [SOFIA, "The eighteenth. Forty-seven minutes of degraded ingest, full outage for about twenty of those. Roughly eleven hundred customers affected, and three of them were mid-migration."],
        [DAN, "Root cause was the schema migration going out without the rollback path tested. We had the rollback written. Nobody ran it in staging."],
        [PRIYA, "Whose call was it to ship?"],
        [DAN, "Mine. I approved it at four fifty on a Friday because we were trying to make the Monday release window."],
        [PRIYA, "Okay. Thank you for saying that plainly. I am not interested in a blame conversation, but I am interested in why a Friday-evening deploy felt like the only option."],
        [DAN, "Because the release train is weekly and if we miss it we wait seven days. That is the actual pressure. The fix is not 'do not deploy on Friday', the fix is that missing a train should not cost a week."],
        [SOFIA, "Agreed. And separately, on-call was one person for four hours with no escalation path. That is the part that made it forty-seven minutes instead of fifteen."],
        [AISHA, "From my side - we had nine support tickets in the first twenty minutes and no status page update for eleven of them. Customers were finding out from their own dashboards before they found out from us."],
        [PRIYA, "That is the worst part, honestly. So: what are we committing to?"],
        [SOFIA, "Three things. Rollback tested in staging becomes a hard gate, not a checkbox. Second on-call with a fifteen-minute escalation. And status page automation tied to the ingest health check so a human is not the bottleneck."],
        [DAN, "And I would add moving to twice-weekly release trains. That removes the Friday pressure entirely."],
        [PRIYA, "Do it. Sofia, write it up with dates and send it to the whole company, not just this group. People need to see that we handled it."],
        [TOM, "Is there a financial exposure? Any customer asking for credits?"],
        [AISHA, "Two asked. One is a ninety-thousand dollar account and they asked for a five percent credit, which I have not agreed to yet."],
        [TOM, "Bring that to me before you agree it."],
      ],
    },
    {
      id: "b-hiring", topic: "hiring", gap_weight: 1.2, followup_pool: "default",
      lines: [
        [DAN, "Two open roles that matter. Staff engineer for the platform team, and a customer success manager for the enterprise book. The staff engineer has been open eleven weeks."],
        [TOM, "The band we approved for staff was two hundred to two hundred and twenty-five."],
        [DAN, "And we have lost three candidates at offer stage on that band in the last two months. The market for staff-level platform engineers with Rust and distributed systems is two thirty-five to two sixty. We are interviewing below market and then being surprised."],
        [TOM, "If we move the band to two sixty, everyone currently at two twenty-five asks for a review. That is the second-order cost and it is bigger than the first."],
        [DAN, "Which is a real argument. But the cost of not hiring is that the platform rewrite slips a quarter, and the Halcyon security work has nowhere to go."],
        [PRIYA, "Sofia, do you have someone in process?"],
        [SOFIA, "Two finalists. One is at two forty-five and would take it. The other wants two sixty-five and has a competing offer from a Series C."],
        [PRIYA, "Okay. Decision: we open a band exception up to two fifty for this one role, this one time, and Tom and Dan write the internal comms together so it does not land as a surprise. We do not move the published band yet - we revisit in Q4 planning with actual offer data."],
        [TOM, "I can live with an exception if it is genuinely an exception and it is documented."],
        [DAN, "That works. I would like to make the offer to the two forty-five candidate this week before they go elsewhere."],
        [PRIYA, "Do it today. Do not wait for the next sync."],
      ],
    },
    {
      id: "b-pricing", topic: "pricing", gap_weight: 0.9, followup_pool: "default",
      lines: [
        [BEN, "Can I raise something that is probably going to get parked. I have been thinking about usage-based pricing. Right now we sell seats, but the heavy users are consuming about four times the ingest of the light users and paying the same."],
        [MARCUS, "Has a single customer asked for that?"],
        [BEN, "Not exactly. Two have asked why their bill does not go down when they use less."],
        [ELENA, "That is a different question though. Those two are asking for a downgrade path, not a metering model."],
        [BEN, "Fair. But if we ever go upmarket properly, procurement is going to ask how we price against their data volume."],
        [TOM, "Usage-based pricing would also mean rebuilding billing, and we are on a provider that does not meter well. That is a quarter of work minimum."],
        [PRIYA, "I am going to park this. Not because it is wrong, but because we have four things in flight that matter more, and nobody has asked us for it. Ben, write a one-pager, put it in the Q1 planning doc, and we will pick it up when we have capacity."],
        [BEN, "Yeah, that is fair. I will write the one-pager."],
        [ELENA, "And I would talk to five customers first, because I think the answer is a downgrade path and that is much cheaper to build."],
      ],
    },
    {
      id: "b-onboarding", topic: "onboarding", gap_weight: 1.1, followup_pool: "default",
      lines: [
        [ELENA, "Onboarding revamp. We shipped the beta to fourteen accounts three weeks ago. Activation - meaning first dashboard created and a teammate invited - went from thirty-one percent to forty-four."],
        [PRIYA, "That is a big jump."],
        [ELENA, "It is, but the sample is fourteen accounts and two of them were hand-held by CS, so I would not take it to the bank yet. Time to first value went from about nine days to three."],
        [AISHA, "Confirms what I am seeing. The hand-held ones are the ones that stuck."],
        [ELENA, "Which is exactly the thing to fix. I need three more weeks to get the self-serve path to the same place, and I need one engineer."],
        [DAN, "After the Halcyon security pack? That is the same two weeks."],
        [ELENA, "Then it is week three and four, not week one and two."],
        [PRIYA, "Elena, sequence it after Halcyon. Marcus needs that deal more than we need onboarding in October. But hold the date - end of October, self-serve activation above forty percent."],
        [ELENA, "End of October. Yes."],
      ],
    },
    {
      id: "b-wrap", topic: "wrap", gap_weight: 0.6, followup_pool: "casual",
      lines: [
        [PRIYA, "Okay, Marcus has dropped, so let us wrap. Actions. Dan owns the written security position for Halcyon, due the fourteenth of October. Sofia owns the security pack and the incident write-up, write-up by Friday."],
        [SOFIA, "Friday."],
        [PRIYA, "Tom and Marcus agree the pipeline wording before Friday and send it to me. Tom and Dan write the internal comms on the comp exception. Elena gets onboarding to end of October. Ben writes the pricing one-pager for Q1 planning."],
        [BEN, "Yep."],
        [PRIYA, "Aisha brings the credit request to Tom before agreeing anything. And everyone - the notetaker has all of this, so if I got an owner wrong, fix it in the summary rather than emailing me."],
        [DAN, "That is the future. Slightly unsettling but useful."],
        [TOM, "Same time next week?"],
        [PRIYA, "Same time. Thanks all."],
      ],
    },
  ],

  trailing_talk: { topic: "wrap", pool: "casual", gap_weight: 0.5 },
};
