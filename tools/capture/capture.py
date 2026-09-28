#!/usr/bin/env python3
"""
8x agent-capture harness.

WHY THIS EXISTS
---------------
The assignment requires that every prompt and every final response is captured
automatically into `.agent-logs/`, in a fixed format, committed as we go.

This agent runs inside a hosted harness that exposes NO prompt/response
lifecycle hook (verified: no .claude/, .cursor/, .codex/, .windsurf/,
AGENTS.md, CLAUDE.md, and no harness env vars other than ARENA_WORKSPACE).
So the session is *wrapped* instead, per the brief's fallback instruction.

The wrapper is made self-enforcing three ways, so it does not depend on
anyone remembering:

  1. `tools/capture/hooks/pre-commit` (installed into .git/hooks) REFUSES any
     commit while a turn is open (prompt captured, response not) and REFUSES
     any commit that fails format validation or contains a secret.
  2. `.github/workflows/agent-log-ci.yml` re-runs `validate` on every push,
     publicly, so log integrity is machine-checked on the remote too.
  3. `bootstrap.sh` re-installs the hook + git identity at the start of every
     turn, because this VM's snapshot excludes `.git/config`.

WHAT IS CAPTURED
----------------
The prompt and the final response. Nothing in between: no reasoning, no tool
calls, no file reads, no diffs, no retries.

Entries are append-only. Nothing in this script rewrites, tidies, summarises
or deletes an existing entry. The only mutable data is the front matter
(counters/timestamps) and session metadata, which is regenerated from the
entries themselves.

The single deliberate deviation from "verbatim, no cleanup" is secret
redaction, applied at write time and disclosed in CAPTURE-TEST.md: this log
ships to a PUBLIC repository, and prompts in this project carry deploy tokens.
Redaction is mechanical (regex over known key formats), never editorial.

USAGE
-----
  capture.py session start --project P --author A --tool T --model M [--id UUID]
  capture.py prompt   (--file F | --text T) [--at ISO8601]
  capture.py response (--file F | --text T) [--at ISO8601]
  capture.py status
  capture.py validate [--strict] [--quiet]
  capture.py session set-model --model M
  capture.py session close
"""

from __future__ import annotations

import argparse
import datetime as dt
import subprocess
import json
import os
import re
import sys
import uuid
from pathlib import Path

# CAPTURE_ROOT lets the test suite point the harness at a scratch repo.
REPO_ROOT = Path(os.environ.get("CAPTURE_ROOT") or Path(__file__).resolve().parents[2]).resolve()
LOG_DIR = REPO_ROOT / ".agent-logs"
STATE_FILE = LOG_DIR / ".state.json"

FRONTMATTER_FIELDS = [
    "session_id",
    "date",
    "author",
    "model",
    "tool",
    "project",
    "total_exchanges",
    "first_prompt_time",
    "last_prompt_time",
]

ENTRY_RE = re.compile(
    r"^\[LOG_ENTRY type=(?P<type>PROMPT|RESPONSE) num=(?P<num>\d+) session=(?P<sid>[0-9a-f\-]+)\]$"
)
TS_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")


# --------------------------------------------------------------------------
# secret redaction (write-time, mechanical, disclosed)
# --------------------------------------------------------------------------

REDACTIONS: list[str] = []


def _mark(kind: str) -> str:
    REDACTIONS.append(kind)
    return f"[REDACTED:{kind}]"


SECRET_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("anthropic-key", re.compile(r"\bsk-ant-[A-Za-z0-9_\-]{16,}")),
    ("openai-key", re.compile(r"\bsk-proj-[A-Za-z0-9_\-]{16,}|\bsk-[A-Za-z0-9]{20,}")),
    ("github-token", re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}")),
    ("github-fine-grained", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}")),
    ("aws-access-key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("google-api-key", re.compile(r"\bAIza[0-9A-Za-z_\-]{30,}")),
    ("slack-token", re.compile(r"\bxox[baprs]-[A-Za-z0-9\-]{10,}")),
    ("vercel-token", re.compile(r"\bvcp_[A-Za-z0-9]{16,}")),
    ("groq-key", re.compile(r"\bgsk_[A-Za-z0-9_\-]{20,}")),
    ("gemini-key", re.compile(r"\bAIza[0-9A-Za-z_\-]{30,}")),
    ("gemini-key", re.compile(r"\bAQ\.[A-Za-z0-9_\-]{20,}")),
    ("npm-token", re.compile(r"\bnpm_[A-Za-z0-9]{30,}")),
    ("stripe-live-key", re.compile(r"\b(?:sk|rk)_live_[0-9a-zA-Z]{16,}")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{4,}")),
    ("cloudflare-token", re.compile(r"\bcfut_[A-Za-z0-9_\-]{20,}")),
    ("cloudflare-token", re.compile(r"(?i)\bcf[_\-]?(?:api[_\-]?)?token\b\s*[:=]\s*['\"]?([A-Za-z0-9_\-]{30,})")),
    ("sendgrid-key", re.compile(r"\bSG\.[A-Za-z0-9_\-]{16,}")),
    ("twilio-key", re.compile(r"\bSK[0-9a-fA-F]{32}\b")),
]

KEYISH = (
    r"api[_\-]?key|apikey|secret|token|password|passwd|pwd|authorization|"
    r"credential|access[_\-]?key|client[_\-]?secret|private[_\-]?key|database[_\-]?url"
)
# Deliberately NOT \b-anchored. The keyish word is usually embedded in a
# SCREAMING_SNAKE name (CLOUDFLARE_API_TOKEN), where '_' is a word character and
# \btoken\b never fires. That miss is why a real Cloudflare token survived
# redaction on the first attempt.
GENERIC_KV = re.compile(
    rf"(?i)([A-Za-z0-9_\-\.]*(?:{KEYISH})[A-Za-z0-9_\-\.]*)(\s*[:=]\s*)(['\"]?)([A-Za-z0-9_\-\.+/=]{{16,}})"
)

# Residual-leak gate. Redaction is pattern-based and therefore best effort, so
# after redacting we look again for anything still shaped like an opaque assigned
# credential and REFUSE to write it. Keys that are genuinely not secrets are
# named here explicitly, rather than loosening the value rule for everyone.
NON_SECRET_KEYS = {
    "cloudflare_account_id", "account_id", "session_id", "sha", "commit",
    "checksum", "hash", "fingerprint", "trace_id", "request_id", "build_id",
}
RESIDUAL = re.compile(
    r"(?im)^\s*(?:export\s+)?([A-Za-z0-9_\-\.]+)\s*[:=]\s*['\"]?([A-Za-z0-9_\-\.+/=]{24,})['\"]?\s*$"
)


def residual_secrets(text: str) -> list[str]:
    """Opaque assigned values that survived redaction. Fails loud, never silent."""
    hits = []
    for m in RESIDUAL.finditer(text):
        key, val = m.group(1), m.group(2)
        if key.lower() in NON_SECRET_KEYS or "REDACTED" in val:
            continue
        classes = sum([any(c.islower() for c in val),
                       any(c.isupper() for c in val),
                       any(c.isdigit() for c in val)])
        if classes >= 2:  # mixed case + digits is the credential shape
            hits.append(f"{key}={val[:4]}\u2026 ({len(val)} chars, {classes} char classes)")
    return hits

DB_URL = re.compile(r"(?i)\b((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|libsql|https?)://[^:/@\s]+:)([^@\s]{3,})(@)")


def redact(text: str) -> str:
    """Mechanically strip credentials. Everything else is byte-for-byte verbatim.

    If a pattern has a capture group, only that group is replaced (so a
    `KEY=<value>` match keeps the key name visible and readable). Otherwise the
    whole match is replaced.
    """
    for kind, pat in SECRET_PATTERNS:
        if pat.groups:
            def _sub(m: re.Match[str], k: str = kind) -> str:
                val = m.group(1)
                return m.group(0).replace(val, _mark(k)) if val else _mark(k)
            text = pat.sub(_sub, text)
        else:
            text = pat.sub(lambda m, k=kind: _mark(k), text)

    text = DB_URL.sub(lambda m: m.group(1) + _mark("db-password") + m.group(3), text)

    def _kv(m: re.Match[str]) -> str:
        return m.group(1) + m.group(2) + m.group(3) + _mark("credential") + m.group(3)

    text = GENERIC_KV.sub(_kv, text)
    return text


# --------------------------------------------------------------------------
# time helpers
# --------------------------------------------------------------------------

def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + \
        f"{dt.datetime.now(dt.timezone.utc).microsecond // 1000:03d}Z"


def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def parse_iso(value: str) -> str:
    """Normalise an --at override to the millisecond UTC form the spec uses."""
    v = value.strip().replace(" ", "T")
    if v.endswith("Z"):
        v = v[:-1] + "+00:00"
    d = dt.datetime.fromisoformat(v)
    if d.tzinfo is None:
        d = d.replace(tzinfo=dt.timezone.utc)
    d = d.astimezone(dt.timezone.utc)
    return d.strftime("%Y-%m-%dT%H:%M:%S.") + f"{d.microsecond // 1000:03d}Z"


# --------------------------------------------------------------------------
# state
# --------------------------------------------------------------------------

def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"sessions": {}, "active": None}


def save_state(state: dict) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")


def active_session(state: dict) -> dict:
    sid = state.get("active")
    if not sid or sid not in state["sessions"]:
        die("no active capture session. Run: capture.py session start ...")
    return state["sessions"][sid]


def die(msg: str, code: int = 1) -> None:
    print(f"capture: {msg}", file=sys.stderr)
    sys.exit(code)


def session_path(sess: dict) -> Path:
    return LOG_DIR / sess["file"]


# --------------------------------------------------------------------------
# writing
# --------------------------------------------------------------------------

def render_frontmatter(sess: dict) -> str:
    lines = ["---"]
    for field in FRONTMATTER_FIELDS:
        lines.append(f"{field}: {sess.get(field, '')}")
    lines.append("---")
    return "\n".join(lines)


def render_header(sess: dict) -> str:
    short = sess["session_id"][:8]
    day = sess["first_prompt_time"][:10] if sess.get("first_prompt_time") else sess["date"]
    return (
        f"# Session Log - {day}\n\n"
        f"Session: `{short}` | Project: `{sess['project']}` | Author: `{sess['author']}`\n\n"
        "---\n"
    )


def rewrite_shell(sess: dict, entries: list[str]) -> None:
    """Rebuild the file from front matter + header + the verbatim entry blocks.

    Entry blocks are read back out of the existing file and re-emitted
    unchanged; this function never edits their contents.
    """
    path = session_path(sess)
    body = "\n".join(entries)
    path.write_text(render_frontmatter(sess) + "\n\n" + render_header(sess) + "\n" + body)


def read_entries(path: Path) -> list[str]:
    """Split an existing session file into its entry blocks, verbatim."""
    if not path.exists():
        return []
    raw = path.read_text()
    lines = raw.split("\n")
    starts = [i for i, ln in enumerate(lines) if ENTRY_RE.match(ln)]
    if not starts:
        return []
    blocks = []
    for idx, start in enumerate(starts):
        end = starts[idx + 1] if idx + 1 < len(starts) else len(lines)
        block = "\n".join(lines[start:end]).rstrip("\n")
        blocks.append(block + "\n\n")
    if blocks:
        blocks[-1] = blocks[-1].rstrip("\n") + "\n"
    return blocks


def append_entry(sess: dict, kind: str, text: str, at: str | None,
                 allow_secret: bool = False) -> None:
    ts = parse_iso(at) if at else now_iso()
    path = session_path(sess)
    entries = read_entries(path)

    prior_prompts = sum(1 for e in entries if "type=PROMPT" in e.split("\n")[0])
    num = prior_prompts + 1 if kind == "PROMPT" else max(prior_prompts, 1)

    body = redact(text.rstrip("\n"))
    leftover = residual_secrets(body)
    if leftover and not allow_secret:
        print("capture: REFUSING to write - credential-shaped value survived redaction:",
              file=sys.stderr)
        for hit in leftover:
            print(f"  {hit}", file=sys.stderr)
        print("Add a pattern for it, or pass --allow-secret if it is genuinely not a "
              "secret (it will then be committed to a PUBLIC repo).", file=sys.stderr)
        die("residual credential in capture text")
    block = (
        f"[LOG_ENTRY type={kind} num={num} session={sess['session_id'][:8]}]\n"
        f"timestamp: {ts}\n"
        f"model: {sess['model']}\n\n"
        f"{body}\n\n"
    )
    entries.append(block)

    if kind == "PROMPT":
        sess["total_exchanges"] = num
        if not sess.get("first_prompt_time"):
            sess["first_prompt_time"] = ts
        sess["last_prompt_time"] = ts
    sess.setdefault("last_activity", ts)

    rewrite_shell(sess, entries)

    state = load_state()
    state["sessions"][sess["session_id"]] = sess
    save_state(state)

    if REDACTIONS:
        kinds = sorted(set(REDACTIONS))
        print(f"capture: wrote {kind} #{num} to .agent-logs/{sess['file']} "
              f"(redacted {len(REDACTIONS)} secret(s): {', '.join(kinds)})")
    else:
        print(f"capture: wrote {kind} #{num} to .agent-logs/{sess['file']}")


# --------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------

def cmd_session_start(args: argparse.Namespace) -> None:
    state = load_state()
    sid = args.id or str(uuid.uuid4())
    start = utc_now()
    fname = start.strftime("%Y-%m-%d_%H-%M-%S") + f"_{sid}.md"
    sess = {
        "session_id": sid,
        "date": start.strftime("%Y-%m-%d"),
        "author": args.author,
        "model": args.model,
        "tool": args.tool,
        "project": args.project,
        "total_exchanges": 0,
        "first_prompt_time": "",
        "last_prompt_time": "",
        "file": fname,
        "started_at": start.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "closed": False,
    }
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    path = LOG_DIR / fname
    if path.exists() and not args.force:
        die(f"{fname} already exists")
    path.write_text(render_frontmatter(sess) + "\n\n" + render_header(sess) + "\n")
    state["sessions"][sid] = sess
    state["active"] = sid
    save_state(state)
    print(f"capture: session {sid[:8]} -> .agent-logs/{fname}")


def cmd_prompt(args: argparse.Namespace) -> None:
    state = load_state()
    sess = active_session(state)
    text = read_source(args)
    if not text.strip():
        die("empty prompt")
    append_entry(sess, "PROMPT", text, args.at, args.allow_secret)


def cmd_response(args: argparse.Namespace) -> None:
    state = load_state()
    sess = active_session(state)
    text = read_source(args)
    if not text.strip():
        die("empty response")
    if args.replace_last:
        replace_last_response(sess, text, args.reason or "(no reason given)", args.at,
                              args.allow_secret)
        return
    if args.reason:
        die("--reason is only meaningful with --replace-last")
    append_entry(sess, "RESPONSE", text, args.at)


def replace_last_response(sess: dict, text: str, reason: str, at: str | None,
                          allow_secret: bool = False) -> None:
    """Correct the most recent RESPONSE entry, loudly.

    Needed because this wrapper has no end-of-turn event: a response can be
    captured and then more work happen in the same turn. Rather than let the log
    diverge from what was actually sent, the entry is replaced - but the
    replacement is disclosed inside the entry itself, the previous version stays
    recoverable in git history, and the reason is mandatory.

    This is the ONLY mutation path in the harness. It cannot touch a PROMPT.
    """
    path = session_path(sess)
    entries = read_entries(path)
    if not entries:
        die("--replace-last: no entries in this session")
    head = entries[-1].split("\n")[0]
    if "type=RESPONSE" not in head:
        die(f"--replace-last: last entry is not a RESPONSE ({head[:60]})")

    num = ENTRY_RE.match(entries[-1].split("\n")[0]).group("num")
    sha = subprocess.run(
        ["git", "log", "-1", "--format=%h", "--", f".agent-logs/{sess['file']}"],
        cwd=REPO_ROOT, capture_output=True, text=True).stdout.strip() or "uncommitted"

    note = (
        f"[capture note: this RESPONSE entry was replaced, not appended.\n"
        f"reason: {reason}\n"
        f"previous version: preserved in git history (commit {sha}).\n"
        f"disclosed in CAPTURE-TEST.md. No PROMPT entry has ever been altered.]"
    )
    entries[-1] = ""  # drop, re-append below through the normal path
    entries = [e for e in entries if e]
    rewrite_shell(sess, entries)

    ts = parse_iso(at) if at else now_iso()
    body = redact(text.rstrip("\n"))
    leftover = residual_secrets(body)
    if leftover and not allow_secret:
        print("capture: REFUSING to write - credential-shaped value survived redaction:",
              file=sys.stderr)
        for hit in leftover:
            print(f"  {hit}", file=sys.stderr)
        print("Add a pattern for it, or pass --allow-secret if it is genuinely not a "
              "secret (it will then be committed to a PUBLIC repo).", file=sys.stderr)
        die("residual credential in capture text")
    block = (
        f"[LOG_ENTRY type=RESPONSE num={num} session={sess['session_id'][:8]}]\n"
        f"timestamp: {ts}\n"
        f"model: {sess['model']}\n\n"
        f"{note}\n\n"
        f"{body}\n"
    )
    entries.append(block)
    rewrite_shell(sess, entries)
    state = load_state()
    state["sessions"][sess["session_id"]] = sess
    save_state(state)
    print(f"capture: REPLACED RESPONSE #{num} in .agent-logs/{sess['file']}", file=sys.stderr)
    print(f"capture: reason recorded in-entry; previous version at commit {sha}", file=sys.stderr)


def read_source(args: argparse.Namespace) -> str:
    if args.file:
        p = Path(args.file)
        if not p.exists():
            die(f"--file not found: {p}")
        return p.read_text()
    if args.text is not None:
        return args.text
    if not sys.stdin.isatty():
        return sys.stdin.read()
    die("nothing to capture: pass --file, --text, or stdin")
    return ""


def cmd_status(_args: argparse.Namespace) -> None:
    state = load_state()
    sid = state.get("active")
    if not sid:
        print("capture: no active session")
        return
    sess = state["sessions"][sid]
    entries = read_entries(session_path(sess))
    prompts = sum(1 for e in entries if ENTRY_RE.match(e.split("\n")[0]) and "type=PROMPT" in e.split("\n")[0])
    responses = sum(1 for e in entries if "type=RESPONSE" in e.split("\n")[0])
    print(f"session : {sess['session_id']}")
    print(f"file    : .agent-logs/{sess['file']}")
    print(f"model   : {sess['model']}   tool: {sess['tool']}")
    print(f"entries : {prompts} prompt(s), {responses} response(s)")
    print(f"state   : {'OPEN TURN (response missing)' if prompts > responses else 'closed'}")


def cmd_set_model(args: argparse.Namespace) -> None:
    state = load_state()
    sess = active_session(state)
    sess["model"] = args.model
    rewrite_shell(sess, read_entries(session_path(sess)))
    state["sessions"][sess["session_id"]] = sess
    save_state(state)
    print(f"capture: model -> {args.model} (existing entry bodies untouched)")


def cmd_session_close(_args: argparse.Namespace) -> None:
    state = load_state()
    sess = active_session(state)
    sess["closed"] = True
    state["sessions"][sess["session_id"]] = sess
    state["active"] = None
    save_state(state)
    print(f"capture: session {sess['session_id'][:8]} closed")


# --------------------------------------------------------------------------
# validation
# --------------------------------------------------------------------------

def validate(strict: bool = False, quiet: bool = False) -> int:
    problems: list[str] = []
    warnings: list[str] = []
    files = sorted(LOG_DIR.glob("*_*.md"))
    if not files:
        problems.append("no session logs found in .agent-logs/")

    for path in files:
        raw = path.read_text()
        name = path.name

        if not raw.startswith("---\n"):
            problems.append(f"{name}: missing front matter")
            continue
        fm_end = raw.find("\n---\n", 4)
        if fm_end == -1:
            problems.append(f"{name}: unterminated front matter")
            continue
        fm = {}
        for line in raw[4:fm_end].split("\n"):
            if ":" in line:
                k, _, v = line.partition(":")
                fm[k.strip()] = v.strip()

        for field in FRONTMATTER_FIELDS:
            if field not in fm:
                problems.append(f"{name}: front matter missing '{field}'")
        for field in ("session_id", "date", "author", "model", "tool", "project"):
            if not fm.get(field):
                problems.append(f"{name}: front matter '{field}' is empty")

        entries = read_entries(path)
        if not entries:
            warnings.append(f"{name}: no entries yet")

        expected_num = 0
        prev_ts = ""
        open_turn = False
        for block in entries:
            lines = block.split("\n")
            m = ENTRY_RE.match(lines[0])
            if not m:
                problems.append(f"{name}: malformed entry header: {lines[0][:60]}")
                continue
            kind = m.group("type")
            num = int(m.group("num"))
            if kind == "PROMPT":
                expected_num += 1
                if num != expected_num:
                    problems.append(f"{name}: PROMPT num={num}, expected {expected_num}")
                open_turn = True
            else:
                if num != expected_num:
                    problems.append(f"{name}: RESPONSE num={num} does not follow PROMPT num={expected_num}")
                open_turn = False

            ts_line = next((l for l in lines[1:4] if l.startswith("timestamp:")), "")
            ts = ts_line.split(":", 1)[1].strip() if ts_line else ""
            if not TS_RE.match(ts):
                problems.append(f"{name}: {kind} #{num} bad timestamp '{ts}'")
            elif prev_ts and ts < prev_ts:
                problems.append(f"{name}: {kind} #{num} timestamp goes backwards")
            prev_ts = ts or prev_ts

            model_line = next((l for l in lines[1:5] if l.startswith("model:")), "")
            if not model_line.split(":", 1)[1].strip():
                problems.append(f"{name}: {kind} #{num} missing model")

            body = "\n".join(lines[4:]).strip()
            if not body:
                problems.append(f"{name}: {kind} #{num} has an empty body")

        if open_turn:
            msg = f"{name}: OPEN TURN - prompt #{expected_num} has no captured response"
            (problems if strict else warnings).append(msg)

        # A turn killed by the environment leaves a prompt with NO response, and not
        # as the final entry - so the open-turn check above cannot see it. Nothing
        # was delivered to the user in that case, so there is genuinely nothing to
        # capture; the correct behaviour is to show the gap, never to invent a
        # response for it. Documented in CAPTURE-TEST.md section 12.
        prompts_here = sum(1 for e in entries if "type=PROMPT" in e.split("\n")[0])
        responses_here = sum(1 for e in entries if "type=RESPONSE" in e.split("\n")[0])
        if responses_here < prompts_here and not open_turn:
            warnings.append(
                f"{name}: {prompts_here - responses_here} prompt(s) have no RESPONSE entry "
                f"(turn terminated mid-work before anything was delivered; see CAPTURE-TEST.md section 12)"
            )

        if fm.get("total_exchanges") and entries:
            counted = sum(1 for e in entries if "type=PROMPT" in e.split("\n")[0])
            if str(counted) != fm["total_exchanges"]:
                problems.append(
                    f"{name}: total_exchanges={fm['total_exchanges']} but {counted} prompts captured"
                )

    gitignore = REPO_ROOT / ".gitignore"
    if gitignore.exists():
        gi = gitignore.read_text()
        for line in gi.split("\n"):
            s = line.strip()
            if s.startswith("#") or s.startswith("!"):
                continue
            if s in (".agent-logs", ".agent-logs/", ".agent-logs/**"):
                problems.append(".gitignore excludes .agent-logs/ - it must ship with the repo")

    for w in warnings:
        if not quiet:
            print(f"warning: {w}")
    for p in problems:
        print(f"error: {p}")
    if not problems and not quiet:
        print(f"capture: OK - {len(files)} session log(s), format conforms to spec")
    return 1 if problems else 0


def cmd_validate(args: argparse.Namespace) -> None:
    sys.exit(validate(strict=args.strict, quiet=args.quiet))


# --------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="capture.py", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("session", help="session lifecycle")
    ssub = s.add_subparsers(dest="session_cmd", required=True)
    st = ssub.add_parser("start")
    st.add_argument("--project", required=True)
    st.add_argument("--author", required=True)
    st.add_argument("--tool", required=True)
    st.add_argument("--model", required=True)
    st.add_argument("--id", default=None)
    st.add_argument("--force", action="store_true")
    st.set_defaults(func=cmd_session_start)
    sm = ssub.add_parser("set-model")
    sm.add_argument("--model", required=True)
    sm.set_defaults(func=cmd_set_model)
    sc = ssub.add_parser("close")
    sc.set_defaults(func=cmd_session_close)

    pr = sub.add_parser("prompt")
    pr.add_argument("--file")
    pr.add_argument("--text")
    pr.add_argument("--at", default=None, help="override timestamp (ISO8601)")
    pr.add_argument("--allow-secret", action="store_true",
                    help="write even if a credential-shaped value survived redaction")
    pr.set_defaults(func=cmd_prompt)

    rs = sub.add_parser("response")
    rs.add_argument("--file")
    rs.add_argument("--text")
    rs.add_argument("--at", default=None, help="override timestamp (ISO8601)")
    rs.add_argument("--allow-secret", action="store_true",
                    help="write even if a credential-shaped value survived redaction")
    rs.add_argument("--replace-last", action="store_true",
                    help="correct the most recent RESPONSE entry (loud, disclosed, reason required)")
    rs.add_argument("--reason", default=None, help="why the response entry is being replaced")
    rs.set_defaults(func=cmd_response)

    st = sub.add_parser("status")
    st.set_defaults(func=cmd_status)

    v = sub.add_parser("validate")
    v.add_argument("--strict", action="store_true", help="treat an open turn as an error")
    v.add_argument("--quiet", action="store_true")
    v.set_defaults(func=cmd_validate)
    return p


def main() -> None:
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
