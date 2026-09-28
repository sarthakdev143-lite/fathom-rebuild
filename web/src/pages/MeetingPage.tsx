import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api, fmtClock, fmtDate, fmtDuration, initials, renderMarkdown, requestLog, type MeetingDetail, type Segment } from "../api";

/** True below the lg breakpoint. Drives the single-pane mobile layout. */
function useIsNarrow() {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 1023px)").matches : false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const fn = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", fn);
    setNarrow(mq.matches);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return narrow;
}

/** Amplitude peaks for the waveform, fetched per meeting (~2 KB). */
function usePeaks(meetingId: string | null) {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  useEffect(() => {
    if (!meetingId) { setPeaks(null); return; }
    let alive = true;
    fetch(`/media/peaks/${meetingId}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => alive && setPeaks(Array.isArray(p) ? p : null))
      .catch(() => alive && setPeaks(null));
    return () => { alive = false; };
  }, [meetingId]);
  return peaks;
}

function Waveform({ peaks, durationMs, currentMs, chapters, highlights, onSeek }: {
  peaks: number[]; durationMs: number; currentMs: number;
  chapters: { id: string; start_ms: number }[];
  highlights: { id: string; start_ms: number; end_ms: number; label?: string | null }[];
  onSeek: (ms: number) => void;
}) {
  const played = durationMs ? Math.min(1, currentMs / durationMs) : 0;
  const bars = (cls: string) => (
    <svg className={cls} viewBox={`0 0 ${peaks.length} 100`} preserveAspectRatio="none" aria-hidden>
      {peaks.map((p, i) => (
        <rect key={i} x={i + 0.18} y={50 - Math.max(1.5, p * 0.46)} width={0.64} height={Math.max(3, p * 0.92)} rx={0.32} />
      ))}
    </svg>
  );
  return (
    <div className="wave" data-testid="waveform" role="slider" aria-label="Recording timeline"
         aria-valuemin={0} aria-valuemax={Math.round(durationMs / 1000)} aria-valuenow={Math.round(currentMs / 1000)}
         tabIndex={0}
         onKeyDown={(e) => {
           if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); onSeek(currentMs + 10000); }
           if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); onSeek(currentMs - 10000); }
         }}
         onClick={(e) => {
           const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
           onSeek(((e.clientX - r.left) / r.width) * durationMs);
         }}>
      {bars("bars-off")}
      <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${(1 - played) * 100}% 0 0)` }}>{bars("bars-on")}</div>
      {chapters.map((ch) => (
        <span key={ch.id} className="chap" title="chapter" style={{ left: `${durationMs ? (ch.start_ms / durationMs) * 100 : 0}%` }} />
      ))}
      {highlights.map((h) => (
        <span key={h.id} className="hl" title={h.label || "highlight"}
              style={{ left: `${durationMs ? (h.start_ms / durationMs) * 100 : 0}%`,
                       width: `${Math.max(0.4, ((h.end_ms - h.start_ms) / (durationMs || 1)) * 100)}%` }} />
      ))}
      <span className="head" style={{ left: `calc(${played * 100}% - 1px)` }} />
    </div>
  );
}

// Playback has two engines and the UI is identical for both:
//   1. real <audio> against a synthesized per-meeting mp3 (Piper TTS, see README)
//   2. a clock-driven simulation used when no audio asset exists yet
// The transcript, highlighting and seeking all drive off `currentMs`, so nothing
// downstream knows or cares which engine is running. That is what let the player
// ship before the audio pipeline did.
type Engine = "audio" | "sim";

function useHighlightMark(query: string) {
  return useCallback((text: string) => {
    if (!query.trim()) return text;
    const i = text.toLowerCase().indexOf(query.toLowerCase());
    if (i < 0) return text;
    return (
      <>
        {text.slice(0, i)}
        <span className="mark-hit">{text.slice(i, i + query.length)}</span>
        {text.slice(i + query.length)}
      </>
    );
  }, [query]);
}

export default function MeetingPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState<MeetingDetail | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"summary" | "actions" | "highlights" | "ask" | "people">("summary");
  const [askQ, setAskQ] = useState("");
  const [askThread, setAskThread] = useState<{ q: string; res: any }[]>([]);
  const [askBusy, setAskBusy] = useState(false);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [showPerf, setShowPerf] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [showTs, setShowTs] = useState(true);
  const [compact, setCompact] = useState(false);
  const narrow = useIsNarrow();
  const [pane, setPane] = useState<"transcript" | "rail">("transcript");
  const peaks = usePeaks(id);
  const [inQuery, setInQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  // playback
  const [currentMs, setCurrentMs] = useState(Number(params.get("t") || 0));
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [engine, setEngine] = useState<Engine>("sim");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const simRef = useRef<number | null>(null);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  useEffect(() => { api.askSuggested().then((r) => setSuggested(r.meeting)).catch(() => {}); }, []);

  const runAsk = async (question: string) => {
    const q = question.trim();
    if (q.length < 3) return;
    setAskBusy(true);
    setAskQ("");
    // Send the conversation so a follow-up like "and who owns it?" resolves. The
    // server stays stateless: the thread lives in the client and travels with
    // each request, so there is nothing to expire or leak between viewers.
    const history = askThread.flatMap((t) => [
      { role: "user", content: t.q },
      { role: "assistant", content: t.res?.answer || "" },
    ]);
    try {
      const res = await api.ask(q, id, history);
      setAskThread((prev) => [...prev, { q, res }]);
    } catch (e: any) {
      setAskThread((prev) => [...prev, { q, res: { answer: `Ask failed: ${e.message}`, citations: [], provider: "error" } }]);
    } finally { setAskBusy(false); }
  };

  // Copy the whole summary as Markdown - the thing people actually want to paste
  // into Slack or an email after a call.
  const summaryMarkdown = () => {
    if (!data?.summary) return "";
    const s = data.summary;
    const acts = data.action_items
      .map((a) => `- [ ] ${a.text}${a.owner_name ? ` — **${a.owner_name}**` : ""}${a.due_text ? ` _(due ${a.due_text})_` : ""}`)
      .join("\n");
    return [
      `# ${m.title}`,
      "",
      `${fmtDate(m.started_at)} · ${fmtDuration(m.duration_ms)} · ${m.participant_count} participants`,
      "",
      `## ${s.headline}`,
      "",
      s.overview,
      "",
      ...s.sections.map((sec) => `### ${sec.title}\n\n${sec.body}\n`),
      acts ? `### Action items\n\n${acts}\n` : "",
      `---\n_Generated by ${s.generated_by}. Quoted lines are verbatim from the transcript._`,
    ].filter(Boolean).join("\n");
  };

  const copySummary = async () => {
    try { await navigator.clipboard.writeText(summaryMarkdown()); flash("Summary copied as Markdown"); }
    catch { flash("Clipboard blocked by the browser — select and copy instead"); }
  };

  useEffect(() => {
    let alive = true;
    setData(null); setSegments([]); setErr(null);
    Promise.all([api.meeting(id), api.transcript(id, 0, 2000)])
      .then(([d, t]) => {
        if (!alive) return;
        setData(d); setSegments(t.segments);
        const st: any = (d as any).settings || {};
        setShowTs(st.transcript_timestamps !== "0");
        setCompact(st.transcript_density === "compact");
      })
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [id]);

  const durationMs = data?.meeting.duration_ms || (segments.at(-1)?.end_ms ?? 0);

  // ---- engine setup: prefer real audio, fall back to the sim clock ---------
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !data?.meeting.audio_key) { setEngine("sim"); return; }
    a.src = data.meeting.audio_key;
    a.playbackRate = rate;
    let cancelled = false;
    const ok = () => { if (!cancelled) setEngine("audio"); };
    const bad = () => { if (!cancelled) { setEngine("sim"); a.removeAttribute("src"); } };
    a.addEventListener("canplay", ok, { once: true });
    a.addEventListener("error", bad, { once: true });
    // If neither fires quickly there is no asset at that path.
    const t = setTimeout(() => { if (a.readyState === 0) bad(); }, 1800);
    return () => { cancelled = true; clearTimeout(t); a.removeEventListener("canplay", ok); a.removeEventListener("error", bad); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.meeting.audio_key]);

  // ---- the simulation clock ---------------------------------------------
  useEffect(() => {
    if (engine === "audio") return;
    if (!playing) { if (simRef.current) cancelAnimationFrame(simRef.current); return; }
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) * rate;
      last = now;
      setCurrentMs((m) => {
        const next = m + dt;
        if (next >= durationMs) { setPlaying(false); return durationMs; }
        return next;
      });
      simRef.current = requestAnimationFrame(tick);
    };
    simRef.current = requestAnimationFrame(tick);
    return () => { if (simRef.current) cancelAnimationFrame(simRef.current); };
  }, [playing, rate, engine, durationMs]);

  const seek = useCallback((ms: number) => {
    const clamped = Math.max(0, Math.min(ms, durationMs || ms));
    setCurrentMs(clamped);
    if (audioRef.current && engine === "audio") audioRef.current.currentTime = clamped / 1000;
  }, [durationMs, engine]);

  const togglePlay = () => {
    if (engine === "audio" && audioRef.current) {
      if (playing) { audioRef.current.pause(); setPlaying(false); }
      else { audioRef.current.play().then(() => setPlaying(true)).catch(() => { setEngine("sim"); setPlaying(true); }); }
    } else setPlaying((p) => !p);
  };

  useEffect(() => {
    if (audioRef.current && engine === "audio") audioRef.current.playbackRate = rate;
  }, [rate, engine]);

  // Keep the engine's clock authoritative when audio is driving.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || engine !== "audio") return;
    const onTime = () => setCurrentMs(a.currentTime * 1000);
    const onEnd = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    return () => { a.removeEventListener("timeupdate", onTime); a.removeEventListener("ended", onEnd); };
  }, [engine]);

  // ---- virtualised transcript -------------------------------------------
  const activeIdx = useMemo(() => {
    let lo = 0, hi = segments.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (segments[mid].start_ms <= currentMs) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return best;
  }, [segments, currentMs]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (compact ? 48 : 68),
    overscan: 14,
  });

  const scrolledTo = useRef(false);
  useEffect(() => {
    if (activeIdx < 0 || !playing) return;
    if (!scrolledTo.current) { scrolledTo.current = true; }
    virtualizer.scrollToIndex(activeIdx, { align: "center", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, playing]);

  useEffect(() => {
    const t = Number(params.get("t"));
    if (t > 0) { seek(t); scrolledTo.current = false; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const mark = useHighlightMark(inQuery);

  // Keyboard: the transcript is the surface people live in, so it should be
  // drivable without the mouse. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      const step = (e.shiftKey ? 30000 : 10000);
      switch (e.key) {
        case " ": e.preventDefault(); togglePlay(); break;
        case "ArrowRight": e.preventDefault(); seek(currentMs + step); break;
        case "ArrowLeft": e.preventDefault(); seek(currentMs - step); break;
        case "j": case "J": {
          e.preventDefault();
          const next = segments.findIndex((s) => s.start_ms > currentMs + 50);
          if (next >= 0) seek(segments[next].start_ms);
          break;
        }
        case "k": case "K": {
          e.preventDefault();
          const prev = [...segments].reverse().find((s) => s.start_ms < currentMs - 500);
          if (prev) seek(prev.start_ms);
          break;
        }
        case "h": case "H": e.preventDefault(); addHighlight(currentMs); break;
        case "?": e.preventDefault(); setShowKeys((v) => !v); break;
        case "Escape":
          // Overlays must dismiss from the keyboard; a modal that only closes on
          // a backdrop click is a trap for anyone not using a mouse. The browser
          // check fell over this, which is the browser check doing its job.
          setShowKeys(false); setShareUrl(null); setEditId(null);
          break;
        case "p": case "P": e.preventDefault(); setShowPerf((v) => !v); break;
        default: break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMs, segments, playing, engine, durationMs]);

  // ---- actions -----------------------------------------------------------
  const [templateBusy, setTemplateBusy] = useState(false);
  const switchTemplate = async (key: string) => {
    if (!data) return;
    setTemplateBusy(true);
    try {
      const r = await api.setTemplate(id, key);
      setData({ ...data, meeting: { ...data.meeting, active_template: key }, summary: r.summary as any, action_items: r.action_items });
      flash(`Switched to “${data.templates.find((t) => t.key === key)?.name || key}” — ${r.summary?.sections?.length ?? 0} sections, ${(r.action_items || []).length} actions`);
    } catch (e: any) { flash(`Template switch failed: ${e.message}`); }
    finally { setTemplateBusy(false); }
  };

  const toggleAction = async (actionId: string, done: boolean) => {
    if (!data) return;
    await api.toggleAction(actionId, done).catch(() => {});
    setData({ ...data, action_items: data.action_items.map((a) => (a.id === actionId ? { ...a, done: done ? 1 : 0 } : a)) });
  };

  const saveCorrection = async (segId: number) => {
    const text = editText.trim();
    setEditId(null);
    if (!text || !data) return;
    const orig = segments.find((s) => s.id === segId);
    if (!orig || orig.text === text) return;
    try {
      await api.correctSegment(segId, text);
      setSegments((prev) => prev.map((s) => (s.id === segId ? { ...s, text, edited: 1 } : s)));
      flash("Line corrected - marked as edited in the transcript");
    } catch (e: any) { flash(`Correction failed: ${e.message}`); }
  };

  const renameSpeaker = async (speakerId: string, current: string) => {
    const name = window.prompt(`Rename "${current}" everywhere in this meeting:`, current);
    if (!name || name.trim() === current || !data) return;
    try {
      await api.renameSpeaker(id, speakerId, name.trim());
      const d = await api.meeting(id);
      setData(d);
      flash(`Renamed ${current} to ${name.trim()} across transcript, people and talk time`);
    } catch (e: any) { flash(`Rename failed: ${e.message}`); }
  };

  const addHighlight = async (start: number, label?: string) => {
    if (!data) return;
    const end = Math.min(start + 30000, durationMs);
    const r = await api.addHighlight(id, { start_ms: start, end_ms: end, label: label || `Highlight at ${fmtClock(start)}`, source: "playback" });
    setData({ ...data, highlights: [...data.highlights, r.highlight] });
    setTab("highlights");
    flash(`Highlight created at ${fmtClock(start)} — it landed in the highlights list`);
  };

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const share = async (clipId?: string, scope?: string, title?: string) => {
    const r = await api.createShare(id, { clip_id: clipId, scope, title });
    const url = `${location.origin}/s/${r.token}`;
    setShareUrl(url);
    try { await navigator.clipboard.writeText(url); flash("Share link copied — it opens for somebody who was not on the call"); }
    catch { flash("Share link created (clipboard blocked by the browser)"); }
    setData((d) => d ? { ...d, shares: [{ token: r.token, scope: scope || "clip", title: title || "Shared clip", view_count: 0, created_at: new Date().toISOString() }, ...d.shares] } : d);
  };

  if (err) return <div className="p-10 text-[13px] text-red-700">Could not load this meeting: {err}</div>;
  if (!data) return <div className="p-10 text-[13px] text-ink-500">Loading meeting…</div>;

  const m = data.meeting;
  const pct = durationMs ? (currentMs / durationMs) * 100 : 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <audio ref={audioRef} preload="metadata" />

      {/* ---- header ---- */}
      <header className="shrink-0 border-b border-ink-200 bg-white px-4 sm:px-6 py-3.5">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <Link to="/" className="focus-ring mt-1 text-ink-400 hover:text-ink-700 transition-colors shrink-0" title="Back to meetings">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"><path d="M15 19l-7-7 7-7" /></svg>
          </Link>
          <div className="min-w-0 flex-1 basis-48">
            <h1 className="text-[17px] font-semibold tracking-tight text-ink-900">{m.title}</h1>
            <div className="flex items-center gap-2.5 mt-1 text-[12px] text-ink-500 flex-wrap">
              <span>{fmtDate(m.started_at)}</span><span className="text-ink-300">·</span>
              <span className="tabular-nums">{fmtDuration(m.duration_ms)}</span><span className="text-ink-300">·</span>
              <span>{m.participant_count} {m.participant_count === 1 ? "person" : "people"}</span><span className="text-ink-300">·</span>
              <span className="tabular-nums">{m.segment_count.toLocaleString()} lines</span><span className="text-ink-300">·</span>
              <span className="capitalize">{m.platform}</span>
              {engine === "sim" && (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-300/60 bg-amber-50 text-amber-700"
                      title="No audio asset for this meeting yet; playback is driven by a clock. Transcript sync is identical either way.">
                  simulated playback
                </span>
              )}
            </div>
          </div>
          {/* Full-width row on a phone: squeezing these beside the title left
              the title two characters wide and the meta stacked one item per line. */}
          {activeIdx >= 0 && segments[activeIdx] && playing && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium shrink-0"
                  style={{ background: `${segments[activeIdx].speaker_color}14`, color: segments[activeIdx].speaker_color }}>
              <span className="speaking-dot w-1.5 h-1.5 rounded-full" style={{ background: segments[activeIdx].speaker_color }} />
              {segments[activeIdx].speaker_name} is speaking
            </span>
          )}
          <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end w-full sm:w-auto sm:ml-auto">
            <button onClick={() => addHighlight(currentMs)}
                    className="focus-ring inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ink-200 bg-white text-[12.5px] font-medium text-ink-700 hover:border-amber-400 hover:text-amber-700 transition-colors">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 3l2.1 5.3L19.5 9l-4 3.6 1.2 5.4L12 15.2 7.3 18l1.2-5.4L4.5 9l5.4-.7z" /></svg>
              Highlight this moment
            </button>
            <button onClick={() => share(undefined, "summary", m.title)}
                    className="focus-ring inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-[12.5px] font-medium hover:bg-indigo-600 transition-colors">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M12 15V3m0 0L8.5 6.5M12 3l3.5 3.5" /></svg>
              Share
            </button>
          </div>
        </div>
      </header>

      {/* ---- player ---- */}
      <div className="shrink-0 border-b border-ink-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3.5">
          <button onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}
                  className="focus-ring w-10 h-10 rounded-full bg-ink-900 text-white flex items-center justify-center hover:bg-accent transition-colors shrink-0">
            {playing
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>}
          </button>
          <span data-testid="player-clock" className="text-[12px] tabular-nums text-ink-600 w-[52px] shrink-0">{fmtClock(currentMs, durationMs > 3600000)}</span>

          {peaks ? (
            <Waveform peaks={peaks} durationMs={durationMs} currentMs={currentMs}
                      chapters={data.chapters} highlights={data.highlights} onSeek={seek} />
          ) : (
            <div className="flex-1 h-9 flex items-center group cursor-pointer select-none"
                 onClick={(e) => {
                   const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                   seek(((e.clientX - r.left) / r.width) * durationMs);
                 }}>
              <div className="relative w-full h-1.5 rounded-full bg-ink-100">
                <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
          <span className="text-[12px] tabular-nums text-ink-500 w-[52px] text-right shrink-0">{fmtClock(durationMs, durationMs > 3600000)}</span>
          <button onClick={() => setRate((r) => (r === 1 ? 1.5 : r === 1.5 ? 2 : r === 2 ? 0.75 : 1))}
                  className="focus-ring shrink-0 text-[11.5px] font-semibold tabular-nums px-2 py-1 rounded-md border border-ink-200 text-ink-600 hover:border-accent/50 hover:text-accent transition-colors">
            {rate}×
          </button>
          <span className="shrink-0 hidden lg:inline text-[10.5px] text-ink-400 tabular-nums" title="Keyboard shortcuts">
            space ⏯ · ←→ 10s · j/k line · h highlight · <button onClick={() => setShowKeys(true)} className="focus-ring underline decoration-ink-300 hover:decoration-accent">?</button> · <button onClick={() => setShowPerf((v) => !v)} className="focus-ring underline decoration-ink-300 hover:decoration-accent">perf</button>
          </span>
          {playing && engine === "sim" && (
            <span className="shrink-0 flex items-end gap-[2px] h-3.5" aria-hidden>
              {[0, 1, 2, 3].map((i) => <span key={i} className="wave-bar w-[2px] bg-accent rounded-full h-full" style={{ animationDelay: `${i * 0.13}s` }} />)}
            </span>
          )}
        </div>
      </div>

      {narrow && (
        <div className="shrink-0 flex border-b border-ink-200 bg-white">
          {(["transcript", "rail"] as const).map((p) => (
            <button key={p} onClick={() => setPane(p)}
                    className={`focus-ring flex-1 py-2 text-[12.5px] font-medium border-b-2 -mb-px transition-colors ${pane === p ? "border-accent text-accent" : "border-transparent text-ink-500"}`}>
              {p === "transcript" ? `Transcript (${segments.length})` : "Summary & actions"}
            </button>
          ))}
        </div>
      )}

      {/* ---- three panes (two on narrow: transcript XOR rail) ---- */}
      <div className="flex-1 min-h-0 flex">
        {/* chapters */}
        <aside className="w-[212px] shrink-0 border-r border-ink-200 bg-white overflow-y-auto py-3 hidden xl:block">
          <div className="px-4 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-500">Chapters</div>
          {data.chapters.map((c) => {
            const active = currentMs >= c.start_ms && currentMs < c.end_ms;
            return (
              <button key={c.id} onClick={() => seek(c.start_ms)}
                      className={`focus-ring w-full text-left px-4 py-1.5 text-[12px] leading-snug transition-colors border-l-2 ${active ? "border-accent bg-accent-soft/60 text-accent font-medium" : "border-transparent text-ink-600 hover:bg-ink-50"}`}>
                <span className="tabular-nums text-[10.5px] text-ink-400 mr-1.5">{fmtClock(c.start_ms)}</span>
                {c.title}
              </button>
            );
          })}
        </aside>

        {/* transcript */}
        <section className={`flex-1 min-w-0 flex-col bg-ink-50 ${narrow && pane !== "transcript" ? "hidden" : "flex"} ${narrow ? "" : "flex"}`}>
          <div className="shrink-0 px-5 py-2.5 border-b border-ink-200 bg-white/70 flex items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500">Transcript</span>
            <div className="relative ml-auto w-full sm:w-56 max-w-[220px]">
              <input value={inQuery} onChange={(e) => setInQuery(e.target.value)} placeholder="Find in meeting…"
                     className="focus-ring w-full pl-7 pr-2 py-1 rounded-md border border-ink-200 bg-white text-[12px] placeholder:text-ink-400" />
              <svg className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-400" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            </div>
          </div>

          <div ref={parentRef} className="flex-1 overflow-y-auto px-5 py-3">
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((vi) => {
                const s = segments[vi.index];
                if (!s) return null;
                const active = vi.index === activeIdx;
                const hit = inQuery.trim() && s.text.toLowerCase().includes(inQuery.toLowerCase());
                return (
                  <div key={s.id} data-index={vi.index} ref={virtualizer.measureElement}
                       style={{ position: "absolute", top: 0, left: 0, width: "100%",
                                transform: `translateY(${vi.start}px)`, ["--row-color" as any]: s.speaker_color }}
                       data-testid={`seg-${vi.index}`}
                       onClick={() => { if (!showTs) seek(s.start_ms); }}
                       className={`seg-row group rounded-lg px-3 transition-colors ${compact ? "py-1" : "py-2"} ${active ? "active-row" : hit ? "bg-amber-50" : "hover:bg-white"} ${showTs ? "" : "cursor-pointer"}`}>
                    <div className="flex items-baseline gap-2.5">
                      {showTs && (
                        <button onClick={() => seek(s.start_ms)}
                                className="focus-ring shrink-0 text-[10.5px] tabular-nums text-ink-400 hover:text-accent transition-colors w-[38px] text-right">
                          {fmtClock(s.start_ms, durationMs > 3600000)}
                        </button>
                      )}
                      <span className="shrink-0 flex items-center gap-1.5 w-[118px] min-w-0" title={s.speaker_name}>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.speaker_color }} />
                        <span className="truncate text-[12px] font-semibold" style={{ color: s.speaker_color }}>{s.speaker_name}</span>
                      </span>
                      {editId === s.id ? (
                        <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)}
                               onBlur={() => saveCorrection(s.id)}
                               onKeyDown={(e) => { if (e.key === "Enter") saveCorrection(s.id); if (e.key === "Escape") setEditId(null); }}
                               className="focus-ring flex-1 px-2 py-1 rounded-md border border-accent/50 bg-white text-[13px]" />
                      ) : (
                      <>
                      <p className={`flex-1 leading-[1.6] ${compact ? "text-[12.5px]" : "text-[13px]"} ${active ? "text-ink-900" : "text-ink-700"}`}>
                        {mark(s.text)}
                        {s.is_crosstalk === 1 && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-ink-400" title="overlapping speech">[overlap]</span>}
                        {s.confidence !== undefined && s.confidence < 0.8 && (
                          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-amber-600" title={`ASR confidence ${(s.confidence * 100).toFixed(0)}%`}>[low conf]</span>
                        )}
                      </p>
                      {s.edited === 1 && (
                        <span className="shrink-0 text-[9.5px] uppercase tracking-wide text-emerald-600" title="a human corrected this line">edited</span>
                      )}
                      <button onClick={() => { setEditId(s.id); setEditText(s.text); }}
                              aria-label="Correct this transcript line"
                              className="seg-actions focus-ring shrink-0 text-[10.5px] text-ink-400 hover:text-accent transition-colors"
                              title="Correct this line">✎</button>
                      <button onClick={() => addHighlight(s.start_ms)}
                              aria-label="Highlight from this moment"
                              className="seg-actions focus-ring shrink-0 text-[10.5px] text-ink-400 hover:text-amber-600 transition-colors"
                              title="Highlight from here">★</button>
                      </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* right rail */}
        <aside data-testid="rail" className={`shrink-0 border-l border-ink-200 bg-white flex-col min-h-0 ${narrow ? (pane === "rail" ? "flex w-full border-l-0" : "hidden") : "flex w-[390px]"}`}>
          <div className="shrink-0 flex border-b border-ink-200">
            {([["summary", "Summary"], ["actions", `Actions${data.action_items.length ? ` (${data.action_items.length})` : ""}`], ["highlights", `Highlights${data.highlights.length ? ` (${data.highlights.length})` : ""}`], ["ask", "Ask"], ["people", "People"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k as any)}
                      className={`focus-ring flex-1 px-2 py-2.5 text-[12px] font-medium border-b-2 -mb-px transition-colors ${tab === k ? "border-accent text-accent" : "border-transparent text-ink-500 hover:text-ink-800"}`}>
                {label}
              </button>
            ))}
          </div>

          <div className={`flex-1 min-h-0 ${tab === "ask" ? "flex flex-col overflow-hidden" : "overflow-y-auto"}`}>
            {tab === "summary" && (
              <div className="p-4">
                <div className="mb-3">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-500 mb-1.5">Template</div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.templates.map((t) => (
                      <button key={t.key} onClick={() => switchTemplate(t.key)} disabled={templateBusy}
                              title={t.tagline}
                              className={`focus-ring px-2.5 py-1 rounded-full text-[11.5px] border transition-colors disabled:opacity-50 ${m.active_template === t.key ? "bg-accent border-accent text-white font-medium" : "bg-white border-ink-200 text-ink-600 hover:border-accent/50 hover:text-accent"}`}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                  <button onClick={copySummary}
                          className="focus-ring mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-ink-200 bg-white text-[11.5px] font-medium text-ink-600 hover:border-accent/50 hover:text-accent transition-colors">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></svg>
                    Copy summary as Markdown
                  </button>
                  {data.summary && (
                    <div className="mt-2 text-[10.5px] text-ink-400">
                      generated by <span className="font-mono">{data.summary.generated_by}</span>
                      {typeof data.summary.latency_ms === "number" && <> · {data.summary.latency_ms}ms</>}
                      {data.summary.generated_by === "local-deterministic" && <> · no API key needed</>}
                    </div>
                  )}
                </div>

                {data.summary ? (
                  <>
                    <h2 className="text-[14px] font-semibold leading-snug text-ink-900 mb-2">{data.summary.headline}</h2>
                    <p className="text-[12.5px] leading-relaxed text-ink-600 mb-4">{data.summary.overview}</p>
                    <div className="prose-summary">
                      {data.summary.sections.map((s) => (
                        <div key={s.section_key}>
                          <h3>{s.title}</h3>
                          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(s.body) }} />
                        </div>
                      ))}
                    </div>
                  </>
                ) : <p className="text-[12.5px] text-ink-500">No summary for this template yet.</p>}
              </div>
            )}

            {tab === "actions" && (
              <div className="p-4 space-y-2">
                {(data as any).action_items_suppressed ? (
                  <div className="rounded-lg border border-ink-200 bg-ink-50 px-3.5 py-3 text-[12.5px] text-ink-600 leading-relaxed">
                    Action item extraction is <strong>off</strong> in Settings. Turn it back on and they reappear —
                    nothing was deleted, the rows are still in the database.
                  </div>
                ) : data.action_items.length === 0 ? (
                  <p className="text-[12.5px] text-ink-500">No action items for this template.</p>
                ) : null}
                {data.action_items.map((a) => (
                  <div key={a.id} className={`rounded-lg border p-3 transition-colors ${a.done ? "border-ink-200 bg-ink-50 opacity-65" : "border-ink-200 bg-white hover:border-accent/40"}`}>
                    <div className="flex gap-2.5">
                      <button onClick={() => toggleAction(a.id, !a.done)} aria-label="toggle done"
                              className={`focus-ring mt-0.5 w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${a.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-ink-300 hover:border-accent"}`}>
                        {a.done === 1 && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"><path d="M5 13l4 4L19 7" /></svg>}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={`text-[12.5px] leading-relaxed ${a.done ? "line-through text-ink-500" : "text-ink-800"}`}>{a.text}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {a.owner_name && <span className="text-[11px] font-medium text-ink-700 bg-ink-100 px-1.5 py-0.5 rounded">{a.owner_name}</span>}
                          {a.due_text && <span className="text-[11px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">due {a.due_text}</span>}
                          <button onClick={() => seek(a.start_ms)} className="focus-ring text-[11px] text-ink-400 hover:text-accent tabular-nums transition-colors">
                            ▶ {fmtClock(a.start_ms)}
                          </button>
                          {!a.owner_name && <span className="text-[10.5px] text-ink-400 italic">unassigned</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "highlights" && (
              <div className="p-4 space-y-2.5">
                {data.highlights.length === 0 && <p className="text-[12.5px] text-ink-500">No highlights yet. Use “Highlight this moment” while playing.</p>}
                {data.highlights.map((h) => (
                  <div key={h.id} className="rounded-lg border border-ink-200 bg-white p-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-medium text-ink-900 leading-snug">{h.label || "Highlight"}</p>
                        {h.note && <p className="text-[12px] text-ink-600 mt-1 leading-relaxed">{h.note}</p>}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <button onClick={() => seek(h.start_ms)} className="focus-ring text-[11px] tabular-nums text-ink-500 hover:text-accent transition-colors">
                            ▶ {fmtClock(h.start_ms)} – {fmtClock(h.end_ms)}
                          </button>
                          <span className="text-[10px] uppercase tracking-wide text-ink-400">{h.source}</span>
                          <button onClick={() => share(data.clips.find((c) => Math.abs(c.start_ms - h.start_ms) < 2000)?.id, "clip", h.label || undefined)}
                                  className="focus-ring ml-auto text-[11px] text-accent hover:underline">share clip</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {data.clips.length > 0 && (
                  <div className="pt-2">
                    <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-500 mb-1.5">Clips</div>
                    {data.clips.map((c) => (
                      <div key={c.id} className="rounded-lg border border-ink-200 bg-ink-50 p-2.5 mb-1.5">
                        <p className="text-[12px] font-medium text-ink-800 leading-snug">{c.title}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <button onClick={() => seek(c.start_ms)} className="focus-ring text-[11px] tabular-nums text-ink-500 hover:text-accent">▶ {fmtClock(c.end_ms - c.start_ms)}</button>
                          <button onClick={() => share(c.id, "clip", c.title)} className="focus-ring ml-auto text-[11px] text-accent hover:underline">copy share link</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {(data as any).attendee_share && (
                  <div className="pt-2">
                    <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-500 mb-1.5">Auto-shared with attendees</div>
                    <a href={`/s/${(data as any).attendee_share.token}`}
                       className="block rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 mb-1 hover:border-emerald-400 transition-colors">
                      <span className="text-[11.5px] text-emerald-900 truncate block">Summary — {m.title}</span>
                      <span className="text-[10.5px] text-emerald-700">{(data as any).attendee_share.view_count} views · no email is sent, the link is real · off in Settings</span>
                    </a>
                  </div>
                )}

                {data.shares.length > 0 && (
                  <div className="pt-2">
                    <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-500 mb-1.5">Shared links</div>
                    {data.shares.map((s) => (
                      <a key={s.token} href={`/s/${s.token}`} className="block rounded-md border border-ink-200 bg-white px-2.5 py-1.5 mb-1 hover:border-accent/40 transition-colors">
                        <span className="text-[11.5px] text-ink-700 truncate block">{s.title}</span>
                        <span className="text-[10.5px] text-ink-400">{s.scope} · {s.view_count} views</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "ask" && (
              <div className="flex flex-col h-full min-h-0">
                <div className="flex-1 overflow-y-auto p-4">
                  {askThread.length === 0 && (
                    <>
                      <p className="text-[12.5px] text-ink-600 leading-relaxed mb-3">
                        Ask anything about this meeting. Answers quote the transcript verbatim with a
                        timestamp, and every source seeks the recording — so they can be checked rather
                        than trusted. Follow-ups work: ask "and who owns it?" next.
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {suggested.map((q) => (
                          <button key={q} onClick={() => runAsk(q)}
                                  className="focus-ring px-2.5 py-1 rounded-full border border-ink-200 bg-white text-[11.5px] text-ink-600 hover:border-accent/50 hover:text-accent transition-colors text-left">
                            {q}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-ink-400 leading-relaxed mt-4">
                        With no model key configured this is retrieval-based: it matches words and
                        recognised intents, not meaning. Settings → Ask switches the mode.
                      </p>
                    </>
                  )}

                  {askThread.map((turn, i) => (
                    <div key={i} className="mb-4 fade-up">
                      <div className="flex justify-end mb-2">
                        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent text-white px-3 py-2 text-[12.5px] leading-relaxed">
                          {turn.q}
                        </div>
                      </div>
                      <div className="rounded-2xl rounded-bl-sm border border-ink-200 bg-white px-3.5 py-3">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-ink-100 text-ink-600 font-semibold font-mono">
                            {turn.res?.provider}
                          </span>
                          {turn.res?.passages_considered != null && (
                            <span className="text-[10px] text-ink-400 tabular-nums">
                              {turn.res.citations?.length || 0} of {turn.res.passages_considered} passages
                            </span>
                          )}
                          {typeof turn.res?.latency_ms === "number" && (
                            <span className="text-[10px] text-ink-400 tabular-nums">{turn.res.latency_ms}ms</span>
                          )}
                        </div>
                        {(turn.res?.concepts || []).length > 0 && (
                          <p className="text-[10.5px] text-ink-500 italic mb-2">
                            Read as: {(turn.res.concepts as any[]).map((c: any) => c.label).join(", ")}
                          </p>
                        )}
                        <div className="prose-summary"
                             onClick={(e) => {
                               // Model answers cite passages as [n](<ms>ms), rendered as
                               // seek chips; clicking one jumps the recording.
                               const chip = (e.target as HTMLElement).closest("[data-seek]") as HTMLElement | null;
                               if (chip) { seek(Number(chip.dataset.seek)); setPane("transcript"); }
                             }}
                             dangerouslySetInnerHTML={{ __html: renderMarkdown(turn.res?.answer || "") }} />
                        {(turn.res?.citations || []).length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-ink-100 space-y-1.5">
                            {turn.res.citations.map((ct: any, j: number) => (
                              <button key={j} onClick={() => { seek(ct.start_ms); setPane("transcript"); }}
                                      className="focus-ring w-full text-left rounded-lg border border-ink-200 bg-ink-50 px-2.5 py-1.5 hover:border-accent/45 transition-colors">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-[10px] tabular-nums text-ink-400">▶ {fmtClock(ct.start_ms)}</span>
                                  <span className="text-[11px] font-semibold truncate" style={{ color: ct.speaker_color }}>{ct.speaker_name}</span>
                                </div>
                                <p className="text-[11.5px] text-ink-600 leading-relaxed line-clamp-2">{ct.text}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {askBusy && (
                    <div className="rounded-2xl rounded-bl-sm border border-ink-200 bg-white px-3.5 py-3 text-[12px] text-ink-500">
                      Searching the transcript…
                    </div>
                  )}
                </div>

                <div className="shrink-0 border-t border-ink-200 p-3 bg-white">
                  <div className="flex gap-2">
                    <input
                      value={askQ}
                      onChange={(e) => setAskQ(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runAsk(askQ); } }}
                      placeholder={askThread.length ? "Ask a follow-up…" : "Ask anything about this meeting…"}
                      className="focus-ring flex-1 min-w-0 px-3 py-2 rounded-lg border border-ink-200 bg-white text-[12.5px] placeholder:text-ink-400"
                    />
                    <button onClick={() => runAsk(askQ)} disabled={askBusy || askQ.trim().length < 3}
                            className="focus-ring shrink-0 px-3 py-2 rounded-lg bg-accent text-white text-[12.5px] font-medium hover:bg-indigo-600 disabled:opacity-40 transition-colors">
                      {askBusy ? "…" : "Ask"}
                    </button>
                  </div>
                  {askThread.length > 0 && (
                    <button onClick={() => setAskThread([])} className="focus-ring mt-2 text-[11px] text-ink-400 hover:text-accent transition-colors">
                      ← start a new question
                    </button>
                  )}
                </div>
              </div>
            )}

            {tab === "people" && (
              <div className="p-4 space-y-1.5">
                {data.participants.map((p) => {
                  const sp = data.speakers.find((s) => s.name === p.person_name);
                  const share = sp && m.duration_ms ? Math.round((sp.talk_ms / m.duration_ms) * 100) : 0;
                  return (
                    <div key={p.person_name} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-ink-50 transition-colors">
                      <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0" style={{ background: p.color }}>
                        {initials(p.person_name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12.5px] font-medium text-ink-900 truncate">{p.person_name}</span>
                          {p.is_external === 1 && <span className="text-[9px] uppercase tracking-wide px-1 py-px rounded bg-ink-100 text-ink-500 shrink-0">external</span>}
                        </div>
                        <div className="text-[11px] text-ink-500 truncate">{p.role || ""}{p.company ? ` · ${p.company}` : ""}</div>
                      </div>
                      <button onClick={() => renameSpeaker(sp?.id || "", p.person_name)}
                              className="focus-ring shrink-0 text-[10.5px] text-ink-400 hover:text-accent transition-colors px-1"
                              title="Rename this speaker everywhere in the meeting">rename</button>
                      <div className="shrink-0 text-right">
                        <div className="text-[11.5px] tabular-nums text-ink-700">{sp ? fmtClock(sp.talk_ms) : "—"}</div>
                        <div className="w-14 h-1 rounded-full bg-ink-100 mt-1 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, share * 2)}%`, background: p.color }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>


      {showPerf && data && (
        <div className="shrink-0 border-b border-ink-200 bg-ink-950 text-ink-200 px-6 py-2.5 font-mono text-[11px] leading-relaxed fade-up">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] uppercase tracking-[0.08em] text-ink-400 font-sans font-semibold">performance — the one-hour case</span>
            <button onClick={() => setShowPerf(false)} className="focus-ring ml-auto text-ink-400 hover:text-white font-sans text-[11px]">hide (p)</button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-1">
            <span>segments in meeting <b className="text-white tabular-nums">{segments.length.toLocaleString()}</b></span>
            <span>rows in DOM <b className="text-white tabular-nums">{virtualizer.getVirtualItems().length}</b> (virtualised)</span>
            <span>playback engine <b className="text-white">{engine}</b></span>
            <span>audio <b className="text-white tabular-nums">{(durationMs / 60000).toFixed(1)}min</b> / {(data.meeting.audio_duration_ms / 60000).toFixed(1)}min file</span>
            {requestLog().slice(-6).map((r, i) => (
              <span key={i}>
                {r.path.replace("/api/", "")} <b className="text-white tabular-nums">{r.ms}ms</b>
                {r.serverMs != null && <span className="text-ink-400"> (edge {r.serverMs}ms)</span>}
              </span>
            ))}
            <span>summary by <b className="text-white">{data.summary?.generated_by}</b>{typeof data.summary?.latency_ms === "number" && <span className="text-ink-400"> {data.summary.latency_ms}ms</span>}</span>
          </div>
          <div className="text-ink-400 mt-1 font-sans text-[10.5px]">
            edge times come from the Worker's Server-Timing header; client times include TLS and transfer of a 14 MB-range-capable asset manifest.
          </div>
        </div>
      )}

      {showKeys && (
        <div className="fixed inset-0 z-50 bg-ink-950/50 flex items-center justify-center p-6" onClick={() => setShowKeys(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl fade-up" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold text-ink-900 mb-3">Keyboard</h3>
            {[["space", "play / pause"], ["← / →", "seek 10s"], ["shift + ← / →", "seek 30s"], ["j / k", "next / previous line"], ["h", "highlight this moment"], ["p", "performance panel"], ["?", "this overlay"]].map(([k, v]) => (
              <div key={k} className="flex items-center gap-3 py-1">
                <kbd className="px-1.5 py-0.5 rounded border border-ink-200 bg-ink-50 text-[11px] font-mono text-ink-700 min-w-[86px] text-center">{k}</kbd>
                <span className="text-[12.5px] text-ink-600">{v}</span>
              </div>
            ))}
            <p className="text-[11px] text-ink-400 mt-3 leading-relaxed">Ignored while typing in a field. The transcript is the surface people live in, so it should not need a mouse.</p>
          </div>
        </div>
      )}

      {shareUrl && (
        <div className="fixed inset-0 z-50 bg-ink-950/45 flex items-center justify-center p-6" onClick={() => setShareUrl(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-lg shadow-xl fade-up" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold text-ink-900 mb-1">Share link created</h3>
            <p className="text-[12.5px] text-ink-600 leading-relaxed mb-3">
              This opens for somebody who was never on the call and has no account — the token is the only auth.
            </p>
            <div className="flex gap-2">
              <input readOnly value={shareUrl} onFocus={(e) => e.target.select()}
                     className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-ink-200 bg-ink-50 text-[12px] font-mono text-ink-700" />
              <button onClick={() => { navigator.clipboard?.writeText(shareUrl); flash("Copied"); }}
                      className="focus-ring shrink-0 px-3 py-2 rounded-lg bg-accent text-white text-[12.5px] font-medium hover:bg-indigo-600">Copy</button>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShareUrl(null)} className="focus-ring px-3 py-1.5 rounded-lg text-[12.5px] text-ink-600 hover:bg-ink-100">Close</button>
              <a href={shareUrl} target="_blank" rel="noreferrer" className="focus-ring px-3 py-1.5 rounded-lg border border-ink-200 text-[12.5px] text-ink-700 hover:border-accent/50">Open in new tab</a>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-ink-900 text-white text-[12.5px] shadow-lg fade-up max-w-[520px] text-center">
          {toast}
        </div>
      )}
    </div>
  );
}
