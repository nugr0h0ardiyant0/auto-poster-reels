# /// script
# dependencies = ["numpy", "scipy", "librosa>=0.10", "soundfile"]
# ///
"""Skor horor untuk "Pesan dari Nomor Lama": dengung rendah yang makin tebal, detak jantung di
scene lemari, getar ponsel di sela narasi, lalu hening total sebelum kalimat terakhir.

60 BPM supaya 1 ketukan = 1 detik dan waktu di film.js sama dengan detik narasi (narasi.json).
Writes <film>/audio/music.wav and <film>/beats.json. Narasi (vo.wav) dibuat tools/buat_reel.py.
"""
import json
import os
import sys
from pathlib import Path

import numpy as np
import soundfile as sf


def _skill_dir():
    if os.environ.get("MOTION_REEL_SKILL"):
        return Path(os.environ["MOTION_REEL_SKILL"])
    found = sorted((Path(os.environ.get("APPDATA", "")) / "Claude").glob("**/skills/motion-reel/scripts/dsp.py"))
    if found:
        return found[0].parent.parent
    sys.exit("set MOTION_REEL_SKILL to the motion-reel skill folder")


sys.path.insert(0, str(_skill_dir() / "scripts"))
from dsp import SR, Bus, filt, hz, limit, reverb, saw, seed, sub_drop, sweep_filter, tvec, whoosh  # noqa: E402

HERE = Path(__file__).resolve().parent
FILM = HERE.parent
cfg = json.loads((FILM / "film.json").read_text(encoding="utf-8"))
nar = json.loads((FILM / "narasi.json").read_text(encoding="utf-8"))
DUR = float(cfg["duration"])
BPM = 60
K = nar["kalimat"]
S2, S3 = nar["scenes"][1]["mulai"], nar["scenes"][2]["mulai"]
HENING = K[-2]["mulai"] - 0.2           # "Hanya tiga kata." : musik hilang, tinggal udara kamar
AKHIR = K[-1]["selesai"] + 0.9          # layar mati, pantulan, kartu judul
N = int(DUR * SR)
t = tvec(N)
seed(1307)
rng = np.random.default_rng(1307)


def env(points):
    """Kurva gain dari [(detik, nilai), ...], linear di antaranya."""
    xs, ys = zip(*points)
    return np.interp(t, xs, ys)


def drone():
    # D1 + A1 + Eb2 (minor second di atas D): gelap, sedikit sumbang, makin keras di scene 2.
    x = np.zeros(N)
    for note, g in (("D1", 1.0), ("A1", 0.55), ("D2", 0.35), ("Eb2", 0.22)):
        f = hz(note)
        for c in (-7, 0, 6):
            x += g * saw(f * 2 ** (c / 1200) * (1 + 0.002 * np.sin(2 * np.pi * 0.07 * t + c)), N, rng.uniform())
    cutoff = env([(0, 90), (S2, 160), (S3 - 0.5, 420), (HENING, 260), (DUR, 120)])
    x = sweep_filter(x, cutoff, "lowpass", 0.9)
    breath = 0.8 + 0.2 * np.sin(2 * np.pi * t / 5.3)
    return x * breath * env([(0, 0.0), (0.4, 0.55), (S2, 0.7), (S3 - 0.3, 1.0), (HENING - 0.3, 0.9),
                             (HENING + 0.2, 0.0), (AKHIR, 0.0), (AKHIR + 0.15, 0.8), (DUR, 0.6)])


def sub():
    x = np.sin(2 * np.pi * 36.7 * t) * (0.6 + 0.4 * np.sin(2 * np.pi * t / 7.1))
    return x * env([(0, 0), (1, 0.5), (S3, 0.7), (HENING, 0.0), (AKHIR, 0.0), (AKHIR + 0.1, 0.9), (DUR, 0.5)])


def glass():
    # Nada tinggi yang berdenyut (dua sinus berselisih 3 Hz), hanya di scene lemari.
    x = np.sin(2 * np.pi * 1760 * t) + np.sin(2 * np.pi * 1763 * t) + 0.5 * np.sin(2 * np.pi * 2490 * t)
    return x * env([(0, 0), (S2, 0), (S2 + 2.5, 0.05), (S3 - 0.4, 0.09), (S3, 0.0), (DUR, 0)])


def room_tone():
    n = filt(rng.standard_normal(N), "bandpass", [120, 1800])
    return n * env([(0, 0.05), (HENING, 0.05), (HENING + 0.4, 0.09), (AKHIR, 0.09), (DUR, 0.05)])


def heartbeat(bus):
    beat = 60 / 64
    k = K[5]["mulai"] - 0.6                 # "Dari dalam lemari..." sampai pindah ke ponsel
    while k < S3 - 0.8:
        for off, g in ((0, 1.0), (0.24, 0.7)):
            bus.add(sub_drop(0.35, 70, 38) * g, 0, gain=0.55, at=k + off)
        k += beat


def buzz(start, length):
    """Getar ponsel di atas meja: motor ~170 Hz yang bergetar pada kayu."""
    n = int(length * SR)
    tt = tvec(n)
    motor = np.sign(np.sin(2 * np.pi * 172 * tt)) * 0.5 + np.sin(2 * np.pi * 344 * tt) * 0.3
    rattle = filt(rng.standard_normal(n), "bandpass", [300, 2400]) * (0.5 + 0.5 * np.sin(2 * np.pi * 172 * tt))
    shape = np.clip(tt / 0.02, 0, 1) * np.clip((length - tt) / 0.04, 0, 1)
    return (filt(motor, "lowpass", 1400) + 0.35 * rattle) * shape, start


def main():
    bus = Bus(DUR, BPM)
    bus.add(np.stack([drone(), drone()]) * 0.32, 0)
    bus.add(sub() * 0.35, 0)
    bus.add(glass(), 0, pan=0.0)
    bus.add(room_tone(), 0)
    heartbeat(bus)
    # Getar di detik pertama (pesan masuk), lalu di sela kalimat "Lalu ponselmu bergetar lagi." (sebelum dan sesudahnya), supaya tidak tertutup
    # ducking di bawah suara narasi.
    for start, length in ((0.0, 0.38), (S3 - 0.95, 0.42), (S3 - 0.45, 0.32), (K[6]["selesai"] + 0.12, 0.45), (K[6]["selesai"] + 0.65, 0.3)):
        sig, at = buzz(start, length)
        bus.add(sig, 0, gain=0.42, at=at)
    # Tarikan napas: desis yang naik ke kalimat terakhir, lalu pukulan rendah saat pantulan muncul.
    bus.add(whoosh(1.4, 300, 2600, peak=0.92) * 0.16, 0, at=AKHIR - 1.3)
    bus.add(sub_drop(2.2, 64, 26), 0, gain=0.9, at=AKHIR)

    x = bus.x[:, :N]
    x = reverb(x, wet=0.35, length=3.0, decay=1.1)
    x = x / (np.abs(x).max() + 1e-9) * 0.6
    x = limit(x, -3.0)
    sf.write(HERE / "music.wav", x.T, SR, subtype="PCM_24")

    period = 60 / BPM
    grid = {"bpm": BPM, "period": period, "offset": 0.0,
            "beats": [round(i * period, 4) for i in range(int(DUR / period) + 1)],
            "sections": [{"name": "ponsel", "beat": 0}, {"name": "lemari", "beat": S2},
                         {"name": "pesan", "beat": S3}, {"name": "pantulan", "beat": AKHIR}]}
    (FILM / "beats.json").write_text(json.dumps(grid, indent=1))
    print(f"music.wav {DUR:.1f} s, hening dari {HENING:.2f} s, pantulan {AKHIR:.2f} s")


if __name__ == "__main__":
    main()
