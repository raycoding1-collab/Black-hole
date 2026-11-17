/*
 * Typography & infographic overlay (Canvas 2D), composited after tone mapping.
 */
(function () {
  const BH = (window.BH = window.BH || {});
  const FONT = "'Inter', 'Inter Display', 'Helvetica Neue', Arial, sans-serif";
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const easeOut = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

  function envelope(t, t0, t1, fin, fout) {
    fin = fin || 0.9; fout = fout || 0.9;
    return smooth(t0, t0 + fin, t) * (1 - smooth(t1 - fout, t1, t));
  }

  function setFont(ctx, weight, px, spacing) {
    ctx.font = `${weight} ${px}px ${FONT}`;
    ctx.letterSpacing = spacing ? `${spacing}px` : '0px';
  }

  // letterSpacing adds trailing space after the last glyph; compensate when centring
  function centerText(ctx, text, x, y, spacing) {
    const w = ctx.measureText(text).width - (spacing || 0);
    ctx.fillText(text, x - w / 2, y);
  }

  function wrap(ctx, text, maxW) {
    const words = text.split(' ');
    const lines = []; let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function glow(ctx, u, a) {
    ctx.shadowColor = `rgba(170,200,255,${0.45 * a})`;
    ctx.shadowBlur = 14 * u;
  }
  function noGlow(ctx) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; }

  function drawCenter(ctx, W, H, u, cue, t) {
    const a = envelope(t, cue.t0, cue.t1, 1.2, 1.1);
    if (a <= 0) return;
    const rise = (1 - easeOut((t - cue.t0) / 1.6)) * 14 * u;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    const y = H * 0.765 + rise;
    const sp1 = 0.42 * 28 * u * (1 + 0.06 * smooth(cue.t0, cue.t1, t));
    setFont(ctx, 300, 28 * u, sp1);
    glow(ctx, u, a);
    ctx.fillStyle = `rgba(236,240,248,${0.95 * a})`;
    centerText(ctx, cue.lines[0], W / 2, y, sp1);
    if (cue.lines[1]) {
      const a2 = a * smooth(cue.t0 + 0.5, cue.t0 + 1.7, t);
      setFont(ctx, 300, 25 * u, 0.04 * 25 * u);
      ctx.fillStyle = `rgba(205,214,230,${0.85 * a2})`;
      centerText(ctx, cue.lines[1], W / 2, y + 46 * u, 0.04 * 25 * u);
    }
    ctx.restore();
  }

  function drawTitle(ctx, W, H, u, cue, t, final) {
    const a = envelope(t, cue.t0, cue.t1, 1.8, 1.4);
    if (a <= 0) return;
    const p = smooth(cue.t0, cue.t1, t);
    ctx.save();
    const size = (final ? 150 : 168) * u;
    const sp = size * (0.36 + 0.1 * p);
    const y = final ? H * 0.74 : H * 0.79;
    setFont(ctx, 200, size, sp);
    ctx.shadowColor = `rgba(255,214,170,${0.5 * a})`;
    ctx.shadowBlur = 40 * u;
    ctx.fillStyle = `rgba(250,248,244,${a})`;
    centerText(ctx, cue.title, W / 2, y, sp);
    noGlow(ctx);
    // subtitle with hairlines
    const a2 = a * smooth(cue.t0 + 0.9, cue.t0 + 2.4, t);
    const ssz = (final ? 19 : 21) * u;
    const ssp = ssz * 0.55;
    setFont(ctx, 400, ssz, ssp);
    ctx.fillStyle = `rgba(226,198,160,${0.92 * a2})`;
    const sy = y + (final ? 70 : 64) * u;
    centerText(ctx, cue.sub, W / 2, sy, ssp);
    const tw = ctx.measureText(cue.sub).width - ssp;
    const lineW = 120 * u * easeOut((t - cue.t0 - 0.9) / 2.0);
    ctx.strokeStyle = `rgba(226,198,160,${0.55 * a2})`;
    ctx.lineWidth = Math.max(1, 1.2 * u);
    ctx.beginPath();
    ctx.moveTo(W / 2 - tw / 2 - 30 * u, sy - ssz * 0.36); ctx.lineTo(W / 2 - tw / 2 - 30 * u - lineW, sy - ssz * 0.36);
    ctx.moveTo(W / 2 + tw / 2 + 30 * u, sy - ssz * 0.36); ctx.lineTo(W / 2 + tw / 2 + 30 * u + lineW, sy - ssz * 0.36);
    ctx.stroke();
    ctx.restore();
  }

  function drawInfo(ctx, W, H, u, cue, t) {
    const a = envelope(t, cue.t0, cue.t1, 1.0, 1.0);
    if (a <= 0) return;
    const x = W * 0.068, y = H * 0.70;
    const slide = (1 - easeOut((t - cue.t0) / 1.4)) * 26 * u;
    ctx.save();
    // soft scrim for legibility over bright plasma
    const sg = ctx.createRadialGradient(x + 300 * u, y + 90 * u, 0, x + 300 * u, y + 90 * u, 620 * u);
    sg.addColorStop(0, `rgba(0,0,0,${0.5 * a})`);
    sg.addColorStop(0.55, `rgba(0,0,0,${0.28 * a})`);
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, y - 560 * u, x + 1000 * u, 1200 * u);
    // accent line + label
    const lw = 54 * u * easeOut((t - cue.t0) / 1.2);
    ctx.strokeStyle = `rgba(255,178,102,${0.95 * a})`;
    ctx.lineWidth = 2 * u;
    ctx.beginPath(); ctx.moveTo(x, y - 7 * u); ctx.lineTo(x + lw, y - 7 * u); ctx.stroke();
    setFont(ctx, 600, 17 * u, 17 * u * 0.38);
    ctx.fillStyle = `rgba(255,186,118,${a})`;
    ctx.fillText(cue.label, x + 72 * u + slide * 0.3, y);
    // value
    const av = a * smooth(cue.t0 + 0.25, cue.t0 + 1.2, t);
    setFont(ctx, 200, 66 * u, 66 * u * 0.01);
    glow(ctx, u, av);
    ctx.fillStyle = `rgba(248,248,250,${av})`;
    ctx.fillText(cue.value, x + slide, y + 78 * u);
    noGlow(ctx);
    // description
    const ad = a * smooth(cue.t0 + 0.6, cue.t0 + 1.6, t);
    setFont(ctx, 300, 24 * u, 0.2 * u);
    ctx.fillStyle = `rgba(200,208,222,${0.92 * ad})`;
    const lines = wrap(ctx, cue.desc, W * 0.34);
    lines.forEach((ln, i) => ctx.fillText(ln, x + slide * 0.6, y + 128 * u + i * 36 * u));
    ctx.restore();
  }

  function drawCredit(ctx, W, H, u, cue, t) {
    const a = envelope(t, cue.t0, cue.t1, 0.8, 0.8);
    if (a <= 0) return;
    ctx.save();
    setFont(ctx, 300, 20 * u, 20 * u * 0.3);
    ctx.fillStyle = `rgba(190,196,210,${0.85 * a})`;
    centerText(ctx, cue.lines[0].toUpperCase(), W / 2, H * 0.5 - 6 * u, 20 * u * 0.3);
    setFont(ctx, 300, 18 * u, 0.5 * u);
    ctx.fillStyle = `rgba(150,158,175,${0.8 * a})`;
    centerText(ctx, cue.lines[1], W / 2, H * 0.5 + 36 * u, 0.5 * u);
    ctx.restore();
  }

  // ---- Solar System to scale, against the black hole -------------------
  const PLANETS = [
    { n: 'Mercury', a: 0.387, ph: 2.1 }, { n: 'Venus', a: 0.723, ph: 4.0 }, { n: 'Earth', a: 1.0, ph: 0.6 },
    { n: 'Mars', a: 1.524, ph: 5.3 }, { n: 'Jupiter', a: 5.203, ph: 1.4 }, { n: 'Saturn', a: 9.537, ph: 3.2 },
    { n: 'Uranus', a: 19.19, ph: 5.9 }, { n: 'Neptune', a: 30.07, ph: 0.35 },
  ];

  function drawScale(ctx, W, H, u, cue, st, t) {
    const a = envelope(t, cue.t0, cue.t1, 1.0, 0.8);
    if (a <= 0) return;
    const c = BH.project(st, [0, 0, 0], W, H);
    if (!c) return;
    const pxPerRs = (H * 0.5) / (c.z * st.tanHalf);
    const pxPerAU = pxPerRs / BH.RS_AU;
    const tilt = 0.42, rot = -0.2;
    ctx.save();
    ctx.translate(c.x, c.y);

    const nepR = 30.07 * pxPerAU;
    // orbits
    const detail = smooth(8 * u, 40 * u, nepR);
    if (nepR > 1.5 * u) {
      for (const p of PLANETS) {
        const R = p.a * pxPerAU;
        if (R < 1.2 * u) continue;
        const inner = p.a < 2;
        const oa = a * (inner ? smooth(4 * u, 30 * u, R) : 1) * (0.35 + 0.65 * detail);
        ctx.strokeStyle = p.n === 'Neptune' ? `rgba(130,205,255,${0.95 * oa})` : `rgba(140,190,240,${0.55 * oa})`;
        ctx.lineWidth = (p.n === 'Neptune' ? 2.4 : 1.4) * u;
        ctx.beginPath();
        ctx.ellipse(0, 0, R, R * tilt, rot, 0, Math.PI * 2);
        ctx.stroke();
        // planet dot
        if (detail > 0.02) {
          const ang = p.ph + t * 0.05 / Math.pow(p.a, 1.5);
          const px = Math.cos(ang) * R, py = Math.sin(ang) * R * tilt;
          const xr = px * Math.cos(rot) - py * Math.sin(rot), yr = px * Math.sin(rot) + py * Math.cos(rot);
          ctx.fillStyle = `rgba(220,235,255,${oa * detail})`;
          ctx.beginPath(); ctx.arc(xr, yr, 3.2 * u, 0, Math.PI * 2); ctx.fill();
          if (detail > 0.3 && (p.n === 'Neptune' || p.n === 'Jupiter' || p.n === 'Saturn' || p.n === 'Uranus')) {
            setFont(ctx, 400, 16 * u, 16 * u * 0.2);
            ctx.fillStyle = `rgba(190,215,240,${0.85 * oa * detail})`;
            ctx.fillText(p.n.toUpperCase(), xr + 9 * u, yr - 9 * u);
          }
        }
      }
    }
    // the Sun
    const sunA = a;
    const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 14 * u);
    sg.addColorStop(0, `rgba(255,250,235,${sunA})`);
    sg.addColorStop(0.25, `rgba(255,214,140,${0.8 * sunA})`);
    sg.addColorStop(1, 'rgba(255,190,120,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(0, 0, 14 * u, 0, Math.PI * 2); ctx.fill();

    // heading while zoomed in
    const ah = a * (1 - smooth(42.4, 44.6, t)) * smooth(38.8, 40.0, t);
    if (ah > 0) {
      ctx.save();
      ctx.translate(-c.x, -c.y);
      setFont(ctx, 300, 30 * u, 30 * u * 0.42);
      glow(ctx, u, ah);
      ctx.fillStyle = `rgba(236,242,250,${ah})`;
      centerText(ctx, 'OUR SOLAR SYSTEM', W / 2, H * 0.12, 30 * u * 0.42);
      noGlow(ctx);
      setFont(ctx, 400, 17 * u, 17 * u * 0.45);
      ctx.fillStyle = `rgba(255,186,118,${ah})`;
      centerText(ctx, 'DRAWN TO SCALE  ·  NEPTUNE’S ORBIT IS 60 AU ACROSS', W / 2, H * 0.12 + 44 * u, 17 * u * 0.45);
      ctx.restore();
    }

    // marker + leader once the solar system has shrunk to a dot
    const am = a * smooth(6 * u, 2.5 * u, nepR) * (nepR < 60 * u ? 1 : 0);
    if (am > 0) {
      const mr = 9 * u;
      ctx.strokeStyle = `rgba(150,215,255,${0.9 * am})`;
      ctx.lineWidth = 1.6 * u;
      ctx.beginPath(); ctx.arc(0, 0, Math.max(mr, nepR + 4 * u), 0, Math.PI * 2); ctx.stroke();
      const lx = 150 * u, ly = -95 * u;
      ctx.beginPath(); ctx.moveTo(mr * 0.75, -mr * 0.75); ctx.lineTo(lx, ly); ctx.lineTo(lx + 40 * u, ly); ctx.stroke();
      setFont(ctx, 500, 17 * u, 17 * u * 0.3);
      ctx.fillStyle = `rgba(190,228,255,${am})`;
      ctx.fillText('OUR ENTIRE SOLAR SYSTEM', lx + 50 * u, ly + 6 * u);
    }

    // event horizon, true (unlensed) size
    const ae = a * smooth(46.6, 48.4, t);
    if (ae > 0) {
      const R = pxPerRs;
      ctx.setLineDash([10 * u, 9 * u]);
      ctx.lineDashOffset = -t * 12 * u;
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * ae})`;
      ctx.lineWidth = 1.8 * u;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      const lx = -R * 0.707, ly = R * 0.707;
      const ex = lx - 150 * u, ey = ly + 110 * u;
      ctx.strokeStyle = `rgba(255,255,255,${0.6 * ae})`;
      ctx.lineWidth = 1.4 * u;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(ex, ey); ctx.lineTo(ex - 40 * u, ey); ctx.stroke();
      setFont(ctx, 500, 17 * u, 17 * u * 0.3);
      ctx.fillStyle = `rgba(255,255,255,${0.95 * ae})`;
      ctx.textAlign = 'right';
      ctx.fillText('EVENT HORIZON (TRUE SIZE)', ex - 50 * u, ey + 6 * u);
      setFont(ctx, 300, 16 * u, 0.3 * u);
      ctx.fillStyle = `rgba(200,206,220,${0.85 * ae})`;
      ctx.fillText('its dark shadow looks 2.6× larger: gravity bends the light', ex - 50 * u, ey + 34 * u);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  // Returns true if anything was drawn
  BH.drawOverlay = function (ctx, W, H, t, st) {
    ctx.clearRect(0, 0, W, H);
    const u = W / 1920;
    let any = false;
    for (const cue of BH.cues) {
      if (t < cue.t0 || t > cue.t1) continue;
      any = true;
      if (cue.type === 'center') drawCenter(ctx, W, H, u, cue, t);
      else if (cue.type === 'title') drawTitle(ctx, W, H, u, cue, t, false);
      else if (cue.type === 'final') drawTitle(ctx, W, H, u, cue, t, true);
      else if (cue.type === 'info') drawInfo(ctx, W, H, u, cue, t);
      else if (cue.type === 'scale') drawScale(ctx, W, H, u, cue, st, t);
      else if (cue.type === 'credit') drawCredit(ctx, W, H, u, cue, t);
    }
    return any;
  };
})();
