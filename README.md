# TON 618 — A Cinematic Journey to an Ultramassive Black Hole

An 87-second, 4K, 2.39:1 cinematic film about **TON 618**, one of the most massive black holes
ever measured. Every frame is produced by a general-relativistic ray tracer: no stock footage,
no pre-made assets, no AI imagery. The score is also original, synthesised from scratch.

| | |
|---|---|
| Resolution | 3840 × 2160 (UHD 4K), 2.39:1 scope image (3840 × 1608) letterboxed |
| Frame rate | 24 fps |
| Running time | 1:27 |
| Audio | Original score, 48 kHz stereo |

## The story

1. **Deep field.** 10.8 billion light-years away, a single point of light outshines its whole galaxy.
2. **Arrival.** We fall towards the quasar. The point resolves into a blazing accretion disk, warped by gravity. *TON 618*.
3. **Mass.** 40.7 billion Suns, nearly 10,000 times heavier than Sagittarius A\*.
4. **Scale.** The film opens on our Solar System, drawn to scale, then pulls back 300-fold. The whole Solar System shrinks to a speck inside the black hole's shadow. The event horizon is about 1,600 AU across, 27 times wider than Neptune's orbit and more than nine light-days wide.
5. **Power.** A dive over the plasma of the disk. The quasar shines like 140 trillion Suns, and its inner gas whirls at about half the speed of light.
6. **Finale.** We pull back and the final title appears.

## The physics in every pixel

* **Exact light bending (Schwarzschild metric).** Each pixel's light ray is traced backwards
  through curved spacetime using the photon orbit equation `u'' + u = 3/2·u²` (with `Rs = 1`).
  Near the black hole this is integrated with velocity-Verlet, which conserves angular momentum
  exactly. Far away, the analytic weak-field deflection `2Rs/b` is used, split between the
  incoming and outgoing legs of the ray so there is no visible seam.
* **The lensed disk.** The far side of the accretion disk appears arched over the top of the
  shadow and under it, and there is a thin photon ring. These come straight out of the tracer:
  they are not painted on.
* **A volumetric accretion disk.** Thin Keplerian disk from the ISCO (`3 Rs`) outward, with a
  Novikov–Thorne-style temperature profile. Turbulent density uses noise in log-polar
  coordinates, sheared by differential rotation. Light is accumulated with
  emission–absorption radiative transfer.
* **Relativistic Doppler beaming and redshift.** The shift factor
  `g = sqrt(1 − 1.5/r) / (1 − Ω·L_z)` combines gravitational and orbital (Doppler) shifts. The
  photon's angular momentum `L_z` is conserved along the geodesic. Each sample's colour is a
  true blackbody at the observed temperature `g·T`: the Planck spectrum integrated against the
  CIE 1931 colour-matching functions.
* **Lensed sky.** The host-galaxy band, nebulosity and three layers of stars are seen through
  the lens. Each star's brightness uses the pixel's on-screen sky footprint, so lensing
  magnification conserves light and stars don't shimmer at the Einstein ring.
* **Relativistic jets.** Analytic line integrals through Gaussian jet tubes, with beaming and
  moving knots. This is an artist's impression.
* **A film pipeline.** HDR rendering, physically based bloom (13-tap Karis downsample with
  tent upsampling), anamorphic streaks, camera glare on the point-like quasar, an ACES and
  hue-preserving tone-mapping blend, a film grade, vignette, chromatic aberration and fine
  grain.

## Facts used

| Quantity | Value |
|---|---|
| Mass | 4.07 × 10¹⁰ M☉ (revised estimate; older value 6.6 × 10¹⁰) |
| Schwarzschild radius | ≈ 803 AU (horizon ≈ 1,607 AU across) |
| Light-crossing time of the horizon | ≈ 9.3 days |
| Redshift / distance | z = 2.219 · 10.8 billion light-years (light-travel distance) |
| Luminosity | ≈ 4 × 10⁴⁰ W, about 140 trillion Suns |
| Constellation | Canes Venatici |

## The website: a live guided tour

`index.html` is an interactive companion to the film. It runs the same ray tracer live in
the browser on a GPU, on desktops and phones.

* **Auto-tour:** ten chapters. The camera glides between viewpoints on its own, and each stop
  explains one detail: the quasar, the mass, lensing, the photon ring, Doppler beaming, the
  Solar System to scale, the accretion disk, the jets, the luminosity and the film.
* **Live callouts:** the labels are pinned to the actual features of the render (the lensed far
  side, the photon ring, the approaching and receding sides, the ISCO and the jets), projected
  every frame.
* **Live physics demos:** relativity is switched off and back on in front of you. The Solar
  System zooms out 300-fold to the event horizon.
* **Explore mode:** drag or touch to orbit, scroll or pinch to zoom, and toggle Doppler
  beaming, jets and auto-orbit.
* **Built for every screen:**
  - Dynamic resolution scaling holds a smooth frame rate.
  - Phones get a lighter shader tier and a bottom-sheet layout.
  - A lens shift keeps the black hole clear of the UI.
  - It handles safe areas and reduced-motion settings.
* **Controls:**
  - Mouse: wheel, arrow keys, space (pause), `E` (explore), `F` (fullscreen).
  - Touch: swipe between chapters.

To host it, enable **GitHub Pages** for this branch: *Settings → Pages → Deploy from a branch*.

## Run it

**Website / real-time (needs a GPU):** serve the folder and open `index.html`
(the film's real-time preview player is `film.html`):

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

Space toggles play/pause, the arrow keys skip, `F` goes fullscreen, and the menu at the bottom
sets the resolution.

**Offline 4K render** (headless Chromium; works on CPU-only machines through SwiftShader,
or pass `--gpu`):

```bash
render/film.sh output 24                      # resumable chunked render -> output/picture.mp4
python3 audio/score.py output/score.f32       # synthesise the score
ffmpeg -i output/picture.mp4 -f f32le -ar 48000 -ac 2 -i output/score.f32 \
       -c:v copy -c:a aac -b:a 320k -shortest TON618.mp4
```

To render single frames for look development:

```bash
node render/render.cjs --stills 26,60 --w 1920 --h 804 --outdir stills
```

## Layout

```
index.html          the website (guided tour + explore)
film.html           film preview player and offline exporter entry point
site/               website chapters, app logic and styles
src/engine.js       shared WebGL2 engine (quality tiers, toggles, lens shift)
media/              film encodes, poster, score
src/shaders.js      geodesic ray tracer, bloom, composite (GLSL ES 3.0)
src/noise.js        tileable 3D noise volume + blackbody LUT
src/timeline.js     shots, camera choreography, caption cues
src/overlay.js      typography and the to-scale Solar System infographic
src/main.js         WebGL2 renderer, interactive player, frame exporter
render/render.cjs   headless frame server -> ffmpeg
render/film.sh      resumable chunked film render
audio/score.py      original score synthesiser (numpy)
```
