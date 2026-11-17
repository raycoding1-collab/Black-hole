#!/usr/bin/env node
/*
 * Offline renderer: serves the project, drives headless Chromium (SwiftShader
 * WebGL2 on the CPU, or a GPU if available), receives raw RGBA frames over
 * HTTP and pipes them straight into ffmpeg.
 *
 *   node render/render.cjs --w 3840 --h 2160 --fps 30 --start 0 --end 300 --out seg.mp4
 *   node render/render.cjs --stills 10,20,30 --w 1920 --h 1080 --outdir stills/
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes('--' + k);

const ROOT = path.resolve(__dirname, '..');
const W = +arg('w', 3840), H = +arg('h', 2160), FPS = +arg('fps', 30);
const START = +arg('start', 0), END = arg('end') !== undefined ? +arg('end') : undefined;
const OUT = arg('out', 'out.mp4');
const STILLS = arg('stills');
const OUTDIR = arg('outdir', 'stills');
const QUALITY = arg('quality', '1.0');
const TILES = arg('tiles', String(Math.max(1, Math.round(H / 270))));
const CRF = arg('crf', '12');
const PRESET = arg('preset', 'medium');
const GPU = flag('gpu');
const PADH = arg('padh') ? +arg('padh') : 0;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

let ff = null;
let frames = 0;
const t0 = Date.now();
let stillNames = STILLS ? STILLS.split(',') : null;

function startFFmpeg() {
  const args = ['-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    '-vf', 'vflip' + (PADH ? `,pad=${W}:${PADH}:0:(oh-ih)/2:black` : '') + ',format=yuv420p', '-c:v', 'libx264', '-preset', PRESET, '-crf', CRF,
    '-profile:v', 'high', '-tune', 'film', '-x264-params', 'aq-mode=3', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-movflags', '+faststart', OUT];
  ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
  ff.on('exit', (c) => { if (c) console.error('ffmpeg exited with', c); });
}

function writePNG(buf, file) {
  return new Promise((res) => {
    const p = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', '-',
      '-vf', 'vflip', '-frames:v', '1', file], { stdio: ['pipe', 'inherit', 'inherit'] });
    p.on('exit', res);
    p.stdin.end(buf);
  });
}

let finish;
const finished = new Promise((r) => (finish = r));

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const body = Buffer.concat(chunks);
      if (url.pathname === '/log') console.log('[page]', body.toString());
      else if (url.pathname === '/frame') {
        const id = +url.searchParams.get('id');
        const ms = url.searchParams.get('ms');
        if (body.length !== W * H * 4) console.error('bad frame size', body.length);
        if (STILLS) {
          fs.mkdirSync(OUTDIR, { recursive: true });
          const name = path.join(OUTDIR, `still_${String(stillNames[id]).replace('.', '_')}.png`);
          await writePNG(body, name);
          console.log(`still t=${stillNames[id]} -> ${name} (${ms} ms)`);
        } else {
          if (!ff.stdin.write(body)) await new Promise((r) => ff.stdin.once('drain', r));
          frames++;
          const el = (Date.now() - t0) / 1000;
          if (frames % 5 === 0 || frames === 1) {
            const total = (END - START);
            const eta = el / frames * (total - frames);
            console.log(`frame ${id} (${frames}/${total})  render ${ms} ms  avg ${(el / frames).toFixed(2)} s/f  eta ${(eta / 60).toFixed(1)} min`);
          }
        }
      } else if (url.pathname === '/done') finish();
      res.writeHead(200); res.end('ok');
    });
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  if (!STILLS) startFFmpeg();
  const flags = GPU ? ['--ignore-gpu-blocklist', '--enable-gpu'] :
    ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ args: [...flags, '--disable-gpu-watchdog', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('console', (m) => console.log('[console]', m.text()));
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  const q = new URLSearchParams({ export: '1', w: W, h: H, fps: FPS, quality: QUALITY, tiles: TILES });
  if (arg('defs')) q.set('defs', arg('defs'));
  if (STILLS) q.set('times', STILLS);
  else { q.set('start', START); if (END !== undefined) q.set('end', END); }
  await page.goto(`http://127.0.0.1:${port}/index.html?${q}`);
  await finished;
  await browser.close();
  if (ff) { ff.stdin.end(); await new Promise((r) => ff.on('exit', r)); }
  server.close();
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
})().catch((e) => { console.error(e); process.exit(1); });
