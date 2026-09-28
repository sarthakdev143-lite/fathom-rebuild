// Signal Notes Capture - content script.
//
// WHAT THIS IS
// ------------
// The capture path a 24-hour rebuild can actually own. Zoom, Meet and Teams all
// render live captions in the page, and those captions already contain what a
// meeting notetaker needs: every participant, what they said, and the order they
// said it in. The platform did the speech-to-text and the diarisation; this
// script reads the result out of the DOM. No bot joins. No audio is recorded.
// No API key exists anywhere in this extension.
//
// WHY NOT MICROPHONE
// ------------------
// A microphone hears one side of a call and hears it badly. Captions hear
// everyone. That difference is the whole product.
//
// WHY SELECTORS ARE A LIST, NOT A CONSTANT
// ----------------------------------------
// Meeting platforms ship new class names without notice. Each platform carries
// an ordered list of candidate selectors plus structural heuristics, and if all
// of them miss, the popup offers "pick the captions element" which stores a
// per-site selector. Degrading to a human pointing at the right box beats
// silently capturing nothing.

(() => {
  const HOST = location.hostname;

  const PLATFORMS = [
    {
      id: "meet",
      test: /(^|\.)meet\.google\.com$/,
      containers: ['div[aria-label="Captions"]', ".aGTcEb", ".E4xV5d", '[data-requested-language]', 'div[aria-label="Transcript"]'],
      lineSelectors: [".E4xV5d", ".aGTcEb > div", '[data-requested-language] > div'],
      speakerHints: [".KcIKxf", '[class*="speaker"]', '[class*="name"]'],
    },
    {
      id: "zoom",
      test: /(^|\.)zoom\.(us|com)$/,
      containers: [".caption-container", ".zm-caption", '[class*="caption-container"]', '[class*="subtitle"]'],
      lineSelectors: [".zm-caption__text", '[class*="caption__text"]', '[class*="caption"] > div'],
      speakerHints: ['[class*="caption__speaker"]', '[class*="speaker"]', '[class*="name"]'],
    },
    {
      id: "teams",
      test: /(^|\.)teams\.(microsoft|live)\.com$/,
      containers: ['[data-ui-id="caption-container"]', ".ts-captions-container", 'div[role="marquee"]', '[class*="caption-container"]'],
      lineSelectors: ['[data-ui-id="caption-container"] > div', ".ts-captions-container > div", 'div[role="marquee"] > div'],
      speakerHints: ['[class*="speaker"]', '[class*="name"]', "[data-ui-id*='speaker']"],
    },
  ];

  const platform = PLATFORMS.find((p) => p.test.test(HOST)) || {
    id: "generic",
    containers: ['[aria-live="polite"][role="log"]', '[class*="caption"]', '[class*="subtitle"]', '[class*="transcript"]'],
    lineSelectors: [],
    speakerHints: ['[class*="speaker"]', '[class*="name"]'],
  };

  // ---- session state -------------------------------------------------------
  const session = {
    platform: platform.id,
    url: location.href,
    title: document.title,
    startedAt: null,
    lines: [],        // finalised { speaker, text, start_ms, end_ms }
    interim: null,    // { speaker, text, start_ms }
    containerFound: false,
    usingCustomSelector: false,
  };

  let container = null;
  let observer = null;
  let lastLineTexts = [];
  let lastActivity = 0;
  let stopped = false;
  let goneTimer = null;

  const now = () => (session.startedAt ? Date.now() - session.startedAt : 0);

  const port = {
    send(msg) {
      try { chrome.runtime.sendMessage(msg).catch(() => {}); } catch { /* SW asleep */ }
    },
  };

  // ---- line extraction -----------------------------------------------------
  function speakerOf(lineEl) {
    for (const sel of platform.speakerHints || []) {
      const el = lineEl.querySelector(sel);
      if (el && el.innerText && el.innerText.trim().length <= 48) return el.innerText.trim();
    }
    const m = lineEl.innerText.match(/^\s*([A-Z][A-Za-z .'\-]{1,40}?)\s*:\s*(\S[\s\S]*)$/);
    if (m) return m[1].trim();
    return null;
  }

  function textOf(lineEl, speaker) {
    let text = lineEl.innerText || "";
    if (speaker && text.startsWith(speaker)) text = text.slice(speaker.length).replace(/^\s*:\s*/, "");
    return text.replace(/\s+/g, " ").trim();
  }

  function extractLines(root) {
    const out = [];
    const selectors = (platform.lineSelectors || []).filter(Boolean);
    let els = [];
    if (selectors.length) {
      for (const sel of selectors) els = [...root.querySelectorAll(sel)];
      if (!els.length) els = [...root.children];
    } else {
      els = [...root.children];
    }
    for (const el of els) {
      const raw = (el.innerText || "").trim();
      if (!raw || raw.length < 2) continue;
      const speaker = speakerOf(el);
      const text = textOf(el, speaker);
      if (!text) continue;
      out.push({ speaker: speaker || "Speaker", text });
    }
    return out;
  }

  // ---- diffing: interim updates vs new turns -------------------------------
  function ingest() {
    if (!container || !document.body.contains(container)) return;
    const current = extractLines(container);
    if (!current.length) return;
    lastActivity = Date.now();
    if (!session.startedAt) startSession();

    const prev = lastLineTexts;
    // Same length: the last line is still being spoken (interim growth).
    if (current.length === prev.length) {
      const last = current[current.length - 1];
      if (last.text !== prev[prev.length - 1]) {
        session.interim = { speaker: last.speaker, text: last.text, start_ms: session.interim?.start_ms ?? now() };
      }
    } else if (current.length > prev.length) {
      // New line(s) appeared: everything before the last is final.
      finalizeInterim();
      for (let i = prev.length; i < current.length - 1; i++) {
        pushLine(current[i]);
      }
      const last = current[current.length - 1];
      session.interim = { speaker: last.speaker, text: last.text, start_ms: now() };
    } else {
      // Container was re-rendered with fewer children: finalise what we had.
      finalizeInterim();
      for (const line of current) {
        if (!prev.includes(line.text)) pushLine(line);
      }
    }
    lastLineTexts = current.map((l) => l.text);
    report();
  }

  function pushLine(line) {
    const t = now();
    session.lines.push({ speaker: line.speaker, text: line.text, start_ms: t, end_ms: t });
  }

  function finalizeInterim() {
    if (!session.interim) return;
    const t = now();
    const { speaker, text, start_ms } = session.interim;
    const prevLine = session.lines[session.lines.length - 1];
    if (prevLine && prevLine.text === text && prevLine.speaker === speaker) {
      prevLine.end_ms = t;
    } else {
      session.lines.push({ speaker, text, start_ms, end_ms: t });
    }
    session.interim = null;
  }

  // ---- container discovery -------------------------------------------------
  function stableSelectorFor(el) {
    if (el.id) return `#${el.id}`;
    for (const attr of ["data-ui-id", "data-testid", "aria-label"]) {
      const v = el.getAttribute(attr);
      if (v) return `${el.tagName.toLowerCase()}[${attr}="${v}"]`;
    }
    const path = [];
    let cur = el;
    while (cur && cur !== document.body && path.length < 6) {
      let sel = cur.tagName.toLowerCase();
      if (cur.className && typeof cur.className === "string") {
        sel += "." + cur.className.trim().split(/\s+/).slice(0, 2).join(".");
      }
      const parent = cur.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter((c) => c.tagName === cur.tagName);
        if (siblings.length > 1) sel += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
      }
      path.unshift(sel);
      cur = parent;
    }
    return path.join(" > ");
  }

  function findContainer() {
    chrome.storage.local.get(["customSelectors"], (res) => {
      const custom = (res.customSelectors || {})[HOST];
      if (custom) {
        const el = document.querySelector(custom);
        if (el) return attach(el, true);
      }
      for (const sel of platform.containers) {
        const el = document.querySelector(sel);
        if (el) return attach(el, false);
      }
      // Heuristics: aria-live logs, or any element whose class mentions captions.
      const heur = document.querySelector('[aria-live="polite"][role="log"], [class*="caption" i], [class*="subtitle" i]');
      if (heur && (heur.innerText || "").trim()) return attach(heur, false);
      session.containerFound = false;
      session.searchingSince = session.searchingSince || Date.now();
      report();
      setTimeout(findContainer, 4000); // captions appear only once someone speaks
    });
  }

  function attach(el, custom) {
    container = el;
    session.containerFound = true;
    session.usingCustomSelector = !!custom;
    observer = new MutationObserver(() => ingest());
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    ingest();
    report();
    watchForEnd();
  }

  // ---- lifecycle -----------------------------------------------------------
  function startSession() {
    session.startedAt = Date.now();
    session.title = document.title;
    port.send({ type: "session-start", platform: platform.id, url: location.href, title: session.title });
  }

  function report() {
    // Mirror state onto the document element. Debugging aid first - it lets a human
    // see at a glance whether capture is live - and it gives the end-to-end test a
    // way to read content-script state, which page.evaluate cannot otherwise reach
    // (the content script lives in an isolated world; chrome.runtime is undefined
    // in the page context).
    try {
      const el = document.documentElement;
      el.dataset.sncLines = String(session.lines.length);
      el.dataset.sncFound = session.containerFound ? "1" : "0";
      el.dataset.sncCustom = session.usingCustomSelector ? "1" : "0";
      el.dataset.sncInterim = session.interim ? session.interim.text : "";
    } catch { /* never let telemetry break capture */ }
    port.send({
      type: "session-update",
      platform: platform.id,
      url: location.href,
      containerFound: session.containerFound,
      searchingFor: session.startedAt ? 0 : Math.round((Date.now() - (session.searchingSince || Date.now())) / 1000),
      usingCustomSelector: session.usingCustomSelector,
      lines: session.lines.length,
      interim: session.interim?.text || null,
      interimSpeaker: session.interim?.speaker || null,
      elapsed_ms: now(),
      started: !!session.startedAt,
    });
  }

  function save(reason) {
    finalizeInterim();
    if (session.lines.length < 2) return;
    port.send({ type: "session-save", reason, session: { ...session, lines: session.lines } });
  }

  function watchForEnd() {
    setInterval(() => {
      if (stopped || !session.startedAt) return;
      const gone = container && !document.body.contains(container);
      const silent = lastActivity && Date.now() - lastActivity > 45000;
      if (gone || silent) {
        if (!goneTimer) {
          goneTimer = setTimeout(() => { save(gone ? "left-call" : "captions-went-silent"); }, 8000);
        }
      } else if (goneTimer) {
        clearTimeout(goneTimer); goneTimer = null;
      }
    }, 5000);
    window.addEventListener("pagehide", () => save("pagehide"));
    window.addEventListener("beforeunload", () => save("unload"));
  }

  // ---- pick mode -----------------------------------------------------------
  let pickOverlay = null;
  function enterPickMode(sendResponse) {
    if (pickOverlay) return sendResponse?.({ ok: true, already: true });
    pickOverlay = document.createElement("div");
    pickOverlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483646;background:rgba(13,16,23,.35);cursor:crosshair;";
    const banner = document.createElement("div");
    banner.textContent = "Click the live captions area. Esc cancels.";
    banner.style.cssText =
      "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#0d1017;color:#fff;padding:10px 16px;border-radius:10px;font:600 13px/1.4 system-ui;box-shadow:0 8px 30px rgba(0,0,0,.4)";
    pickOverlay.appendChild(banner);
    document.documentElement.appendChild(pickOverlay);

    let hovered = null;
    const highlight = (el) => {
      if (hovered) hovered.outline = "";
      hovered = el;
      if (el) el.outline = "3px solid #6366f1";
    };
    pickOverlay.addEventListener("mousemove", (e) => {
      pickOverlay.style.pointerEvents = "none";
      highlight(document.elementFromPoint(e.clientX, e.clientY));
      pickOverlay.style.pointerEvents = "";
    });
    const finish = (el) => {
      if (hovered) hovered.outline = "";
      pickOverlay.remove(); pickOverlay = null;
      document.removeEventListener("keydown", onKey, true);
      if (!el) return;
      const sel = stableSelectorFor(el);
      chrome.storage.local.get(["customSelectors"], (res) => {
        const all = res.customSelectors || {};
        all[HOST] = sel;
        chrome.storage.local.set({ customSelectors: all }, () => {
          if (observer) observer.disconnect();
          attach(el, true);
        });
      });
    };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); finish(null); } };
    document.addEventListener("keydown", onKey, true);
    pickOverlay.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      pickOverlay.style.pointerEvents = "none";
      const el = document.elementFromPoint(e.clientX, e.clientY);
      pickOverlay.style.pointerEvents = "";
      finish(el);
    }, true);
    return sendResponse?.({ ok: true });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "pick") return enterPickMode(sendResponse);
    if (msg.type === "status") { report(); sendResponse({ ok: true, ...session, lines: session.lines.length }); return false; }
    if (msg.type === "stop") { stopped = true; save("manual"); sendResponse({ ok: true }); return false; }
    if (msg.type === "start") { stopped = false; findContainer(); sendResponse({ ok: true }); return false; }
    if (msg.type === "dump") { sendResponse({ ok: true, session }); return false; }
    return false;
  });

  findContainer();
  setInterval(report, 2000);
})();
