/*
 * TON 618 — WebGL2 renderer, interactive player and offline frame exporter.
 */
(function () {
  const BH = (window.BH = window.BH || {});

  // Rendering lives in src/engine.js (BH.Engine), shared with the website.

  // ======================================================================
  // App
  // ======================================================================
  const params = new URLSearchParams(location.search);

  async function waitFonts() {
    try {
      await Promise.all([
        document.fonts.load("200 100px 'Inter'"), document.fonts.load("300 30px 'Inter'"),
        document.fonts.load("400 30px 'Inter'"), document.fonts.load("500 30px 'Inter'"),
        document.fonts.load("600 30px 'Inter'"),
      ]);
    } catch (e) { /* fall back silently */ }
  }

  async function exportMode() {
    const W = +params.get('w') || 3840, H = +params.get('h') || 2160;
    const fps = +params.get('fps') || 30;
    const quality = +params.get('quality') || 1.0;
    const tiles = +params.get('tiles') || 8;
    const times = params.get('times') ? params.get('times').split(',').map(Number) : null;
    const start = +params.get('start') || 0;
    const end = params.get('end') ? +params.get('end') : Math.round(BH.DURATION * fps);
    const log = (m) => fetch('/log', { method: 'POST', body: String(m) });

    const canvas = document.getElementById('gl');
    const ov = document.createElement('canvas');
    ov.width = W; ov.height = H;
    const octx = ov.getContext('2d');
    let R;
    try {
      R = new BH.Engine(canvas, { defines: (params.get('defs') || '').split(',').filter(Boolean) });
      R.resize(W, H);
    } catch (e) { await log('INIT ERROR ' + e.message); await fetch('/done', { method: 'POST' }); return; }
    await waitFonts();
    const list = times ? times.map((t, i) => ({ t, id: i })) : Array.from({ length: end - start }, (_, i) => ({ t: (start + i) / fps, id: start + i }));
    for (const item of list) {
      const t0 = performance.now();
      const st = BH.frameState(item.t, W / H);
      const any = BH.drawOverlay(octx, W, H, item.t, st);
      if (any) R.uploadOverlay(ov);
      R.render(st, { quality, tiles, overlayOn: any, frame: item.id });
      const px = R.readPixels();
      const t1 = performance.now();
      await fetch(`/frame?id=${item.id}&t=${item.t.toFixed(3)}&ms=${Math.round(t1 - t0)}`, { method: 'POST', body: px });
    }
    await fetch('/done', { method: 'POST' });
  }

  function interactiveMode() {
    const canvas = document.getElementById('gl');
    const ov = document.createElement('canvas');
    const octx = ov.getContext('2d');
    const ui = {
      play: document.getElementById('play'), scrub: document.getElementById('scrub'),
      time: document.getElementById('time'), res: document.getElementById('res'), err: document.getElementById('err'),
      cap: document.getElementById('captions'),
    };
    let R;
    try { R = new BH.Engine(canvas, { defines: (params.get('defs') || '').split(',').filter(Boolean) }); } catch (e) { ui.err.textContent = e.message; ui.err.style.display = 'block'; return; }
    let playing = true, t = +params.get('t') || 0, last = performance.now(), frame = 0;
    let scale = +ui.res.value;
    ui.scrub.max = BH.DURATION;
    ui.play.onclick = () => { playing = !playing; ui.play.textContent = playing ? '❚❚' : '▶'; };
    ui.scrub.oninput = () => { t = +ui.scrub.value; };
    ui.res.onchange = () => { scale = +ui.res.value; };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { ui.play.onclick(); e.preventDefault(); }
      if (e.code === 'ArrowRight') t = Math.min(BH.DURATION, t + 5);
      if (e.code === 'ArrowLeft') t = Math.max(0, t - 5);
      if (e.code === 'KeyF') document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    });
    waitFonts();
    function loop(now) {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (playing) { t += dt; if (t > BH.DURATION) t = 0; }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.max(64, Math.round(window.innerWidth * dpr * scale));
      const H = Math.max(36, Math.round(window.innerHeight * dpr * scale));
      R.resize(W, H);
      if (ov.width !== W || ov.height !== H) { ov.width = W; ov.height = H; }
      const st = BH.frameState(t, W / H);
      const any = ui.cap.checked && BH.drawOverlay(octx, W, H, t, st);
      if (any) R.uploadOverlay(ov);
      R.render(st, { quality: 1.0, tiles: 1, overlayOn: any, toCanvas: true, frame: frame++ });
      ui.scrub.value = t;
      ui.time.textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  window.addEventListener('load', () => {
    if (params.get('export')) { document.body.classList.add('export'); exportMode(); }
    else interactiveMode();
  });
})();
