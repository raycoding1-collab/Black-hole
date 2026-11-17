#!/usr/bin/env python3
"""
TON 618 — original score, synthesised from scratch with numpy and synced to the
picture timeline (src/timeline.js).  Writes raw float32 stereo at 48 kHz.

  python3 audio/score.py out.f32
  ffmpeg -f f32le -ar 48000 -ac 2 -i out.f32 score.wav
"""
import sys
import numpy as np

SR = 48000
DUR = 87.0
N = int(SR * DUR)
T = np.arange(N, dtype=np.float64) / SR
rng = np.random.default_rng(618)


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env_pts(points):
    """Piecewise-linear envelope from [(t, value), ...] over the whole timeline."""
    ts, vs = zip(*points)
    return np.interp(T, ts, vs)


def adsr(n0, n1, att, rel, curve=2.0):
    """Envelope (full length) for a note sounding between sample n0 and n1."""
    e = np.zeros(N)
    a = int(att * SR); r = int(rel * SR)
    n1r = min(N, n1 + r)
    idx = np.arange(n0, n1r)
    x = (idx - n0) / max(a, 1)
    rise = np.clip(x, 0, 1) ** curve
    fall = np.where(idx > n1, np.clip(1 - (idx - n1) / max(r, 1), 0, 1) ** 2, 1.0)
    e[n0:n1r] = rise * fall
    return e


def stft_filter(x, cutoff_fn, kind='low', block=4096):
    """Time-varying FFT filter (Hann overlap-add). cutoff_fn(t)->Hz (or (lo,hi) for band)."""
    hop = block // 2
    win = np.hanning(block + 1)[:-1]
    out = np.zeros(len(x) + block)
    xp = np.concatenate([x, np.zeros(block)])
    freqs = np.fft.rfftfreq(block, 1 / SR)
    for s in range(0, len(x), hop):
        seg = xp[s:s + block] * win
        X = np.fft.rfft(seg)
        c = cutoff_fn((s + hop) / SR)
        if kind == 'low':
            m = 1 / (1 + (freqs / max(c, 1)) ** 4)
        elif kind == 'high':
            m = 1 / (1 + (max(c, 1) / np.maximum(freqs, 1)) ** 4)
        else:
            lo, hi = c
            m = 1 / (1 + (lo / np.maximum(freqs, 1)) ** 4) / (1 + (freqs / hi) ** 4)
        out[s:s + block] += np.fft.irfft(X * m, block)
    return out[:len(x)]


def fft_conv(x, h):
    n = len(x) + len(h) - 1
    nf = 1 << (n - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, nf) * np.fft.rfft(h, nf), nf)[:len(x)]
    return y


def reverb_ir(seconds, decay, seed, bright=6000.0):
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = r.standard_normal(n) * np.exp(-t / decay)
    # darken the tail: progressively low-passed
    ir = stft_filter_short(ir, lambda tt: bright * np.exp(-tt / (decay * 1.2)) + 500)
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    return ir / np.sqrt(np.sum(ir ** 2))


def stft_filter_short(x, fn, block=2048):
    hop = block // 2
    win = np.hanning(block + 1)[:-1]
    out = np.zeros(len(x) + block)
    xp = np.concatenate([x, np.zeros(block)])
    freqs = np.fft.rfftfreq(block, 1 / SR)
    for s in range(0, len(x), hop):
        X = np.fft.rfft(xp[s:s + block] * win)
        c = fn((s + hop) / SR)
        out[s:s + block] += np.fft.irfft(X / (1 + (freqs / c) ** 2), block)
    return out[:len(x)]


# ---------------------------------------------------------------- voices
def organ_pad(chords, att=2.8, rel=4.0, detune_cents=7.0, harmonics=((1, 1.0), (2, 0.55), (3, 0.28), (4, 0.22), (6, 0.1), (8, 0.06))):
    L = np.zeros(N); R = np.zeros(N)
    for (t0, t1, notes, amp) in chords:
        n0, n1 = int(t0 * SR), int(t1 * SR)
        e = adsr(n0, n1, att, rel)
        nz = np.nonzero(e)[0]
        if len(nz) == 0:
            continue
        a, b = nz[0], nz[-1] + 1
        tt = T[a:b]
        for k, m in enumerate(notes):
            f = midi(m)
            pan = 0.5 + 0.35 * np.sin(k * 2.1 + m)
            v = np.zeros(b - a)
            for d in (-detune_cents, 0.0, detune_cents):
                fd = f * 2 ** (d / 1200)
                ph = rng.uniform(0, 2 * np.pi)
                for h, w in harmonics:
                    if fd * h > 9000:
                        continue
                    v += w * np.sin(2 * np.pi * fd * h * tt + ph * h)
            # slow breathing
            v *= 1 + 0.12 * np.sin(2 * np.pi * (0.11 + 0.03 * k) * tt + k)
            v *= e[a:b] * amp / (len(notes) ** 0.5) / 3.0
            L[a:b] += v * np.sqrt(1 - pan); R[a:b] += v * np.sqrt(pan)
    return L, R


def bell(t0, m, amp, dur=5.0, pan=0.5):
    """FM bell (glassy) note."""
    L = np.zeros(N); R = np.zeros(N)
    n0 = int(t0 * SR); n1 = min(N, n0 + int(dur * SR))
    tt = T[n0:n1] - t0
    f = midi(m)
    I = 2.2 * np.exp(-tt / 0.9)
    v = np.sin(2 * np.pi * f * tt + I * np.sin(2 * np.pi * f * 3.5 * tt)) * np.exp(-tt / 1.6)
    v += 0.35 * np.sin(2 * np.pi * f * 2.01 * tt) * np.exp(-tt / 0.7)
    v *= amp * np.clip(tt / 0.004, 0, 1)
    L[n0:n1] += v * np.sqrt(1 - pan); R[n0:n1] += v * np.sqrt(pan)
    return L, R


def boom(t0, amp, f_end=29.0, f_start=78.0, decay=3.2):
    out = np.zeros(N)
    n0 = int(t0 * SR); n1 = min(N, n0 + int(9 * SR))
    tt = T[n0:n1] - t0
    f = f_end + (f_start - f_end) * np.exp(-tt / 0.12)
    ph = 2 * np.pi * np.cumsum(f) / SR
    v = np.sin(ph) * np.exp(-tt / decay) * np.clip(tt / 0.003, 0, 1)
    nb = rng.standard_normal(n1 - n0) * np.exp(-tt / 0.35) * 0.5
    v = np.tanh(1.6 * (v + 0.25 * stft_filter_short(nb, lambda _: 180.0)))
    out[n0:n1] = v * amp
    return out


def riser(t0, t1, amp, f0=200.0, f1=7000.0, seed=1):
    """Filtered-noise swell that ends abruptly at t1."""
    r = np.random.default_rng(seed)
    out = np.zeros(N)
    n0, n1 = int(t0 * SR), int(t1 * SR)
    x = r.standard_normal(n1 - n0)
    def band(tt):
        p = np.clip(tt / (t1 - t0), 0, 1)
        c = f0 * (f1 / f0) ** (p ** 1.5)
        return (c * 0.5, c * 1.6)
    y = stft_filter(x, band, kind='band', block=2048)
    p = np.linspace(0, 1, n1 - n0)
    out[n0:n1] = y * (p ** 2.5) * amp
    out[n1 - 200:n1] *= np.linspace(1, 0, 200)
    return out


def whoosh(t0, t1, amp, seed=3, f0=120.0, f1=2600.0):
    r = np.random.default_rng(seed)
    out = np.zeros(N)
    n0, n1 = int(t0 * SR), int(t1 * SR)
    x = r.standard_normal(n1 - n0)
    def band(tt):
        p = np.clip(tt / (t1 - t0), 0, 1)
        s = np.sin(np.pi * p)
        c = f0 * (f1 / f0) ** s
        return (c * 0.4, c * 2.2)
    y = stft_filter(x, band, kind='band', block=2048)
    p = np.linspace(0, 1, n1 - n0)
    out[n0:n1] = y * np.sin(np.pi * p) ** 1.5 * amp
    return out


# ================================================================ composition
D2, F2, A2 = 38, 41, 45
mixL = np.zeros(N); mixR = np.zeros(N)
revL = np.zeros(N); revR = np.zeros(N)       # reverb sends


def add(L, R, g=1.0, send=0.35):
    global mixL, mixR, revL, revR
    mixL += L * g; mixR += R * g
    revL += L * g * send; revR += R * g * send


# --- sub drone across the whole piece, following the picture's intensity
drone_env = env_pts([(0, 0), (4, 0.5), (12, 0.75), (13.2, 1.0), (37, 0.9), (37.8, 0.15), (38.4, 0.5), (49.5, 0.9),
                     (56.2, 0.4), (57, 0.8), (74, 1.0), (82, 0.9), (84.5, 0.2), (87, 0)])
sub = (np.sin(2 * np.pi * midi(26) * T) * 0.55 + np.sin(2 * np.pi * midi(33) * T + 1.0) * 0.3 +
       np.sin(2 * np.pi * midi(38) * T * 1.001) * 0.18)
sub *= (1 + 0.15 * np.sin(2 * np.pi * 0.07 * T)) * drone_env * 0.32
add(sub, sub, 1.0, 0.05)

# --- deep-space texture: dark filtered noise + high shimmer partials
air = rng.standard_normal(N)
air = stft_filter(air, lambda t: (300.0 + 200 * np.sin(t * 0.1), 1400.0 + 600 * np.sin(t * 0.07)), kind='band', block=4096)
air *= env_pts([(0, 0), (3, 0.6), (13, 0.8), (37, 0.6), (38.5, 0.9), (56, 0.4), (60, 0.8), (84, 0.6), (87, 0)]) * 0.05
airR = np.roll(air, 1733)
add(air, airR, 1.0, 0.6)

shim_env = env_pts([(0, 0), (5, 0.6), (12, 0.8), (13.2, 0.2), (20, 0.5), (37, 0.4), (38.4, 1.0), (44, 0.9), (50, 0.2),
                    (56, 0.3), (74.6, 0.2), (78, 0.7), (87, 0)])
sh = np.zeros(N)
for k, m in enumerate([86, 93, 98, 100, 105]):
    lfo = 0.5 + 0.5 * np.sin(2 * np.pi * (0.05 + 0.031 * k) * T + k * 1.7)
    sh += np.sin(2 * np.pi * midi(m) * T + k) * lfo ** 3 / (k + 2)
sh *= shim_env * 0.05
add(sh * 0.8, np.roll(sh, 2400), 1.0, 0.9)

# --- main harmonic progression (organ-like pads)
chords = [
    # opening — a single sustained open fifth, growing
    (2.0, 12.6, [D2, A2, 50, 57], 0.55),
    # title & first act: Dm9 – Bbmaj7#11 – Fadd9 – Csus2 – Dm9 – Bb6/9 – Gm9 – Asus4
    (13.2, 19.4, [38, 45, 50, 53, 57, 64], 1.0),
    (19.4, 24.6, [34, 41, 46, 50, 57, 64], 0.95),
    (24.6, 29.6, [41, 48, 53, 57, 67], 0.9),
    (29.6, 33.6, [36, 43, 48, 50, 55, 62], 0.9),
    (33.6, 37.4, [34, 41, 50, 55, 62, 67], 0.85),
    # scale section: suspended pedal, then crescendo Gm9 – Bb – C – D (major reveal)
    (38.4, 42.6, [50, 57, 64], 0.45),
    (42.6, 45.0, [31, 43, 50, 53, 57, 62], 0.7),
    (45.0, 47.2, [34, 46, 50, 53, 58, 65], 0.8),
    (47.2, 49.6, [36, 48, 52, 55, 60, 67], 0.9),
    (49.6, 55.8, [38, 50, 54, 57, 62, 66, 69], 1.0),
    # power: Dm – Bb – F/A – C – Dm – Gm9 – Bb – A7sus4
    (56.8, 59.8, [38, 50, 53, 57, 62], 0.8),
    (59.8, 62.6, [34, 46, 50, 53, 58], 0.85),
    (62.6, 65.3, [33, 45, 48, 53, 57, 60], 0.9),
    (65.3, 68.0, [36, 48, 52, 55, 60, 64], 0.95),
    (68.0, 70.2, [38, 50, 53, 57, 62, 65], 1.0),
    (70.2, 72.4, [31, 43, 50, 53, 58, 62], 1.0),
    (72.4, 74.6, [33, 45, 50, 52, 55, 57, 64], 1.05),
    # finale: D major add9 (resolution) – long sustain
    (74.6, 84.0, [26, 38, 45, 50, 54, 57, 62, 64, 69], 1.25),
    # credits: high open fifth
    (84.0, 86.4, [62, 69, 74], 0.35),
]
pL, pR = organ_pad(chords)
pad_cut = lambda t: float(np.interp(t, [0, 12, 13.2, 37, 38.5, 42.6, 49.6, 56, 57, 74.5, 75, 84, 87],
                                       [500, 900, 3200, 2600, 900, 1100, 4200, 2000, 1400, 4500, 5200, 1800, 1200]))
pL = stft_filter(pL, pad_cut); pR = stft_filter(pR, pad_cut)
add(pL, pR, 0.5, 0.55)

# --- low "string" layer an octave below the pads (thick saw-like stack), only in the big sections
lowchords = [(c[0], c[1], [n - 12 for n in c[2][:2]], c[3]) for c in chords if c[0] >= 13 and c[0] < 84]
lL, lR = organ_pad(lowchords, att=1.5, rel=2.5, detune_cents=11, harmonics=tuple((h, 1.0 / h) for h in range(1, 13)))
lL = stft_filter(lL, lambda t: 380.0); lR = stft_filter(lR, lambda t: 380.0)
add(lL, lR, 0.42, 0.2)

# --- pulsing ostinato through the power section (84 bpm eighths, on D/A)
ost = np.zeros(N)
bpm = 84.0; step = 60 / bpm / 2
seq = [50, 50, 57, 50, 53, 50, 57, 62]
t = 57.4; i = 0
while t < 74.4:
    n0 = int(t * SR); n1 = min(N, n0 + int(0.45 * SR))
    tt = T[n0:n1] - t
    m = seq[i % len(seq)] - 12
    v = np.sign(np.sin(2 * np.pi * midi(m) * tt)) * 0.5 + np.sin(2 * np.pi * midi(m) * tt)
    v *= np.exp(-tt / 0.16) * np.clip(tt / 0.004, 0, 1)
    ost[n0:n1] += v * (0.55 + 0.45 * (t - 57.4) / 17.0)
    t += step; i += 1
ost = stft_filter(ost, lambda tt: float(np.interp(tt, [57, 74.5], [600, 2600])))
add(ost * 0.9, np.roll(ost, 480) * 0.9, 0.18, 0.35)

# --- bells for the Solar System reveal
for (tb, m, a, pn) in [(38.9, 81, 0.5, 0.4), (39.9, 86, 0.4, 0.6), (40.8, 88, 0.35, 0.3), (41.6, 93, 0.3, 0.7),
                       (43.0, 81, 0.25, 0.5), (44.2, 76, 0.2, 0.4)]:
    bL, bR = bell(tb, m, a, pan=pn)
    add(bL, bR, 0.32, 0.8)

# --- percussion / sound design
hits = np.zeros(N)
hits += boom(13.2, 1.0)
hits += boom(49.6, 0.9, decay=3.8)
hits += boom(56.8, 0.55, decay=2.2)
hits += boom(74.6, 1.15, decay=5.0)
hits += riser(10.0, 13.2, 0.25, seed=2)
hits += riser(45.5, 49.6, 0.22, seed=5)
hits += riser(71.0, 74.6, 0.28, seed=7)
add(hits, hits, 0.55, 0.25)

sw = whoosh(8.5, 17.5, 0.16, seed=11) + whoosh(59.5, 68.5, 0.14, seed=12, f0=90, f1=1800) + whoosh(74.8, 82.0, 0.1, seed=13)
add(sw, np.roll(sw, 900), 1.0, 0.5)

# --- reverb (large hall, decorrelated L/R)
print('reverb...', flush=True)
irL = reverb_ir(5.5, 1.7, 101); irR = reverb_ir(5.5, 1.7, 202)
wetL = fft_conv(revL, irL); wetR = fft_conv(revR, irR)
L = mixL + wetL * 0.55
R = mixR + wetR * 0.55

# --- master: gentle glue compression + soft clip, fades
def compress(x, thr=0.35, ratio=2.5, att=0.01, rel=0.25):
    lvl = np.abs(x)
    # envelope follower via block max + smoothing
    blk = 256
    nb = len(x) // blk + 1
    pk = np.array([lvl[i * blk:(i + 1) * blk].max(initial=0) for i in range(nb)])
    sm = np.zeros_like(pk); a = 0.0
    ka = np.exp(-blk / (att * SR)); kr = np.exp(-blk / (rel * SR))
    for i, p in enumerate(pk):
        a = ka * a + (1 - ka) * p if p > a else kr * a + (1 - kr) * p
        sm[i] = a
    g = np.where(sm > thr, (thr + (sm - thr) / ratio) / np.maximum(sm, 1e-9), 1.0)
    gs = np.interp(np.arange(len(x)), np.arange(nb) * blk + blk / 2, g)
    return x * gs

peak = max(np.abs(L).max(), np.abs(R).max())
L /= peak; R /= peak
Lc = compress(L)
Rc = compress(R)
L, R = np.tanh(Lc * 1.25) / np.tanh(1.25), np.tanh(Rc * 1.25) / np.tanh(1.25)
fade = env_pts([(0, 0), (0.8, 1), (85.6, 1), (87, 0)])
L *= fade; R *= fade
pk = max(np.abs(L).max(), np.abs(R).max())
L *= 0.89 / pk; R *= 0.89 / pk
out = np.stack([L, R], axis=1).astype(np.float32)
out.tofile(sys.argv[1] if len(sys.argv) > 1 else 'score.f32')
print('rms dBFS', 20 * np.log10(np.sqrt(np.mean(out ** 2))), 'written', out.shape)
