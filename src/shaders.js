/*
 * TON 618 — GLSL shaders
 *
 * Units: Schwarzschild radius Rs = 1 (so M = 0.5).  Event horizon r = 1,
 * photon sphere r = 1.5, innermost stable circular orbit (ISCO) r = 3,
 * critical impact parameter (shadow radius) b_c = 3*sqrt(3)/2 ≈ 2.598.
 *
 * Null geodesics are integrated with the exact orbit equation of the
 * Schwarzschild metric, u'' + u = 1.5 u^2 (u = 1/r), written in Cartesian
 * form as the "central force"  a = -1.5 h^2 x / r^5  with h = |x × v|.
 * Outside a bounding sphere, rays are straight lines plus the analytic
 * weak-field deflection 2Rs/b, split between the incoming/outgoing legs.
 */
(function () {
  const BH = (window.BH = window.BH || {});

  BH.fullscreenVS = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

  // ------------------------------------------------------------------
  // Scene: geodesic ray tracer
  // ------------------------------------------------------------------
  BH.sceneFS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
precision highp sampler2D;

uniform vec2  uRes;
uniform vec4  uViewport;     // full-frame offset/size (for tiled & cropped renders)
uniform vec3  uCamPos;
uniform mat3  uCamRot;       // columns: right, up, forward
uniform float uTanHalfFov;
uniform float uTime;         // disk animation time (simulation units)
uniform float uJetTime;
uniform float uFrame;
uniform float uStepScale;
uniform float uPixAngle;     // angular size of one pixel (radians, unlensed)
uniform float uDiskBright;
uniform float uJetBright;
uniform float uSkyBright;
uniform float uROut;
uniform float uRBound;
uniform float uTPeak;
uniform float uBeaming;      // 0 = no Doppler, 1 = full relativistic Doppler
uniform mat3  uGalRot;
uniform float uStarScale;
uniform sampler3D uNoise;
uniform sampler2D uBB;

out vec4 outColor;

#define PI  3.14159265359
#define TAU 6.28318530718
#define RIN 3.0
#define MAX_STEPS 360

// ---------------------------------------------------------------- utils
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

float erfApprox(float x) {
  float x2 = x * x;
  float a = 0.147;
  float t = 1.0 - exp(-x2 * (1.27323954 + a * x2) / (1.0 + a * x2));
  return sign(x) * sqrt(max(t, 0.0));
}

vec3 blackbody(float T) {        // luminance-normalised linear-sRGB chromaticity
  float u = clamp((log(T) - 6.68461) / (10.59663 - 6.68461), 0.0, 1.0); // 800K..40000K
  return texture(uBB, vec2(u, 0.5)).rgb;
}

// --------------------------------------------------------- accretion disk
float diskSigma(float rho) { return 0.016 + 0.0115 * rho; }    // Gaussian scale height (thin disk, H/r ~ 0.012)

float diskTemp(float rho) {     // Novikov-Thorne-like profile, peak normalised to 1
  float x = max(rho / RIN, 1.0);
  return pow(x, -0.75) * pow(max(1.0 - 0.92 * inversesqrt(x), 0.0), 0.25) / 0.5529;
}

// returns (density, brightness variation)
vec2 diskDensity(vec3 p, float rho) {
  float sig = diskSigma(rho);
  float yn = p.y / sig;
  float vert = exp(-0.5 * yn * yn);
  float inner = smoothstep(RIN - 0.75, RIN + 0.35, rho);
  float outer = 1.0 - smoothstep(uROut * 0.45, uROut, rho);
  float env = vert * inner * outer;
  if (env < 0.003) return vec2(0.0);

  float om = sqrt(0.5 / (rho * rho * rho));           // Keplerian Ω (M = 0.5)
  float phi = atan(p.z, p.x) + om * uTime;
  float a = phi * (1.0 / TAU);
  float s = log(rho);

  vec4 n1 = texture(uNoise, vec3(a * 2.0, s * 3.4, yn * 0.05 + s * 0.35));
  vec4 n2 = texture(uNoise, vec3(a * 6.0 + 0.31, s * 13.0, yn * 0.12 + 0.41));
  float fil = texture(uNoise, vec3(a * 3.0 + 0.71, s * 46.0, yn * 0.08 + 0.13)).a;  // thin streaks
  float base = n1.r * 0.5 + n1.g * 0.32 + n1.b * 0.18;
  float det  = n2.g * 0.5 + n2.b * 0.5;
  float d = base * (0.35 + 1.25 * det);
  d = smoothstep(0.18, 0.95, d);
  d *= 0.45 + 0.75 * fil + 0.35 * n2.a;
  d = d * d * 1.6;
  // surface density: denser inside, more tenuous and wispy outside
  float surf = mix(1.0, 0.35, smoothstep(RIN, uROut, rho));
  return vec2(env * d * surf, 0.45 + 1.1 * n1.a * n2.r + 0.3 * fil);
}

// ---------------------------------------------------------------- jets
float jetRadius(float ay) { return 0.32 + 0.075 * ay; }

// Analytic line integral of a Gaussian tube along the y axis, over the
// straight segment p0 + s*dir, s in [0, L]  (dir must be unit length)
vec3 jetSegment(vec3 p0, vec3 dir, float L) {
  vec2 pxz = p0.xz, dxz = dir.xz;
  float dd = dot(dxz, dxz);
  float sStar = dd > 1e-7 ? -dot(pxz, dxz) / dd : 0.5 * L;
  float sc = clamp(sStar, 0.0, L);
  vec3 pc = p0 + dir * sc;
  float ay = abs(pc.y);
  if (ay < 1.15) return vec3(0.0);
  float R = jetRadius(ay);
  vec2 q = pxz + dxz * sStar;
  float dperp2 = dot(q, q);
  if (dperp2 > 9.0 * R * R) return vec3(0.0);
  float k = sqrt(dd) / R;
  float g = exp(-dperp2 / (R * R));
  float integ = (k * L < 1e-3) ? L * g
              : g * 0.8862269 / k * (erfApprox(k * (L - sStar)) - erfApprox(-k * sStar));
  // longitudinal profile + moving knots
  float fall = smoothstep(1.15, 3.5, ay) / (1.0 + 0.035 * ay) * exp(-ay / 260.0);
  float kn = texture(uNoise, vec3(0.27, ay * 0.0125 - uJetTime * 0.035, 0.63 + sign(pc.y) * 0.25)).g;
  float knots = 0.35 + 1.1 * kn * kn;
  // relativistic beaming of the jet (bulk β ≈ 0.6, softened)
  float mu = dot(vec3(0.0, sign(pc.y), 0.0), -dir);
  float delta = 1.0 / (1.25 * (1.0 - 0.6 * mu));
  float beam = delta * delta * delta;
  vec3 col = mix(vec3(0.42, 0.58, 1.0), vec3(0.85, 0.9, 1.0), exp(-ay * 0.08));
  return col * (uJetBright * fall * knots * beam * integ / (R * R));
}

// ---------------------------------------------------------------- sky
vec3 starLayer(vec3 d, float scale, float dens, float seed, float fp, float mag) {
  vec3 p = d * scale;
  vec3 cell = floor(p);
  vec3 h = hash33(cell + seed);
  if (h.x > dens) return vec3(0.0);
  vec3 off = 0.2 + 0.6 * hash33(cell + seed + 19.19);
  vec3 sp = normalize(cell + off);
  vec3 q = sp * scale - cell;
  if (any(lessThan(q, vec3(0.06))) || any(greaterThan(q, vec3(0.94)))) return vec3(0.0);
  float sig = 0.62 * fp;
  vec3 dv = d - sp;
  float g = exp(-0.5 * dot(dv, dv) / (sig * sig));
  float lum = 0.05 + 6.0 * pow(h.y, 14.0) + 0.35 * h.y * h.y * h.y;
  float T = mix(2800.0, 12500.0, pow(h.z, 1.6));
  return blackbody(T) * (lum * g * mag);
}

vec3 sky(vec3 d, float fp) {
  vec3 g = uGalRot * d;
  float lat = g.y;
  // host-galaxy band (we sit at the centre of TON 618's host galaxy)
  vec4 n  = texture(uNoise, g * 0.85 + vec3(0.5));
  vec4 n2 = texture(uNoise, g * 2.6 + vec3(0.13, 0.71, 0.29));
  vec4 n3 = texture(uNoise, g * 6.5 + vec3(0.77, 0.21, 0.55));
  float band = exp(-lat * lat / 0.022);
  float core = exp(-lat * lat / 0.0035);
  float wide = exp(-lat * lat / 0.16);
  float clouds = n.r * 0.55 + n2.g * 0.3 + n3.b * 0.15;
  float dust = smoothstep(0.42, 0.72, n2.r * 0.55 + n.b * 0.3 + n3.g * 0.15) * exp(-lat * lat / 0.006);
  vec3 c = vec3(1.0, 0.80, 0.60) * (band * (0.15 + 1.3 * clouds * clouds * clouds) * 0.022 + core * 0.012 * clouds);
  c += vec3(0.45, 0.62, 1.0) * wide * pow(clouds, 4.0) * 0.016;
  c += vec3(0.75, 0.82, 1.0) * band * pow(n3.r, 6.0) * 0.035;            // star-forming knots
  c *= 1.0 - 0.9 * dust;
  // faint diffuse nebulosity
  float neb = n2.b * n.g;
  c += vec3(0.30, 0.10, 0.28) * pow(neb, 2.5) * 0.02 + vec3(0.06, 0.16, 0.22) * pow(n3.a * n.r, 3.0) * 0.025;

  // stars: footprint-aware so lensing magnification is flux-conserving and alias-free
  float mag = clamp(uPixAngle * uPixAngle / (fp * fp), 0.0, 10.0) * uStarScale;
  vec3 s = vec3(0.0);
  s += starLayer(d, 140.0, 0.20, 1.7,  fp, mag) * 1.0;
  s += starLayer(d, 320.0, 0.24, 7.3,  fp, mag) * 0.45;
  s += starLayer(d, 700.0, 0.30, 13.9, fp, mag) * 0.18;
  s *= 0.6 + 0.8 * band;
  return (c + s) * uSkyBright;
}

// weak-field deflection of a straight leg between line parameters sa..sb
vec3 bendLeg(vec3 p, vec3 d, float sa, float sb) {
  vec3 perp = p - dot(p, d) * d;            // closest-approach vector
  float b = length(perp);
  if (b < 1e-4) return d;
  float alpha = (sb / sqrt(b * b + sb * sb) - sa / sqrt(b * b + sa * sa)) / b;
  return normalize(d - perp / b * alpha);
}

void main() {
  vec2 frag = gl_FragCoord.xy + uViewport.xy;
  vec2 ndc = (frag - 0.5 * uViewport.zw) / (0.5 * uViewport.w);
  vec3 dir = normalize(uCamRot * vec3(ndc * uTanHalfFov, 1.0));
  vec3 pos = uCamPos;
  float rcam = length(pos);

  vec3 col = vec3(0.0);
  float trans = 1.0;
  float captured = 0.0;
  vec3 outDir = dir;

  // intersect bounding sphere
  float bq = dot(pos, dir);
  float cq = dot(pos, pos) - uRBound * uRBound;
  float disc = bq * bq - cq;
  bool inside = cq <= 0.0;
  bool hits = inside || (disc > 0.0 && bq < 0.0);

  if (!hits) {
    col += jetSegment(pos, dir, 6000.0);
    outDir = bendLeg(pos, dir, bq, 1e6);
  } else {
    float tEnter = inside ? 0.0 : (-bq - sqrt(max(disc, 0.0)));
    vec3 x = pos + dir * tEnter;
    vec3 v = dir;
    if (!inside) {
      col += jetSegment(pos, dir, tEnter);
      v = bendLeg(pos, dir, bq, bq + tEnter);
    }
    float r0 = length(x);
    vec3 Lv = cross(x, v);
    float h2 = dot(Lv, Lv);
    // photon constants for the redshift:  b = L/E,  Ly = L·ŷ (physical photon travels along -v)
    float bImp = inversesqrt(max(1.0 / max(h2, 1e-8) - 1.0 / (r0 * r0 * r0), 1e-8));
    float LyHat = -Lv.y * inversesqrt(max(h2, 1e-12));
    float camRed = inversesqrt(max(1.0 - 1.0 / max(rcam, 1.05), 0.05));

    float jit = ign(gl_FragCoord.xy + vec2(uFrame * 5.588, uFrame * 3.1));
    float r2 = dot(x, x);
    float r = sqrt(r2);
    vec3 acc = -1.5 * h2 * x / (r2 * r2 * r);

    for (int i = 0; i < MAX_STEPS; i++) {
      if (r < 1.0) { captured = 1.0; break; }
      if (r > uRBound && dot(x, v) > 0.0) break;
      if (trans < 0.004) break;

      float vlen = length(v);
      float ds = uStepScale * 0.085 * r;
      ds = min(ds, max(0.6 * (r - 1.0), 0.04) + 0.02);

      float rho = length(x.xz);
      bool diskZone = rho > RIN - 0.8 && rho < uROut * 1.02;
      float sig = diskSigma(rho);
      float Hb = 3.0 * sig;
      float ay = abs(x.y);
      float vy = v.y / vlen;
      bool inSlab = false;
      if (diskZone) {
        if (ay > Hb) {
          if (x.y * vy < 0.0) ds = min(ds, (ay - Hb) / max(abs(vy), 1e-4) + 0.35 * sig);
        } else {
          inSlab = true;
          ds = min(ds, max(0.55 * sig / max(abs(vy), 0.12), 0.06 * sig));
          ds = min(ds, 0.05 * rho + 0.03);
        }
      }

      // velocity-Verlet (kick-drift-kick); conserves h exactly for a central force
      float dt = ds / vlen;
      vec3 vh = v + 0.5 * dt * acc;
      vec3 xn = x + dt * vh;
      float r2n = dot(xn, xn);
      float rn = sqrt(r2n);
      vec3 accn = -1.5 * h2 * xn / (r2n * r2n * rn);
      vec3 vn = vh + 0.5 * dt * accn;

      vec3 seg = xn - x;
      float segL = length(seg);

      // ---- volumetric accretion disk (emission–absorption) ----
#ifndef NO_DISK
      if (inSlab || (diskZone && abs(xn.y) < Hb)) {
        float j = fract(jit + float(i) * 0.6180339);
        vec3 p = x + seg * j;
        float prho = length(p.xz);
        vec2 dd = diskDensity(p, prho);
        if (dd.x > 0.0005) {
          float pr = length(p);
          float om = sqrt(0.5 / (prho * prho * prho));
          float gfac = sqrt(max(1.0 - 1.5 / pr, 0.02)) * camRed / max(1.0 - om * bImp * LyHat, 0.05);
          gfac = mix(1.0, gfac, uBeaming);
          float T = uTPeak * diskTemp(prho) * gfac;
          float Tn = T / uTPeak;
          vec3 S = blackbody(T) * (Tn * Tn * Tn * Tn) * dd.y * uDiskBright;
          float sigp = diskSigma(prho);
          float dtau = dd.x * 2.4 * segL / sigp;
          float alpha = 1.0 - exp(-dtau);
          col += trans * alpha * S;
          trans *= 1.0 - alpha;
        }
      }

#endif
#ifndef NO_JET
      // ---- relativistic jets ----
      if (segL > 1e-5 && (abs(x.y) > 1.0 || abs(xn.y) > 1.0)) {
        float rhoMin = min(length(x.xz), length(xn.xz));
        if (rhoMin < 3.0 * jetRadius(max(abs(x.y), abs(xn.y))) + segL) {
          col += trans * jetSegment(x, seg / segL, segL);
        }
      }

#endif
      x = xn; v = vn; acc = accn; r = rn; r2 = r2n;
      if (i == MAX_STEPS - 1) captured = 1.0;
    }

    if (captured < 0.5) {
      vec3 vd = normalize(v);
      float sNow = dot(x, vd);
      col += trans * jetSegment(x, vd, 6000.0);
      outDir = bendLeg(x, vd, sNow, 1e6);
    }
  }

  // sky with lensing-aware footprint (derivatives taken in uniform control flow)
  vec3 dx = dFdx(outDir), dy = dFdy(outDir);
  float fp = max(max(length(dx), length(dy)), 1e-7);
  fp = max(fp, uPixAngle * 0.02);
#ifdef NO_SKY
  vec3 bg = vec3(0.0);
#else
  vec3 bg = sky(outDir, fp);
#endif
  col += trans * bg * (1.0 - captured);

  outColor = vec4(max(col, 0.0), 1.0);
}`;

  // ------------------------------------------------------------------
  // Bloom: 13-tap downsample (Karis average on first level) + tent upsample
  // ------------------------------------------------------------------
  BH.downFS = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uSrcTexel;
uniform vec2 uDstSize;
uniform int uFirst;
uniform float uThreshold;
out vec4 o;
vec3 S(vec2 uv, vec2 off) { return texture(uSrc, uv + off * uSrcTexel).rgb; }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 kw(vec3 c) { return c / (1.0 + lum(c) * 0.25); }
void main() {
  vec2 uv = gl_FragCoord.xy / uDstSize;
  vec3 a = S(uv, vec2(-2, 2)), b = S(uv, vec2(0, 2)), c = S(uv, vec2(2, 2));
  vec3 d = S(uv, vec2(-2, 0)), e = S(uv, vec2(0, 0)), f = S(uv, vec2(2, 0));
  vec3 g = S(uv, vec2(-2, -2)), h = S(uv, vec2(0, -2)), i = S(uv, vec2(2, -2));
  vec3 j = S(uv, vec2(-1, 1)), k = S(uv, vec2(1, 1)), l = S(uv, vec2(-1, -1)), m = S(uv, vec2(1, -1));
  vec3 res;
  if (uFirst == 1) {
    vec3 g0 = (j + k + l + m) * 0.25, g1 = (a + b + d + e) * 0.25, g2 = (b + c + e + f) * 0.25;
    vec3 g3 = (d + e + g + h) * 0.25, g4 = (e + f + h + i) * 0.25;
    res = kw(g0) * 0.5 + (kw(g1) + kw(g2) + kw(g3) + kw(g4)) * 0.125;
    res = max(res - uThreshold, 0.0);
  } else {
    res = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  o = vec4(res, 1.0);
}`;

  BH.upFS = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uSrcTexel;
uniform vec2 uDstSize;
uniform float uRadius;
uniform float uWeight;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uDstSize;
  vec2 t = uSrcTexel * uRadius;
  vec3 s = texture(uSrc, uv).rgb * 4.0;
  s += (texture(uSrc, uv + vec2(-t.x, 0)).rgb + texture(uSrc, uv + vec2(t.x, 0)).rgb +
        texture(uSrc, uv + vec2(0, -t.y)).rgb + texture(uSrc, uv + vec2(0, t.y)).rgb) * 2.0;
  s += texture(uSrc, uv + vec2(-t.x, -t.y)).rgb + texture(uSrc, uv + vec2(t.x, -t.y)).rgb +
       texture(uSrc, uv + vec2(-t.x, t.y)).rgb + texture(uSrc, uv + vec2(t.x, t.y)).rgb;
  o = vec4(s * (uWeight / 16.0), 1.0);
}`;

  // horizontal anamorphic streak (run on a low-res bright level)
  BH.streakFS = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uSrcTexel;
uniform vec2 uDstSize;
uniform float uStep;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uDstSize;
  vec3 s = vec3(0.0); float wsum = 0.0;
  for (int i = -7; i <= 7; i++) {
    float w = exp(-0.5 * float(i * i) / 12.0);
    s += texture(uSrc, uv + vec2(float(i) * uStep * uSrcTexel.x, 0.0)).rgb * w;
    wsum += w;
  }
  o = vec4(s / wsum, 1.0);
}`;

  // ------------------------------------------------------------------
  // Final composite: bloom, streak, exposure, ACES, grade, vignette,
  // chromatic aberration, grain, overlay, fade
  // ------------------------------------------------------------------
  BH.compositeFS = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uStreak;
uniform sampler2D uOverlay;
uniform vec2 uRes;
uniform float uExposure;
uniform float uBloomStrength;
uniform float uStreakStrength;
uniform float uFade;
uniform float uOverlayOn;
uniform float uFrame;
uniform float uGrain;
uniform float uCA;
out vec4 o;

vec3 aces(vec3 x) {
  // Stephen Hill's fitted ACES (RRT+ODT)
  const mat3 IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  x = IN * x;
  vec3 a = x * (x + 0.0245786) - 0.000090537;
  vec3 b = x * (0.983729 * x + 0.4329510) + 0.238081;
  x = OUT * (a / b);
  return clamp(x, 0.0, 1.0);
}
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  vec2 caOff = cc * r2 * uCA;
  vec3 hdr;
  hdr.r = texture(uScene, uv - caOff).r;
  hdr.g = texture(uScene, uv).g;
  hdr.b = texture(uScene, uv + caOff).b;
  vec3 bloom = texture(uBloom, uv).rgb;
  vec3 streak = texture(uStreak, uv).rgb * vec3(0.75, 0.85, 1.15);
  vec3 c = hdr + bloom * uBloomStrength + streak * uStreakStrength;
  c *= uExposure;
  c = aces(c);
  // gentle filmic grade: cool shadows, warm highlights
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c * vec3(0.94, 0.98, 1.06), c * vec3(1.03, 1.0, 0.95), smoothstep(0.05, 0.6, l));
  c *= 1.0 - 0.38 * smoothstep(0.08, 0.62, r2 * 1.6);      // vignette
  c *= uFade;
  vec3 s = toSRGB(clamp(c, 0.0, 1.0));
  if (uOverlayOn > 0.5) {
    vec4 ov = texture(uOverlay, uv);
    s = s * (1.0 - ov.a) + ov.rgb;
  }
  float n = hash12(gl_FragCoord.xy + fract(uFrame * 0.6180339) * 917.0) + hash12(gl_FragCoord.yx * 1.37 + uFrame) - 1.0;
  s += n * (uGrain * (0.35 + 0.65 * (1.0 - l)) + 0.5 / 255.0);
  o = vec4(clamp(s, 0.0, 1.0), 1.0);
}`;
})();
