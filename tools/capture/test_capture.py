#!/usr/bin/env python3
"""Regression tests for the capture harness.

Run: python3 tools/capture/test_capture.py
Every test executes against a scratch repo via CAPTURE_ROOT, so it can never
touch the real .agent-logs/.
"""

from __future__ import annotations

import importlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent


def fresh_module(tmp: Path):
    os.environ["CAPTURE_ROOT"] = str(tmp)
    sys.path.insert(0, str(HERE))
    for name in list(sys.modules):
        if name == "capture":
            del sys.modules[name]
    return importlib.import_module("capture")


class CaptureTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="capture-test-"))
        (self.tmp / ".agent-logs").mkdir()
        self.cap = fresh_module(self.tmp)

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def start(self, sid: str = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee") -> dict:
        self.cap.LOG_DIR.mkdir(parents=True, exist_ok=True)
        state = self.cap.load_state()
        import datetime as dt
        start = dt.datetime(2026, 9, 27, 12, 0, 0, tzinfo=dt.timezone.utc)
        sess = {
            "session_id": sid, "date": start.strftime("%Y-%m-%d"),
            "author": "tester", "model": "qwen", "tool": "test",
            "project": "p", "total_exchanges": 0, "first_prompt_time": "",
            "last_prompt_time": "", "file": "2026-09-27_12-00-00_" + sid + ".md",
            "started_at": "2026-09-27T12:00:00.000Z", "closed": False,
        }
        (self.cap.LOG_DIR / sess["file"]).write_text(
            self.cap.render_frontmatter(sess) + "\n\n" + self.cap.render_header(sess) + "\n"
        )
        state["sessions"][sid] = sess
        state["active"] = sid
        self.cap.save_state(state)
        return sess

    # --- the bug that was actually hit -----------------------------------
    def test_indented_example_entries_in_a_prompt_body_are_not_boundaries(self):
        """A captured prompt may itself CONTAIN the spec's indented example log.

        This happened for real: turn 1 of the build session is the 8x setup
        prompt, which embeds `[LOG_ENTRY ...]` examples inside a 4-space
        indented code block. Matching after .strip() split one entry into four
        and reported 3 prompts / 1 response.
        """
        self.start()
        body = (
            "Format:\n\n"
            "    [LOG_ENTRY type=PROMPT num=1 session=3f9c1a20]\n"
            "    timestamp: 2026-08-28T09:14:02.118Z\n"
            "    model: claude-opus-5\n\n"
            "    Some example prompt text.\n\n\n"
            "    [LOG_ENTRY type=RESPONSE num=1 session=3f9c1a20]\n"
            "    timestamp: 2026-08-28T09:15:40.663Z\n"
            "    model: claude-opus-5\n\n"
            "    Some example response text.\n"
        )
        sess = self.cap.active_session(self.cap.load_state())
        self.cap.append_entry(sess, "PROMPT", body, None)
        entries = self.cap.read_entries(self.cap.session_path(sess))
        self.assertEqual(len(entries), 1, f"expected 1 entry, got {len(entries)}")
        self.assertIn("Some example response text.", entries[0])
        # still an open turn at this point, so only non-strict may pass
        self.assertEqual(self.cap.validate(strict=False, quiet=True), 0)
        self.cap.append_entry(sess, "RESPONSE", "answered", None)
        self.assertEqual(self.cap.validate(strict=True, quiet=True), 0)

    def test_column_zero_entry_inside_body_would_split_is_accepted_risk(self):
        """Documented limitation: a body line at column 0 that is byte-identical
        to an entry header would be read as a boundary. Real prompts indent such
        examples; the format has no escape syntax, so this is recorded rather
        than silently 'fixed' with a lossy transform."""
        self.assertTrue(True)

    # --- sequencing / validation ----------------------------------------
    def test_numbering_and_timestamps(self):
        self.start()
        sess = self.cap.active_session(self.cap.load_state())
        self.cap.append_entry(sess, "PROMPT", "first question", "2026-09-27T12:00:01.000Z")
        self.cap.append_entry(sess, "RESPONSE", "first answer", "2026-09-27T12:00:05.000Z")
        self.cap.append_entry(sess, "PROMPT", "second question", "2026-09-27T12:01:00.000Z")
        self.cap.append_entry(sess, "RESPONSE", "second answer", "2026-09-27T12:02:00.000Z")
        raw = self.cap.session_path(sess).read_text()
        self.assertIn("[LOG_ENTRY type=PROMPT num=1 session=aaaaaaaa]", raw)
        self.assertIn("[LOG_ENTRY type=RESPONSE num=2 session=aaaaaaaa]", raw)
        self.assertIn("total_exchanges: 2", raw)
        self.assertEqual(self.cap.validate(strict=True, quiet=True), 0)

    def test_open_turn_blocks_strict_validation(self):
        self.start()
        sess = self.cap.active_session(self.cap.load_state())
        self.cap.append_entry(sess, "PROMPT", "unanswered", None)
        self.assertEqual(self.cap.validate(strict=True, quiet=True), 1)
        self.assertEqual(self.cap.validate(strict=False, quiet=True), 0)

    def test_backwards_timestamp_is_an_error(self):
        self.start()
        sess = self.cap.active_session(self.cap.load_state())
        self.cap.append_entry(sess, "PROMPT", "q", "2026-09-27T12:05:00.000Z")
        self.cap.append_entry(sess, "RESPONSE", "a", "2026-09-27T12:01:00.000Z")
        self.assertEqual(self.cap.validate(strict=False, quiet=True), 1)

    def test_entries_are_never_rewritten(self):
        """append_entry re-emits existing blocks byte-for-byte."""
        self.start()
        sess = self.cap.active_session(self.cap.load_state())
        self.cap.append_entry(sess, "PROMPT", "original   spacing\n\npreserved", None)
        before = self.cap.read_entries(self.cap.session_path(sess))[0]
        self.cap.append_entry(sess, "RESPONSE", "later", None)
        after = self.cap.read_entries(self.cap.session_path(sess))[0]
        # the final block in a file carries one trailing newline, a non-final
        # block carries the two-newline separator; that framing is not content.
        self.assertEqual(before.rstrip("\n"), after.rstrip("\n"))

    # --- the only mutation path ------------------------------------------
    def test_replace_last_writes_a_disclosure_note(self):
        self.start()
        sess = self.cap.active_session(self.cap.load_state())
        self.cap.append_entry(sess, "PROMPT", "q", "2026-09-27T12:00:01.000Z")
        self.cap.append_entry(sess, "RESPONSE", "incomplete answer", "2026-09-27T12:00:02.000Z")
        self.cap.replace_last_response(sess, "complete answer", "more work happened after capture", None)
        raw = self.cap.session_path(sess).read_text()
        self.assertIn("complete answer", raw)
        self.assertNotIn("incomplete answer", raw)
        self.assertIn("this RESPONSE entry was replaced", raw)
        self.assertIn("more work happened after capture", raw)
        self.assertEqual(raw.count("[LOG_ENTRY type=RESPONSE"), 1, "must replace, not duplicate")
        self.assertEqual(self.cap.validate(strict=True, quiet=True), 0)

    def test_replace_last_refuses_to_touch_a_prompt(self):
        self.start()
        sess = self.cap.active_session(self.cap.load_state())
        self.cap.append_entry(sess, "PROMPT", "q", "2026-09-27T12:00:01.000Z")
        with self.assertRaises(SystemExit):
            self.cap.replace_last_response(sess, "tampered", "x", None)
        self.assertIn("q", self.cap.session_path(sess).read_text())

    # --- redaction -------------------------------------------------------
    def test_redaction_of_known_key_formats(self):
        cases = {
            "token ghp_FIXTURENOTREALaaaaaaaaaaaaaaaaaa": "[REDACTED:github-token]",
            "OPENAI_API_KEY=sk-FIXTURENOTREALaaaaaaaaaaaaaaaaaaaa": "[REDACTED:openai-key]",
            "anthropic sk-ant-fixture03-NOTREALaaaaaaaaaaaa": "[REDACTED:anthropic-key]",
            "vercel vcp_FIXTURENOTREALaaaaaaaaaa": "[REDACTED:vercel-token]",
            "aws AKIAFIXTURENOTREAL00": "[REDACTED:aws-access-key]",
        }
        for src, marker in cases.items():
            out = self.cap.redact(src)
            self.assertIn(marker, out, f"failed to redact: {src}")

    def test_redaction_preserves_normal_prose(self):
        text = "Ship the transcript view, then the summary templates. 8-person call runs an hour."
        self.assertEqual(self.cap.redact(text), text)

    def test_db_url_password_redacted_host_preserved(self):
        out = self.cap.redact("DATABASE_URL=postgres://user:FIXTURENOTREALpw@db.example.com:5432/app")
        self.assertIn("[REDACTED:db-password]", out)
        self.assertIn("@db.example.com:5432/app", out)
        self.assertNotIn("FIXTURENOTREALpw", out)

    # --- format conformance ---------------------------------------------
    def test_front_matter_matches_spec_field_order(self):
        self.start()
        sess = self.cap.active_session(self.cap.load_state())
        self.cap.append_entry(sess, "PROMPT", "x", None)
        raw = self.cap.session_path(sess).read_text()
        fm = raw.split("---\n")[1]
        keys = [ln.split(":")[0].strip() for ln in fm.strip().split("\n")]
        self.assertEqual(keys, self.cap.FRONTMATTER_FIELDS)

    def test_gitignoring_agent_logs_fails_validation(self):
        self.start()
        sess = self.cap.active_session(self.cap.load_state())
        self.cap.append_entry(sess, "PROMPT", "x", None)
        self.cap.append_entry(sess, "RESPONSE", "y", None)
        (self.tmp / ".gitignore").write_text("node_modules/\n.agent-logs/\n")
        self.assertEqual(self.cap.validate(strict=True, quiet=True), 1)


class CliTest(unittest.TestCase):
    """End-to-end through the CLI, the way it is actually invoked."""

    def test_cli_roundtrip(self):
        tmp = Path(tempfile.mkdtemp(prefix="capture-cli-"))
        try:
            env = dict(os.environ, CAPTURE_ROOT=str(tmp))
            run = lambda *a: subprocess.run(
                [sys.executable, str(HERE / "capture.py"), *a],
                env=env, capture_output=True, text=True)
            r = run("session", "start", "--project", "p", "--author", "a",
                    "--tool", "t", "--model", "m")
            self.assertEqual(r.returncode, 0, r.stderr)
            r = run("prompt", "--text", "hello")
            self.assertEqual(r.returncode, 0, r.stderr)
            r = run("validate", "--strict", "--quiet")
            self.assertEqual(r.returncode, 1, "open turn must fail strict validation")
            r = run("response", "--text", "world")
            self.assertEqual(r.returncode, 0, r.stderr)
            r = run("validate", "--strict", "--quiet")
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            logs = list((tmp / ".agent-logs").glob("*_*.md"))
            self.assertEqual(len(logs), 1)
            body = logs[0].read_text()
            self.assertIn("hello", body)
            self.assertIn("world", body)
            self.assertEqual(json.loads((tmp / ".agent-logs/.state.json").read_text())["active"] is not None, True)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
