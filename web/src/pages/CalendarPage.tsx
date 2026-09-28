import React, { useEffect, useState } from "react";
import { api } from "../api";

// Calendar connect is stubbed OAuth. Real Google/Microsoft OAuth needs verified
// client ids, a consent screen and an approved redirect domain — none of which a
// 24-hour rebuild can obtain. The states, screens and side effects are the real
// ones: connect -> permissions -> calendars -> events -> notetaker scheduled.
export default function CalendarPage() {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [consent, setConsent] = useState<null | { provider: string }>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = () => api.calendar().then(setData).catch(() => {});
  useEffect(() => { load(); }, []);

  const flash = (m: string) => { setNote(m); setTimeout(() => setNote(null), 3200); };

  const connect = async (provider: string) => {
    setBusy(provider);
    await new Promise((r) => setTimeout(r, 900)); // the consent round-trip
    await api.connectCalendar(provider);
    setBusy(null); setConsent(null);
    await load();
    flash(`${provider === "google" ? "Google" : "Microsoft"} calendar connected (stubbed OAuth — no real account was touched)`);
  };

  const toggleNotetaker = async (eventId: string, current: string) => {
    const next = current === "off" ? "scheduled" : "off";
    await api.setNotetaker(eventId, next);
    await load();
    flash(next === "scheduled" ? "Notetaker will join this meeting automatically" : "Notetaker turned off for this meeting");
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const day = d.toDateString() === today.toDateString() ? "Today"
      : d.toDateString() === new Date(today.getTime() + 86400000).toDateString() ? "Tomorrow"
      : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    return { day, time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), end: iso };
  };

  const grouped: Record<string, any[]> = (data?.events || []).reduce((acc: Record<string, any[]>, ev: any) => {
    const k = fmt(ev.starts_at).day;
    (acc[k] ||= []).push(ev);
    return acc;
  }, {});

  const scheduledCount = (data?.events || []).filter((e: any) => e.notetaker_status === "scheduled").length;

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="sticky top-0 z-10 bg-ink-50/85 backdrop-blur border-b border-ink-200 px-8 py-5">
        <h1 className="text-[22px] font-semibold tracking-tight">Calendar</h1>
        <p className="text-[13px] text-ink-500 mt-1">
          Connect a calendar and the notetaker joins your meetings automatically. {scheduledCount} of {(data?.events || []).length} upcoming meetings have it scheduled.
        </p>
      </header>

      <div className="px-8 py-6 max-w-4xl space-y-6">
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500 mb-2.5">Connected accounts</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { key: "google", label: "Google Calendar", color: "#4285f4", desc: "Reads events and join links" },
              { key: "microsoft", label: "Microsoft 365", color: "#0f6cbd", desc: "Outlook calendar and Teams links" },
            ].map((p) => {
              const conn = (data?.connections || []).find((c: any) => c.provider === p.key && c.status === "connected");
              return (
                <div key={p.key} className="rounded-xl border border-ink-200 bg-white p-4 flex items-start gap-3">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white text-[13px] font-bold" style={{ background: p.color }}>
                    {p.key === "google" ? "G" : "M"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-ink-900">{p.label}</span>
                      {conn ? (
                        <span className="text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">connected</span>
                      ) : (
                        <span className="text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-ink-100 text-ink-500 font-semibold">not connected</span>
                      )}
                    </div>
                    <p className="text-[11.5px] text-ink-500 mt-0.5">{conn ? conn.email : p.desc}</p>
                    <div className="mt-2.5">
                      {conn ? (
                        <span className="text-[11.5px] text-ink-400">connected {new Date(conn.connected_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                      ) : (
                        <button onClick={() => setConsent({ provider: p.key })} disabled={busy === p.key}
                                className="focus-ring px-3 py-1.5 rounded-lg border border-ink-200 text-[12px] font-medium text-ink-700 hover:border-accent/50 hover:text-accent transition-colors disabled:opacity-50">
                          {busy === p.key ? "Connecting…" : "Connect"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11.5px] text-ink-400 mt-2.5 leading-relaxed">
            Stubbed OAuth: no real Google or Microsoft account is contacted, and no token is stored. The consent screen,
            scopes and resulting event list behave as they would in the real flow.
          </p>
        </section>

        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500 mb-2.5">Upcoming</h2>
          {Object.entries(grouped as Record<string, any[]>).map(([day, events]) => (
            <div key={day} className="mb-4">
              <div className="text-[12px] font-semibold text-ink-700 mb-1.5">{day}</div>
              <div className="space-y-1.5">
                {events.map((ev: any) => {
                  const attendees: string[] = (() => { try { return JSON.parse(ev.attendee_json || "[]"); } catch { return []; } })();
                  return (
                    <div key={ev.id} className="rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 flex items-center gap-3">
                      <div className="w-[52px] shrink-0 text-[11.5px] tabular-nums text-ink-500">{fmt(ev.starts_at).time}</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-ink-900 truncate">{ev.title}</div>
                        <div className="text-[11.5px] text-ink-500 truncate">
                          {attendees.length} attendees · {ev.platform}{ev.organizer ? ` · organised by ${ev.organizer}` : ""}
                        </div>
                      </div>
                      <button onClick={() => toggleNotetaker(ev.id, ev.notetaker_status)}
                              className={`focus-ring shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11.5px] font-medium transition-colors ${
                                ev.notetaker_status === "off"
                                  ? "border-ink-200 text-ink-500 hover:border-accent/50 hover:text-accent"
                                  : "border-accent/40 bg-accent-soft text-accent"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${ev.notetaker_status === "off" ? "bg-ink-300" : "bg-accent"}`} />
                        {ev.notetaker_status === "off" ? "Add notetaker" : "Notetaker scheduled"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {!data && <p className="text-[13px] text-ink-500 py-6">Loading calendar…</p>}
        </section>
      </div>

      {consent && (
        <div className="fixed inset-0 z-50 bg-ink-950/45 flex items-center justify-center p-6" onClick={() => setConsent(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-8 h-8 rounded-lg bg-ink-100 flex items-center justify-center text-[13px] font-bold"
                    style={{ color: consent.provider === "google" ? "#4285f4" : "#0f6cbd" }}>
                {consent.provider === "google" ? "G" : "M"}
              </span>
              <div>
                <h3 className="text-[14.5px] font-semibold text-ink-900">Choose an account</h3>
                <p className="text-[11.5px] text-ink-500">to continue to Signal Notes</p>
              </div>
            </div>
            <button onClick={() => connect(consent.provider)}
                    className="focus-ring w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-ink-200 hover:bg-ink-50 transition-colors text-left">
              <span className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center text-[10.5px] font-semibold">PR</span>
              <span className="min-w-0">
                <span className="block text-[13px] text-ink-900 truncate">Priya Raman</span>
                <span className="block text-[11.5px] text-ink-500 truncate">priya@northwindlabs.example</span>
              </span>
            </button>
            <div className="mt-4 pt-3 border-t border-ink-200">
              <div className="text-[11.5px] font-semibold text-ink-700 mb-1">Signal Notes wants access to:</div>
              <ul className="text-[11.5px] text-ink-600 space-y-1 list-disc pl-4">
                <li>See your calendar events and who is attending</li>
                <li>Read meeting join links so the notetaker can dial in</li>
              </ul>
              <p className="text-[11px] text-ink-400 mt-2 leading-relaxed">
                Simulated consent screen. No real OAuth request is made and nothing is sent to {consent.provider === "google" ? "Google" : "Microsoft"}.
              </p>
            </div>
          </div>
        </div>
      )}

      {note && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-ink-900 text-white text-[12.5px] shadow-lg fade-up max-w-[520px] text-center">
          {note}
        </div>
      )}
    </div>
  );
}
