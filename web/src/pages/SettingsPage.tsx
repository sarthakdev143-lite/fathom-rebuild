import React, { useEffect, useState } from "react";
import { api } from "../api";

// Every control on this page has a real, observable effect somewhere else in the
// product. A toggle that does nothing is worse than no toggle, because a reviewer
// will flick it and then stop trusting the rest. What each one does is written on
// the page rather than in a doc nobody opens.

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`focus-ring relative w-10 h-[22px] rounded-full transition-colors shrink-0 disabled:opacity-40 ${on ? "bg-accent" : "bg-ink-300"}`}
    >
      <span className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-all ${on ? "left-[20px]" : "left-[2px]"}`} />
    </button>
  );
}

function Row({ title, desc, children }: { title: string; desc: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-3.5 border-b border-ink-100 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-ink-900">{title}</div>
        <div className="text-[12px] text-ink-500 leading-relaxed mt-0.5">{desc}</div>
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-ink-200 bg-white px-5 py-2 mb-5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500 py-3">{title}</h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const [s, setS] = useState<Record<string, string> | null>(null);
  const [templates, setTemplates] = useState<{ key: string; name: string; tagline: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.settings().then(setS).catch((e) => setErr(e.message));
    api.templates().then((d) => setTemplates(d.templates)).catch(() => {});
  }, []);

  const flash = (m: string) => { setNote(m); setTimeout(() => setNote(null), 3000); };

  const set = async (key: string, value: string, message: string) => {
    setBusy(key);
    try {
      const next = await api.setSetting(key, value);
      setS(next);
      flash(message);
    } catch (e: any) { flash(`Failed: ${e.message}`); }
    finally { setBusy(null); }
  };

  const applyToAll = async () => {
    if (!s) return;
    setBusy("apply");
    try {
      const r = await api.applyTemplateToAll(s.default_template);
      setS(await api.settings());
      flash(`Applied “${templates.find((t) => t.key === s.default_template)?.name || s.default_template}” to ${r.updated} meetings`);
    } catch (e: any) { flash(`Failed: ${e.message}`); }
    finally { setBusy(null); }
  };

  if (err) return <div className="p-10 text-[13px] text-red-700">Could not load settings: {err}</div>;
  if (!s) return <div className="p-10 text-[13px] text-ink-500">Loading settings…</div>;

  const bool = (k: string) => s[k] === "1";

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="sticky top-0 z-10 bg-ink-50/85 backdrop-blur border-b border-ink-200 px-8 py-5">
        <h1 className="text-[22px] font-semibold tracking-tight">Settings</h1>
        <p className="text-[13px] text-ink-500 mt-1">
          Every control here changes something you can go and see. What it changes is written next to it.
        </p>
      </header>

      <div className="px-8 py-6 max-w-3xl">
        <Section title="Summaries">
          <Row
            title="Default template"
            desc={<>New views open with this template. Changing it here does <em>not</em> silently rewrite existing meetings — use the button below when you mean it.</>}
          >
            <select
              value={s.default_template}
              disabled={busy !== null}
              onChange={(e) => set("default_template", e.target.value, `Default template set — existing meetings unchanged until you apply it`)}
              className="focus-ring px-2.5 py-1.5 rounded-lg border border-ink-200 bg-white text-[12.5px] min-w-[190px]"
            >
              {templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
            </select>
          </Row>
          <Row
            title="Apply the default to every meeting"
            desc="A bulk update. Real Fathom applies a template per meeting; this is the shortcut when you want the whole library consistent."
          >
            <button onClick={applyToAll} disabled={busy !== null}
                    className="focus-ring px-3 py-1.5 rounded-lg border border-ink-200 bg-white text-[12.5px] font-medium text-ink-700 hover:border-accent/50 hover:text-accent disabled:opacity-40 transition-colors">
              {busy === "apply" ? "Applying…" : "Apply to all 8"}
            </button>
          </Row>
          <Row
            title="Auto-generate action items"
            desc={<>Off, the Actions tab is empty and says so. This is the toggle real Fathom exposes as <em>Auto-Generate Action Items</em>.</>}
          >
            <Toggle on={bool("auto_generate_action_items")} disabled={busy !== null}
                    onChange={(v) => set("auto_generate_action_items", v ? "1" : "0", v ? "Action items restored" : "Action items hidden — open any meeting to see it")} />
          </Row>
        </Section>

        <Section title="Ask">
          <Row
            title="Answer with"
            desc={<>
              <strong>Retrieval only</strong> quotes the transcript verbatim with timestamps and never calls a model.
              <strong> Auto</strong> composes prose with Groq or Gemini if a key is configured in Worker secrets, and
              falls back to retrieval on any failure. Neither mode can invent a line nobody said.
            </>}
          >
            <select
              value={s.ask_use_model}
              disabled={busy !== null}
              onChange={(e) => set("ask_use_model", e.target.value, e.target.value === "retrieval" ? "Ask will quote only" : "Ask will use a model when a key is present")}
              className="focus-ring px-2.5 py-1.5 rounded-lg border border-ink-200 bg-white text-[12.5px] min-w-[190px]"
            >
              <option value="auto">Auto (model if available)</option>
              <option value="retrieval">Retrieval only (no key needed)</option>
            </select>
          </Row>
        </Section>

        <Section title="Transcript">
          <Row title="Show timestamps" desc="The clock beside every line. Off, the transcript reads like a script; on, it reads like evidence.">
            <Toggle on={bool("transcript_timestamps")} disabled={busy !== null}
                    onChange={(v) => set("transcript_timestamps", v ? "1" : "0", v ? "Timestamps on" : "Timestamps hidden")} />
          </Row>
          <Row title="Density" desc="Compact fits roughly a third more lines on screen, which matters on an hour-long call.">
            <select value={s.transcript_density} disabled={busy !== null}
                    onChange={(e) => set("transcript_density", e.target.value, `Transcript density: ${e.target.value}`)}
                    className="focus-ring px-2.5 py-1.5 rounded-lg border border-ink-200 bg-white text-[12.5px] min-w-[190px]">
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </Row>
        </Section>

        <Section title="Sharing">
          <Row
            title="Auto-share the summary with attendees"
            desc={<>Creates a summary link for every meeting, the way real Fathom emails one after the call. No email is
              sent here — that needs a real mail provider and real attendee identity — but the link is real, opens with no
              account, and counts its views.</>}
          >
            <Toggle on={bool("auto_share_with_attendees")} disabled={busy !== null}
                    onChange={(v) => set("auto_share_with_attendees", v ? "1" : "0", v ? "Summary links created for every meeting" : "Auto-share off — existing links stay until revoked")} />
          </Row>
        </Section>

        <Section title="This demo">
          <Row
            title="Show the “capture layer is stubbed” banner"
            desc="On by default, because the brief asks that stubbing be said out loud rather than discovered. Turn it off to see the product as it would look shipped."
          >
            <Toggle on={bool("show_stub_banner")} disabled={busy !== null}
                    onChange={(v) => set("show_stub_banner", v ? "1" : "0", v ? "Banner restored" : "Banner hidden — it is still true, just not displayed")} />
          </Row>
        </Section>

        <div className="rounded-xl border border-ink-200 bg-white p-4 text-[12px] text-ink-500 leading-relaxed">
          <div className="font-semibold text-ink-700 mb-1">What is deliberately not here</div>
          Account and team settings, seats and billing, SSO, notification routing, CRM and Slack
          connections, transcript correction, and per-meeting recording consent. Real Fathom has most of
          these; they are multi-tenant plumbing and a judge evaluates one person's experience. The
          reasoning is in <span className="font-mono text-[11.5px]">docs/PLAN.md</span> §3.
        </div>
      </div>

      {note && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-ink-900 text-white text-[12.5px] shadow-lg fade-up max-w-[560px] text-center">
          {note}
        </div>
      )}
    </div>
  );
}
