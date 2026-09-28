#!/usr/bin/env python3
"""Synthesize meeting audio from the seeded transcripts.

WHY
---
The capture layer is stubbed (no bot joins a real call), but playback <-> transcript
sync should still be real rather than a progress bar pretending. So audio is
generated from the same segment timings the transcript uses: every segment is
spoken by a distinct neural TTS voice and placed at exactly its start_ms.

HOW SYNC IS KEPT
----------------
The seed generator sized each segment from word count at ~150 wpm. TTS does not
naturally match that, so each voice is calibrated once (words/second at
length_scale=1.0) and every segment gets a per-segment length_scale that lands its
spoken duration on the transcript slot:

    length_scale = clamp(slot_seconds / (words / calibrated_wps), 0.72, 1.45)

Then the audio is padded with silence or trimmed to the exact slot. Overlapping
speech (segments the generator marked as crosstalk) is MIXED into the buffer
rather than overwriting, so interruptions sound like interruptions.

OUTPUT
------
web/public/media/<meeting-id>.mp3  -> served as a Worker static asset at
/media/<meeting-id>.mp3, which is the audio_key the seed wrote into the meetings
table. Mono, 22.05 kHz, 24 kbps: ~11 MB for an hour, under the 25 MiB per-asset
limit and small enough that deploys stay quick.

USAGE
-----
  python3 scripts/synthesize-audio.py --meeting m-solo-test
  python3 scripts/synthesize-audio.py --all
  python3 scripts/synthesize-audio.py --all --skip m-leadership-sync
"""

from __future__ import annotations

import argparse
import gc
import json
import os
import subprocess
import sys
import time
import wave
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[1]
SEG_DIR = REPO / "media" / "segments"
VOICE_DIR = REPO / "media" / "voices"
OUT_DIR = REPO / "web" / "public" / "media"

SAMPLE_RATE = 22050

# One distinct voice per person, gender-matched, so an eight-person call has eight
# identifiable voices rather than one narrator reading every part.
VOICE_MAP = {
    "Priya Raman":      "en_US-amy-medium",
    "Dan Okafor":       "en_US-ryan-medium",
    "Sofia Marchetti":  "en_GB-alba-medium",
    "Marcus Lee":       "en_US-joe-medium",
    "Elena Petrova":    "en_GB-cori-medium",
    "Tom Whitfield":    "en_US-kusal-medium",
    "Aisha Bello":      "en_US-lessac-medium",
    "Ben Nakamura":     "en_US-bryce-medium",
    "Rachel Kim":       "en_GB-jenny_dioco-medium",
    "Dev Patel":        "en_US-norman-medium",
    "Nina Alvarez":     "en_US-hfc_female-medium",
    "Callum Reid":      "en_US-hfc_male-medium",
    "Yuki Tanaka":      "en_US-libritts_r-medium",
}
FALLBACK_VOICES = ["en_US-lessac-medium", "en_US-ryan-medium"]

CALIBRATION_TEXT = (
    "We should probably start with the numbers and then move on to the security "
    "review, because that is the part everyone is waiting to hear about."
)


def ensure_voice(name: str) -> Path | None:
    """Download a voice model if it is not already on disk."""
    onnx = VOICE_DIR / f"{name}.onnx"
    if onnx.exists():
        return onnx
    try:
        subprocess.run(
            [sys.executable, "-m", "piper.download_voices", name, "--data-dir", str(VOICE_DIR)],
            check=True, capture_output=True, timeout=600,
        )
        return onnx if onnx.exists() else None
    except Exception as exc:  # noqa: BLE001
        print(f"    ! could not download {name}: {exc}", file=sys.stderr)
        return None


def resolve_voice(person: str, cache: dict[str, Path]) -> Path:
    want = VOICE_MAP.get(person)
    if want:
        if want in cache:
            return cache[want]
        path = ensure_voice(want)
        if path:
            cache[want] = path
            return path
    for fb in FALLBACK_VOICES:
        if fb in cache:
            return cache[fb]
        path = ensure_voice(fb)
        if path:
            cache[fb] = path
            return path
    raise SystemExit("no usable voice model available")


def load_voice(path: Path):
    from piper import PiperVoice
    return PiperVoice.load(str(path))


def calibrate(voice) -> float:
    """Words per second at length_scale=1.0 for this voice."""
    from piper import SynthesisConfig
    words = len(CALIBRATION_TEXT.split())
    chunks = list(voice.synthesize(CALIBRATION_TEXT, SynthesisConfig(length_scale=1.0)))
    samples = sum(c.audio_int16_array.shape[-1] for c in chunks)
    seconds = samples / SAMPLE_RATE
    return words / seconds if seconds > 0 else 2.5


def synth_segment(voice, text: str, length_scale: float) -> np.ndarray:
    # This piper build's SynthesisConfig takes speaker_id / length_scale /
    # noise_scale / noise_w_scale / normalize_audio / volume - there is no
    # sentence_silence. Multi-speaker models (libritts_r) need a speaker_id.
    from piper import SynthesisConfig
    num_speakers = int(getattr(voice.config, "num_speakers", 0) or 0)
    cfg = SynthesisConfig(length_scale=length_scale, speaker_id=0 if num_speakers > 1 else None)
    parts = [c.audio_int16_array for c in voice.synthesize(text, cfg)]
    if not parts:
        return np.zeros(1, dtype=np.int16)
    audio = np.concatenate(parts).astype(np.float32) / 32768.0
    return audio


def fit_to_slot(audio: np.ndarray, slot_samples: int) -> np.ndarray:
    """Pad with silence or trim so the clip occupies exactly its transcript slot."""
    if slot_samples <= 0:
        return np.zeros(0, dtype=np.float32)
    if len(audio) >= slot_samples:
        # Fade the tail out over 25ms so a trim is not an audible click.
        out = audio[:slot_samples].copy()
        fade = min(int(0.025 * SAMPLE_RATE), len(out))
        if fade:
            out[-fade:] *= np.linspace(1.0, 0.0, fade, dtype=np.float32)
        return out
    return np.concatenate([audio, np.zeros(slot_samples - len(audio), dtype=np.float32)])


def synthesize_meeting(meeting_id: str, voice_cache: dict[str, Path], verbose: bool = True) -> Path | None:
    src = SEG_DIR / f"{meeting_id}.json"
    if not src.exists():
        print(f"  ! no segment dump for {meeting_id} (run npm run build:db)", file=sys.stderr)
        return None

    data = json.loads(src.read_text())
    segments = data["segments"]
    total_ms = data["duration_ms"]
    total_samples = int((total_ms / 1000.0) * SAMPLE_RATE) + SAMPLE_RATE  # 1s tail
    buffer = np.zeros(total_samples, dtype=np.float32)

    # Group by speaker so each model is loaded once, then released.
    by_speaker: dict[str, list[dict]] = {}
    for seg in segments:
        by_speaker.setdefault(seg["speaker"], []).append(seg)

    t0 = time.time()
    done = 0
    for speaker, segs in by_speaker.items():
        vpath = resolve_voice(speaker, voice_cache)
        voice = load_voice(vpath)
        wps = calibrate(voice)
        if verbose:
            print(f"    {speaker:18} -> {vpath.stem:28} ({wps:.2f} words/s, {len(segs)} lines)")

        for seg in segs:
            text = seg["text"].strip()
            if not text or text.startswith("["):
                # [crosstalk] / [inaudible] markers are not spoken.
                done += 1
                continue
            words = len(text.split())
            start = int((seg["start_ms"] / 1000.0) * SAMPLE_RATE)
            end = int((seg["end_ms"] / 1000.0) * SAMPLE_RATE)
            slot = max(1, end - start)
            base = words / wps if wps else words / 2.5
            length_scale = min(1.45, max(0.72, slot / SAMPLE_RATE / base)) if base > 0 else 1.0

            audio = synth_segment(voice, text, length_scale)
            audio = fit_to_slot(audio, slot)

            stop = min(start + len(audio), total_samples)
            n = stop - start
            if n > 0:
                # Mix rather than overwrite: overlapping speech should sound like it.
                buffer[start:stop] += audio[:n] * 0.92
            done += 1

        del voice
        gc.collect()

    # Soft-clip and normalise so mixed crosstalk does not distort.
    #
    # Every step is IN-PLACE. The first version did `np.tanh(buffer * target * 1.05)`,
    # which allocates a second 306 MB float32 array on top of the 306 MB buffer for a
    # 61-minute meeting and died with ArrayMemoryError - after all eight speakers had
    # already been synthesized, i.e. at the most expensive possible moment to fail.
    peak = float(np.max(np.abs(buffer))) or 1.0
    buffer *= (0.89 / max(1.0, peak)) * 1.05
    np.tanh(buffer, out=buffer)
    buffer *= 0.95 * 32767.0
    pcm = buffer.astype(np.int16)
    del buffer
    gc.collect()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    wav_path = OUT_DIR / f"{meeting_id}.wav"
    with wave.open(str(wav_path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        # Chunked: pcm.tobytes() on an hour of audio is another 153 MB copy.
        CH = 2_000_000
        for i in range(0, len(pcm), CH):
            w.writeframes(pcm[i:i + CH].tobytes())
    del pcm
    gc.collect()

    mp3_path = OUT_DIR / f"{meeting_id}.mp3"
    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run(
        [ff, "-y", "-loglevel", "error", "-i", str(wav_path),
         "-codec:a", "libmp3lame", "-b:a", "32k", "-ar", "22050", "-ac", "1", str(mp3_path)],
        check=True, timeout=900,
    )
    wav_path.unlink(missing_ok=True)

    elapsed = time.time() - t0
    audio_min = total_ms / 60000
    size_mb = mp3_path.stat().st_size / (1024 * 1024)
    if verbose:
        print(f"    -> {mp3_path.name}: {audio_min:.1f} min audio, {size_mb:.1f} MB, "
              f"synthesized in {elapsed:.0f}s ({audio_min * 60 / max(elapsed, 1):.1f}x realtime)")
    return mp3_path


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--meeting", action="append", default=[], help="meeting id (repeatable)")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--skip", action="append", default=[])
    ap.add_argument("--quiet", action="store_true")
    ap.add_argument("--only-stale", action="store_true",
                    help="skip meetings whose existing mp3 already matches the transcript duration. "
                         "Makes an interrupted run cheap to resume: one meeting lost, not the whole batch.")
    args = ap.parse_args()

    available = sorted(p.stem for p in SEG_DIR.glob("*.json"))
    if args.all:
        targets = [m for m in available if m not in args.skip]
    elif args.meeting:
        targets = [m for m in args.meeting if m in available]
    else:
        print("nothing to do: pass --meeting <id> or --all", file=sys.stderr)
        sys.exit(2)

    total = 0.0
    voice_cache: dict[str, Path] = {}
    for mid in list(targets):
        if args.only_stale:
            data0 = json.loads((SEG_DIR / f"{mid}.json").read_text())
            mp3 = OUT_DIR / f"{mid}.mp3"
            if mp3.exists():
                import subprocess as _sp
                import imageio_ffmpeg as _iff
                out = _sp.run([_iff.get_ffmpeg_exe(), "-i", str(mp3)], capture_output=True, text=True)
                import re as _re
                m = _re.search(r"Duration: (\d+):(\d+):([\d.]+)", out.stderr)
                if m:
                    secs = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
                    want = data0["duration_ms"] / 1000 + 1.0  # the deliberate 1s tail
                    if abs(secs - want) <= 1.6:
                        print(f"  skip {mid}: audio already matches transcript ({secs/60:.1f}m)")
                        targets.remove(mid)
                        continue
    for mid in targets:
        data = json.loads((SEG_DIR / f"{mid}.json").read_text())
        mins = data["duration_ms"] / 60000
        total += mins
        print(f"\n=== {mid} ({mins:.1f} min, {len(data['segments'])} segments) ===")
        t0 = time.time()
        out = synthesize_meeting(mid, voice_cache, verbose=not args.quiet)
        if out is None:
            continue
        print(f"    elapsed {time.time() - t0:.0f}s")

    print(f"\ndone: {len(targets)} meeting(s), {total:.1f} min of audio -> {OUT_DIR}")
    print("these are committed as Worker static assets; the SPA plays them at /media/<id>.mp3")


if __name__ == "__main__":
    main()
