// Thin typed API client. Every call is a plain fetch against the same Worker
// that serves this bundle, so there is no base URL to configure and no CORS.

export type Segment = {
  id: number;
  edited?: number;
  start_ms: number;
  end_ms: number;
  text: string;
  words?: number;
  is_crosstalk?: number;
  confidence?: number;
  speaker_name: string;
  speaker_color: string;
};

export type Chapter = { id: string; title: string; topic: string | null; start_ms: number; end_ms: number; sort_order: number };

export type ActionItem = {
  id: string; text: string; owner_name: string | null; due_text: string | null;
  start_ms: number; done: number; confidence: number;
};

export type SummarySection = { section_key: string; title: string; body: string; sort_order: number };

export type Summary = {
  id?: string; template_key: string; headline: string; overview: string;
  generated_by: string; latency_ms?: number; sections: SummarySection[];
};

export type Highlight = {
  id: string; start_ms: number; end_ms: number; label: string | null;
  note: string | null; source: string; created_at: string;
};

export type Person = { person_name: string; color: string; is_external: number; role?: string | null; company?: string | null };

export type MeetingRow = {
  id: string; title: string; started_at: string; ended_at: string | null;
  duration_ms: number; platform: string; status: string; participant_count: number;
  speaker_count: number; segment_count: number; word_count: number; active_template: string;
  is_pinned: number; is_read: number; headline: string | null;
  action_count: number; highlight_count: number;
  people: { person_name: string; color: string; is_external: number }[];
};

export type MeetingDetail = {
  meeting: MeetingRow & { bot_name: string; audio_key: string | null; audio_duration_ms: number; audio_synthesized: number; audio_note: string | null };
  participants: Person[];
  speakers: { id: string; name: string; color: string; talk_ms: number; segment_ct: number }[];
  chapters: Chapter[];
  highlights: Highlight[];
  clips: { id: string; title: string; start_ms: number; end_ms: number; transcript: string; label?: string }[];
  shares: { token: string; scope: string; title: string; view_count: number; created_at: string }[];
  templates: { key: string; name: string; tagline: string; icon: string }[];
  summary: Summary | null;
  action_items: ActionItem[];
  stats: { n: number; words: number; crosstalk: number; avg_conf: number } | null;
};

// Client-visible request telemetry: path, round-trip ms, and the Worker's own
// Server-Timing figure. Kept as a ring buffer so the perf panel can show what the
// page actually cost without a profiling build.
export type ReqStat = { path: string; ms: number; serverMs: number | null; at: number };
const reqLog: ReqStat[] = [];
export const requestLog = () => reqLog.slice();

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  const st = res.headers.get("server-timing");
  const m = st ? /app;dur=([\d.]+)/.exec(st) : null;
  reqLog.push({
    path: path.split("?")[0],
    ms: Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0),
    serverMs: m ? Number(m[1]) : null,
    at: Date.now(),
  });
  if (reqLog.length > 40) reqLog.shift();
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { msg = ((await res.json()) as any)?.error || msg; } catch { /* keep status text */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => req<{ ok: boolean; provider: string; demo: boolean }>("/api/health"),
  me: () => req<{ name: string; email: string; initials: string; color: string; plan: string; company: string }>("/api/me"),
  stats: () => req<Record<string, number>>("/api/stats"),
  meetings: (q = "") => req<{ meetings: MeetingRow[] }>(`/api/meetings${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  meeting: (id: string) => req<MeetingDetail>(`/api/meetings/${encodeURIComponent(id)}`),
  transcript: (id: string, from = 0, limit = 800) =>
    req<{ segments: Segment[]; next_from: number | null }>(`/api/meetings/${encodeURIComponent(id)}/transcript?from=${from}&limit=${limit}`),
  setTemplate: (id: string, template: string) =>
    req<{ template: string; summary: Summary; action_items: ActionItem[] }>(`/api/meetings/${encodeURIComponent(id)}/template`, {
      method: "POST", body: JSON.stringify({ template }),
    }),
  renameSpeaker: (meetingId: string, speakerId: string, name: string) =>
    req<{ ok: boolean; renamed_from: string; name: string }>(`/api/meetings/${encodeURIComponent(meetingId)}/speakers/${encodeURIComponent(speakerId)}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  correctSegment: (id: number, text: string) =>
    req<{ ok: boolean; edited: boolean }>(`/api/segments/${id}`, { method: "PATCH", body: JSON.stringify({ text }) }),
  toggleAction: (id: string, done: boolean) =>
    req<{ ok: boolean }>(`/api/action-items/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ done }) }),
  addHighlight: (id: string, h: { start_ms: number; end_ms?: number; label?: string; note?: string; source?: string }) =>
    req<{ highlight: Highlight }>(`/api/meetings/${encodeURIComponent(id)}/highlights`, { method: "POST", body: JSON.stringify(h) }),
  deleteHighlight: (id: string) => req<{ ok: boolean }>(`/api/highlights/${encodeURIComponent(id)}`, { method: "DELETE" }),
  createShare: (id: string, body: { clip_id?: string; scope?: string; title?: string }) =>
    req<{ token: string; url: string }>(`/api/meetings/${encodeURIComponent(id)}/shares`, { method: "POST", body: JSON.stringify(body) }),
  share: (token: string) => req<any>(`/api/share/${encodeURIComponent(token)}`),
  shareView: (token: string) => req<{ view_count: number }>(`/api/share/${encodeURIComponent(token)}/view`, { method: "POST" }),
  ask: (question: string, meetingId?: string, history?: { role: string; content: string }[]) =>
    req<{
      question: string; scope: string; answer: string; provider: string;
      citations: { meeting_id: string; meeting_title: string; speaker_name: string; speaker_color: string; start_ms: number; text: string }[];
      passages_considered: number; latency_ms?: number; fallback_used?: boolean;
      concepts?: { id: string; label: string }[];
    }>("/api/ask", { method: "POST", body: JSON.stringify({ question, meeting_id: meetingId, history }) }),
  askSuggested: () => req<{ meeting: string[]; all: string[] }>("/api/ask/suggested"),
  templates: () => req<{ templates: { key: string; name: string; tagline: string; icon: string }[]; default: string }>("/api/templates"),
  settings: () => req<Record<string, string>>("/api/settings"),
  setSetting: (key: string, value: string) =>
    req<Record<string, string>>("/api/settings", { method: "PATCH", body: JSON.stringify({ key, value }) }),
  applyTemplateToAll: (template: string) =>
    req<{ ok: boolean; updated: number }>(`/api/settings/apply-template?template=${encodeURIComponent(template)}`, { method: "POST" }),
  search: (q: string) => req<{ query: string; total: number; hits: any[]; meetings: { meeting_id: string; count: number }[] }>(`/api/search?q=${encodeURIComponent(q)}`),
  calendar: () => req<{ connections: any[]; events: any[]; is_stub: boolean }>("/api/calendar"),
  connectCalendar: (provider: string) => req<{ ok: boolean; provider: string; is_stub: boolean }>("/api/calendar/connect", {
    method: "POST", body: JSON.stringify({ provider }),
  }),
  setNotetaker: (eventId: string, notetaker_status: string) =>
    req<{ ok: boolean }>(`/api/calendar/events/${encodeURIComponent(eventId)}`, { method: "PATCH", body: JSON.stringify({ notetaker_status }) }),
};

// ---- formatting helpers shared by every view ------------------------------

export function fmtClock(ms: number, forceHours = false): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0 || forceHours) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function fmtDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.round((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m} min`;
  return `${Math.max(1, Math.round(total))}s`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const yest = new Date(today.getTime() - 86400000);
  if (sameDay) return `Today, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  if (d.toDateString() === yest.toDateString()) return `Yesterday, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

export function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

/** Tiny markdown subset: headings, bullets, bold, italic, inline code, links. */
export function renderInline(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    // Model answers cite passages as [n](<milliseconds>ms). Render them as chips
    // that seek the recording, rather than as dead markdown.
    .replace(/\[([^\]]+)\]\((\d+)ms\)/g, (_m, label, ms) => {
      const n = Number(ms);
      return `<button type="button" data-seek="${n}" class="cite-chip" title="Jump to ${fmtClock(n)} in the recording">${label} · ${fmtClock(n)}</button>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  let html = "";
  let inList = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { if (inList) { html += "</ul>"; inList = false; } continue; }
    if (line.startsWith("### ")) { if (inList) { html += "</ul>"; inList = false; } html += `<h3>${renderInline(line.slice(4))}</h3>`; continue; }
    if (line.startsWith("- [ ] ") || line.startsWith("- [x] ")) {
      if (!inList) { html += "<ul>"; inList = true; }
      const checked = line.startsWith("- [x] ");
      html += `<li>${checked ? "✅ " : ""}${renderInline(line.slice(6))}</li>`;
      continue;
    }
    if (line.startsWith("- ")) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${renderInline(line.slice(2))}</li>`;
      continue;
    }
    if (inList) { html += "</ul>"; inList = false; }
    html += `<p>${renderInline(line)}</p>`;
  }
  if (inList) html += "</ul>";
  return html;
}
