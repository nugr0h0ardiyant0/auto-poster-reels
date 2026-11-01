# /// script
# dependencies = ["numpy", "scipy", "librosa>=0.10", "soundfile"]
# ///
"""Skor horor untuk "Pesan dari Nomor Lama" (3 menit): dengung rendah yang naik-turun per adegan,
derit lemari, getar ponsel, nada sambung, dering teredam dari kolong ranjang, langkah lari, lampu
yang sekarat, lalu hening total sebelum kalimat terakhir.

Semua waktu dicari dari teks kalimat di narasi.json, sama persis dengan film.js (objek T di sana).
60 BPM supaya 1 ketukan = 1 detik. Writes <film>/audio/music.wav and <film>/beats.json.
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
N = int(DUR * SR)
t = tvec(N)
seed(1307)
rng = np.random.default_rng(1307)


def kal(frag):
    for k in nar["kalimat"]:
        if frag in k["teks"]:
            return k
    sys.exit(f"kalimat tidak ada di narasi.json: {frag}")


def at(frag):
    return kal(frag)["mulai"]


def end(frag):
    return kal(frag)["selesai"]


# ---- cues: the same derivations as T in film.js
T_TURN = at("Kamu menoleh ke lemari") - 0.35
T_STARE = at("Celah gelap")
T_TORCH = end("Kamu menyalakan senter") - 0.25
T_STEP = at("Kamu melangkah pelan")
T_OPEN = end("Kamu melangkah pelan") - 0.75
T_CLOSE = at("Kamu menutupnya kembali") + 0.5
T_PHONE2 = at("Kamu menghela napas") - 0.35
T_BUZZ2 = end("Lalu ponselmu bergetar lagi") + 0.1
T_FULL2 = at("Kali ini, kamu yang ada di foto") - 0.25 + 1.3
T_CALL = at("Tanganmu gemetar") - 0.3
T_TONES = [end(f"Nada sambung {w}") + 0.06 for w in ("pertama", "kedua", "ketiga")]
T_HEAR = at("Lalu kamu mendengarnya") - 0.3
T_RING_ON = end("Lalu kamu mendengarnya") + 0.08
T_RUN = at("Kamu berlari keluar kamar") - 0.25
T_FLICKER = at("Lampu di ujungnya berkedip") + 0.4
T_LAMP_OFF = end("lalu padam") - 0.15
T_RING_OFF = at("Dering itu berhenti") - 0.15
T_STOP = T_RING_OFF - 0.2
T_LISTEN = at("Lalu dari kamarmu")
T_DOOR_SHUT = end("Menutup.") + 0.12
T_PHONE3 = T_DOOR_SHUT + 0.55
T_FULL3 = at("Lorong ini") - 0.2 + 1.2
T_PHONE4 = at("Kamu berhenti") - 0.35
HENING = at("Hanya tiga kata") - 0.2                   # music gone: only the air of the house
T_OFF = end("Jangan lihat ke belakang") + 0.9            # screen off, the reflection
FLICK = [(0, 0.12), (0.3, 0.38), (0.7, 1.02), (1.25, 1.3), (1.42, 1.5)]
BUZZ = [(0.0, 0.38), (T_BUZZ2, 0.45), (T_BUZZ2 + 0.55, 0.3), (T_PHONE3, 0.45), (T_PHONE3 + 0.55, 0.3)]


def env(points):
    """Gain curve from [(seconds, value), ...], linear in between (points sorted here)."""
    xs, ys = zip(*sorted(points))
    return np.interp(t, xs, ys)


def drone():
    # D1 + A1 + D2 + Eb2: dark and a little sour. It thickens scene by scene and opens up when the
    # dread peaks (under the bed, the hallway), then drops out entirely before the last line.
    x = np.zeros(N)
    for note, g in (("D1", 1.0), ("A1", 0.55), ("D2", 0.35), ("Eb2", 0.22)):
        f = hz(note)
        for c in (-7, 0, 6):
            x += g * saw(f * 2 ** (c / 1200) * (1 + 0.002 * np.sin(2 * np.pi * 0.07 * t + c)), N, rng.uniform())
    cutoff = env([(0, 90), (T_TURN, 170), (T_OPEN, 300), (T_PHONE2, 150), (T_FULL2, 380), (T_HEAR, 460),
                  (T_RUN, 520), (T_STOP, 240), (T_FULL3, 420), (HENING, 260), (DUR, 120)])
    x = sweep_filter(x, cutoff, "lowpass", 0.9)
    breath = 0.8 + 0.2 * np.sin(2 * np.pi * t / 5.3)
    return x * breath * env([(0, 0.0), (0.4, 0.5), (T_TURN, 0.65), (T_OPEN, 0.85), (T_PHONE2, 0.55),
                             (T_FULL2, 0.9), (T_HEAR, 1.0), (T_STOP, 0.95), (T_STOP + 0.6, 0.35),
                             (T_FULL3, 0.95), (HENING - 0.3, 0.85), (HENING + 0.2, 0.0),
                             (T_OFF, 0.0), (T_OFF + 0.15, 0.8), (DUR, 0.6)])


def sub():
    x = np.sin(2 * np.pi * 36.7 * t) * (0.6 + 0.4 * np.sin(2 * np.pi * t / 7.1))
    return x * env([(0, 0), (1, 0.45), (T_FULL2, 0.75), (T_STOP, 0.75), (T_STOP + 0.5, 0.3), (HENING, 0.0),
                    (T_OFF, 0.0), (T_OFF + 0.1, 0.9), (DUR, 0.5)])


def glass():
    # A high beating tone (two sines 3 Hz apart) while the wardrobe is watched, and again behind you.
    x = np.sin(2 * np.pi * 1760 * t) + np.sin(2 * np.pi * 1763 * t) + 0.5 * np.sin(2 * np.pi * 2490 * t)
    return x * env([(0, 0), (T_TURN, 0), (T_STARE, 0.06), (T_STARE + 3.5, 0.1), (T_TORCH, 0.0),
                    (T_FULL3, 0.0), (T_FULL3 + 2, 0.08), (T_PHONE4, 0.0), (DUR, 0)])


def room_tone():
    n = filt(rng.standard_normal(N), "bandpass", [120, 1800])
    return n * env([(0, 0.05), (T_STOP, 0.05), (T_STOP + 0.5, 0.1), (T_PHONE3, 0.06), (HENING, 0.05),
                    (HENING + 0.4, 0.09), (T_OFF, 0.09), (DUR, 0.05)])


def heartbeat(bus, start, stop, bpm):
    k = start
    while k < stop:
        for off, g in ((0, 1.0), (0.24, 0.7)):
            bus.add(sub_drop(0.35, 70, 38) * g, 0, gain=0.55, at=k + off)
        k += 60 / bpm


def buzz(length):
    """A phone vibrating on wood: a ~170 Hz motor rattling the surface."""
    n = int(length * SR)
    tt = tvec(n)
    motor = np.sign(np.sin(2 * np.pi * 172 * tt)) * 0.5 + np.sin(2 * np.pi * 344 * tt) * 0.3
    rattle = filt(rng.standard_normal(n), "bandpass", [300, 2400]) * (0.5 + 0.5 * np.sin(2 * np.pi * 172 * tt))
    shape = np.clip(tt / 0.02, 0, 1) * np.clip((length - tt) / 0.04, 0, 1)
    return (filt(motor, "lowpass", 1400) + 0.35 * rattle) * shape


def creak(length, f0=190, bright=2600):
    """A wooden hinge: stick-slip pulses whose rate wanders, through the door's resonance."""
    n = int(length * SR)
    tt = tvec(n)
    wander = 1 + 0.35 * np.sin(2 * np.pi * 0.6 * tt + 0.7) + 0.2 * np.sin(2 * np.pi * 1.7 * tt)
    phase = np.cumsum(f0 * wander / SR)
    pulses = (np.diff(np.floor(phase), prepend=0) > 0).astype(float) * (0.5 + 0.5 * rng.random(n))
    x = filt(pulses, "bandpass", [350, bright]) + 0.4 * filt(pulses, "bandpass", [900, 1300])
    return x * np.clip(tt / 0.08, 0, 1) * np.clip((length - tt) / 0.25, 0, 1) * 3.0


def thud(gain=1.0, cutoff=900):
    x = sub_drop(0.5, 110, 45) + 0.5 * filt(rng.standard_normal(int(0.5 * SR)), "lowpass", cutoff) * np.exp(-np.arange(int(0.5 * SR)) / (0.04 * SR))
    return x * gain


def ringback(length=0.9):
    """Indonesian ringback: 425 Hz through a telephone band."""
    n = int(length * SR)
    tt = tvec(n)
    x = np.sin(2 * np.pi * 425 * tt) + 0.25 * np.sin(2 * np.pi * 850 * tt)
    return filt(x, "bandpass", [300, 3400]) * np.clip(tt / 0.02, 0, 1) * np.clip((length - tt) / 0.03, 0, 1)


def ringtone(start, stop):
    """A cheerful marimba ringtone, muffled by the mattress: the worst sound in the house."""
    n = int((stop - start) * SR)
    x = np.zeros(n)
    notes = ["E6", "B5", "E6", "G6", "F#6", "E6"]
    k = 0.0
    while k < stop - start:
        for j, note in enumerate(notes):
            s = int((k + j * 0.16) * SR)
            if s >= n:
                break
            m = min(int(0.4 * SR), n - s)
            tt = tvec(m)
            f = hz(note)
            x[s:s + m] += (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * 4 * f * tt)) * np.exp(-tt / 0.09)
        k += 1.6
    x *= np.clip(np.arange(n) / (0.02 * SR), 0, 1) * np.clip((n - np.arange(n)) / (0.01 * SR), 0, 1)
    return filt(x, "lowpass", 1300) * 0.5


def lamp_hum():
    on = np.zeros(N)
    on[t < T_FLICKER] = 0.25
    for a, b in FLICK:
        on[(t >= T_FLICKER + a) & (t < T_FLICKER + b) & (t < T_LAMP_OFF)] = 1.0
    on[(t < T_RUN) | (t >= T_LAMP_OFF)] = 0.0
    hum = np.sign(np.sin(2 * np.pi * 100 * t)) * 0.3 + np.sin(2 * np.pi * 200 * t) * 0.2
    return filt(hum, "bandpass", [90, 2500]) * filt(on, "lowpass", 60) * 0.12


def main():
    bus = Bus(DUR, BPM)
    bus.add(np.stack([drone(), drone()]) * 0.32, 0)
    bus.add(sub() * 0.35, 0)
    bus.add(glass(), 0, pan=0.0)
    bus.add(room_tone(), 0)
    bus.add(lamp_hum(), 0, pan=0.15)
    heartbeat(bus, T_FULL2, T_CALL, 64)                  # under the bed, in the photo
    heartbeat(bus, T_HEAR + 1.0, T_RUN, 76)              # the ringing under the bed
    heartbeat(bus, T_STOP + 0.4, T_PHONE3 + 1.0, 58)     # the silent house, slowing, listening
    for start, length in BUZZ:
        bus.add(buzz(length), 0, gain=0.42, at=start)
    # the wardrobe: door opens, swings shut; later, from the bedroom, it creaks and closes by itself
    bus.add(creak(1.3, 170), 0, gain=0.22, at=T_OPEN - 0.1, pan=0.1)
    bus.add(creak(0.9, 230), 0, gain=0.2, at=T_CLOSE, pan=0.1)
    bus.add(thud(0.5, 1400), 0, gain=0.35, at=T_CLOSE + 0.85)
    bus.add(filt(creak(1.6, 140, 1600), "lowpass", 1100), 0, gain=0.16, at=end("terdengar pintu lemari") + 0.15, pan=-0.3)
    bus.add(thud(0.7, 500), 0, gain=0.4, at=T_DOOR_SHUT, pan=-0.3)
    # the call: ringback after each "Nada sambung ...", then the muffled ringtone under the bed
    for tone in T_TONES:
        bus.add(ringback(), 0, gain=0.16, at=tone)
    bus.add(ringtone(T_RING_ON, T_RING_OFF), 0, gain=0.5, at=T_RING_ON, pan=0.2)
    # running down the hallway: footsteps that slow to a stop
    k, step = T_RUN + 0.15, 0
    while k < T_STOP:
        bus.add(thud(0.6, 700), 0, gain=0.3, at=k, pan=-0.2 if step % 2 else 0.2)
        k += 0.3 + 0.25 * max(0.0, (k - (T_STOP - 1.5)) / 1.5)
        step += 1
    # the lamp dying: a pop when it goes
    bus.add(thud(0.4, 3000), 0, gain=0.2, at=T_LAMP_OFF)
    # breath in, rising to the last line; then the low blow when the reflection shows
    bus.add(whoosh(1.4, 300, 2600, peak=0.92) * 0.16, 0, at=T_OFF - 1.3)
    bus.add(sub_drop(2.2, 64, 26), 0, gain=0.9, at=T_OFF)

    x = bus.x[:, :N]
    x = reverb(x, wet=0.35, length=3.0, decay=1.1)
    x = x / (np.abs(x).max() + 1e-9) * 0.6
    x = limit(x, -3.0)
    sf.write(HERE / "music.wav", x.T, SR, subtype="PCM_24")

    period = 60 / BPM
    grid = {"bpm": BPM, "period": period, "offset": 0.0,
            "beats": [round(i * period, 4) for i in range(int(DUR / period) + 1)],
            "sections": [{"name": "ponsel", "beat": 0}, {"name": "lemari", "beat": T_TURN},
                         {"name": "kolong", "beat": T_FULL2}, {"name": "lorong", "beat": T_RUN},
                         {"name": "pesan", "beat": T_PHONE4}, {"name": "pantulan", "beat": T_OFF}]}
    (FILM / "beats.json").write_text(json.dumps(grid, indent=1))
    print(f"music.wav {DUR:.1f} s, hening dari {HENING:.2f} s, pantulan {T_OFF:.2f} s")


if __name__ == "__main__":
    main()
