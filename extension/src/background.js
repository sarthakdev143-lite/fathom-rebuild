// Signal Notes Capture - service worker.
//
// Owns the one thing a content script cannot: surviving the page. Sessions are
// archived to chrome.storage.local the moment they end, BEFORE any network call,
// so a meeting is never lost to a dead socket, a closed laptop or an offline
// train. Delivery to the web app is a queue with retries; the popup shows what is
// pending.

const DEFAULT_TARGET = "https://fathom-rebuild.sarthak-fathom.workers.dev";

const live = { platform: null, url: null, lines: 0, interim: null, interimSpeaker: null, elapsed_ms: 0, started: false, containerFound: false };

function badge() {
  const text = live.started && live.lines ? String(live.lines) : "";
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: text ? "#6366f1" : "#64748b" });
}

async function target() {
  const { targetUrl } = await chrome.storage.local.get("targetUrl");
  return (targetUrl || DEFAULT_TARGET).replace(/\/$/, "");
}

async function flushQueue() {
  const { archive = [] } = await chrome.storage.local.get("archive");
  const base = await target();
  let changed = false;
  for (const item of archive) {
    if (item.sent) continue;
    try {
      const res = await fetch(base + "/api/meetings/from-transcript", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(item.payload),
      });
      if (res.ok) {
        const d = await res.json();
        item.sent = true;
        item.meeting_id = d.id;
        item.sentAt = Date.now();
        changed = true;
      } else {
        item.lastError = `${res.status}`;
        changed = true;
      }
    } catch (e) {
      item.lastError = String(e && e.message ? e.message : e).slice(0, 120);
      changed = true;
    }
  }
  if (changed) await chrome.storage.local.set({ archive });
  return archive;
}

async function archiveSession(session, reason) {
  const last = session.lines[session.lines.length - 1];
  const payload = {
    title: `${(session.title || "Captured meeting").replace(/\s*[-–]\s*(Google Meet|Zoom|Microsoft Teams).*$/i, "").trim()} · ${session.platform}`,
    platform: session.platform === "meet" ? "meet" : session.platform === "zoom" ? "zoom" : session.platform === "teams" ? "teams" : "extension",
    segments: session.lines.map((l) => ({
      speaker: l.speaker || "Speaker",
      text: l.text,
      start_ms: l.start_ms || 0,
      end_ms: l.end_ms || (l.start_ms || 0) + 4000,
    })),
    duration_ms: last ? last.end_ms : 0,
    source: "extension",
    note: `Captured from live ${session.platform} captions by the Signal Notes browser extension. Speakers and ordering come from the platform's own captions; no audio was recorded and no speech-to-text key was used.`,
  };
  const { archive = [] } = await chrome.storage.local.get("archive");
  archive.unshift({ savedAt: Date.now(), reason, sent: false, payload });
  await chrome.storage.local.set({ archive: archive.slice(0, 50) });
  await flushQueue();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "session-update") {
    Object.assign(live, {
      platform: msg.platform, url: msg.url, lines: msg.lines, interim: msg.interim,
      interimSpeaker: msg.interimSpeaker, elapsed_ms: msg.elapsed_ms, started: msg.started,
      containerFound: msg.containerFound, usingCustomSelector: msg.usingCustomSelector,
    });
    badge();
    return false;
  }
  if (msg.type === "session-start") {
    live.started = true;
    live.platform = msg.platform;
    live.url = msg.url;
    badge();
    return false;
  }
  if (msg.type === "session-save") {
    archiveSession(msg.session, msg.reason).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "flush") {
    flushQueue().then((archive) => sendResponse({ ok: true, archive }));
    return true;
  }
  if (msg.type === "state") {
    chrome.storage.local.get("archive").then(({ archive = [] }) =>
      sendResponse({ ok: true, live, archive: archive.slice(0, 12) }));
    return true;
  }
  if (msg.type === "set-target") {
    chrome.storage.local.set({ targetUrl: msg.value }).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

// Retry pending sessions periodically and on coming back online.
setInterval(flushQueue, 60000);
chrome.runtime.onInstalled.addListener(() => flushQueue());
if (typeof self !== "undefined") {
  self.addEventListener?.("online", () => flushQueue());
}
