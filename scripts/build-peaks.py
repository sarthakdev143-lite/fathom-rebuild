#!/usr/bin/env python3
"""Decode each meeting mp3 and emit amplitude peaks for the waveform player.

    python3 scripts/build-peaks.py

720 buckets per meeting (~5s resolution on an hour), max-abs per bucket, quantised
0-100. Committed as web/public/media/peaks/<id>.json (~2 KB each) and rendered as
an SVG the playhead sweeps across. A thin bar says "audio exists"; a waveform says
"somebody spoke here, and here, and went quiet here" - which is information, not
decoration.
"""
import array, json, os, subprocess, sys
import imageio_ffmpeg

HERE = os.path.dirname(os.path.abspath(__file__))
MEDIA = os.path.join(HERE, "..", "web", "public", "media")
OUT = os.path.join(MEDIA, "peaks")
BUCKETS = 720

os.makedirs(OUT, exist_ok=True)
ff = imageio_ffmpeg.get_ffmpeg_exe()

for name in sorted(os.listdir(MEDIA)):
    if not name.endswith(".mp3"):
        continue
    mid = name[:-4]
    proc = subprocess.run(
        [ff, "-v", "error", "-i", os.path.join(MEDIA, name), "-f", "s16le", "-ac", "1", "-ar", "8000", "-"],
        capture_output=True, check=True)
    samples = array.array("h")
    samples.frombytes(proc.stdout)
    n = len(samples)
    if not n:
        continue
    # RMS per bucket, not max-abs. Max-abs over continuous speech saturates: every
    # bucket is loud, so an hour of meeting renders as a solid slab and says nothing.
    # RMS falls to (near) zero in the pauses, which is where the shape of a
    # conversation actually lives - who talked, who stopped, where the gaps are.
    per = max(1, n // BUCKETS)
    raw = []
    for b in range(BUCKETS):
        chunk = samples[b * per:(b + 1) * per]
        if not chunk:
            raw.append(0.0)
            continue
        acc = 0
        for v in chunk:
            acc += v * v
        raw.append((acc / len(chunk)) ** 0.5)
    top = max(raw) or 1.0
    peaks = [min(100, int((v / top) ** 0.62 * 100)) for v in raw]
    sm = [peaks[0]] + [int((peaks[i - 1] + peaks[i] * 2 + peaks[i + 1]) / 4) for i in range(1, BUCKETS - 1)] + [peaks[-1]]
    json.dump(sm, open(os.path.join(OUT, f"{mid}.json"), "w"))
    print(f"  {mid:24} {n/8000/60:6.1f} min decoded -> {len(sm)} peaks, max {max(sm)}")
print("peaks written to web/public/media/peaks/")
