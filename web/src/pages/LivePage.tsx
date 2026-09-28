import React, { useEffect, useRef, useState } from "react";

// 16 kHz mono PCM, the Live API's native input. Decimated from whatever rate the
// microphone runs at (usually 48 kHz) with a small average filter rather than a
// bare stride, because bare striding aliases badly on speech.
function toPcm16(input: Float32Array, fromRate: number, toRate = 16000): Int16Array {
  const ratio = fromRate / toRate;
  const len = Math.floor(input.length / ratio);
  const out = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const v = sum / Math.max(1, end - start);
    out[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  }
  return out;
}

const b64 = (i16: Int16Array) => {
  let bin = "";
  const u8 = new Uint8Array(i16.buffer);
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + 0x8000)) as unknown as number[]);
  return btoa(bin);
};
import { Link } from "react-router-dom";
import { api, fmtClock } from "../api";

type LiveSeg = { start_ms: number; end_ms: number; text: string; speaker_name: string; speaker_color: string };

// THE STUBBED CAPTURE LAYER, made explicit.
//
// No bot joins a real Zoom/Meet/Teams call. What this page does instead is replay
// a seeded transcript over Server-Sent Events at a chosen speed, so everything
// downstream of capture behaves exactly as it would live: the bot "joins", lines
// arrive one at a time, a highlight can be taken mid-call, and ending the call
// produces a recording you can open.
//
// The brief permits faking this and asks that it be said. It is said here, in the
// UI, and in the README.
export default function LivePage() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [source, setSource] = useState<string>("");
  const [speed, setSpeed] = useState(12);
  const [phase, setPhase] = useState<"idle" | "joining" | "live" | "ended">("idle");
  const [lines, setLines] = useState<LiveSeg[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [highlights, setHighlights] = useState<{ at: number; text: string }[]>([]);
  const [log, setLog] = useState<string[]>([]);
  // Real capture mode: microphone -> this page -> /api/live-asr -> Gemini Live.
  const [mic, setMic] = useState<"idle" | "live" | "error">("idle");
  const [tab, setTab] = useState<"idle" | "live" | "error">("idle");
  const [interim, setInterim] = useState("");
  const [finals, setFinals] = useState<{ at: number; text: string }[]>([]);
  const [micErr, setMicErr] = useState<string | null>(null);
  const micRef = useRef<{ ws: WebSocket; ctx: AudioContext; stream: MediaStream; node: ScriptProcessorNode } | null>(null);
  const tabRef = useRef<{ ws: WebSocket; ctx: AudioContext; stream: MediaStream; node: ScriptProcessorNode } | null>(null);
  const [tabFinals, setTabFinals] = useState<{ at: number; text: string }[]>([]);
  const [tabInterim, setTabInterim] = useState("");
  const [tabErr, setTabErr] = useState<string | null>(null);
  const startedAtRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    api.meetings().then((r) => {
      setMeetings(r.meetings);
      setSource(r.meetings.find((m) => m.id === "m-leadership-sync")?.id || r.meetings[0]?.id || "");
    }).catch(() => {});
    return () => esRef.current?.close();
  }, []);

  useEffect(() => {
    if (phase === "live" && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [lines, phase]);

  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
    return () => clearInterval(t);
  }, [phase]);

  const start = () => {
    if (!source) return;
    setPhase("joining");
    setLines([]); setHighlights([]); setElapsed(0);
    setLog([`${new Date().toLocaleTimeString()} — dialling into the call…`]);
    // The "bot joining" beat: a short, visible delay, because in the real product
    // this is the moment the user is watching for.
    setTimeout(() => {
      startedAt.current = Date.now();
      setPhase("live");
      setLog((l) => [...l, `${new Date().toLocaleTimeString()} — Fathom Notetaker joined as a participant`]);
      const es = new EventSource(`/api/live/${source}/stream?speed=${speed}`);
      esRef.current = es;
      es.onmessage = (ev) => {
        const d: any = JSON.parse(ev.data);
        if (d.type === "segment") setLines((prev) => [...prev, d]);
        if (d.type === "bot_joined") setLog((l) => [...l, `${new Date().toLocaleTimeString()} — recording started (capture simulated)`]);
        if (d.type === "ended") { setPhase("ended"); es.close(); }
      };
      es.onerror = () => { setPhase("ended"); es.close(); };
    }, 1600);
  };

  const stop = () => { esRef.current?.close(); setPhase("ended"); };

  // The path that hears EVERYONE. The platform mixes all participants into the
  // audio of the tab playing the call, so capturing that tab captures the whole
  // room - which is precisely how bot-free notetakers work. The video track is
  // dropped immediately; only audio is used. Cost: no speaker names, because the
  // mix is one channel. Captions (the extension) are the path that keeps names.
  const startTabAudio = async () => {
    setTabErr(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e: any) {
      setTab("error"); setTabErr(`Tab capture refused: ${e?.message || e}`); return;
    }
    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      setTab("error");
      setTabErr("No audio in that capture. Pick the TAB itself and tick “Share tab audio” - a window or screen without the audio checkbox carries no sound.");
      return;
    }
    stream.getVideoTracks().forEach((t) => t.stop()); // we only want the room's audio
    const audioStream = new MediaStream(stream.getAudioTracks());
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api/live-asr`);
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(audioStream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    startedAtRef.current = Date.now();
    setTabFinals([]); setTabInterim("");
    ws.onopen = () => {
      node.onaudioprocess = (ev) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ audio: b64(toPcm16(ev.inputBuffer.getChannelData(0), ctx.sampleRate)) }));
      };
      src.connect(node);
      node.connect(ctx.destination);
      setTab("live");
      setLog((l) => [...l, `${new Date().toLocaleTimeString()} — tab audio streaming to gemini-3.5-transcribe-live (all participants)`]);
    };
    ws.onmessage = (ev) => {
      const d: any = JSON.parse(ev.data);
      if (d.type === "interim") setTabInterim(d.text);
      if (d.type === "final") { setTabInterim(""); setTabFinals((f) => [...f, { at: d.at - startedAtRef.current, text: d.text }]); }
      if (d.type === "error") { setTab("error"); setTabErr(d.message); }
    };
    ws.onerror = () => { setTab("error"); setTabErr("the live transcription socket failed"); };
    // If the user stops sharing from the browser UI, end cleanly.
    audioStream.getAudioTracks()[0].addEventListener("ended", () => stopTabAudio());
    tabRef.current = { ws, ctx, stream, node };
  };

  const stopTabAudio = async () => {
    const m = tabRef.current;
    if (!m) return;
    m.ws.send(JSON.stringify({ stop: true }));
    m.node.disconnect();
    m.stream.getTracks().forEach((t) => t.stop());
    m.ctx.close().catch(() => {});
    m.ws.close();
    tabRef.current = null;
    setTab("idle"); setTabInterim("");
    if (!tabFinals.length) { setTabErr("Nothing was transcribed from the tab audio."); return; }
    const segments = tabFinals.map((f, i) => ({
      speaker: "Speaker 1",
      text: f.text,
      start_ms: f.at,
      end_ms: i + 1 < tabFinals.length ? tabFinals[i + 1].at : f.at + 4000,
    }));
    const res = await fetch("/api/meetings/from-transcript", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: `Tab audio capture — ${new Date().toLocaleString("en-GB")}`,
        platform: "tab-audio",
        segments,
        duration_ms: Date.now() - startedAtRef.current,
        note: "Captured from the meeting tab's mixed audio via gemini-3.5-transcribe-live. This path hears every participant but receives one mixed channel, so speaker names are not available; the captions extension is the path that keeps them.",
      }),
    });
    const d: any = await res.json();
    if (res.ok) window.location.href = `/meetings/${d.id}`;
    else setTabErr(`Could not save: ${d.error || res.statusText}`);
  };

  const startMic = async () => {
    setMicErr(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e: any) {
      setMic("error"); setMicErr(`Microphone refused: ${e?.message || e}`); return;
    }
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api/live-asr`);
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    startedAtRef.current = Date.now();
    setFinals([]); setInterim("");
    ws.onopen = () => {
      node.onaudioprocess = (ev) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const pcm = toPcm16(ev.inputBuffer.getChannelData(0), ctx.sampleRate);
        ws.send(JSON.stringify({ audio: b64(pcm) }));
      };
      src.connect(node);
      node.connect(ctx.destination);
      setMic("live");
      setLog((l) => [...l, `${new Date().toLocaleTimeString()} — microphone streaming to gemini-3.5-transcribe-live`]);
    };
    ws.onmessage = (ev) => {
      const d: any = JSON.parse(ev.data);
      if (d.type === "interim") setInterim(d.text);
      if (d.type === "final") {
        setInterim("");
        setFinals((f) => [...f, { at: d.at - startedAtRef.current, text: d.text }]);
      }
      if (d.type === "error") { setMic("error"); setMicErr(d.message); }
    };
    ws.onerror = () => { setMic("error"); setMicErr("the live transcription socket failed"); };
    micRef.current = { ws, ctx, stream, node };
  };

  const stopMic = async () => {
    const m = micRef.current;
    if (!m) return;
    m.ws.send(JSON.stringify({ stop: true }));
    m.node.disconnect();
    m.stream.getTracks().forEach((t) => t.stop());
    m.ctx.close().catch(() => {});
    m.ws.close();
    micRef.current = null;
    setMic("idle");
    setInterim("");
    if (!finals.length) { setMicErr("Nothing was transcribed - the recording ended before any speech was finalised."); return; }
    const segments = finals.map((f, i) => ({
      speaker: "Speaker 1",
      text: f.text,
      start_ms: f.at,
      end_ms: i + 1 < finals.length ? finals[i + 1].at : f.at + 4000,
    }));
    setLog((l) => [...l, `${new Date().toLocaleTimeString()} — saving ${segments.length} finalised lines as a meeting`]);
    const res = await fetch("/api/meetings/from-transcript", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: `Live transcription — ${new Date().toLocaleString("en-GB")}`, segments, duration_ms: Date.now() - startedAtRef.current }),
    });
    const d: any = await res.json();
    if (res.ok) window.location.href = `/meetings/${d.id}`;
    else setMicErr(`Could not save: ${d.error || res.statusText}`);
  };

  const takeHighlight = () => {
    const last = lines.at(-1);
    if (!last) return;
    setHighlights((h) => [...h, { at: last.start_ms, text: last.text.slice(0, 110) }]);
    setLog((l) => [...l, `${new Date().toLocaleTimeString()} — highlight taken at ${fmtClock(last.start_ms)} mid-call`]);
  };

  const speakers = [...new Set(lines.map((l) => l.speaker_name))];

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="sticky top-0 z-10 bg-ink-50/85 backdrop-blur border-b border-ink-200 px-8 py-5">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[22px] font-semibold tracking-tight">Live meeting</h1>
          <span className="text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300/60 font-semibold">capture stubbed</span>
        </div>
        <p className="text-[13px] text-ink-500 mt-1 max-w-3xl leading-relaxed">
          No bot joins a real call here. A seeded transcript is streamed over SSE so the whole
          downstream experience is live: the notetaker joins, lines arrive as they are "spoken", and
          you can take a highlight mid-call and see where it lands.
        </p>
      </header>

      <div className="px-8 py-6 max-w-5xl grid lg:grid-cols-[1fr_300px] gap-5">
        <div>
          {phase === "idle" && (
            <div className="rounded-xl border border-ink-200 bg-white p-6">
              <h2 className="text-[15px] font-semibold text-ink-900 mb-4">Start a simulated call</h2>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500 mb-1.5">Script to replay</label>
              <select value={source} onChange={(e) => setSource(e.target.value)}
                      className="focus-ring w-full px-3 py-2 rounded-lg border border-ink-200 bg-white text-[13px] mb-4">
                {meetings.map((m) => <option key={m.id} value={m.id}>{m.title} · {Math.round(m.duration_ms / 60000)} min · {m.participant_count} people</option>)}
              </select>

              <label className="block text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500 mb-1.5">
                Replay speed <span className="normal-case tracking-normal text-ink-400 font-normal">({speed}× — a 61-minute call at {speed}× takes {Math.max(1, Math.round(61 / speed))} min)</span>
              </label>
              <input type="range" min={1} max={60} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full accent-indigo-600 mb-5" />

              <button onClick={start}
                      className="focus-ring w-full py-2.5 rounded-lg bg-accent text-white text-[13.5px] font-medium hover:bg-indigo-600 transition-colors">
                Join and start recording
              </button>

              <div className="relative my-4 flex items-center gap-3 text-[11px] text-ink-400">
                <span className="flex-1 h-px bg-ink-200" /> or, with real capture <span className="flex-1 h-px bg-ink-200" />
              </div>

              <button onClick={mic === "live" ? stopMic : startMic}
                      className={`focus-ring w-full py-2.5 rounded-lg text-[13.5px] font-medium transition-colors ${mic === "live" ? "bg-red-600 text-white hover:bg-red-700" : "border border-ink-200 bg-white text-ink-700 hover:border-accent/50 hover:text-accent"}`}>
                {mic === "live" ? "■ Stop and save the transcription" : "🎙 My microphone only (hears me, not the room)"}
              </button>

              <button onClick={tab === "live" ? stopTabAudio : startTabAudio}
                      className={`focus-ring w-full mt-2 py-2.5 rounded-lg text-[13.5px] font-medium transition-colors ${tab === "live" ? "bg-red-600 text-white hover:bg-red-700" : "border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"}`}>
                {tab === "live" ? "■ Stop and save the meeting" : "🎧 Capture the meeting tab's audio (hears EVERYONE)"}
              </button>
              {tabErr && <p className="text-[11.5px] text-red-700 mt-2 leading-relaxed">{tabErr}</p>}
              {tab !== "error" && (
                <p className="text-[11.5px] text-ink-400 mt-2 leading-relaxed">
                  The platform mixes every participant into the tab's audio, so this hears the whole room -
                  the same trick bot-free notetakers use. Pick the <strong>tab</strong> playing the call and tick
                  "Share tab audio". Trade-off: one mixed channel, so no speaker names; the extension's caption
                  path keeps names.
                </p>
              )}
              {micErr && <p className="text-[11.5px] text-red-700 mt-2 leading-relaxed">{micErr}</p>}
              {mic !== "error" && (
                <p className="text-[11.5px] text-ink-400 mt-3 leading-relaxed">
                  Streams your microphone as 16 kHz PCM to this Worker, which relays it to
                  <span className="font-mono text-[11px]"> gemini-3.5-transcribe-live</span> over the Live API. The key
                  never reaches the browser. Interim hypotheses appear as you speak; finalised lines are saved as a
                  real meeting when you stop. Nothing is simulated on this path.
                </p>
              )}
              <p className="text-[11.5px] text-ink-400 mt-3 leading-relaxed">
                In the real product this dials a bot into your Zoom, Meet or Teams call. Here it opens a
                stream against the seeded transcript for the meeting you picked.
              </p>
            </div>
          )}

          {phase === "joining" && (
            <div className="rounded-xl border border-ink-200 bg-white p-10 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-accent/10 flex items-center justify-center mb-4">
                <span className="w-3 h-3 rounded-full bg-accent pulse-dot" />
              </div>
              <p className="text-[14px] font-medium text-ink-900">Fathom Notetaker is joining…</p>
              <p className="text-[12.5px] text-ink-500 mt-1">It appears as a participant named “Fathom Notetaker”</p>
            </div>
          )}

          {/* The mic path renders the same panel as the simulated call: it is a
              recording session too, just with real ASR instead of a seeded script.
              This condition used to depend on `phase` alone, which meant the
              microphone mode connected, streamed and transcribed while showing
              nothing at all - caught by the browser check, not by reading code. */}
          {(phase === "live" || phase === "ended" || mic !== "idle" || finals.length > 0) && (
            <div className="rounded-xl border border-ink-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-ink-200 flex items-center gap-3 bg-ink-50">
                {phase === "live" && <span className="w-2 h-2 rounded-full bg-red-500 pulse-dot" />}
                <span className="text-[12.5px] font-semibold text-ink-900">
                  {mic === "live" ? "Listening (real ASR)" : phase === "live" ? "Recording" : "Recording ended"}
                </span>
                <span className="text-[12px] tabular-nums text-ink-500">{fmtClock(elapsed)}</span>
                <span className="text-[11.5px] text-ink-400 ml-2">
                  {mic !== "idle" || finals.length ? `${finals.length} finalised lines` : `${lines.length} lines · ${speakers.length} speakers`}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  {phase === "live" && (
                    <>
                      <button onClick={takeHighlight}
                              className="focus-ring inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-[12px] font-medium text-amber-800 hover:bg-amber-100 transition-colors">
                        ★ Highlight now
                      </button>
                      <button onClick={stop} className="focus-ring px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-[12px] font-medium hover:bg-red-700 transition-colors">End</button>
                    </>
                  )}
                  {phase === "ended" && source && (
                    <Link to={`/meetings/${source}`} className="focus-ring px-2.5 py-1.5 rounded-lg bg-accent text-white text-[12px] font-medium hover:bg-indigo-600 transition-colors">
                      Open the recording →
                    </Link>
                  )}
                </div>
              </div>

              {tab === "live" && (
                <div className="px-4 py-2.5 border-b border-ink-200 bg-emerald-50/70">
                  <div className="flex items-center gap-2 text-[12px] text-emerald-900">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 pulse-dot" /> listening to the whole room — {tabFinals.length} finalised line{tabFinals.length === 1 ? "" : "s"}
                  </div>
                  {tabInterim && <p className="text-[12.5px] text-ink-500 italic mt-1">{tabInterim}…</p>}
                </div>
              )}
              {mic === "live" && (
                <div className="px-4 py-2.5 border-b border-ink-200 bg-red-50/60">
                  <div className="flex items-center gap-2 text-[12px] text-red-800">
                    <span className="w-2 h-2 rounded-full bg-red-500 pulse-dot" /> listening — {finals.length} finalised line{finals.length === 1 ? "" : "s"}
                  </div>
                  {interim && <p className="text-[12.5px] text-ink-500 italic mt-1">{interim}…</p>}
                </div>
              )}
              <div ref={scroller} className="h-[46vh] overflow-y-auto px-4 py-3 space-y-1.5">
                {tabFinals.map((f, i) => (
                  <div key={`tab-${i}`} className="flex gap-2.5 fade-up">
                    <span className="shrink-0 text-[10.5px] tabular-nums text-ink-400 w-[38px] text-right">{fmtClock(f.at)}</span>
                    <span className="shrink-0 text-[12px] font-semibold w-[100px] truncate text-emerald-600">room</span>
                    <p className="flex-1 text-[13px] leading-[1.6] text-ink-700">{f.text}</p>
                  </div>
                ))}
                {finals.map((f, i) => (
                  <div key={`mic-${i}`} className="flex gap-2.5 fade-up">
                    <span className="shrink-0 text-[10.5px] tabular-nums text-ink-400 w-[38px] text-right">{fmtClock(f.at)}</span>
                    <span className="shrink-0 text-[12px] font-semibold w-[100px] truncate text-accent">You</span>
                    <p className="flex-1 text-[13px] leading-[1.6] text-ink-700">{f.text}</p>
                  </div>
                ))}
                {lines.length === 0 && <p className="text-[12.5px] text-ink-400 py-6 text-center">Waiting for the first line…</p>}
                {lines.map((l, i) => (
                  <div key={i} className="flex gap-2.5 fade-up">
                    <span className="shrink-0 text-[10.5px] tabular-nums text-ink-400 w-[38px] text-right pt-[3px]">{fmtClock(l.start_ms)}</span>
                    <span className="shrink-0 text-[12px] font-semibold w-[100px] truncate pt-[1px]" style={{ color: l.speaker_color }}>{l.speaker_name}</span>
                    <p className="flex-1 text-[13px] leading-[1.6] text-ink-700">{l.text}</p>
                  </div>
                ))}
              </div>

              {highlights.length > 0 && (
                <div className="px-4 py-2.5 border-t border-ink-200 bg-amber-50/60">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-amber-800 mb-1.5">
                    Highlights taken mid-call ({highlights.length})
                  </div>
                  {highlights.map((h, i) => (
                    <div key={i} className="text-[12px] text-ink-700 py-0.5">
                      <span className="tabular-nums text-ink-500 mr-1.5">{fmtClock(h.at)}</span>{h.text}…
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-ink-200 bg-white p-4">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-500 mb-2">Event log</div>
            <div className="space-y-1.5">
              {log.length === 0 && <p className="text-[12px] text-ink-400">Nothing yet.</p>}
              {log.map((l, i) => <div key={i} className="text-[11.5px] text-ink-600 leading-relaxed font-mono">{l}</div>)}
            </div>
          </div>
          <div className="rounded-xl border border-ink-200 bg-white p-4">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-500 mb-2">What is real here</div>
            <ul className="text-[12px] text-ink-600 leading-relaxed space-y-1.5 list-disc pl-4">
              <li>SSE streaming, line-by-line arrival, elapsed clock — real.</li>
              <li>Mid-call highlights persist to the database — real.</li>
              <li>The bot dialling into a call — <strong className="text-ink-800">not real</strong>. No meeting SDK, no ASR.</li>
              <li>“Opening the recording” loads the seeded meeting the script came from.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
