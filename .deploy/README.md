# Deploy configuration

Non-secret deploy config lives here and is committed. Credentials do NOT — they
live outside the repo at `"$ARENA_WORKSPACE"/.secrets/env.sh` and are sourced by
`scripts/bootstrap.sh`.

- `remote.txt` — the `origin` URL **without** any embedded token. Committed
  because this VM's snapshot excludes `.git/config`, so `origin` would otherwise
  be lost between sessions. `bootstrap.sh` re-adds it, and pushes use an
  in-memory credential helper fed from the secrets file, so the token never
  touches disk inside the repo or the git config.

Target: Cloudflare Workers (API + SPA in one Worker) + D1 + R2.
See `docs/PLAN.md` §4 for why.
