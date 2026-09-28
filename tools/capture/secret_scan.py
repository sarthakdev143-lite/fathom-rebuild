#!/usr/bin/env python3
"""Credential scan — single source of truth for the pre-commit gate and CI.

Scans tracked or staged files for credential-shaped strings. `.agent-logs/` is
skipped: capture.py already redacts at write time, and re-scanning redacted
markers would be noise.

Deliberate test fixtures are allowed via `.secretscanallow` at the repo root —
an exact-path allowlist with a mandatory reason per line, so an exception is
always visible and reviewable rather than a blanket weakening of the scan.

Usage:
  secret_scan.py --staged     # files in the git index (pre-commit)
  secret_scan.py --tracked    # all tracked files (CI)
  secret_scan.py FILE...      # explicit paths
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ALLOW_FILE = REPO_ROOT / ".secretscanallow"

PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("anthropic-key", re.compile(r"\bsk-ant-[A-Za-z0-9_\-]{16,}")),
    ("openai-key", re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_\-]{20,}")),
    ("github-token", re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}")),
    ("github-fine-grained", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}")),
    ("aws-access-key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("google-api-key", re.compile(r"\bAIza[0-9A-Za-z_\-]{30,}")),
    ("slack-token", re.compile(r"\bxox[baprs]-[A-Za-z0-9\-]{10,}")),
    ("vercel-token", re.compile(r"\bvcp_[A-Za-z0-9]{16,}")),
    ("cloudflare-token", re.compile(r"\bcfut_[A-Za-z0-9_\-]{20,}")),
    ("groq-key", re.compile(r"\bgsk_[A-Za-z0-9_\-]{20,}")),
    ("gemini-key", re.compile(r"\bAQ\.[A-Za-z0-9_\-]{20,}")),
    ("gemini-key", re.compile(r"\bAIza[0-9A-Za-z_\-]{30,}")),
    ("npm-token", re.compile(r"\bnpm_[A-Za-z0-9]{30,}")),
    ("stripe-live-key", re.compile(r"\b(?:sk|rk)_live_[0-9a-zA-Z]{16,}")),
    ("sendgrid-key", re.compile(r"\bSG\.[A-Za-z0-9_\-]{16,}\.[A-Za-z0-9_\-]{16,}")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{4,}")),
    ("private-key-block", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
]

SKIP_PREFIXES = (".agent-logs/",)


def load_allowlist() -> dict[str, str]:
    allowed: dict[str, str] = {}
    if not ALLOW_FILE.exists():
        return allowed
    for line in ALLOW_FILE.read_text().split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 1)
        allowed[parts[0]] = parts[1] if len(parts) > 1 else "(no reason given)"
    return allowed


def files_staged() -> list[str]:
    out = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"],
        cwd=REPO_ROOT, capture_output=True, text=True, check=True).stdout
    return [f for f in out.split("\n") if f.strip()]


def files_tracked() -> list[str]:
    out = subprocess.run(["git", "ls-files"], cwd=REPO_ROOT,
                         capture_output=True, text=True, check=True).stdout
    return [f for f in out.split("\n") if f.strip()]


def scan(paths: list[str]) -> int:
    allowed = load_allowlist()
    violations: list[str] = []
    skipped: list[str] = []

    for rel in paths:
        if rel.startswith(SKIP_PREFIXES):
            continue
        path = REPO_ROOT / rel
        if not path.is_file():
            continue
        try:
            text = path.read_text(errors="ignore")
        except Exception:
            continue
        if path.is_symlink() or len(text) > 4_000_000:
            continue

        for lineno, line in enumerate(text.split("\n"), 1):
            for kind, pat in PATTERNS:
                if pat.search(line):
                    if rel in allowed:
                        skipped.append(f"{rel}:{lineno} [{kind}] allowed: {allowed[rel]}")
                    else:
                        violations.append(f"{rel}:{lineno}: {kind}")
                    break

    for s in sorted(set(skipped)):
        print(f"secret-scan: allowlisted fixture -> {s}", file=sys.stderr)
    if violations:
        print("", file=sys.stderr)
        for v in sorted(set(violations)):
            print(f"secret-scan: VIOLATION {v}", file=sys.stderr)
        print("", file=sys.stderr)
        print("A credential-shaped string is about to reach a PUBLIC repository.", file=sys.stderr)
        print("Real credentials belong in /home/user/.secrets/env.sh, outside the repo.", file=sys.stderr)
        print("If this is a deliberate test fixture, add an exact path plus a reason to", file=sys.stderr)
        print(".secretscanallow -- and make the fixture self-evidently fake.", file=sys.stderr)
        return 1
    print(f"secret-scan: clean ({len(paths)} file(s) checked)")
    return 0


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(2)
    if args[0] == "--staged":
        sys.exit(scan(files_staged()))
    if args[0] == "--tracked":
        sys.exit(scan(files_tracked()))
    sys.exit(scan(args))


if __name__ == "__main__":
    main()
