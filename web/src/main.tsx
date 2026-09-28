import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, NavLink, useNavigate, useParams, Link } from "react-router-dom";
import "./styles.css";
import { api, fmtDate, fmtDuration, initials, renderMarkdown, type MeetingRow } from "./api";
import MeetingPage from "./pages/MeetingPage";
import SharePage from "./pages/SharePage";
import LivePage from "./pages/LivePage";
import CalendarPage from "./pages/CalendarPage";
import SettingsPage from "./pages/SettingsPage";

// ---------------------------------------------------------------- shell ----

const NAV = [
  { to: "/", label: "Meetings", icon: "M4 6h16M4 12h16M4 18h10" },
  { to: "/live", label: "Live", icon: "M12 8v8m-4-4h8", badge: "sim" },
  { to: "/calendar", label: "Calendar", icon: "M7 3v3m10-3v3M4 9h16M5 6h14v14H5z" },
  { to: "/search", label: "Search", icon: "M11 19a8 8 0 100-16 8 8 0 000 16zm10 2l-4.35-4.35" },
  { to: "/settings", label: "Settings", icon: "M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zm7.4-3.5l2 1.6-2 3.4-2.4-1a7.6 7.6 0 01-1.5.9L15 20h-6l-.5-3.1a7.6 7.6 0 01-1.5-.9l-2.4 1-2-3.4 2-1.6a7.7 7.7 0 010-1.8l-2-1.6 2-3.4 2.4 1a7.6 7.6 0 011.5-.9L9 4h6l.5 3.1c.5.2 1 .5 1.5.9l2.4-1 2 3.4-2 1.6a7.7 7.7 0 010 1.8z" },
];

function Shell({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => { api.me().then(setMe).catch(() => {}); api.stats().then(setStats).catch(() => {}); }, []);

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Narrow screens: the sidebar becomes a horizontal top bar. The walkthrough
          script tells the candidate to open a share link on their phone, and a
          236px rail plus two fixed panes on a 390px screen is an own goal. */}
      <div className="md:hidden shrink-0 bg-ink-950 px-3 py-2 flex items-center gap-1 overflow-x-auto">
        <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shrink-0 mr-1.5">
          <svg width="15" height="15" viewBox="0 0 32 32" fill="none"><path d="M9 21V11h8M9 16h6" stroke="white" strokeWidth="2.6" strokeLinecap="round" /><circle cx="22" cy="20" r="2.8" fill="#22d3ee" /></svg>
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"}
                   className={({ isActive }) => `shrink-0 px-2.5 py-1.5 rounded-lg text-[12.5px] whitespace-nowrap ${isActive ? "bg-white/12 text-white font-medium" : "text-ink-300"}`}>
            {n.label}
          </NavLink>
        ))}
      </div>

      <aside className="hidden md:flex w-[236px] shrink-0 bg-ink-950 text-ink-200 flex-col">
        <div className="px-4 py-4 flex items-center gap-2.5 border-b border-white/8">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
              <path d="M9 21V11h8M9 16h6" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
              <circle cx="22" cy="20" r="2.8" fill="#22d3ee" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-white leading-tight truncate">Signal Notes</div>
            <div className="text-[10.5px] text-ink-400 leading-tight">a fathom.video rebuild</div>
          </div>
        </div>

        <nav className="px-2.5 py-3 space-y-0.5 flex-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `group flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors ${
                  isActive ? "bg-white/10 text-white font-medium" : "text-ink-300 hover:bg-white/6 hover:text-white"
                }`
              }
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                <path d={n.icon} />
              </svg>
              <span className="flex-1">{n.label}</span>
              {n.badge && (
                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 border border-amber-400/25">
                  {n.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-white/8 space-y-2">
          {stats && (
            <div className="text-[10.5px] text-ink-400 leading-relaxed">
              <div className="flex justify-between"><span>meetings</span><span className="text-ink-200 tabular-nums">{stats.meetings}</span></div>
              <div className="flex justify-between"><span>transcript lines</span><span className="text-ink-200 tabular-nums">{Number(stats.segments).toLocaleString()}</span></div>
              <div className="flex justify-between"><span>recorded</span><span className="text-ink-200 tabular-nums">{Math.round(stats.total_ms / 3600000)}h</span></div>
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10.5px] font-semibold text-white shrink-0"
                 style={{ background: me?.color || "#6366f1" }}>{me ? initials(me.name) : "··"}</div>
            <div className="min-w-0">
              <div className="text-[12px] text-white truncate leading-tight">{me?.name || "Loading…"}</div>
              <div className="text-[10px] text-ink-400 truncate leading-tight">{me?.company} · {me?.plan}</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col bg-ink-50 overflow-hidden">{children}</main>
    </div>
  );
}

const PLATFORM_COLOR: Record<string, string> = {
  zoom: "#2d8cff", meet: "#00a968", teams: "#5b5fc7", upload: "#f59e0b", "live-asr": "#ef4444",
};

/** Downsampled amplitude sketch of the recording - the card's visual anchor. */
function CardWave({ id, color }: { id: string; color: string }) {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/media/peaks/${id}.json`).then((r) => (r.ok ? r.json() : null))
      .then((p) => alive && setPeaks(Array.isArray(p) ? p : null)).catch(() => {});
    return () => { alive = false; };
  }, [id]);
  if (!peaks) return <div className="h-9" />;
  const step = Math.max(1, Math.floor(peaks.length / 56));
  const bars = peaks.filter((_, i) => i % step === 0).slice(0, 56);
  return (
    <svg className="spark w-full h-9" viewBox="0 0 56 40" preserveAspectRatio="none" aria-hidden>
      {bars.map((p, i) => (
        <rect key={i} x={i + 0.22} y={20 - Math.max(1, p * 0.18)} width={0.56}
              height={Math.max(2, p * 0.36)} rx={0.28} fill={color} />
      ))}
    </svg>
  );
}

function PlatformIcon({ platform }: { platform: string }) {
  const c = platform === "zoom" ? "#2d8cff" : platform === "meet" ? "#00a968" : "#5b5fc7";
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] font-medium px-1.5 py-0.5 rounded border"
          style={{ color: c, borderColor: `${c}33`, background: `${c}0f` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
      {platform}
    </span>
  );
}

function AvatarStack({ people }: { people: { person_name: string; color: string; is_external: number }[] }) {
  const shown = people.slice(0, 5);
  const extra = people.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((p) => (
        <span key={p.person_name} title={`${p.person_name}${p.is_external ? " (external)" : ""}`}
              className="w-6 h-6 rounded-full ring-2 ring-white flex items-center justify-center text-[9px] font-semibold text-white"
              style={{ background: p.color }}>
          {initials(p.person_name)}
        </span>
      ))}
      {extra > 0 && (
        <span className="w-6 h-6 rounded-full ring-2 ring-white bg-ink-100 text-ink-600 flex items-center justify-center text-[9px] font-semibold">
          +{extra}
        </span>
      )}
    </div>
  );
}

// ------------------------------------------------------------- meetings ----

function MeetingsPage() {
  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showBanner, setShowBanner] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [canUpload, setCanUpload] = useState<boolean | null>(null);
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api.health().then((h) => setCanUpload(true)).catch(() => setCanUpload(false)); }, []);

  // The real capture path: give it an audio file and Gemini ASR builds a meeting
  // exactly like a seeded one. Duration comes from the browser's own decode of the
  // file metadata, because proportional timing needs a true duration.
  const onFile = async (f: File) => {
    setUploading("reading duration…");
    const duration_ms = await new Promise<number>((resolve) => {
      const url = URL.createObjectURL(f);
      const a = new Audio();
      a.preload = "metadata";
      a.onloadedmetadata = () => { resolve(Math.round(a.duration * 1000)); URL.revokeObjectURL(url); };
      a.onerror = () => { resolve(0); URL.revokeObjectURL(url); };
      a.src = url;
    });
    if (!duration_ms) { setUploading(null); setErr("Could not read that file's duration - is it audio?"); return; }
    setUploading(`transcribing ${Math.round(duration_ms / 1000)}s with Gemini ASR…`);
    try {
      const form = new FormData();
      form.append("file", f);
      form.append("duration_ms", String(duration_ms));
      form.append("title", f.name.replace(/\.[a-z0-9]+$/i, ""));
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const d: any = await res.json();
      if (!res.ok) throw new Error(d.error || res.statusText);
      nav(`/meetings/${d.id}`);
    } catch (e: any) {
      setErr(`Upload failed: ${e.message}`);
    } finally { setUploading(null); }
  };

  useEffect(() => {
    api.meetings().then((r) => setRows(r.meetings)).catch((e) => setErr(e.message)).finally(() => setLoading(false));
    api.settings().then((s) => setShowBanner(s.show_stub_banner !== "0")).catch(() => {});
  }, []);

  const groups = useMemo(() => {
    const m = new Map<string, MeetingRow[]>();
    for (const r of rows) {
      const d = new Date(r.started_at);
      const today = new Date();
      const key = d.toDateString() === today.toDateString() ? "Today"
        : d.toDateString() === new Date(today.getTime() - 86400000).toDateString() ? "Yesterday"
        : d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return [...m.entries()];
  }, [rows]);

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="sticky top-0 z-10 bg-ink-50/85 backdrop-blur border-b border-ink-200 px-8 py-5">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Meetings</h1>
            <p className="text-[13px] text-ink-500 mt-0.5">
              {rows.length} recordings · everything below is seeded demo data, including the transcripts
            </p>
          </div>
          <input ref={fileRef} type="file" accept="audio/*" className="hidden"
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading !== null}
                  title="Real capture: transcribes the file with gemini-3.5-transcribe and builds a meeting"
                  className="focus-ring shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-ink-200 bg-white text-[13px] font-medium text-ink-700 hover:border-accent/50 hover:text-accent transition-colors disabled:opacity-50">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 16V4m0 0L8 8m4-4l4 4" /><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></svg>
            {uploading ? uploading : "Upload a recording"}
          </button>
          <Link to="/live" className="focus-ring shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-accent text-white text-[13px] font-medium hover:bg-indigo-600 transition-colors shadow-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            New live meeting
          </Link>
        </div>
      </header>

      <div className="px-8 py-6 max-w-[1100px]">
        {showBanner && <div className="mb-5 rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900 leading-relaxed">
          <strong className="font-semibold">The eight seeded meetings were never recorded</strong> — no bot joins a real
          call; transcripts are authored and audio is synthesized from them. Recordings you upload or capture with the
          browser extension are real.{" "}
          <Link to="/settings" className="underline decoration-amber-400 hover:decoration-amber-600">Hide this note</Link>.
          {" "}<Link to="https://github.com/sarthakdev143-lite/fathom-rebuild/tree/main/extension" className="underline decoration-amber-400 hover:decoration-amber-600">Get the extension</Link>.
        </div>}

        {err && <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-[13px] text-red-800">Failed to load: {err}</div>}
        {loading && <div className="text-[13px] text-ink-500 py-10 text-center">Loading meetings…</div>}

        {groups.map(([label, list]) => (
          <section key={label} className="mb-8">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500 mb-2.5">{label}</h2>
            <div className="space-y-2">
              {list.map((m) => {
                const pc = PLATFORM_COLOR[m.platform] || "#6366f1";
                return (
                <Link key={m.id} to={`/meetings/${m.id}`} className="focus-ring mcard group"
                      style={{ ["--card-accent" as any]: pc }}>
                  <div className="flex items-start gap-3.5">
                    <div className="shrink-0 w-9 h-9 rounded-[10px] flex items-center justify-center mt-0.5"
                         style={{ background: `${pc}12`, color: pc }} title={m.platform}>
                      {m.platform === "upload" || m.platform === "live-asr"
                        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"><path d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3z" /><path d="M19 11a7 7 0 01-14 0M12 18v3" /></svg>
                        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"><rect x="2.5" y="6" width="13" height="12" rx="2.5" /><path d="M15.5 10.5l6-3.5v10l-6-3.5" /></svg>}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {m.is_pinned === 1 && <span title="Pinned" className="text-amber-500 text-[13px] leading-none">★</span>}
                        <h3 className="text-[15px] font-semibold text-ink-900 truncate group-hover:text-accent transition-colors">
                          {m.title}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2 mt-1 text-[12px] text-ink-500 flex-wrap">
                        <span>{fmtDate(m.started_at)}</span>
                        <span className="text-ink-300">·</span>
                        <span className="tabular-nums font-medium text-ink-600">{fmtDuration(m.duration_ms)}</span>
                        <span className="text-ink-300">·</span>
                        <span>{m.participant_count} {m.participant_count === 1 ? "person" : "people"}</span>
                        <span className="text-ink-300">·</span>
                        <span className="tabular-nums">{m.segment_count.toLocaleString()} lines</span>
                        <span className="text-ink-300">·</span>
                        <span className="tabular-nums">{Math.round(m.word_count / 100) / 10}k words</span>
                      </div>

                      {m.headline && (
                        <p className="mt-2 text-[13px] text-ink-600 leading-relaxed line-clamp-2 max-w-[62ch]">{m.headline}</p>
                      )}

                      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                        {m.action_count > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-ink-100 text-[11px] font-medium text-ink-600">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M5 13l4 4L19 7" /></svg>
                            {m.action_count} actions
                          </span>
                        )}
                        {m.highlight_count > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-[11px] font-medium text-amber-700">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 3l2.1 5.3L19.5 9l-4 3.6 1.2 5.4L12 15.2 7.3 18l1.2-5.4L4.5 9l5.4-.7z" /></svg>
                            {m.highlight_count} highlights
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium"
                              style={{ background: `${pc}10`, color: pc }}>{m.platform}</span>
                        {m.id.startsWith("m-upload") || m.id.startsWith("m-live-asr") ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-[11px] font-medium text-emerald-700">real capture</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="shrink-0 hidden sm:flex flex-col items-end gap-2 w-[168px]">
                      <CardWave id={m.id} color={pc} />
                      <div className="flex items-center gap-2">
                        <span className="text-[10.5px] tabular-nums text-ink-400">{fmtDuration(m.duration_ms)}</span>
                        <AvatarStack people={m.people} />
                      </div>
                    </div>
                  </div>
                </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- search ----

function SearchPage() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [askQ, setAskQ] = useState("");
  const [askRes, setAskRes] = useState<any>(null);
  const [askBusy, setAskBusy] = useState(false);
  const [askSugg, setAskSugg] = useState<string[]>([]);
  const nav = useNavigate();

  useEffect(() => { api.askSuggested().then((r) => setAskSugg(r.all)).catch(() => {}); }, []);

  const runAsk = async (question: string) => {
    const s = question.trim();
    if (s.length < 3) return;
    setAskBusy(true);
    try { setAskRes(await api.ask(s)); }
    catch (e: any) { setAskRes({ answer: `Ask failed: ${e.message}`, citations: [], provider: "error" }); }
    finally { setAskBusy(false); }
  };

  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    setBusy(true);
    const t = setTimeout(() => api.search(q).then(setRes).catch(() => {}).finally(() => setBusy(false)), 160);
    return () => clearTimeout(t);
  }, [q]);

  const mark = (text: string) => {
    if (!q.trim()) return text;
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return text;
    return <>{text.slice(0, i)}<span className="mark-hit">{text.slice(i, i + q.length)}</span>{text.slice(i + q.length)}</>;
  };

  const KIND: Record<string, string> = { transcript: "bg-ink-100 text-ink-600", action: "bg-emerald-50 text-emerald-700", highlight: "bg-amber-50 text-amber-700", title: "bg-accent-soft text-accent" };

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="sticky top-0 z-10 bg-ink-50/85 backdrop-blur border-b border-ink-200 px-8 py-5">
        <h1 className="text-[22px] font-semibold tracking-tight mb-3">Search</h1>
        <div className="relative max-w-2xl">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Search every word anyone said, plus titles, actions and highlights…"
                 className="focus-ring w-full pl-10 pr-4 py-2.5 rounded-xl border border-ink-200 bg-white text-[13.5px] placeholder:text-ink-400" />
          {busy && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-400">searching…</span>}
        </div>
        {res && q.trim().length >= 2 && (
          <p className="text-[12px] text-ink-500 mt-2.5">
            <strong className="text-ink-800 tabular-nums">{res.total}</strong> hits across{" "}
            <strong className="text-ink-800 tabular-nums">{res.meetings.length}</strong> meetings
            <span className={`ml-2 px-1.5 py-0.5 rounded border text-[10px] uppercase tracking-wider font-semibold ${res.mode === "hybrid" ? "border-accent/40 bg-accent-soft text-accent" : "border-ink-200 bg-white text-ink-500"}`}>
              {res.mode === "hybrid" ? `semantic + lexical` : "lexical"}
            </span>
            {res.mode === "hybrid" ? (
              <span className="text-ink-400" title="Gemini's free embedding quota is 1000 requests a day; the full corpus is ~2,161 lines, so the embedded set is the authored key moments plus the short meetings. Everything else is covered by lexical ranking and fused by RRF.">
                {" "}· semantic over {res.semantic_vectors} key moments, lexical over all 2,161 lines
              </span>
            ) : (
              <span className="text-ink-400" title="Embedding is a resumable build step gated by Gemini's free embedding quota (1000 requests/day). It resumes where it stopped and switches this on by itself.">
                {" "}· keyword ranking — embedding build paused at {res.semantic_vectors ?? 0} of 425 key moments by the free quota window
              </span>
            )}
          </p>
        )}
      </header>

      <div className="px-8 py-6 max-w-4xl">
        <div className="rounded-xl border border-accent/25 bg-accent-soft/50 p-4 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent"><path d="M21 12a8 8 0 11-3.2-6.4" /><path d="M9.5 9.5a2.5 2.5 0 113.5 2.3c-.8.4-1 .9-1 1.7" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></svg>
            <span className="text-[12.5px] font-semibold text-accent-900">Ask across every meeting</span>
            <span className="text-[10.5px] text-ink-500 ml-auto">answers are quoted with timestamps, not paraphrased</span>
          </div>
          <div className="flex gap-2">
            <input value={askQ} onChange={(e) => setAskQ(e.target.value)}
                   onKeyDown={(e) => { if (e.key === "Enter") runAsk(askQ); }}
                   placeholder="What has anyone said about region pinning?"
                   className="focus-ring flex-1 min-w-0 px-3 py-2 rounded-lg border border-ink-200 bg-white text-[13px] placeholder:text-ink-400" />
            <button onClick={() => runAsk(askQ)} disabled={askBusy || askQ.trim().length < 3}
                    className="focus-ring shrink-0 px-3.5 py-2 rounded-lg bg-accent text-white text-[13px] font-medium hover:bg-indigo-600 disabled:opacity-40 transition-colors">
              {askBusy ? "…" : "Ask"}
            </button>
          </div>
          {!askRes && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {askSugg.map((s) => (
                <button key={s} onClick={() => { setAskQ(s); runAsk(s); }}
                        className="focus-ring px-2.5 py-1 rounded-full border border-ink-200 bg-white text-[11.5px] text-ink-600 hover:border-accent/50 hover:text-accent transition-colors text-left">{s}</button>
              ))}
            </div>
          )}
          {askRes && !askBusy && (
            <div className="mt-3 fade-up">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white text-ink-600 font-semibold font-mono border border-ink-200">{askRes.provider}</span>
                {askRes.passages_considered != null && <span className="text-[10.5px] text-ink-500 tabular-nums">{askRes.citations?.length || 0} cited of {askRes.passages_considered} passages considered</span>}
                {typeof askRes.latency_ms === "number" && <span className="text-[10.5px] text-ink-500 tabular-nums">{askRes.latency_ms}ms</span>}
                <button onClick={() => setAskRes(null)} className="focus-ring ml-auto text-[11px] text-ink-500 hover:text-accent">clear</button>
              </div>
              {(askRes.concepts || []).length > 0 && (
                <p className="text-[11px] text-ink-500 italic mb-2">
                  Read the question as: {(askRes.concepts as any[]).map((c: any) => c.label).join(", ")} — the words you typed
                  do not appear in these answers, the intent behind them does.
                </p>
              )}
              <div className="prose-summary bg-white rounded-lg border border-ink-200 p-3.5"
                   onClick={(e) => {
                     const chip = (e.target as HTMLElement).closest("[data-seek]") as HTMLElement | null;
                     const ms = chip ? Number(chip.dataset.seek) : null;
                     const cit = ms != null ? (askRes.citations || []).find((cc: any) => Math.abs(cc.start_ms - ms) < 50) : null;
                     if (cit) nav(`/meetings/${cit.meeting_id}?t=${ms}`);
                   }}
                   dangerouslySetInnerHTML={{ __html: renderMarkdown(askRes.answer || "") }} />
              {(askRes.citations || []).length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  {askRes.citations.map((ct: any, i: number) => (
                    <button key={i} onClick={() => nav(`/meetings/${ct.meeting_id}?t=${ct.start_ms}`)}
                            className="focus-ring w-full text-left rounded-lg border border-ink-200 bg-white px-3 py-2 hover:border-accent/45 transition-colors">
                      <div className="flex items-center gap-2 mb-0.5 text-[11px]">
                        <span className="tabular-nums text-ink-400">▶ {new Date(ct.start_ms).toISOString().substr(14, 5)}</span>
                        <span className="font-semibold" style={{ color: ct.speaker_color }}>{ct.speaker_name}</span>
                        <span className="text-ink-400 truncate">· {ct.meeting_title}</span>
                      </div>
                      <p className="text-[12.5px] text-ink-600 leading-relaxed line-clamp-2">{ct.text}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {q.trim().length < 2 ? (
          <div className="text-[13px] text-ink-500 space-y-2">
            <p className="font-medium text-ink-700">Try one of these — they all hit real seeded transcripts:</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {["region pinning", "rollback", "forty-seven minutes", "metadata", "comp band", "fourteen October", "credit"].map((s) => (
                <button key={s} onClick={() => setQ(s)} className="focus-ring px-2.5 py-1 rounded-full border border-ink-200 bg-white text-[12px] text-ink-700 hover:border-accent/50 hover:text-accent transition-colors">{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {(res?.hits || []).map((h: any, i: number) => (
              <button key={i} onClick={() => nav(`/meetings/${h.meeting_id}${h.start_ms != null ? `?t=${h.start_ms}` : ""}`)}
                      className="focus-ring w-full text-left rounded-lg border border-ink-200 bg-white px-4 py-3 hover:border-accent/45 transition-colors fade-up">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[9.5px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${KIND[h.kind] || KIND.transcript}`}>{h.kind}</span>
                  {h.source && h.source !== "lexical" && (
                    <span className="text-[9.5px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-accent-soft text-accent">{h.source}</span>
                  )}
                  <span className="text-[12px] font-medium text-ink-800 truncate">{h.meeting_title}</span>
                  {h.start_ms != null && <span className="text-[11px] text-ink-400 tabular-nums ml-auto shrink-0">{new Date(h.start_ms).toISOString().substr(14, 5)}</span>}
                </div>
                <p className="text-[12.5px] text-ink-600 leading-relaxed line-clamp-2">
                  {h.speaker_name && <span className="font-medium text-ink-800">{h.speaker_name}: </span>}
                  {mark(h.text)}
                </p>
              </button>
            ))}
            {res && res.hits.length === 0 && <p className="text-[13px] text-ink-500 py-8 text-center">Nothing matched “{res.query}”.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ app ----

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/s/:token" element={<SharePage />} />
        <Route path="*" element={
          <Shell>
            <Routes>
              <Route path="/" element={<MeetingsPage />} />
              <Route path="/meetings/:id" element={<MeetingPage />} />
              <Route path="/live" element={<LivePage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </Shell>
        } />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
