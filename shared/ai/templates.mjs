// Template definitions. Switching template must change the OUTPUT materially,
// not just the heading - that is the whole point of the feature.
//
// Each section declares an `extract` strategy; shared/ai/summarize.mjs turns a
// transcript into content for it. Adding a template is adding config, not code.

export const TEMPLATES = [
  {
    key: "standard",
    name: "Standard summary",
    tagline: "What was discussed, what was decided, who does what",
    icon: "doc",
    sort_order: 10,
    is_default: 1,
    sections: [
      { key: "overview", title: "Overview", extract: "overview" },
      { key: "key_points", title: "Key points", extract: "key_points" },
      { key: "decisions", title: "Decisions", extract: "decisions" },
      { key: "action_items", title: "Action items", extract: "actions" },
      { key: "open_questions", title: "Questions raised", extract: "questions" },
    ],
  },
  {
    key: "executive",
    name: "Executive brief",
    tagline: "One screen for someone who was not in the room",
    icon: "briefcase",
    sort_order: 20,
    is_default: 0,
    sections: [
      { key: "bottom_line", title: "Bottom line", extract: "bottom_line" },
      { key: "metrics", title: "Numbers mentioned", extract: "metrics" },
      { key: "risks", title: "Risks & exposure", extract: "risks" },
      { key: "decisions", title: "Decisions made", extract: "decisions" },
      { key: "escalations", title: "Needs a decision above this group", extract: "escalations" },
    ],
  },
  {
    key: "sales",
    name: "Sales call",
    tagline: "Pain, objections, signals and the next step",
    icon: "target",
    sort_order: 30,
    is_default: 0,
    sections: [
      { key: "customer_context", title: "Customer context", extract: "customer_context" },
      { key: "pain_points", title: "Pain points", extract: "pain_points" },
      { key: "objections", title: "Objections & how they were handled", extract: "objections" },
      { key: "buying_signals", title: "Buying signals", extract: "buying_signals" },
      { key: "next_steps", title: "Next steps", extract: "actions" },
    ],
  },
  {
    key: "interview",
    name: "Interview scorecard",
    tagline: "Evidence per competency, then a recommendation",
    icon: "user",
    sort_order: 40,
    is_default: 0,
    sections: [
      { key: "candidate", title: "Candidate & role", extract: "candidate" },
      { key: "technical", title: "Technical depth", extract: "technical_evidence" },
      { key: "judgement", title: "Judgement & incident leadership", extract: "judgement_evidence" },
      { key: "concerns", title: "Concerns raised", extract: "concerns" },
      { key: "recommendation", title: "Recommendation", extract: "recommendation" },
    ],
  },
  {
    key: "detailed",
    name: "Detailed notes",
    tagline: "Chronological, by topic, with who said what",
    icon: "list",
    sort_order: 50,
    is_default: 0,
    sections: [{ key: "chapters", title: "Notes by topic", extract: "chapters" }],
  },
  {
    key: "actions_only",
    name: "Actions only",
    tagline: "Nothing but owners, tasks and dates",
    icon: "check",
    sort_order: 60,
    is_default: 0,
    sections: [{ key: "action_items", title: "Action items", extract: "actions" }],
  },
];

export const TEMPLATE_BY_KEY = Object.fromEntries(TEMPLATES.map((t) => [t.key, t]));
export const DEFAULT_TEMPLATE = TEMPLATES.find((t) => t.is_default).key;
