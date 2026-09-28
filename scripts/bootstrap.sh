#!/usr/bin/env bash
# Run at the START of every working session on this VM.
#
# Why this exists: the VM snapshot that persists between turns deliberately
# excludes sensitive git paths (.git/config, .git/credentials). So the repo's
# identity and its `origin` remote are lost between turns even though the
# commits survive. This script restores them, reinstalls the capture
# commit-gate, and loads credentials from outside the repo.
#
# Secrets live in /home/user/.secrets/env.sh - OUTSIDE the repository tree, so
# they can never be staged, committed, or captured into .agent-logs/.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SECRETS="${SECRETS:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/.secrets/env.sh}"

cd "$REPO_ROOT"

git config user.name  "sarthakdev143-lite"
git config user.email "sarthakdev143.official@gmail.com"
git config core.autocrlf false
git config commit.gpgsign false

bash tools/capture/install-hooks.sh >/dev/null
echo "bootstrap: git identity + capture hook restored"

# restore origin (URL without credentials) if we have one on file
if [ -f .deploy/remote.txt ]; then
  REMOTE_URL="$(tr -d '[:space:]' < .deploy/remote.txt)"
  if [ -n "$REMOTE_URL" ]; then
    git remote remove origin 2>/dev/null || true
    git remote add origin "$REMOTE_URL"
    echo "bootstrap: origin -> $REMOTE_URL"
  fi
fi

if [ -f "$SECRETS" ]; then
  # shellcheck disable=SC1090
  set -a; . "$SECRETS"; set +a
  echo "bootstrap: loaded $(grep -c '^[A-Z]' "$SECRETS" || true) credential(s) from $SECRETS (outside repo)"
else
  echo "bootstrap: no secrets file at $SECRETS (deploy steps will need one)"
fi

python3 tools/capture/capture.py status || true
