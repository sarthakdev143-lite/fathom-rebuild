#!/usr/bin/env bash
# Install the capture commit-gate into .git/hooks.
# Safe to re-run; idempotent.
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
mkdir -p "$REPO_ROOT/.git/hooks"
cp "$REPO_ROOT/tools/capture/hooks/pre-commit" "$REPO_ROOT/.git/hooks/pre-commit"
chmod +x "$REPO_ROOT/.git/hooks/pre-commit"
echo "hooks: pre-commit installed -> $REPO_ROOT/.git/hooks/pre-commit"
