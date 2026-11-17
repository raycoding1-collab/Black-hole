/*
 * TON 618 — interactive website: guided auto-tour + free exploration,
 * running the general-relativistic ray tracer live.
 */
(function () {
  const BH = window.BH;
  const $ = (id) => document.getElementById(id);
  const D2R = Math.PI / 180;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const wrap180 = (a) => ((a + 540) % 360) - 180;

  const touch = matchMedia('(pointer: coarse)').matches;
  const mobile = touch && Math.min(screen.width, screen.height) < 820;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const body = document.body;
  const canvas = $('bh'), fx = $('fx'), fctx = fx.getContext('2d');
  const svg = $('lines'), labels = $('labels');
  const chapters = BH.chapters;
  const RS_AU = 803.49;
  const FOV_SOLAR = 2 * Math.atan((60.14 / RS_AU / 0.42) / (2 * 62)) / D2R;

  // ------------------------------------------------------------------ state
  let engine = null;
  let mode = 'hero';               // hero | tour | explore
  let ch = -1;                     // chapter index
  let tc = 0;                      // time inside the chapter (pauses with the tour)
  let paused = false;
  let clock = 0;                   // global animation time (s)
  let heroT = 0;
  let cur = null;                  // current camera params
  let from = null, transT = 0, transDur = 0;
  let fade = 0, fadeTarget = 1;
  let cutPending = -1, cutT = 0;
  let shift = 0;
  let beaming = 0.85, jetBright = 0.035;
  const ex = { D: 46, az: 40, el: 8, spin: true, doppler: true, jets: true };
  let lastNav = 0;

  function params(c, azAdd) {
    return {
      lD: Math.log(c.D), az: c.az + (azAdd || 0), el: c.el, roll: c.roll || 0,
      lF: Math.log(Math.tan(0.5 * c.fov * D2R)), ty: c.ty || 0, ex: c.ex === undefined ? 1 : c.ex,
    };
  }
  function mix(a, b, t) {
    return {
      lD: lerp(a.lD, b.lD, t), az: a.az + wrap180(b.az - a.az) * t, el: lerp(a.el, b.el, t), roll: lerp(a.roll, b.roll, t),
      lF: lerp(a.lF, b.lF, t), ty: lerp(a.ty, b.ty, t), ex: lerp(a.ex, b.ex, t),
    };
  }

  // camera the current mode/chapter wants right now
  function targetParams() {
    if (mode === 'explore') {
      const fov = 48;
      return { lD: Math.log(ex.D), az: ex.az, el: ex.el, roll: 0, lF: Math.log(Math.tan(0.5 * fov * D2R)), ty: 0,
        ex: lerp(0.38, 0.95, smooth(14, 48, ex.D)) };
    }
    if (mode === 'hero' || ch < 0) return params(BH.hero.cam, reduced ? 0 : heroT * BH.hero.drift);
    const c = chapters[ch];
    const p = params(c.cam, reduced ? 0 : tc * (c.drift || 0));
    if (c.scaleDemo) {
      const k = ease(smooth(2.6, 10.8, tc));
      p.lF = lerp(Math.log(Math.tan(0.5 * FOV_SOLAR * D2R)), Math.log(Math.tan(0.5 * c.cam.fov * D2R)), k);
    }
    return p;
  }

  // ------------------------------------------------------------------ chapters UI
  const segs = $('segs');
  chapters.forEach((c, i) => {
    const b = document.createElement('button');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', c.title);
    b.innerHTML = `<i></i><span>${c.kicker}</span>`;
    b.onclick = () => go(i, true);
    segs.appendChild(b);
  });
  const card = $('card');
  ['c-kicker', 'c-title', 'c-body', 'c-facts'].forEach((id) => $(id).classList.add('swap'));

  function fillCard(i) {
    const c = chapters[i];
    $('c-kicker').textContent = c.kicker;
    $('c-count').textContent = `${String(i + 1).padStart(2, '0')} / ${String(chapters.length).padStart(2, '0')}`;
    $('c-title').textContent = c.title;
    $('c-body').textContent = c.body;
    $('c-facts').innerHTML = c.facts.map(([v, l]) => `<div><dt>${v}</dt><dd>${l}</dd></div>`).join('');
    card.classList.toggle('cta', !!c.cta);
    [...segs.children].forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-selected', k === i); });
  }

  function go(i, user) {
    i = (i + chapters.length) % chapters.length;
    if (user) lastNav = performance.now();
    if (mode !== 'tour') setMode('tour', true);
    const c = chapters[i];
    if (c.cut && ch !== i && fade > 0.05) {     // dip to black
      cutPending = i; cutT = 0; fadeTarget = 0;
      card.classList.add('out');
      return;
    }
    enter(i, c.cut);
  }

  function enter(i, jump) {
    const changed = i !== ch;
    ch = i; tc = 0;
    from = cur ? Object.assign({}, cur) : null;
    transT = 0;
    transDur = jump || !from ? 0 : (Math.abs(from.lD - params(chapters[i].cam).lD) > 2.5 ? 4.2 : 3.4);
    if (jump) { cur = targetParams(); from = null; }
    fadeTarget = 1;
    buildCallouts();
    if (changed) {
      card.classList.add('out');
      setTimeout(() => { fillCard(i); card.classList.remove('out'); }, jump ? 50 : 420);
    }
  }

  function setMode(m, silent) {
    mode = m;
    body.classList.toggle('at-hero', m === 'hero');
    body.classList.toggle('mode-explore', m === 'explore');
    $('m-tour').classList.toggle('on', m !== 'explore');
    $('m-explore').classList.toggle('on', m === 'explore');
    segs.style.opacity = m === 'tour' ? 1 : 0;
    if (m === 'explore') {
      const p = cur || targetParams();
      ex.D = clamp(Math.exp(p.lD), 12, 600); ex.az = p.az; ex.el = p.el;
      from = Object.assign({}, cur); transT = 0; transDur = 1.6;
      clearCallouts();
      $('relpill').classList.remove('show');
    } else if (m === 'tour' && !silent) {
      go(Math.max(ch, 0));
    } else if (m === 'hero') {
      ch = -1; heroT = 0; from = cur ? Object.assign({}, cur) : null; transT = 0; transDur = 3.5;
      clearCallouts();
      [...segs.children].forEach((b) => b.classList.remove('on'));
    }
  }

  // ------------------------------------------------------------------ callouts
  let callouts = [];
  function clearCallouts() { svg.innerHTML = ''; labels.innerHTML = ''; callouts = []; }
  function buildCallouts() {
    clearCallouts();
    const c = chapters[ch];
    if (!c || !c.callouts) return;
    const NS = 'http://www.w3.org/2000/svg';
    for (const co of c.callouts) {
      const g = document.createElementNS(NS, 'g');
      const line = document.createElementNS(NS, 'line');
      const ring = document.createElementNS(NS, 'circle'); ring.setAttribute('r', 8);
      const core = document.createElementNS(NS, 'circle'); core.setAttribute('r', 2.2); core.setAttribute('class', 'core');
      g.append(line, ring, core); svg.appendChild(g);
      const lab = document.createElement('div');
      lab.className = 'lab';
      lab.innerHTML = `<b>${co.label}</b><s>${co.sub || ''}</s>`;
      labels.appendChild(lab);
      callouts.push({ co, g, line, ring, lab });
    }
  }

  function project(st, p, W, H) {
    const d = BH.vec.sub(p, st.pos);
    const z = BH.vec.dot(d, st.rot.fwd);
    if (z <= 1e-6) return null;
    const x = BH.vec.dot(d, st.rot.right) / (z * st.tanHalf);
    const y = BH.vec.dot(d, st.rot.up) / (z * st.tanHalf);
    return { x: W * 0.5 + x * H * 0.5, y: H * (0.5 - st.shift) - y * H * 0.5, z };
  }

  function anchorOf(co, st, W, H) {
    const D = Math.hypot(...st.pos);
    if (co.kind === 'shadow') {
      const c = project(st, [0, 0, 0], W, H);
      if (!c) return null;
      const a = Math.asin(Math.min(1, 2.598 * Math.sqrt(Math.max(0, 1 - 1 / D)) / D));
      const r = Math.tan(a) / st.tanHalf * H * 0.5 * co.k;
      return { x: c.x + Math.cos(co.ang * D2R) * r, y: c.y - Math.sin(co.ang * D2R) * r };
    }
    if (co.kind === 'disk') {
      const az = Math.atan2(st.pos[0], st.pos[2]) + co.rel * D2R;
      return project(st, [co.r * Math.sin(az), 0, co.r * Math.cos(az)], W, H);
    }
    if (co.kind === 'approach' || co.kind === 'recede') {
      const r = st.rot.right;
      const l = Math.hypot(r[0], r[2]) || 1;
      const cands = [1, -1].map((s) => [s * co.r * r[0] / l, 0, s * co.r * r[2] / l]);
      const isApp = (p) => { const v = [p[2], 0, -p[0]]; return BH.vec.dot(v, BH.vec.sub(st.pos, p)) > 0; };
      const p = cands.find((q) => isApp(q) === (co.kind === 'approach'));
      return project(st, p, W, H);
    }
    return project(st, co.p, W, H);
  }

  function updateCallouts(st, W, H) {
    if (!callouts.length) return;
    const c = chapters[ch];
    const vis = (mode === 'tour' ? 1 : 0) * smooth(transDur + 0.2, transDur + 1.2, tc) * (1 - smooth(c.dur - 0.9, c.dur - 0.1, tc)) * fade;
    const s = W < 760 ? 0.62 : 1;
    const cardR = card.getBoundingClientRect();
    for (const k of callouts) {
      const a = anchorOf(k.co, st, W, H);
      if (!a || vis <= 0.01) { k.g.style.opacity = 0; k.lab.style.opacity = 0; continue; }
      let dx = k.co.dx * s, dy = k.co.dy * s;
      if (a.x + dx > W - 190 * s) dx = -Math.abs(dx);
      if (a.x + dx < 190 * s) dx = Math.abs(dx);
      let ly = clamp(a.y + dy, 110, H - 60);
      let lx = a.x + dx;
      const lw = k.lab.offsetWidth || 160;
      // keep labels on screen
      if (dx >= 0 && lx + lw + 18 > W) { dx = -Math.abs(dx); lx = a.x + dx; }
      if (dx < 0 && lx - lw - 18 < 0) { dx = Math.abs(dx); lx = a.x + dx; }
      lx = dx >= 0 ? Math.min(lx, W - lw - 18) : Math.max(lx, lw + 18);
      // keep clear of the chapter card
      const x0 = dx >= 0 ? lx : lx - lw - 10, x1 = dx >= 0 ? lx + lw + 10 : lx;
      if (x1 > cardR.left - 10 && x0 < cardR.right + 10 && ly > cardR.top - 36) {
        if (W >= 760 && a.x + Math.abs(dx) + lw < W - 20) { dx = Math.abs(dx); lx = Math.max(a.x + dx, cardR.right + 24); }
        else ly = cardR.top - 44;
      }
      const ux = lx - a.x, uy = ly - a.y, ul = Math.hypot(ux, uy) || 1;
      k.line.setAttribute('x1', a.x + ux / ul * 11); k.line.setAttribute('y1', a.y + uy / ul * 11);
      k.line.setAttribute('x2', lx); k.line.setAttribute('y2', ly);
      k.ring.setAttribute('cx', a.x); k.ring.setAttribute('cy', a.y);
      k.ring.setAttribute('r', 7 + 2.5 * Math.sin(clock * 3));
      k.g.querySelector('.core').setAttribute('cx', a.x); k.g.querySelector('.core').setAttribute('cy', a.y);
      k.g.style.opacity = vis;
      k.lab.className = 'lab ' + (dx >= 0 ? 'right' : 'left');
      k.lab.style.left = lx + 'px'; k.lab.style.top = ly + 'px';
      k.lab.style.opacity = vis;
    }
  }

  // ------------------------------------------------------------------ scale infographic (2D)
  const PLANETS = [[0.387, 2.1], [0.723, 4.0], [1, 0.6], [1.524, 5.3], [5.203, 1.4], [9.537, 3.2], [19.19, 5.9], [30.07, 0.35]];
  function drawScale(st, W, H, dpr) {
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.clearRect(0, 0, W, H);
    const c = chapters[ch];
    if (mode !== 'tour' || !c || !c.scaleDemo) return;
    const a = fade * (1 - smooth(c.dur - 0.8, c.dur, tc));
    const ctr = project(st, [0, 0, 0], W, H);
    if (!ctr || a <= 0) return;
    const pxRs = (H * 0.5) / (ctr.z * st.tanHalf);
    const pxAU = pxRs / RS_AU;
    const u = Math.max(0.7, Math.min(W, H) / 900);
    fctx.save();
    fctx.translate(ctr.x, ctr.y);
    fctx.shadowColor = 'rgba(0,0,0,0.85)'; fctx.shadowBlur = 8 * u;
    const nep = 30.07 * pxAU;
    const detail = smooth(6, 40, nep);
    for (const [au, ph] of PLANETS) {
      const R = au * pxAU;
      if (R < 1) continue;
      const isN = au > 30;
      fctx.strokeStyle = isN ? `rgba(130,205,255,${0.95 * a})` : `rgba(140,190,240,${0.5 * a * (0.3 + 0.7 * detail)})`;
      fctx.lineWidth = (isN ? 1.8 : 1.1) * u;
      fctx.beginPath(); fctx.ellipse(0, 0, R, R * 0.42, -0.2, 0, Math.PI * 2); fctx.stroke();
      if (detail > 0.05) {
        const ang = ph + clock * 0.06 / Math.pow(au, 1.5);
        const px = Math.cos(ang) * R, py = Math.sin(ang) * R * 0.42;
        fctx.fillStyle = `rgba(225,238,255,${a * detail})`;
        fctx.beginPath(); fctx.arc(px * Math.cos(-0.2) - py * Math.sin(-0.2), px * Math.sin(-0.2) + py * Math.cos(-0.2), 2.4 * u, 0, 7); fctx.fill();
      }
    }
    const g = fctx.createRadialGradient(0, 0, 0, 0, 0, 10 * u);
    g.addColorStop(0, `rgba(255,250,235,${a})`); g.addColorStop(0.3, `rgba(255,210,140,${0.8 * a})`); g.addColorStop(1, 'rgba(255,190,120,0)');
    fctx.fillStyle = g; fctx.beginPath(); fctx.arc(0, 0, 10 * u, 0, 7); fctx.fill();
    fctx.font = `500 ${11 * u}px Inter, sans-serif`;
    fctx.letterSpacing = `${2 * u}px`;
    // label while big
    const aBig = a * smooth(30, 70, nep);
    if (aBig > 0.01) {
      fctx.fillStyle = `rgba(190,228,255,${aBig})`;
      fctx.fillText('NEPTUNE’S ORBIT · 60 AU', nep * 0.62, -nep * 0.42 * 0.95);
    }
    // marker once it is a speck
    const aDot = a * smooth(14, 4, nep);
    if (aDot > 0.01) {
      fctx.strokeStyle = `rgba(150,215,255,${0.9 * aDot})`;
      fctx.lineWidth = 1.2 * u;
      const mr = Math.max(8 * u, nep + 4 * u);
      fctx.beginPath(); fctx.arc(0, 0, mr, 0, 7); fctx.stroke();
      fctx.beginPath(); fctx.moveTo(mr * 0.7, -mr * 0.7); fctx.lineTo(90 * u, -60 * u); fctx.lineTo(118 * u, -60 * u); fctx.stroke();
      fctx.fillStyle = `rgba(200,232,255,${aDot})`;
      fctx.fillText('OUR ENTIRE SOLAR SYSTEM', 124 * u, -56 * u);
    }
    // event horizon (true size)
    const aH = a * smooth(8.5, 10.5, tc);
    if (aH > 0.01) {
      fctx.setLineDash([7 * u, 6 * u]); fctx.lineDashOffset = -clock * 10;
      fctx.strokeStyle = `rgba(255,255,255,${0.75 * aH})`; fctx.lineWidth = 1.3 * u;
      fctx.beginPath(); fctx.arc(0, 0, pxRs, 0, 7); fctx.stroke(); fctx.setLineDash([]);
      const hx = pxRs * 0.707, hy = pxRs * 0.707;
      fctx.beginPath(); fctx.moveTo(hx, hy); fctx.lineTo(hx + 70 * u, hy + 55 * u); fctx.lineTo(hx + 96 * u, hy + 55 * u); fctx.stroke();
      fctx.fillStyle = `rgba(255,255,255,${aH})`;
      fctx.fillText('EVENT HORIZON (TRUE SIZE)', hx + 102 * u, hy + 59 * u);
      fctx.font = `300 ${11 * u}px Inter, sans-serif`; fctx.letterSpacing = '0px';
      fctx.fillStyle = `rgba(200,206,220,${0.85 * aH})`;
      fctx.fillText('the shadow looks 2.6\u00d7 larger: gravity bends light', hx + 102 * u, hy + 77 * u);
    }
    fctx.restore();
  }

  // ------------------------------------------------------------------ rendering + adaptive resolution
  let scale = mobile ? 0.5 : 0.7;
  const maxScale = mobile ? 0.85 : 1.0, minScale = mobile ? 0.28 : 0.33;
  const target = mobile ? 1 / 30 : 1 / 45;
  let quality = mobile ? 1.3 : 1.0;
  let acc = 0, nfr = 0, lastAdj = 0, fpsShown = 0, frameNo = 0, lastNow = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    if (!engine || document.hidden || body.classList.contains('film-open')) { lastNow = now; return; }
    const dt = Math.min(0.1, lastNow ? (now - lastNow) / 1000 : 0.016);
    lastNow = now;
    clock += dt;

    // adaptive resolution
    acc += dt; nfr++;
    if (now - lastAdj > 1000 && nfr >= 8) {
      const avg = acc / nfr;
      fpsShown = Math.round(1 / avg);
      if (qs.has('scale')) { acc = 0; nfr = 0; lastAdj = now; } else {
      if (avg > target * 1.15) scale = Math.max(minScale, scale * clamp(target / avg, 0.7, 0.92));
      else if (avg < target * 0.8) scale = Math.min(maxScale, scale * 1.06);
      quality = scale <= minScale + 0.01 && avg > target * 1.3 ? Math.min(1.8, quality * 1.1) : quality;
      acc = 0; nfr = 0; lastAdj = now; }
    }

    // timeline
    if (mode === 'hero') {
      heroT += dt;
      if (heroT > 9 && !paused) go(0);
    } else if (mode === 'tour') {
      if (!paused) tc += dt;
      const c = chapters[ch];
      if (c && tc >= c.dur && !paused) go(ch + 1);
    }
    if (cutPending >= 0) {
      cutT += dt;
      if (cutT > 0.6) { const i = cutPending; cutPending = -1; enter(i, true); }
    }
    if (mode === 'explore' && ex.spin && !dragging) ex.az += dt * 3;
    transT += dt;
    fade += (fadeTarget - fade) * (1 - Math.exp(-dt * (fadeTarget > fade ? 2.6 : 9)));

    // camera
    const tp = targetParams();
    if (!cur) cur = tp;
    cur = from && transT < transDur ? mix(from, tp, ease(transT / transDur)) : tp;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth, H = window.innerHeight;
    const aspect = W / H;
    const k = clamp((16 / 9) / aspect, 1, 4);
    const f = k > 1.4 ? Math.sqrt(k * 0.62) : 1;      // portrait: widen view and step back a little
    const c = chapters[ch];
    const D = Math.exp(cur.lD) * (c && c.scaleDemo && mode === 'tour' ? 1 : f);
    const el = cur.el * D2R, az = cur.az * D2R;
    const pos = [D * Math.cos(el) * Math.sin(az), D * Math.sin(el), D * Math.cos(el) * Math.cos(az)];
    const rot = BH.lookRot(pos, [0, cur.ty, 0], cur.roll + (reduced ? 0 : 0.3 * Math.sin(clock * 0.37)));
    const tanHalf = Math.exp(cur.lF) * f;

    // lens shift keeps the black hole clear of the bottom sheet on phones
    const wantShift = W < 760 && aspect < 1 ? (mode === 'tour' ? 0.15 : mode === 'hero' ? 0.16 : 0.04) : (mode === 'hero' ? 0.17 : mode === 'tour' ? 0.02 : 0);
    shift += (wantShift - shift) * (1 - Math.exp(-dt * 2));

    // relativity demo / toggles
    let wantBeam = 0.85, wantJet = 0.035;
    if (mode === 'explore') { wantBeam = ex.doppler ? 0.85 : 0; wantJet = ex.jets ? 0.05 : 0; }
    else if (mode === 'tour' && c) {
      if (c.beamDemo) wantBeam = 0.85 * (1 - smooth(4.2, 5.6, tc) + smooth(8.8, 10.2, tc));
      if (c.jetBright) wantJet = c.jetBright;
    }
    beaming += (wantBeam - beaming) * (1 - Math.exp(-dt * 6));
    jetBright += (wantJet - jetBright) * (1 - Math.exp(-dt * 2));
    const pill = $('relpill');
    pill.classList.toggle('show', mode === 'tour' && !!(c && c.beamDemo) && tc > 1.5 && tc < c.dur - 0.8);
    pill.classList.toggle('off', beaming < 0.4);
    $('reltext').textContent = beaming < 0.4 ? 'Relativistic effects: off' : 'Relativistic effects: on';

    const RW = Math.max(64, Math.round(W * dpr * scale)), RH = Math.max(36, Math.round(H * dpr * scale));
    engine.resize(RW, RH);
    const st = {
      pos, rot, tanHalf, shift, fade: Math.max(fade, 0),
      exposure: 0.95 * cur.ex * (1 + 0.6 * smooth(400, 3000, D)),
      diskTime: clock * 3.0 + 40, jetTime: clock,
      bloom: 0.055 + 0.03 * smooth(18, 45, D) + 0.06 * smooth(300, 3000, D),
      streak: 0.035 + 0.05 * smooth(300, 3000, D),
      glare: 2.2 * smooth(260, 1800, D),
      beaming, jetBright,
      starScale: clamp(Math.pow(RH / 2000, 2), 0.05, 0.6),
    };
    const g = project(st, [0, 0, 0], W, H);
    st.glarePos = g ? [g.x / W, 1 - g.y / H] : [0.5, 0.5];
    engine.render(st, { toCanvas: true, quality, frame: frameNo++, grain: 0.006 });

    if (fx.width !== Math.round(W * dpr) || fx.height !== Math.round(H * dpr)) { fx.width = Math.round(W * dpr); fx.height = Math.round(H * dpr); }
    drawScale(st, W, H, dpr);
    updateCallouts(st, W, H);
    if (mode === 'tour' && c) $('c-bar').style.width = `${clamp(tc / c.dur, 0, 1) * 100}%`;
    if (frameNo % 20 === 0) $('st-text').textContent = `Live GR ray tracing · ${RW}×${RH} · ${fpsShown} fps`;
    if (frameNo === 3) body.classList.remove('is-loading');
  }

  // ------------------------------------------------------------------ input
  let dragging = false, pts = new Map(), pinch0 = 0, swipe0 = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    swipe0 = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (mode === 'explore') dragging = true;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    if (mode === 'explore') {
      if (pts.size === 2) {
        p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0) ex.D = clamp(ex.D * pinch0 / d, 12, 600);
        pinch0 = d;
        return;
      }
      ex.az -= (e.clientX - p.x) * 0.25;
      ex.el = clamp(ex.el + (e.clientY - p.y) * 0.2, -75, 75);
    }
    p.x = e.clientX; p.y = e.clientY;
  });
  const up = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch0 = 0;
    if (!pts.size) dragging = false;
    if (swipe0 && mode !== 'explore') {
      const dx = e.clientX - swipe0.x, dy = e.clientY - swipe0.y;
      if (performance.now() - swipe0.t < 700 && Math.max(Math.abs(dx), Math.abs(dy)) > 50) {
        if (mode === 'hero') go(0, true);
        else if (Math.abs(dx) > Math.abs(dy)) go(ch + (dx < 0 ? 1 : -1), true);
        else go(ch + (dy < 0 ? 1 : -1), true);
      }
    }
    swipe0 = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  let wheelAcc = 0;
  window.addEventListener('wheel', (e) => {
    if (body.classList.contains('film-open')) return;
    if (mode === 'explore') { ex.D = clamp(ex.D * Math.exp(e.deltaY * 0.0012), 12, 600); e.preventDefault(); return; }
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) > 60 && performance.now() - lastNav > 1100) {
      if (mode === 'hero') go(0, true); else go(ch + (wheelAcc > 0 ? 1 : -1), true);
      wheelAcc = 0;
    }
    clearTimeout(window.__wt); window.__wt = setTimeout(() => (wheelAcc = 0), 200);
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return closeFilm();
    if (body.classList.contains('film-open')) return;
    if (['ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key)) { go(mode === 'hero' ? 0 : ch + 1, true); e.preventDefault(); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { go(ch - 1, true); e.preventDefault(); }
    else if (e.key === ' ') { togglePause(); e.preventDefault(); }
    else if (e.key === 'e' || e.key === 'E') setMode('explore');
    else if (e.key === 't' || e.key === 'T') setMode('tour');
    else if (e.key === 'f' || e.key === 'F') document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
  });

  function togglePause() { paused = !paused; body.classList.toggle('paused', paused); $('pause').setAttribute('aria-label', paused ? 'Resume the tour' : 'Pause the tour'); }
  $('begin').onclick = () => go(0, true);
  $('prev').onclick = () => go(ch - 1, true);
  $('next').onclick = () => go(ch + 1, true);
  $('pause').onclick = togglePause;
  $('brand').onclick = () => setMode('hero');
  $('m-tour').onclick = () => setMode('tour');
  $('m-explore').onclick = () => setMode('explore');
  $('t-doppler').onchange = (e) => (ex.doppler = e.target.checked);
  $('t-jets').onchange = (e) => (ex.jets = e.target.checked);
  $('t-spin').onchange = (e) => (ex.spin = e.target.checked);
  if (touch) $('ex-hint').textContent = 'Drag to orbit · pinch to zoom';

  // sound
  const music = $('music');
  $('b-sound').onclick = () => {
    const on = !$('b-sound').classList.contains('on');
    $('b-sound').classList.toggle('on', on);
    if (on) { music.volume = 0; music.play().catch(() => {}); fadeVol(0.55); } else fadeVol(0, () => music.pause());
  };
  function fadeVol(v, done) {
    const v0 = music.volume, t0 = performance.now();
    const step = () => { const k = Math.min(1, (performance.now() - t0) / 1200); music.volume = v0 + (v - v0) * k; if (k < 1) requestAnimationFrame(step); else done && done(); };
    step();
  }

  // film
  const video = $('video');
  function openFilm() {
    body.classList.add('film-open');
    if ($('b-sound').classList.contains('on')) music.pause();
    video.play().catch(() => {});
  }
  function closeFilm() {
    if (!body.classList.contains('film-open')) return;
    body.classList.remove('film-open'); video.pause();
    if ($('b-sound').classList.contains('on')) music.play().catch(() => {});
  }
  $('m-film').onclick = openFilm; $('hero-film').onclick = openFilm; $('c-cta').onclick = openFilm; $('fb-film').onclick = openFilm;
  $('film-close').onclick = closeFilm;
  $('film').addEventListener('click', (e) => { if (e.target.id === 'film') closeFilm(); });

  // debug / deep-link: ?chapter=3&t=6&scale=0.5
  const qs = new URLSearchParams(location.search);
  if (qs.has('scale')) { scale = +qs.get('scale'); }
  function deepLink() {
    if (!qs.has('chapter')) return;
    go(+qs.get('chapter'));
    enter(+qs.get('chapter'), true);
    tc = +(qs.get('t') || 4);
    fade = 1;
    fillCard(ch); card.classList.remove('out');
  }

  // ------------------------------------------------------------------ boot
  function boot() {
    body.classList.add('at-hero');
    try {
      $('ld-sub').textContent = 'Bending spacetime…';
      engine = new BH.Engine(canvas, mobile ? { maxSteps: 240, noiseRes: 96, bloomLevels: 7 } : { maxSteps: 360, noiseRes: 128, bloomLevels: 8 });
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fail('The graphics context was lost. Reload the page to restart the live render.'); });
    } catch (err) {
      console.error(err);
      return fail(err.message);
    }
    deepLink();
    requestAnimationFrame(frame);
  }
  function fail(msg) {
    engine = null;
    body.classList.remove('is-loading');
    body.classList.add('no-webgl');
    $('fb-msg').textContent = msg + ' You can still watch the film.';
  }
  // hide film controls until the film files are actually deployed next to the page
  fetch('media/TON618_1080p.mp4', { method: 'HEAD' }).then((r) => { if (!r.ok) throw 0; }).catch(() => {
    ['m-film', 'hero-film', 'c-cta', 'fb-film'].forEach((id) => { const el = $(id); if (el) el.style.display = 'none'; });
    body.classList.add('no-film');
  });
  fetch('media/TON618_4K.mp4', { method: 'HEAD' }).then((r) => { if (!r.ok) throw 0; }).catch(() => {
    const a = document.querySelector('.film-meta a'); if (a) a.remove();
  });

  // let the loader paint before compiling shaders / generating the noise volume
  requestAnimationFrame(() => setTimeout(boot, 60));
})();
