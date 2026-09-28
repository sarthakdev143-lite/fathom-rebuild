// Popup controller. Everything here talks to the service worker; the only direct
// tab contact is asking the content script to enter pick mode or save now.

const $ = (id) => document.getElementById(id);

const fmt = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function toTab(msg) {
  const tab = await activeTab();
  if (!tab?.id) return null;
  try { return await chrome.tabs.sendMessage(tab.id, msg); } catch { return null; }
}

async function render() {
  const res = await chrome.runtime.sendMessage({ type: "state" });
  if (!res?.ok) return;
  const { live, archive } = res;

  $("platform").textContent = live.platform || "not on a meeting page";
  const c = $("container");
  if (!live.platform) { c.textContent = "—"; c.className = "v"; }
  else if (live.containerFound) { c.textContent = live.usingCustomSelector ? "found (your pick)" : "found"; c.className = "v ok"; }
  else { c.textContent = "not yet — captions appear once someone speaks"; c.className = "v warn"; }

  const cap = $("capturing");
  cap.textContent = live.started ? "yes" : "no";
  cap.className = "v " + (live.started ? "ok" : "");
  $("counts").textContent = `${live.lines} / ${fmt(live.elapsed_ms)}`;
  $("interim").textContent = live.interim ? `${live.interimSpeaker || ""}: ${live.interim}…` : "";
  $("toggle").textContent = live.started ? "Stop capture" : "Resume capture";

  const q = $("queue");
  q.innerHTML = "";
  if (!archive?.length) {
    q.innerHTML = `<div class="empty">No sessions yet. Join a Meet, Zoom or Teams call with captions on and this fills itself in.</div>`;
  } else {
    for (const item of archive) {
      const div = document.createElement("div");
      div.className = "item";
      const when = new Date(item.savedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      const status = item.sent
        ? `<span class="ok">in your library</span>${item.meeting_id ? ` · <a href="${encodeURIComponent("#")}" data-open="${item.meeting_id}">open</a>` : ""}`
        : `<span class="warn">pending${item.lastError ? ` — ${item.lastError}` : ""}</span>`;
      div.innerHTML = `<div class="t">${item.payload.title}</div>
        <div class="m">${item.payload.segments.length} lines · ${when} · ${item.reason} · ${status}</div>`;
      q.appendChild(div);
    }
  }
  q.querySelectorAll("[data-open]").forEach((a) => {
    a.addEventListener("click", async (e) => {
      e.preventDefault();
      const { targetUrl } = await chrome.storage.local.get("targetUrl");
      const base = (targetUrl || "https://fathom-rebuild.sarthak-fathom.workers.dev").replace(/\/$/, "");
      chrome.tabs.create({ url: `${base}/meetings/${a.dataset.open}` });
    });
  });

  const { targetUrl } = await chrome.storage.local.get("targetUrl");
  const input = $("target");
  if (document.activeElement !== input) input.value = targetUrl || "https://fathom-rebuild.sarthak-fathom.workers.dev";
}

$("pick").addEventListener("click", async () => {
  const r = await toTab({ type: "pick" });
  if (!r) $("pick").textContent = "Open a Meet / Zoom / Teams tab first";
  window.close();
});

$("toggle").addEventListener("click", async () => {
  const started = $("capturing").textContent === "yes";
  await toTab({ type: started ? "stop" : "start" });
  render();
});

$("send").addEventListener("click", async () => {
  const dump = await toTab({ type: "dump" });
  if (dump?.session?.lines?.length) {
    await chrome.runtime.sendMessage({ type: "session-save", reason: "manual", session: dump.session });
  }
  await chrome.runtime.sendMessage({ type: "flush" });
  render();
});

$("save-target").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "set-target", value: $("target").value.trim() });
  render();
});

$("export").addEventListener("click", async () => {
  const { archive = [] } = await chrome.storage.local.get("archive");
  const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `signal-notes-capture-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
});

chrome.storage.onChanged.addListener(render);
setInterval(render, 1500);
render();
