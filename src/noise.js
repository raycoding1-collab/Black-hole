/*
 * Procedural lookup data generated at start-up:
 *  - a tileable 128^3 RGBA8 gradient-noise volume (4 independent octaves/styles)
 *  - a blackbody colour LUT (Planck spectrum integrated against CIE 1931 CMFs)
 */
(function () {
  const BH = (window.BH = window.BH || {});

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Tileable 3D Perlin gradient noise sampled on a res^3 grid with `period` lattice cells.
  function perlinVolume(res, period, seed, out, channel, ridged) {
    const rnd = mulberry32(seed);
    const n = period * period * period;
    const gx = new Float32Array(n), gy = new Float32Array(n), gz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let x, y, z, l;
      do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 1e-4);
      l = 1 / Math.sqrt(l); gx[i] = x * l; gy[i] = y * l; gz[i] = z * l;
    }
    const cell = res / period;
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const P = period;
    // precompute per-axis lattice indices and fractional parts
    const i0 = new Int32Array(res), i1 = new Int32Array(res), fr = new Float32Array(res), fd = new Float32Array(res);
    for (let k = 0; k < res; k++) {
      const f = k / cell; const ii = Math.floor(f);
      i0[k] = ii % P; i1[k] = (ii + 1) % P; fr[k] = f - ii; fd[k] = fade(f - ii);
    }
    let idx = channel;
    for (let z = 0; z < res; z++) {
      const z0 = i0[z] * P * P, z1 = i1[z] * P * P, tz = fr[z], wz = fd[z];
      for (let y = 0; y < res; y++) {
        const y0 = i0[y] * P, y1 = i1[y] * P, ty = fr[y], wy = fd[y];
        for (let x = 0; x < res; x++) {
          const x0 = i0[x], x1 = i1[x], tx = fr[x], wx = fd[x];
          let a, b, c, d, e, f, g, h, q;
          q = z0 + y0 + x0; a = gx[q] * tx + gy[q] * ty + gz[q] * tz;
          q = z0 + y0 + x1; b = gx[q] * (tx - 1) + gy[q] * ty + gz[q] * tz;
          q = z0 + y1 + x0; c = gx[q] * tx + gy[q] * (ty - 1) + gz[q] * tz;
          q = z0 + y1 + x1; d = gx[q] * (tx - 1) + gy[q] * (ty - 1) + gz[q] * tz;
          q = z1 + y0 + x0; e = gx[q] * tx + gy[q] * ty + gz[q] * (tz - 1);
          q = z1 + y0 + x1; f = gx[q] * (tx - 1) + gy[q] * ty + gz[q] * (tz - 1);
          q = z1 + y1 + x0; g = gx[q] * tx + gy[q] * (ty - 1) + gz[q] * (tz - 1);
          q = z1 + y1 + x1; h = gx[q] * (tx - 1) + gy[q] * (ty - 1) + gz[q] * (tz - 1);
          const ab = a + (b - a) * wx, cd = c + (d - c) * wx, ef = e + (f - e) * wx, gh = g + (h - g) * wx;
          const v = (ab + (cd - ab) * wy) + ((ef + (gh - ef) * wy) - (ab + (cd - ab) * wy)) * wz;
          let o = ridged ? 1 - Math.min(1, Math.abs(v) * 2.2) : 0.5 + v * 0.78;
          if (ridged) o = o * o;
          out[idx] = Math.max(0, Math.min(255, Math.round(o * 255)));
          idx += 4;
        }
      }
    }
  }

  BH.makeNoiseVolume = function (res) {
    res = res || 128;
    const data = new Uint8Array(res * res * res * 4);
    perlinVolume(res, 4, 1337, data, 0, false);
    perlinVolume(res, 8, 4242, data, 1, false);
    perlinVolume(res, 16, 777, data, 2, false);
    perlinVolume(res, 16, 9001, data, 3, true);
    return { res, data };
  };

  // --- Blackbody LUT -----------------------------------------------------
  function g(l, mu, s1, s2) { const t = (l - mu) / (l < mu ? s1 : s2); return Math.exp(-0.5 * t * t); }
  function cmf(l) {
    return [
      1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2),
      0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1),
      1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8),
    ];
  }
  BH.makeBlackbodyLUT = function (n) {
    n = n || 256;
    const out = new Float32Array(n * 4);
    const Tmin = 800, Tmax = 40000;
    for (let i = 0; i < n; i++) {
      const T = Tmin * Math.pow(Tmax / Tmin, i / (n - 1));
      let X = 0, Y = 0, Z = 0;
      for (let l = 380; l <= 780; l += 2) {
        const lm = l * 1e-9;
        const B = 1 / (Math.pow(lm, 5) * (Math.exp(1.4387769e-2 / (lm * T)) - 1));
        const c = cmf(l);
        X += B * c[0]; Y += B * c[1]; Z += B * c[2];
      }
      X /= Y; Z /= Y; Y = 1;
      let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
      let gg = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
      let b = 0.0557 * X - 0.204 * Y + 1.057 * Z;
      r = Math.max(r, 0); gg = Math.max(gg, 0); b = Math.max(b, 0);
      const L = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      out[i * 4] = r / L; out[i * 4 + 1] = gg / L; out[i * 4 + 2] = b / L; out[i * 4 + 3] = 1;
    }
    return out;
  };
})();
