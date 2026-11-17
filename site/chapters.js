/*
 * Guided-tour chapters: camera presets, copy, key figures and feature callouts.
 * Camera: D (distance, Rs), az/el (deg), roll (deg), fov (deg, vertical, designed for 16:9), ty (look-at height), ex (exposure)
 * drift: azimuth drift in deg/s while the chapter plays.
 * Callouts:
 *   {kind:'shadow', ang, k}  — point at k × (apparent shadow radius) from the centre, at screen angle `ang` (deg, 0 = right, 90 = up)
 *   {kind:'disk', r, rel}    — point on the disk plane at radius r, azimuth rel (deg) relative to the camera's azimuth
 *   {kind:'world', p:[x,y,z]}
 *   {kind:'approach'|'recede', r} — the Doppler-brightened / dimmed side of the disk
 *   dx, dy: label offset in CSS px (desktop); flips automatically near screen edges
 */
(function () {
  const BH = (window.BH = window.BH || {});

  BH.hero = { cam: { D: 46, az: 38, el: 7.5, roll: -3, fov: 44, ex: 0.95 }, drift: 2.2 };

  BH.chapters = [
    {
      id: 'light', kicker: 'A point of light', title: 'Brighter than a galaxy',
      body: 'Ten billion light-years away, in the constellation Canes Venatici, a single point of light outshines every star of its galaxy combined. Astronomers call it a quasar: the glare of a black hole feeding on gas.',
      facts: [['10.8 bn', 'light-years away'], ['z = 2.219', 'redshift'], ['1957', 'first catalogued']],
      cam: { D: 4200, az: 18, el: 14, roll: 0, fov: 26, ex: 1.0 }, drift: 0.35, dur: 12, glare: true,
    },
    {
      id: 'mass', kicker: 'Ultramassive', title: '40.7 billion Suns',
      body: 'TON 618 is one of the most massive black holes ever weighed: nearly ten thousand times heavier than Sagittarius A*, the black hole at the heart of our own Milky Way.',
      facts: [['40.7 bn', 'solar masses'], ['≈ 9,500×', 'Sagittarius A*'], ['803 AU', 'Schwarzschild radius']],
      cam: { D: 50, az: 62, el: 9, roll: -3, fov: 42, ex: 0.95 }, drift: 1.4, dur: 12,
    },
    {
      id: 'lensing', kicker: 'Gravitational lensing', title: 'Light, bent back',
      body: 'Its gravity bends light so violently that the far side of the disk appears folded up and over the black hole, and underneath it. You are seeing the back and the underside of the disk at the same time.',
      facts: [['2Rs / b', 'deflection far away'], ['∞', 'at the photon sphere'], ['per pixel', 'computed live']],
      cam: { D: 33, az: 118, el: 3.4, roll: -4, fov: 46, ex: 0.9 }, drift: 0.7, dur: 13,
      callouts: [
        { kind: 'shadow', ang: 72, k: 1.75, label: 'Far side of the disk', sub: 'lensed over the top', dx: 120, dy: -70 },
        { kind: 'shadow', ang: -100, k: 1.22, label: 'Underside of the disk', sub: 'lensed beneath the shadow', dx: -150, dy: 80 },
      ],
    },
    {
      id: 'ring', kicker: 'The photon ring', title: 'Where light orbits',
      body: 'At 1.5 Schwarzschild radii, light itself can circle the black hole. The razor-thin ring at the edge of the shadow is light that looped around it, some of it more than once, before escaping towards you.',
      facts: [['1.5 Rs', 'photon sphere'], ['2.6×', 'shadow vs. horizon'], ['\u2248 76 days', 'one lap of light']],
      cam: { D: 30, az: 150, el: 7, roll: -2, fov: 19, ex: 0.85 }, drift: 0.45, dur: 13,
      callouts: [
        { kind: 'shadow', ang: 128, k: 1.0, label: 'Photon ring', sub: 'light that orbited the black hole', dx: -150, dy: -90 },
        { kind: 'shadow', ang: -35, k: 0.55, label: 'Shadow', sub: 'no light escapes from here', dx: 170, dy: 60 },
      ],
    },
    {
      id: 'doppler', kicker: 'Relativity in action', title: 'Doppler beaming',
      body: 'Gas on one side of the disk rushes towards us at a large fraction of the speed of light, so its light is boosted and blueshifted. The receding side is dimmed and reddened. Watch as relativity is switched off, then back on.',
      facts: [['≈ 0.5 c', 'orbital speed'], ['g⁴', 'brightness boost'], ['+ redshift', 'from gravity']],
      cam: { D: 40, az: 178, el: 12, roll: 0, fov: 44, ex: 0.9 }, drift: 0.5, dur: 14, beamDemo: true,
      callouts: [
        { kind: 'approach', r: 9, label: 'Approaching side', sub: 'boosted & blueshifted', dx: -40, dy: -120 },
        { kind: 'recede', r: 9, label: 'Receding side', sub: 'dimmed & reddened', dx: 40, dy: 110 },
      ],
    },
    {
      id: 'scale', kicker: 'A sense of scale', title: 'Our Solar System, to scale',
      body: 'That speck is our entire Solar System, out to Neptune. TON 618’s event horizon is about 1,600 AU across, 27 times wider than Neptune’s orbit. Light would need more than nine days to cross it.',
      facts: [['1,600 AU', 'horizon diameter'], ['27×', 'Neptune’s orbit'], ['9.3 days', 'light-crossing time']],
      cam: { D: 62, az: 164, el: 26, roll: 0, fov: 46, ex: 0.8 }, drift: 0.25, dur: 15, cut: true, scaleDemo: true,
    },
    {
      id: 'disk', kicker: 'The accretion disk', title: 'A whirlpool of fire',
      body: 'Gas spirals inwards, heated by friction until it glows. At the innermost stable orbit, about 2,400 AU out, it whirls at half the speed of light. Even so, a single orbit there takes about seven months.',
      facts: [['0.5 c', 'speed at the ISCO'], ['≈ 214 days', 'one orbit at the ISCO'], ['2,400 AU', 'ISCO radius']],
      cam: { D: 17.5, az: 268, el: 9.5, roll: 9, fov: 58, ex: 0.38 }, drift: 1.0, dur: 13,
      callouts: [
        { kind: 'disk', r: 3.3, rel: 62, label: 'Innermost stable orbit', sub: '3 Rs — gas plunges in beyond here', dx: -170, dy: -110 },
      ],
    },
    {
      id: 'jets', kicker: 'Relativistic jets', title: 'Beams across the cosmos',
      body: 'Twisted magnetic fields can fling part of the infalling matter out along the poles at nearly the speed of light. TON 618 emits radio waves; the jets shown here are an artist’s impression based on other quasars.',
      facts: [['≈ c', 'jet speed'], ['radio', 'emission detected'], ['poles', 'magnetic launch']],
      cam: { D: 70, az: 300, el: 24, roll: 0, fov: 44, ty: 6, ex: 0.95 }, drift: 0.8, dur: 12, jetBright: 0.09,
      callouts: [
        { kind: 'world', p: [0, 24, 0], label: 'Polar jet', sub: 'magnetised plasma', dx: 140, dy: -40 },
      ],
    },
    {
      id: 'power', kicker: 'The power of a quasar', title: '140 trillion Suns',
      body: 'TON 618 radiates around 4 × 10⁴⁰ watts. Its light ionises an enormous cloud of gas around it, a glowing Lyman-alpha nebula more than 300,000 light-years across.',
      facts: [['4×10⁴⁰ W', 'luminosity'], ['140 trillion', 'Suns'], ['100 kpc', 'nebula diameter']],
      cam: { D: 95, az: 332, el: 11, roll: 0, fov: 40, ty: -6, ex: 0.95 }, drift: 0.9, dur: 12,
    },
    {
      id: 'film', kicker: 'The film', title: 'Journey to TON 618',
      body: 'An 87-second 4K film, rendered frame by frame with the same general-relativistic ray tracer that is running live on your screen right now.',
      facts: [['3840×2160', 'UHD 4K'], ['2.39 : 1', 'scope'], ['original', 'score']],
      cam: { D: 62, az: 20, el: 10, roll: 0, fov: 40, ex: 0.95 }, drift: 1.6, dur: 14, cta: true,
    },
  ];
})();
