/*
 * TON 618 — shot list, camera choreography and caption cues.
 * Time is in seconds of film time.  Distances are in Schwarzschild radii
 * (1 Rs of TON 618 ≈ 803 AU for M = 4.07e10 solar masses).
 */
(function () {
  const BH = (window.BH = window.BH || {});

  const RS_AU = 803.49;           // Schwarzschild radius of TON 618 in AU
  BH.RS_AU = RS_AU;
  BH.DURATION = 87.0;

  const D2R = Math.PI / 180;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  BH.smooth = smooth;
  BH.clamp = clamp;

  // Cubic Hermite through keyframes with Catmull-Rom style tangents.
  // keys: [{t, ...props}], `flat` on a key forces a zero tangent (hold/ease).
  function track(keys, t, prop) {
    const n = keys.length;
    if (t <= keys[0].t) return keys[0][prop];
    if (t >= keys[n - 1].t) return keys[n - 1][prop];
    let k = 0;
    while (k < n - 2 && t > keys[k + 1].t) k++;
    const k0 = keys[k], k1 = keys[k + 1];
    const dt = k1.t - k0.t;
    const s = (t - k0.t) / dt;
    const tangent = (i) => {
      const K = keys[i];
      if (K.flat || i === 0 || i === n - 1) return 0;
      const a = keys[i - 1], b = keys[i + 1];
      const m = 0.5 * ((b[prop] - K[prop]) / (b.t - K.t) + (K[prop] - a[prop]) / (K.t - a.t));
      // limit to avoid overshoot (monotone-ish)
      const d0 = (K[prop] - a[prop]) / (K.t - a.t), d1 = (b[prop] - K[prop]) / (b.t - K.t);
      if (d0 * d1 <= 0) return 0;
      const lim = 3 * Math.min(Math.abs(d0), Math.abs(d1));
      return Math.sign(m) * Math.min(Math.abs(m), lim);
    };
    const m0 = tangent(k), m1 = tangent(k + 1);
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * k0[prop] + (s3 - 2 * s2 + s) * dt * m0 +
           (-2 * s3 + 3 * s2) * k1[prop] + (s3 - s2) * dt * m1;
  }

  // Keyframes use: D (distance, interpolated in log space), az/el (deg), roll (deg), fov (deg, log-tan space)
  function prep(keys) {
    return keys.map((k) => Object.assign({}, k, {
      lD: Math.log(k.D),
      lF: Math.log(Math.tan(0.5 * k.fov * D2R)),
      ty: k.ty || 0,
      ex: k.ex === undefined ? 1 : k.ex,
    }));
  }

  const FOV_SOLAR = (() => {
    // Neptune's orbit (60.14 AU across) spans ~46% of the frame height at D = 62 Rs
    const span = 60.14 / RS_AU / 0.46;
    return 2 * Math.atan(span / (2 * 62)) / D2R;
  })();

  const takes = [
    {
      name: 'arrival', start: 0, end: 37.6, fadeIn: [0, 3.2], fadeOut: [36.8, 37.6], timeOffset: 40,
      keys: prep([
        { t: 0.0,  D: 5600, az: 20,  el: 14,  roll: 0,  fov: 26, ex: 1.0 },
        { t: 8.5,  D: 2600, az: 25,  el: 13,  roll: 0,  fov: 27, ex: 1.0 },
        { t: 16.5, D: 105,  az: 46,  el: 11,  roll: -1, fov: 38, ex: 1.0 },
        { t: 21.5, D: 50,   az: 66,  el: 8.5, roll: -3, fov: 42, ex: 1.0 },
        { t: 29.5, D: 41,   az: 110, el: 5.6, roll: -5, fov: 44, ex: 1.0 },
        { t: 37.6, D: 37,   az: 150, el: 3.8, roll: -7, fov: 45, ex: 1.0 },
      ]),
    },
    {
      name: 'scale', start: 38.1, end: 56.2, fadeIn: [38.1, 38.7], fadeOut: [55.5, 56.2], timeOffset: 70,
      keys: prep([
        { t: 38.1, D: 62, az: 164, el: 26,   roll: 0, fov: FOV_SOLAR, flat: true },
        { t: 41.8, D: 62, az: 164.6, el: 25.9, roll: 0, fov: FOV_SOLAR, flat: true },
        { t: 50.0, D: 62, az: 167.5, el: 25.4, roll: 0, fov: 46, ex: 0.8 },
        { t: 56.2, D: 60, az: 171, el: 25,   roll: 0, fov: 47, ex: 0.8 },
      ]),
    },
    {
      name: 'power', start: 56.7, end: BH.DURATION, fadeIn: [56.7, 57.4], fadeOut: [82.6, 84.2], timeOffset: 20,
      keys: prep([
        { t: 56.7, D: 34,  az: 205, el: 36,  roll: 0,  fov: 50, ex: 0.5 },
        { t: 62.5, D: 22,  az: 238, el: 17,  roll: 5,  fov: 54, ex: 0.4 },
        { t: 68.0, D: 17.5, az: 268, el: 9.5, roll: 10, fov: 58, ex: 0.33 },
        { t: 72.0, D: 17,  az: 288, el: 8.8, roll: 11, fov: 58, ex: 0.36, ty: 0 },
        { t: 78.0, D: 44,  az: 320, el: 9.5, roll: 2,  fov: 46, ex: 0.8, ty: -5.5 },
        { t: 84.2, D: 76,  az: 336, el: 10.5, roll: 0, fov: 40, ex: 0.9, ty: -9 },
      ]),
    },
  ];
  BH.takes = takes;

  // Caption cues — drawn by overlay.js
  BH.cues = [
    { type: 'center', t0: 1.4, t1: 6.6, lines: ['10.8 BILLION LIGHT-YEARS AWAY', 'in the constellation Canes Venatici'] },
    { type: 'center', t0: 7.2, t1: 12.2, lines: ['A SINGLE POINT OF LIGHT', 'outshines every star in its galaxy combined'] },
    { type: 'title', t0: 13.2, t1: 21.6, title: 'TON 618', sub: 'AN ULTRAMASSIVE BLACK HOLE' },
    { type: 'info', t0: 23.0, t1: 29.6, label: 'MASS', value: '40.7 billion Suns',
      desc: 'One of the most massive black holes ever measured.' },
    { type: 'info', t0: 30.3, t1: 36.6, label: 'VS. THE MILKY WAY’S BLACK HOLE', value: '≈ 10,000× heavier',
      desc: 'Sagittarius A*, at the heart of our galaxy, has “only” 4.3 million solar masses.' },
    { type: 'scale', t0: 38.4, t1: 55.8 },
    { type: 'info', t0: 49.6, t1: 55.6, label: 'EVENT HORIZON', value: '1,600 AU across',
      desc: '27× wider than Neptune’s orbit. Light itself would need more than nine days to cross it.' },
    { type: 'info', t0: 58.2, t1: 64.4, label: 'LUMINOSITY', value: '140 trillion Suns',
      desc: 'As a quasar, it outshines entire galaxies — one of the brightest objects in the universe.' },
    { type: 'info', t0: 65.2, t1: 71.6, label: 'ACCRETION DISK', value: 'Half the speed of light',
      desc: 'At its inner edge, superheated gas whirls around the black hole at roughly 0.5 c.' },
    { type: 'final', t0: 74.6, t1: 83.0, title: 'TON 618',
      sub: '40.7 BILLION SOLAR MASSES  ·  10.8 BILLION LIGHT-YEARS AWAY' },
    { type: 'credit', t0: 84.4, t1: 87.0, lines: ['General-relativistic ray tracing  ·  Schwarzschild metric',
      'Doppler beaming, gravitational redshift and gravitational lensing computed per pixel'] },
  ];

  function lookRot(pos, target, rollDeg) {
    const f = norm(sub(target, pos));
    let r = norm(cross(f, [0, 1, 0]));
    let u = cross(r, f);
    const c = Math.cos(rollDeg * D2R), s = Math.sin(rollDeg * D2R);
    const r2 = [r[0] * c + u[0] * s, r[1] * c + u[1] * s, r[2] * c + u[2] * s];
    const u2 = [u[0] * c - r[0] * s, u[1] * c - r[1] * s, u[2] * c - r[2] * s];
    return { right: r2, up: u2, fwd: f };
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  BH.frameState = function (t, aspect) {
    let take = takes[takes.length - 1];
    for (const tk of takes) { if (t < tk.end) { take = tk; break; } }
    const K = take.keys;
    const D = Math.exp(track(K, t, 'lD'));
    const az = track(K, t, 'az') * D2R;
    const el = track(K, t, 'el') * D2R;
    const roll = track(K, t, 'roll');
    const tanHalf = Math.exp(track(K, t, 'lF')) * (16 / 9) / (aspect || 16 / 9);   // keep the 16:9-designed horizontal framing
    const ex = track(K, t, 'ex');
    const ty = track(K, t, 'ty');

    // subtle hand-held drift (very low amplitude, smooth)
    const shake = (a, f) => a * (Math.sin(t * f) * 0.6 + Math.sin(t * f * 2.31 + 1.3) * 0.4);
    const pos = [D * Math.cos(el) * Math.sin(az), D * Math.sin(el), D * Math.cos(el) * Math.cos(az)];
    const target = [0, ty, 0];
    const rot = lookRot(pos, target, roll + shake(0.25, 0.37));

    let fade = 1;
    if (t < take.start || t > take.end) fade = 0;
    else fade = smooth(take.fadeIn[0], take.fadeIn[1], t) * (1 - smooth(take.fadeOut[0], take.fadeOut[1], t));
    if (take.fadeIn[0] === 0) fade = Math.pow(smooth(0, take.fadeIn[1], t), 1.5) * (1 - smooth(take.fadeOut[0], take.fadeOut[1], t));
    if (t >= takes[takes.length - 1].fadeOut[1]) fade = 0;

    // exposure: compensate for the quasar being a point source in the deep-field opening
    const farBoost = 1 + 0.6 * smooth(400, 3000, D);
    return {
      t, take: take.name, pos, rot, tanHalf, D, az, el,
      fade,
      exposure: 0.95 * ex * farBoost,
      diskTime: (t - take.start + take.timeOffset) * 3.0,
      jetTime: t,
      glare: 2.2 * smooth(260, 1800, D),
      glarePos: [0.5, 0.5],
      bloom: 0.055 + 0.03 * smooth(18, 45, D) + 0.06 * smooth(300, 3000, D),
      streak: 0.035 + 0.05 * smooth(300, 3000, D),
    };
  };

  // Project a world point to pixel coordinates (top-left origin) for the overlay
  BH.project = function (st, p, W, H) {
    const d = sub(p, st.pos);
    const z = dot(d, st.rot.fwd);
    if (z <= 1e-6) return null;
    const x = dot(d, st.rot.right) / (z * st.tanHalf);
    const y = dot(d, st.rot.up) / (z * st.tanHalf);
    return { x: W * 0.5 + x * H * 0.5, y: H * 0.5 - y * H * 0.5, z };
  };
})();
