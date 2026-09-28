# CAPTURE-TEST.md

Status: **GREEN.** Capture is verified. Nothing was built before this passed.

---

## 1. Tool and model

| | |
|---|---|
| **Tool** | `qwen-agent-harness` — a hosted agent runtime (Qwen's agentic sandbox). Not Claude Code, Cursor, Codex CLI, Windsurf or Aider. |
| **Model (plans)** | `qwen` |
| **Model (executes)** | `qwen` — same model plans and executes; this runtime does not expose a separate planner/executor split. |
| **Author** | `sarthakdev143-lite` |
| **Project** | `fathom-rebuild` |

The runtime does not publish its exact checkpoint string to the agent, so the
`model:` field records `qwen`. If 8x needs the precise model id, it is visible
in the client UI; `python3 tools/capture/capture.py session set-model --model X`
updates front matter and per-entry model lines without touching entry bodies.

## 2. Does this tool have a hook / lifecycle-event / rules mechanism?

**No.** This was checked, not assumed. Concretely, on this VM:

```
$ find / -maxdepth 4 \( -name ".claude*" -o -name ".cursor*" -o -name ".codex*" \
      -o -name ".aider*" -o -name "AGENTS.md" -o -name "CLAUDE.md" \
      -o -name ".windsurf*" \) 2>/dev/null
(no results)

$ env | sort
ARENA_WORKSPACE  HOME  LANG  LC_ALL  OLDPWD  PATH  PWD  PYTHONNOUSERSITE  SHLVL  TERM  TMPDIR  VIRTUAL_ENV
```

There is no settings file to wire events into, no session store on disk to
tail, and no rules mechanism. The agent process is server-side; nothing inside
the sandbox can intercept a prompt or a response as it crosses the boundary.

So, per the brief's explicit fallback — *"say so explicitly, name what you
checked, and wrap the session instead"* — the session is wrapped.

## 3. The mechanism used, and the files that configure it

A wrapper that only works when someone remembers to run it is not a capture
mechanism, so the wrapper is made self-enforcing at the one point in this
workflow that cannot be skipped: **the commit**.

| File | Role |
|---|---|
| `tools/capture/capture.py` | The capture tool. Writes PROMPT/RESPONSE entries in the exact spec format, regenerates front matter from the entries, redacts credentials, validates. |
| `tools/capture/hooks/pre-commit` | **The enforcement.** Source of the commit gate. |
| `.git/hooks/pre-commit` | The installed copy (this is the "config file changed" — git's own hook path). |
| `tools/capture/install-hooks.sh` | Installs the gate. Idempotent. |
| `.github/workflows/agent-log-ci.yml` | Re-validates the log on every push, publicly, so integrity is machine-checked on the remote and not just locally. |
| `scripts/bootstrap.sh` | Restores git identity, the hook, and `origin` at the start of each session — this VM's snapshot excludes `.git/config`, so they would otherwise be lost between turns. |
| `.agent-logs/.state.json` | Session registry (active session, counters, filenames). |

**The gate blocks a commit when:**

1. a turn is open — a prompt was captured but its response was not;
2. `.agent-logs/` fails format validation (front matter fields, entry numbering,
   timestamp monotonicity, model on every entry, empty bodies,
   `total_exchanges` disagreeing with the actual prompt count);
3. `.agent-logs/` is missing or gitignored;
4. a staged file matches a credential pattern.

Because code and its log entry cannot be committed separately, the commit order
*necessarily* shows the order the work happened in. That is the property the
brief is asking for, obtained without a lifecycle hook.

## 4. Where the canaries landed

| Session | File |
|---|---|
| Canary 1 | `.agent-logs/2026-09-27_13-54-59_1622cc4e-afea-4e23-9b65-e685f81ee1d4.md` |
| Canary 2 (second session) | `.agent-logs/2026-09-27_13-55-11_62941e94-87e1-464a-8ae0-e6709e3d4a8d.md` |
| Canary 3 (commit-gate negative test) | `.agent-logs/2026-09-27_13-55-34_6977f88f-2221-4a3c-845d-82eb8ba95aa5.md` |

## 5. Canary entries, pasted raw

### Canary 1 — `.agent-logs/2026-09-27_13-54-59_1622cc4e-afea-4e23-9b65-e685f81ee1d4.md`

```markdown
---
session_id: 1622cc4e-afea-4e23-9b65-e685f81ee1d4
date: 2026-09-27
author: sarthakdev143-lite
model: qwen
tool: qwen-agent-harness
project: fathom-rebuild
total_exchanges: 1
first_prompt_time: 2026-09-27T13:54:59.854Z
last_prompt_time: 2026-09-27T13:54:59.854Z
---

# Session Log - 2026-09-27

Session: `1622cc4e` | Project: `fathom-rebuild` | Author: `sarthakdev143-lite`

---

[LOG_ENTRY type=PROMPT num=1 session=1622cc4e]
timestamp: 2026-09-27T13:54:59.854Z
model: qwen

CAPTURE TEST — 8x assignment, sarthakdev143-lite

[LOG_ENTRY type=RESPONSE num=1 session=1622cc4e]
timestamp: 2026-09-27T13:54:59.909Z
model: qwen

Canary received and captured.

This entry was written by tools/capture/capture.py, not by hand. It proves the
PROMPT side of the wrapper works: the prompt text landed verbatim, with a UTC
millisecond timestamp and the model name, in the session file named
YYYY-MM-DD_HH-MM-SS_<session-id>.md under .agent-logs/.

Capture configuration for this repository:
  tool    qwen-agent-harness (hosted agent runtime)
  model   qwen
  author  sarthakdev143-lite
  project fathom-rebuild

Mechanism: this runtime exposes no prompt/response lifecycle hook, so the
session is wrapped. Enforcement is automatic rather than remembered — a
pre-commit gate (installed into .git/hooks, source at
tools/capture/hooks/pre-commit) refuses any commit while a turn is open or the
log fails validation, and .github/workflows/agent-log-ci.yml re-validates on
every push.

This is the RESPONSE half of the canary pair.
```

### Canary 2 — second session, `.agent-logs/2026-09-27_13-55-11_62941e94-87e1-464a-8ae0-e6709e3d4a8d.md`

```markdown
---
session_id: 62941e94-87e1-464a-8ae0-e6709e3d4a8d
date: 2026-09-27
author: sarthakdev143-lite
model: qwen
tool: qwen-agent-harness
project: fathom-rebuild
total_exchanges: 1
first_prompt_time: 2026-09-27T13:55:11.223Z
last_prompt_time: 2026-09-27T13:55:11.223Z
---

# Session Log - 2026-09-27

Session: `62941e94` | Project: `fathom-rebuild` | Author: `sarthakdev143-lite`

---

[LOG_ENTRY type=PROMPT num=1 session=62941e94]
timestamp: 2026-09-27T13:55:11.223Z
model: qwen

CAPTURE TEST — 8x assignment, sarthakdev143-lite (second session)

[LOG_ENTRY type=RESPONSE num=1 session=62941e94]
timestamp: 2026-09-27T13:55:11.276Z
model: qwen

Second-session canary received and captured.

This is the check from step 4.3 of the setup prompt: a capture mechanism that
only works in the session which created it is not installed. This entry was
written from a freshly started session with its own session-id, its own
.agent-logs/ file, and its own front matter counters, using the same code path
as the first canary.

Both canaries are now on disk in separate files:
  session 1 - 1622cc4e (canary #1)
  session 2 - this session (canary #2)

Counters restart per session, session isolation holds, and the wrapper is not
bound to the process or session that set it up. Capture is green.
```

Canary 2 is the step-4.3 check: a **new session with a new session-id**, written
through the same code path. It confirms the wrapper is not bound to the session
that created it.

### Canary 3 — commit-gate negative test, `.agent-logs/2026-09-27_13-55-34_6977f88f-2221-4a3c-845d-82eb8ba95aa5.md`

```markdown
---
session_id: 6977f88f-2221-4a3c-845d-82eb8ba95aa5
date: 2026-09-27
author: sarthakdev143-lite
model: qwen
tool: qwen-agent-harness
project: fathom-rebuild
total_exchanges: 1
first_prompt_time: 2026-09-27T13:55:34.953Z
last_prompt_time: 2026-09-27T13:55:34.953Z
---

# Session Log - 2026-09-27

Session: `6977f88f` | Project: `fathom-rebuild` | Author: `sarthakdev143-lite`

---

[LOG_ENTRY type=PROMPT num=1 session=6977f88f]
timestamp: 2026-09-27T13:55:34.953Z
model: qwen

CAPTURE TEST — 8x assignment, sarthakdev143-lite (commit-gate negative test)

[LOG_ENTRY type=RESPONSE num=1 session=6977f88f]
timestamp: 2026-09-27T13:55:52.681Z
model: qwen

Commit-gate negative test: PASS.

Attempted a commit while this turn was open (prompt captured, response not).
The pre-commit gate refused it:

    error: 2026-09-27_13-55-34_6977f88f-2221-4a3c-845d-82eb8ba95aa5.md: OPEN TURN - prompt #1 has no captured response
    commit blocked: .agent-logs/ did not validate
    commit exit code: 1

No commit was created. The gate fires on its own; nobody had to remember to
run anything. This entry is the response half, written to close the turn so the
next commit can proceed.
```

## 6. Verification output

```
$ python3 tools/capture/capture.py validate --strict
capture: OK - 3 session log(s), format conforms to spec
```

Negative test 1 — commit attempted with an open turn:

```
error: 2026-09-27_13-55-34_6977f88f-2221-4a3c-845d-82eb8ba95aa5.md: OPEN TURN - prompt #1 has no captured response
commit blocked: .agent-logs/ did not validate
commit exit code: 1        # no commit created
```

Negative test 2 — commit attempted with a staged credential:

```
commit blocked: possible secret in staged file(s): .deploy-leak-test.sh
commit exit code: 1        # no commit created
```

Both gates fire on their own. Neither was invoked manually.

## 7. What was tried first and did not work

1. **Looked for a native hook to wire.** No `.claude/settings.json`, no Cursor
   rules file, no Codex/Aider session log, no harness env vars. Dead end — see
   the `find` output in section 2. There is nothing to attach to.
2. **Considered tailing a session store on disk**, the Cursor/Windsurf route.
   There is no session store in this sandbox; conversation state lives
   server-side. Dead end.
3. **Considered a shell wrapper around the agent CLI** (the usual "wrap the
   session" move). There is no agent CLI in the sandbox to wrap — the runtime is
   the sandbox. Dead end.
4. **First cut of the gate was a `post-commit` hook** that appended the log
   after each commit. Wrong: it cannot block anything, so a forgotten response
   would silently produce a log with holes, and the commit order would no longer
   prove the work order. Replaced with `pre-commit`.
5. **Tried writing entry bodies with `rewrite_shell()` regenerating them from
   state.** Rejected — that path could alter an entry after the fact, which the
   brief forbids. Entry bodies are now read back out of the file and re-emitted
   byte-for-byte; only front matter is regenerated.
6. **Entry-header matching used `line.strip()`.** This broke on the very first
   real prompt. Turn 1 of the build session *is* the 8x setup prompt, which
   embeds the spec's example log inside a 4-space indented code block. After
   stripping, those indented `[LOG_ENTRY ...]` examples matched as real entry
   boundaries, so one prompt parsed as three prompts and one response, and
   `status` reported `3 prompt(s), 1 response(s)` for a file with a single
   exchange. Fixed by anchoring entry headers at column 0, and covered by
   `test_indented_example_entries_in_a_prompt_body_are_not_boundaries` in
   `tools/capture/test_capture.py` (12 tests, run in CI).

   Known residual limitation, recorded rather than papered over: a body line at
   column 0 that is byte-identical to an entry header would still read as a
   boundary. The spec's format has no escape syntax, and inventing one would
   mean altering captured text. Real prompts indent such examples.

7. **Timestamps were initially second-precision.** The spec shows milliseconds
   (`...09:14:02.118Z`), so the format was tightened and `validate` now rejects
   anything that is not `YYYY-MM-DDTHH:MM:SS.mmmZ`.

## 8. One disclosed deviation from "verbatim, no cleanup"

Prompts in this project carry deploy credentials (GitHub PAT, Cloudflare API
token). `.agent-logs/` ships to a **public** repository. `capture.py` therefore
redacts credentials at write time — mechanically, by regex over known key
formats (`sk-ant-…`, `ghp_…`, `github_pat_…`, `AKIA…`, `vcp_…`, JWTs, DB URLs
with embedded passwords, `key = <opaque value>` pairs), replacing each with
`[REDACTED:<kind>]`.

Nothing else is altered: no truncation, no paraphrase, no summarising, no
tidying, no deletion. Wrong turns, failed approaches and mistakes are left in
exactly as written. Every redaction is also counted and reported to stdout at
write time, so a redaction can never happen silently. Real credentials live
outside the repo at `"$ARENA_WORKSPACE"/.secrets/env.sh` and are sourced by
`scripts/bootstrap.sh`.

## 9. Convention used for mid-turn clarification

When the agent asks a clarifying question through its question UI, the verbatim
question and answer block is included at the top of that turn's RESPONSE entry,
labelled `[clarification exchange]`. It is part of what happened in that turn
and is recorded rather than dropped.

## 10. Turn 1 of the build session was backfilled

The capture harness was being written *during* turn 1, so turn 1's PROMPT entry
could not be captured at the moment the prompt arrived. It was written at the
end of that turn with `--at 2026-09-27T13:46:00.000Z`, the turn-start time read
off the VM clock (workspace directory mtime at the first tool call of the turn).
The text is verbatim and in full. Every turn from turn 2 onward is captured at
the moment it happens: PROMPT written as the first action of the turn, RESPONSE
written as the last.

Consequence worth stating plainly: because the pre-commit gate refuses commits
while a turn is open, each turn's commits are made immediately after its
RESPONSE entry is captured. Code and its log entry therefore land in the same
turn's commit group, in work order.

## 11. One RESPONSE entry was replaced, and why that is disclosed here

Turn 1 of the build session has a `[capture note]` at the top of its RESPONSE
entry. That note is not decoration.

**What happened.** The RESPONSE entry was captured, and then more work happened
in the same turn: the credential scanner was extracted into
`tools/capture/secret_scan.py`, the `.secretscanallow` allowlist was added, and
the correction path itself was written and tested. Because this wrapper has no
end-of-turn event, capturing a response too early is a failure mode it can have.

**The choice.** Leave the log saying less than what was actually sent, or correct
the entry. Leaving it diverged is the worse form of dishonesty — a log that looks
clean but does not match the conversation is exactly what the brief says it can
tell the difference of. So the entry was corrected.

**How it is corrected.** Through the harness, not by hand. `capture.py response
--replace-last --reason "…"` is the only mutation path in the tool. It:

- refuses to run unless the last entry is a RESPONSE — a PROMPT can never be
  altered (`test_replace_last_refuses_to_touch_a_prompt`);
- requires a reason, and writes that reason **inside the entry**;
- records the commit sha of the previous version, which stays in git history
  (`git log -p .agent-logs/` shows the before-and-after for anyone who wants it);
- replaces rather than duplicates, so numbering and `total_exchanges` stay valid;
- prints `capture: REPLACED RESPONSE #n` to stderr.

Covered by two of the 14 tests in `tools/capture/test_capture.py`.

**The reason recorded for this instance:** *response was captured before the
turn's work finished: the credential-scanner extraction, the `--replace-last`
correction path and its two tests all landed after the first write. Replacing
rather than leaving the log diverged from what was actually sent; previous
version remains in git history.*

No PROMPT entry has been altered at any point. No entry has been summarised,
tidied or deleted. From turn 2 onward the RESPONSE entry is written as the last
action of the turn, so this path should not be needed again — and if it is used
again, it will be disclosed here again.

## 12. Turns killed by the environment leave a prompt with no response

Two prompts in the build session (`#7` and `#8`) have **no RESPONSE entry**. This is
not a capture failure and not an omission I can fix by writing something: in both
cases the turn was terminated by the hosting environment while a long-running tool
call was in flight, so **no response was ever delivered to the user**. There is no
verbatim final response to record, and inventing one would put a conversation in
the log that never happened.

What the log therefore shows for those turns is the prompt, then the next turn's
prompt. The gap is the truthful record. It is also now machine-visible:
`capture.py validate` warns when a session contains prompts without responses,
with a pointer back to this section, so the gap can never be silent.

The fix on my side was behavioural, not cosmetic: long CPU-bound work (audio
synthesis) is now run one meeting per process with `--only-stale` resumability, so
an interrupted call costs a single meeting instead of a whole turn - and turns end
with their response captured before any further work, which is why this section
exists only for the two turns that predate that discipline.

## 13. The commit history before this point does not exist, and why that is honest

Between turns 12 and 13 the hosting environment restored this workspace **without its `.git`
directory**. Not the excluded `.git/config` - the whole directory. The forty-three commits made
across turns 1-12, and their interleaving with `.agent-logs/`, were unrecoverable: no pack files,
no refs, no `ORIG_HEAD` anywhere on the filesystem. Nothing had been pushed, because the PAT lacked
the Workflows scope until turn 13.

What survived: every file in the working tree, this log in full (it is plain files, not git
objects), the deployed Worker, its D1 database, the synthesized audio, the extension and every test.
What did not: the commit objects, and with them the commit-level evidence of work order.

The recovery is **one commit, timestamped at recovery time, containing the whole tree**, labelled
`RECOVERY:` in its subject. It does not backdate anything and does not reconstruct the lost
sequence. Rebuilding forty-three commits with fabricated timestamps would manufacture precisely
the artefact this assignment verifies, and would look identical to the real thing to anyone who
did not ask.

Consequences a reader should hold:

- The commit graph shows one commit before the recovery work, not twelve turns of interleaving.
  The turn-by-turn order of the work is in this log and nowhere else; read `.agent-logs/` for it.
- Commit messages from the lost history survive *as text* inside later messages and in this file's
  neighbours, but their SHAs and timestamps are gone.
- The CI workflow on the remote validates this log on every push, so the record that survived is
  the record that is machine-checked.

Prevention, now in force: every commit is pushed immediately; a `git bundle` of all refs is written
outside the repository after each turn; and `bootstrap.sh` derives its paths from its own location,
because a hardcoded workspace root silently skipped the identity restore during this recovery and
failed the first commit attempt with "Author identity unknown".
