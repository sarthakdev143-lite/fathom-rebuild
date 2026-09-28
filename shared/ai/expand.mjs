// Query expansion: the offline half of closing the semantic gap.
//
// docs/RECON.md names the honest weakness of lexical retrieval: "did anyone commit
// to a date" does not find "we will have the full response by the fourteenth of
// October", because none of those words appear in the question.
//
// Real embeddings would fix this properly and are the first thing I would add
// (they need a model, so they need a key, so the demo would depend on one). Query
// expansion fixes a large and specific slice of it with no key at all: when a
// question matches a known INTENT - commitment, deadline, money, risk, blame,
// decision - the vocabulary that answers that intent is added to the search at a
// lower weight.
//
// Weighting matters. Expanded terms must not outrank the words the person actually
// typed, or "what is blocking the deal" would drift into every sentence containing
// "the". They contribute 0.4 of a direct term's score.
//
// This is a lexicon, not a model, and it is bounded by what I thought to write down.
// It is documented as such rather than dressed up as semantic search.

export const EXPANSION_WEIGHT = 0.4;

export const CONCEPTS = [
  {
    id: "commitment",
    label: "commitments & ownership",
    patterns: [/\bcommit/i, /\bpromis/i, /\bagree[d]?\s+to\b/i, /\bwho\s+(owns|is\s+going|will)\b/i, /\bowner\b/i, /\bresponsib/i, /\baction\s+item/i, /\bfollow\s*up/i, /\btake\s+(that|this|it)\b/i],
    expand: ["i'll", "i will", "we'll", "we will", "owns", "own", "owning", "responsible", "take that", "i can", "i'm happy to own", "send", "write", "book", "schedule", "deliver", "by"],
  },
  {
    id: "deadline",
    label: "dates & deadlines",
    patterns: [/\bwhen\b/i, /\bdate\b/i, /\bdeadline\b/i, /\bdue\b/i, /\btimeline\b/i, /\bby\s+when\b/i, /\bhow\s+long\b/i, /\bschedule[d]?\b/i],
    expand: ["friday", "monday", "tuesday", "wednesday", "thursday", "today", "tomorrow", "end of the week", "end of the month", "end of day", "next week", "october", "november", "january", "fourteenth", "eod", "eow", "by the", "due"],
  },
  {
    id: "decision",
    label: "decisions",
    patterns: [/\bdecid/i, /\bdecision\b/i, /\bagree[d]?\b/i, /\bchose\b/i, /\bgoing\s+with\b/i, /\bapproved?\b/i, /\bcall\b.*\b(make|made)\b/i, /\bconclusion\b/i],
    expand: ["we decided", "decision", "let's go with", "we're going to", "approved", "go ahead", "do it", "that's the call", "we agreed", "i'm happy with"],
  },
  {
    id: "money",
    label: "money & pricing",
    patterns: [/\bprice/i, /\bpricing\b/i, /\bcost\b/i, /\bcheap/i, /\bdiscount/i, /\bbudget\b/i, /\bmoney\b/i, /\bhow\s+much\b/i, /\bquote\b/i, /\bexpensive\b/i, /\bspend/i, /\bcredit\b/i, /\bsalary\b/i, /\bcomp\b/i, /\bpay\b/i],
    expand: ["price", "cost", "cheaper", "expensive", "discount", "budget", "acv", "arr", "thousand", "million", "percent", "credit", "quote", "salary", "band", "dollars", "burn", "runway"],
  },
  {
    id: "risk",
    label: "risks, blockers & problems",
    patterns: [/\brisk/i, /\bblock/i, /\bproblem\b/i, /\bconcern/i, /\bworr/i, /\bstuck\b/i, /\bissue\b/i, /\bexposure\b/i, /\bwhat'?s\s+stopping\b/i, /\bfail/i, /\bbroke\b/i, /\boutage\b/i],
    expand: ["risk", "risky", "blocker", "blocked", "problem", "concern", "concerned", "worried", "worry", "exposure", "slip", "slipped", "churn", "falls over", "broke", "failure", "lose the deal", "not where we want", "thin", "debt"],
  },
  {
    id: "blame",
    label: "accountability",
    patterns: [/\bwho\s+(approved|did|made|signed)\b/i, /\bblame\b/i, /\bresponsib/i, /\bfault\b/i, /\baccountab/i, /\bwhose\s+call\b/i],
    expand: ["mine", "i approved", "my call", "i take", "i should have", "that's on me", "i own", "without blaming", "accountable"],
  },
  {
    id: "security",
    label: "security & compliance",
    patterns: [/\bsecurity\b/i, /\bsoc\s*2\b/i, /\bcompliance\b/i, /\bresidency\b/i, /\bencryption\b/i, /\bpen\s*test\b/i, /\bsub-?processor\b/i, /\bregion\b/i, /\bdata\s+location\b/i, /\bprivacy\b/i],
    expand: ["security", "soc 2", "compliance", "residency", "region", "pinning", "encryption", "pen test", "sub-processor", "review", "questionnaire", "trust page", "data location", "gdpr"],
  },
  {
    id: "hiring",
    label: "hiring & people",
    patterns: [/\bhir(e|ing)\b/i, /\bcandidate\b/i, /\binterview\b/i, /\boffer\b/i, /\brecruit/i, /\brole\b.*\bopen\b/i, /\bstaff\s+engineer\b/i, /\bheadcount\b/i],
    expand: ["candidate", "offer", "interview", "hiring", "role", "band", "comp", "finalist", "recruiting", "headcount", "strong hire", "on-call", "rotation"],
  },
  {
    id: "customer",
    label: "customers & deals",
    patterns: [/\bcustomer\b/i, /\bclient\b/i, /\bdeal\b/i, /\bpipeline\b/i, /\bprospect\b/i, /\brenewal\b/i, /\bchurn\b/i, /\baccount\b/i, /\blogo\b/i, /\bprocurement\b/i, /\blegal\b/i],
    expand: ["customer", "deal", "pipeline", "renewal", "churn", "account", "logo", "procurement", "legal", "pilot", "champion", "signed", "contract", "msa", "vertical"],
  },
  {
    id: "metrics",
    label: "numbers & metrics",
    patterns: [/\bnumber\b/i, /\bmetric/i, /\bhow\s+(many|much)\b/i, /\bpercent/i, /\bgrowth\b/i, /\barr\b/i, /\bretention\b/i, /\bstat/i, /\bmeasure\b/i],
    expand: ["percent", "arr", "nrr", "retention", "churn", "growth", "million", "thousand", "up", "down", "against a target", "plan", "conversion", "activation"],
  },
];

/**
 * Which concepts a question is really asking about, and the vocabulary that
 * answers them.
 * @param {string} question
 * @returns {{concepts: {id: string, label: string}[], terms: string[]}}
 */
export function expandQuery(question) {
  const q = question.toLowerCase();
  const hits = CONCEPTS.filter((c) => c.patterns.some((re) => re.test(q)));
  const terms = [];
  const seen = new Set();
  for (const h of hits) {
    for (const t of h.expand) {
      const k = t.toLowerCase();
      if (!seen.has(k)) { seen.add(k); terms.push(t); }
    }
  }
  return { concepts: hits.map((h) => ({ id: h.id, label: h.label })), terms };
}

/** Multi-word expansions need their own matching; single words go through TF-IDF. */
export function splitExpansions(terms) {
  const single = [];
  const phrases = [];
  for (const t of terms) (t.includes(" ") ? phrases : single).push(t);
  return { single, phrases };
}
