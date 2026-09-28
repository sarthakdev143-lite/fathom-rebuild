import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api, fmtClock, fmtDate, fmtDuration, initials, renderMarkdown } from "../api";

// The share page is deliberately NOT inside the app shell. The brief asks for
// "share a clip with someone who was not on the call" - so this route has no
// sidebar, no sign-in, no account context. The token in the URL is the only
// authentication, and viewing it is recorded so the owner can see it was opened.
export default function SharePage() {
  const { token = "" } = useParams();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ms, setMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const raf = useRef<number | null>(null);
  const counted = useRef(false);

  useEffect(() => {
    api.share(token).then(setData).catch((e) => setErr(e.message));
    // Record the view once, from the viewer's side.
    if (!counted.current) { counted.current = true; api.shareView(token).catch(() => {}); }
  }, [token]);

  const clip = data?.clip;
  const span = clip ? clip.end_ms - clip.start_ms : 0;
  const lines: string[] = clip?.transcript ? clip.transcript.split("\n").filter(Boolean) : [];
  const segments = data?.segments || [];

  // Playback here is a clock over the clip window: same engine abstraction as
  // the main player, scoped to the shared range only.
  useEffect(() => {
    if (!playing) { if (raf.current) cancelAnimationFrame(raf.current); return; }
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last; last = now;
      setMs((m) => {
        const next = m + dt;
        if (next >= span) { setPlaying(false); return span; }
        return next;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [playing, span]);

  const shell = (children: React.ReactNode) => (
    <div className="min-h-full bg-ink-50">
      <div className="max-w-3xl mx-auto px-5 py-8">{children}</div>
      <footer className="max-w-3xl mx-auto px-5 pb-10 text-[11.5px] text-ink-400 text-center leading-relaxed">
        Shared from <span className="font-medium text-ink-600">Signal Notes</span>, a rebuild of fathom.video built for the 8x
        take-home. The capture layer is stubbed: transcripts are authored and generated, audio is synthesized.
      </footer>
    </div>
  );

  if (err) return shell(<div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
    <h1 className="text-[16px] font-semibold text-red-800 mb-1">This link is not available</h1>
    <p className="text-[13px] text-red-700">{err}</p>
  </div>);

  if (!data) return shell(<div className="text-[13px] text-ink-500 py-16 text-center">Loading shared item…</div>);

  return shell(
    <>
      <div className="rounded-xl border border-accent/25 bg-accent-soft px-4 py-2.5 mb-5 text-[12px] text-accent-900 flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" /></svg>
        Shared with you. No account needed — this link is the only access.
        <span className="ml-auto text-[11px] text-accent-700 tabular-nums">{data.link.view_count} view{(data.link.view_count ?? 0) === 1 ? "" : "s"}</span>
      </div>

      <h1 className="text-[20px] font-semibold tracking-tight text-ink-900 leading-snug mb-1.5">{data.link.title}</h1>
      <div className="flex items-center gap-2.5 text-[12px] text-ink-500 flex-wrap mb-5">
        {data.meeting && <>
          <span className="text-ink-700 font-medium">{data.meeting.title}</span>
          <span className="text-ink-300">·</span><span>{fmtDate(data.meeting.started_at)}</span>
          <span className="text-ink-300">·</span><span className="tabular-nums">{fmtDuration(data.meeting.duration_ms)}</span>
        </>}
        {data.participants?.length > 0 && (
          <span className="flex items-center -space-x-1.5 ml-1">
            {data.participants.slice(0, 6).map((p: any) => (
              <span key={p.person_name} title={p.person_name} className="w-5 h-5 rounded-full ring-2 ring-ink-50 flex items-center justify-center text-[8.5px] font-semibold text-white" style={{ background: p.color }}>{initials(p.person_name)}</span>
            ))}
          </span>
        )}
      </div>

      {clip && (
        <div className="rounded-xl border border-ink-200 bg-white overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-ink-200 flex items-center gap-3">
            <button onClick={() => { setPlaying((p) => !p); }} aria-label={playing ? "Pause clip" : "Play clip"}
                    className="focus-ring w-9 h-9 rounded-full bg-ink-900 text-white flex items-center justify-center hover:bg-accent transition-colors shrink-0">
              {playing
                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>}
            </button>
            <div className="flex-1 h-1.5 rounded-full bg-ink-100 relative cursor-pointer"
                 onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMs(((e.clientX - r.left) / r.width) * span); }}>
              <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${span ? (ms / span) * 100 : 0}%` }} />
            </div>
            <span className="text-[11.5px] tabular-nums text-ink-500 shrink-0">{fmtClock(ms)} / {fmtClock(span)}</span>
          </div>
          <div className="px-4 py-3 max-h-[46vh] overflow-y-auto space-y-2 bg-ink-50">
            {lines.map((l, i) => {
              const m = l.match(/^\[(\d+)s\]\s([^:]+):\s(.*)$/);
              const at = m ? Number(m[1]) * 1000 : i * 4000;
              const active = ms >= at && ms < (lines[i + 1]?.match(/^\[(\d+)s\]/) ? Number(lines[i + 1]!.match(/^\[(\d+)s\]/)![1]) * 1000 : span);
              return (
                <div key={i} className={`flex gap-2.5 rounded-md px-2 py-1 transition-colors ${active ? "bg-accent-soft" : ""}`}>
                  <span className="shrink-0 text-[10.5px] tabular-nums text-ink-400 w-[34px] text-right pt-[3px]">{fmtClock(at)}</span>
                  <span className="shrink-0 text-[12px] font-semibold text-ink-800 w-[104px] truncate pt-[1px]">{m ? m[2] : ""}</span>
                  <p className="flex-1 text-[13px] leading-[1.6] text-ink-700">{m ? m[3] : l}</p>
                </div>
              );
            })}
            {lines.length === 0 && <p className="text-[12.5px] text-ink-500 py-4 text-center">No transcript in this clip.</p>}
          </div>
        </div>
      )}

      {data.summary && (
        <div className="rounded-xl border border-ink-200 bg-white p-5 mb-5">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-500 mb-2">AI summary</div>
          <h2 className="text-[15px] font-semibold text-ink-900 leading-snug mb-2">{data.summary.headline}</h2>
          <p className="text-[13px] text-ink-600 leading-relaxed mb-3">{data.summary.overview}</p>
          <div className="prose-summary">
            {data.summary.sections?.map((s: any) => (
              <div key={s.section_key}><h3>{s.title}</h3><div dangerouslySetInnerHTML={{ __html: renderMarkdown(s.body) }} /></div>
            ))}
          </div>
        </div>
      )}

      {data.link.scope === "transcript" && segments.length > 0 && (
        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-500 mb-3">Full transcript · {segments.length.toLocaleString()} lines</div>
          <div className="max-h-[52vh] overflow-y-auto space-y-1.5">
            {segments.map((s: any, i: number) => (
              <div key={i} className="flex gap-2.5">
                <span className="shrink-0 text-[10.5px] tabular-nums text-ink-400 w-[42px] text-right pt-[3px]">{fmtClock(s.start_ms)}</span>
                <span className="shrink-0 text-[12px] font-semibold w-[104px] truncate pt-[1px]" style={{ color: s.speaker_color }}>{s.speaker_name}</span>
                <p className="flex-1 text-[13px] leading-[1.6] text-ink-700">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <audio ref={audioRef} />
    </>
  );
}
