#!/usr/bin/env python3
"""End-to-end smoke test against the deployed site, as a logged-out stranger.

    python3 scripts/smoke-test.py
    python3 scripts/smoke-test.py --base http://localhost:8787

No auth, no cookies, a browser user agent. Exits non-zero if any check fails, so
it can gate a deploy. Every check asserts something a reviewer would notice:
that the meetings list is not empty, that the flagship meeting really is an
eight-person hour, that switching template changes the body and not just the
heading, that audio answers a Range request with 206, that Ask refuses to bluff
on gibberish, that a share link opens with no account, and that SPA deep links
render on a hard refresh.

Writes are cleaned up after themselves unless --keep-writes is passed.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

UA = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

passed = 0
failed = 0
failures: list[str] = []


def check(name: str, cond: bool, extra: str = "") -> None:
    global passed, failed
    if cond:
        passed += 1
        print(f"  PASS  {name}" + (f"  {extra}" if extra else ""))
    else:
        failed += 1
        failures.append(name)
        print(f"  FAIL  {name}" + (f"  {extra}" if extra else ""))


class Client:
    def __init__(self, base: str):
        self.base = base.rstrip("/")

    def _open(self, req):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.headers, e.read()

    def get(self, path, headers=None, limit=None):
        h = dict(UA)
        h.update(headers or {})
        st, hd, body = self._open(urllib.request.Request(self.base + path, headers=h))
        return st, hd, (body[:limit] if limit else body)

    def get_json(self, path):
        st, _, body = self.get(path)
        return st, (json.loads(body) if body else None)

    def post(self, path, payload):
        h = dict(UA)
        h["content-type"] = "application/json"
        st, _, body = self._open(urllib.request.Request(
            self.base + path, data=json.dumps(payload).encode(), headers=h, method="POST"))
        try:
            return st, json.loads(body)
        except Exception:
            return st, {"_raw": body.decode(errors="ignore")[:200]}

    def delete(self, path):
        st, _, _ = self._open(urllib.request.Request(self.base + path, headers=UA, method="DELETE"))
        return st


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://fathom-rebuild.sarthak-fathom.workers.dev")
    ap.add_argument("--keep-writes", action="store_true", help="leave the highlight/share this test creates")
    args = ap.parse_args()

    c = Client(args.base)
    print(f"=== smoke test: {c.base} ===")
    created: dict[str, str] = {}

    st, d = c.get_json("/api/health")
    check("health", st == 200 and d.get("ok") is True, f"provider={d.get('provider')}")

    st, d = c.get_json("/api/meetings")
    meetings = (d or {}).get("meetings", [])
    # >= 8, not == 8: uploads and live transcriptions legitimately add meetings.
    # What must hold is that the SEEDED universe is present and non-empty.
    seeded = {"m-leadership-sync", "m-solo-test", "m-halcyon-discovery", "m-standup",
              "m-interview", "m-design-review", "m-allhands", "m-investor"}
    have = {m["id"] for m in meetings}
    check("all eight seeded meetings are present", st == 200 and seeded <= have,
          f"{len(meetings)} meetings listed, {len(seeded & have)}/8 seeded")
    check("no meeting has a stub transcript", all(m["segment_count"] > 10 for m in meetings))

    flag = next((m for m in meetings if m["id"] == "m-leadership-sync"), None)
    check("the brief's case exists: 8 people, ~an hour",
          bool(flag) and flag["participant_count"] == 8 and 59 <= flag["duration_ms"] / 60000 <= 62,
          f"{flag['duration_ms']/60000:.1f}min {flag['participant_count']}p {flag['segment_count']} lines" if flag else "")

    st, det = c.get_json("/api/meetings/m-leadership-sync")
    check("detail returns 8 speakers", st == 200 and len(det["speakers"]) == 8)
    check("detail returns chapters", len(det["chapters"]) >= 6, f"{len(det['chapters'])}")
    check("summary is authored, not only extracted",
          det["summary"]["generated_by"] == "authored+extractive", det["summary"]["headline"][:56])
    check("action items carry owners",
          sum(1 for a in det["action_items"] if a["owner_name"]) >= 7, f"{len(det['action_items'])} items")
    check("action items carry due dates as spoken",
          any(a["due_text"] for a in det["action_items"]))
    check("highlights are seeded", len(det["highlights"]) >= 3, f"{len(det['highlights'])}")
    check("clips and share links exist", len(det["clips"]) >= 2 and len(det["shares"]) >= 2)

    st, tr = c.get_json("/api/meetings/m-leadership-sync/transcript?from=1800000&limit=5")
    check("transcript pages from an offset", st == 200 and tr["segments"][0]["start_ms"] >= 1800000)

    bodies = {}
    for tpl in ["standard", "executive", "sales", "interview", "detailed", "actions_only"]:
        st, r = c.post("/api/meetings/m-leadership-sync/template", {"template": tpl})
        body = "|".join(s["body"] for s in r["summary"]["sections"])
        bodies[tpl] = body
        check(f"template {tpl}", st == 200 and len(body) > 200, f"{len(r['summary']['sections'])} sections")
    check("switching template changes the BODY, not just headings",
          bodies["standard"] != bodies["executive"] and bodies["standard"] != bodies["sales"])

    st, hd, body = c.get("/media/m-leadership-sync.mp3", {"Range": "bytes=1000000-1000999"}, limit=1000)
    total = (hd.get("content-range") or "").split("/")[-1]
    check("audio answers Range with 206 (seeking works)", st == 206 and len(body) == 1000,
          f"content-range={hd.get('content-range')}")
    st, hd, body = c.get("/media/m-solo-test.mp3", limit=4)
    check("audio is served as audio/mpeg", hd.get("content-type") == "audio/mpeg" and body[:3] == b"ID3")
    st, _, _ = c.get("/media/does-not-exist.mp3")
    check("a missing asset 404s instead of serving HTML as audio", st == 404, f"got {st}")

    st, r = c.post("/api/ask", {"question": "What did we decide about the comp band?"})
    check("ask across all meetings", st == 200 and len(r["citations"]) > 0 and "band exception" in r["answer"],
          f"{len(r['citations'])} citations")
    check("ask citations are verifiable (timestamp + speaker + meeting)",
          all(x.get("speaker_name") and isinstance(x.get("start_ms"), int) and x.get("meeting_title")
              for x in r["citations"]))
    st, r = c.post("/api/ask", {"question": "region pinning", "meeting_id": "m-halcyon-discovery"})
    check("ask scoped to one meeting", st == 200 and all(x["meeting_id"] == "m-halcyon-discovery" for x in r["citations"]))
    st, r = c.post("/api/ask", {"question": "zzz qqq xxx yyy"})
    check("ask refuses to bluff on gibberish", st == 200 and len(r["citations"]) == 0)
    st, r = c.post("/api/ask", {"question": "hi"})
    check("ask rejects a too-short question", st == 400)

    st, sr = c.get_json("/api/search?q=rollback")
    check("search finds transcript lines across meetings", st == 200 and sr["total"] > 0,
          f"{sr['total']} hits / {len(sr['meetings'])} meetings")
    st, sr = c.get_json("/api/search?q=%5Bcrosstalk%5D")
    check("search handles a bracketed query", st == 200)

    st, r = c.post("/api/meetings/m-leadership-sync/highlights",
                   {"start_ms": 1234567, "label": "smoke test highlight"})
    created["highlight"] = r.get("highlight", {}).get("id", "")
    check("create a highlight mid-playback", st == 201 and r["highlight"]["start_ms"] == 1234567)

    st, r = c.post("/api/meetings/m-leadership-sync/shares", {"scope": "summary", "title": "smoke test share"})
    token = r.get("token", "")
    created["share"] = token
    check("create a share link", st == 201 and bool(token))
    st, sh = c.get_json(f"/api/share/{token}")
    check("the share link opens with no account and no auth",
          st == 200 and sh["link"]["scope"] == "summary" and "summary" in sh)
    st, r = c.post(f"/api/share/{token}/view", {})
    check("views are counted so the owner knows it was opened", st == 200 and r["view_count"] >= 1)
    st, _ = c.get_json("/api/share/token-that-does-not-exist")
    check("an unknown share token 404s", st == 404, f"got {st}")

    st, cal = c.get_json("/api/calendar")
    check("calendar events are seeded", st == 200 and len(cal["events"]) >= 5, f"{len(cal['events'])} events")
    check("calendar says it is stubbed rather than pretending", cal["is_stub"] is True)
    st, r = c.post("/api/calendar/connect", {"provider": "microsoft"})
    check("stubbed OAuth connect succeeds", st == 200 and r["is_stub"] is True)

    import urllib.request as _ur
    def raw_post(path, data, ctype):
        h = dict(UA); h["content-type"] = ctype
        req = _ur.Request(c.base + path, data=data, headers=h, method="POST")
        try:
            with _ur.urlopen(req, timeout=60) as r: return r.status, r.read()
        except urllib.error.HTTPError as e: return e.code, e.read()
    st, _ = raw_post("/api/upload", b"", "multipart/form-data; boundary=x")
    check("upload without a file is a 400, not a crash", st == 400, f"got {st}")
    st, _ = raw_post("/api/meetings/from-transcript", json.dumps({"segments": []}).encode(), "application/json")
    check("from-transcript without segments is a 400", st == 400, f"got {st}")
    st, hd, _ = c.get("/api/live-asr")
    check("the live ASR relay refuses non-WebSocket requests with 426", st == 426, f"got {st}")

    st, hd, body = c.get("/api/live/m-standup/stream?speed=200", limit=300)
    check("the live SSE stream starts", st == 200 and (hd.get("content-type") or "").startswith("text/event-stream"),
          hd.get("content-type"))

    for p in ["/", "/meetings/m-leadership-sync", "/live", "/search", "/calendar", f"/s/{token}"]:
        st, hd, body = c.get(p, limit=3000)
        check(f"SPA route renders on a hard refresh: {p}",
              st == 200 and (hd.get("content-type") or "").startswith("text/html") and b'<div id=' in body)
    st, _, body = c.get("/api/definitely-not-a-route")
    check("an unknown API route returns JSON 404, not index.html", st == 404 and body[:1] == b"{")

    # ---- settings: every toggle must have an observable effect ----
    st, settings = c.get_json("/api/settings")
    check("settings endpoint returns defaults", st == 200 and settings.get("default_template") == "standard",
          f"{len(settings)} keys")

    st, d2 = c.get_json("/api/meetings/m-leadership-sync")
    n_actions_on = len(d2["action_items"])
    check("action items present while auto-generate is on", n_actions_on > 0, f"{n_actions_on} items")

    st, s2 = c.post("/api/settings", {}) if False else (None, None)
    import urllib.request as _u
    def patch(payload):
        h = dict(UA); h["content-type"] = "application/json"
        req = _u.Request(c.base + "/api/settings", data=json.dumps(payload).encode(), headers=h, method="PATCH")
        with _u.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read())

    st, _ = patch({"key": "auto_generate_action_items", "value": "0"})
    check("PATCH a setting", st == 200, f"-> {st}")
    st, d3 = c.get_json("/api/meetings/m-leadership-sync")
    check("turning off auto-generate actually empties the action items",
          st == 200 and len(d3["action_items"]) == 0 and d3["action_items_suppressed"] is True)
    st, _ = patch({"key": "auto_generate_action_items", "value": "1"})
    st, d4 = c.get_json("/api/meetings/m-leadership-sync")
    check("turning it back on restores them (nothing was deleted)", len(d4["action_items"]) == n_actions_on)

    st, body = (lambda: (None, None))()
    h = dict(UA); h["content-type"] = "application/json"
    try:
        _u.urlopen(_u.Request(c.base + "/api/settings", data=json.dumps({"key": "nope", "value": "1"}).encode(), headers=h, method="PATCH"), timeout=30)
        check("an unknown setting key is rejected", False)
    except urllib.error.HTTPError as e:
        check("an unknown setting key is rejected", e.code == 400, f"-> {e.code}")
    try:
        _u.urlopen(_u.Request(c.base + "/api/settings", data=json.dumps({"key": "transcript_density", "value": "enormous"}).encode(), headers=h, method="PATCH"), timeout=30)
        check("an invalid setting value is rejected", False)
    except urllib.error.HTTPError as e:
        check("an invalid setting value is rejected", e.code == 400, f"-> {e.code}")

    st, _ = patch({"key": "auto_share_with_attendees", "value": "1"})
    st, d5 = c.get_json("/api/meetings/m-leadership-sync")
    ash = d5.get("attendee_share")
    check("auto-share creates a real link", bool(ash) and ash.get("token") == "auto_m-leadership-sync", str(ash and ash.get("token")))
    if ash:
        st, sh2 = c.get_json(f"/api/share/{ash['token']}")
        check("the auto-share link opens with no account", st == 200 and sh2["link"]["scope"] == "summary")
    st, _ = patch({"key": "auto_share_with_attendees", "value": "0"})
    st, d6 = c.get_json("/api/meetings/m-leadership-sync")
    check("turning auto-share off stops creating it", d6.get("attendee_share") is None)

    st, _ = patch({"key": "ask_use_model", "value": "retrieval"})
    st, r = c.post("/api/ask", {"question": "region pinning"})
    check("ask honours the retrieval-only setting", st == 200 and r["provider"] == "retrieval-only", r.get("provider"))
    st, _ = patch({"key": "ask_use_model", "value": "auto"})

    st, r = c.post("/api/ask", {"question": "did anyone commit to a date"})
    found = any("fourteenth of October" in x["text"] or "by Friday" in x["text"] for x in r["citations"])
    concepts = [x["label"] for x in r.get("concepts", [])]
    check("intent expansion bridges the lexical gap", st == 200 and found, f"{len(r['citations'])} citations")
    check("...and reports the intent it read, so the mechanism is not magic",
          any(x in ("commitment", "deadline") for x in [c["id"] for c in r.get("concepts", [])]), f"concepts={concepts}")

    st, _ = c.post("/api/settings/apply-template?template=executive", {})
    st, d7 = c.get_json("/api/meetings/m-leadership-sync")
    check("apply-template-to-all is a real bulk update", st == 200 and d7["meeting"]["active_template"] == "executive")
    st, _ = c.post("/api/settings/apply-template?template=standard", {})
    st, d8 = c.get_json("/api/meetings/m-leadership-sync")
    check("...and it is reversible", d8["meeting"]["active_template"] == "standard")

    if not args.keep_writes:
        if created.get("highlight"):
            c.delete(f"/api/highlights/{created['highlight']}")
        c.delete("/api/shares/auto_m-leadership-sync")  # created by the auto-share check
        if created.get("share"):
            st = c.delete(f"/api/shares/{created['share']}")
            check("a share link can be revoked", st == 200, f"DELETE -> {st}")
            st, _ = c.get_json(f"/api/share/{created['share']}")
            check("a revoked link stops resolving", st == 404, f"got {st}")
        print("\n  (writes cleaned up)")

    print(f"\n{passed} passed, {failed} failed")
    if failures:
        print("failed checks:")
        for f in failures:
            print(f"  - {f}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
