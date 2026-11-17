/*
 * TON 618 — WebGL2 rendering engine (shared by the website and the film exporter).
 *
 *   const R = new BH.Engine(canvas, { maxSteps: 360, noiseRes: 128 });
 *   R.resize(w, h);
 *   R.render(state, { quality, tiles, overlayOn, toCanvas, frame });
 *
 * `state` = camera + look parameters (see BH.frameState in timeline.js).
 * Optional overrides on `state`: beaming, jetBright, diskBright, skyBright, starScale.
 */
(function () {
  const BH = (window.BH = window.BH || {});

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader compile error:\n' + gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, BH.fullscreenVS));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link error: ' + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  function makeTex(gl, w, h, internal, format, type) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function makeTarget(gl, w, h, hdr) {
    const tex = hdr ? makeTex(gl, w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT) : makeTex(gl, w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Render target unsupported');
    return { tex, fb, w, h };
  }
  function mul3(a, b) {
    const o = new Array(9);
    for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2];
    return o;
  }

  BH.Engine = class {
    constructor(canvas, opts) {
      opts = opts || {};
      const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
      if (!gl) throw new Error('WebGL2 is not available on this device.');
      if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) throw new Error('Floating-point render targets are not supported.');
      gl.getExtension('OES_texture_float_linear');
      this.gl = gl; this.canvas = canvas;
      const defs = (opts.defines || []).map((d) => `#define ${d.replace('=', ' ')}\n`).join('');
      let fs = BH.sceneFS.replace('#version 300 es\n', '#version 300 es\n' + defs);
      if (opts.maxSteps) fs = fs.replace(/#define MAX_STEPS \d+/, `#define MAX_STEPS ${opts.maxSteps | 0}`);
      this.scene = program(gl, fs);
      this.down = program(gl, BH.downFS);
      this.up = program(gl, BH.upFS);
      this.streakP = program(gl, BH.streakFS);
      this.comp = program(gl, BH.compositeFS);
      this.bloomLevels = opts.bloomLevels || 8;

      const vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      const nv = BH.makeNoiseVolume(opts.noiseRes || 128);
      this.noise = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_3D, this.noise);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, nv.res, nv.res, nv.res, 0, gl.RGBA, gl.UNSIGNED_BYTE, nv.data);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.REPEAT);

      const bb = BH.makeBlackbodyLUT(256);
      this.bb = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.bb);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 256, 1, 0, gl.RGBA, gl.FLOAT, bb);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      this.overlayTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.overlayTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      const ax = 62 * Math.PI / 180, ay = 28 * Math.PI / 180;
      const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
      this.galRot = mul3([1, 0, 0, 0, cx, sx, 0, -sx, cx], [cy, 0, -sy, 0, 1, 0, sy, 0, cy]);
      this.w = 0; this.h = 0;
    }

    resize(w, h) {
      if (w === this.w && h === this.h) return;
      const gl = this.gl;
      this.w = w; this.h = h;
      this.canvas.width = w; this.canvas.height = h;
      const del = (t) => { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } };
      del(this.sceneT); del(this.outT);
      (this.mips || []).forEach(del); (this.streakT || []).forEach(del);
      this.sceneT = makeTarget(gl, w, h, true);
      this.outT = null;
      this.mips = [];
      let mw = w, mh = h;
      for (let i = 0; i < this.bloomLevels; i++) {
        mw = Math.max(1, Math.ceil(mw / 2)); mh = Math.max(1, Math.ceil(mh / 2));
        this.mips.push(makeTarget(gl, mw, mh, true));
        if (mh <= 4) break;
      }
      const sl = this.mips[Math.min(2, this.mips.length - 1)];
      this.streakT = [makeTarget(gl, sl.w, sl.h, true), makeTarget(gl, sl.w, sl.h, true)];
    }

    uploadOverlay(canvas2d) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.overlayTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas2d);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }

    render(st, opts) {
      const gl = this.gl, w = this.w, h = this.h;
      opts = opts || {};
      const pick = (v, d) => (v === undefined ? d : v);
      gl.bindVertexArray(this.vao);
      gl.disable(gl.BLEND);
      const frame = opts.frame || 0;

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneT.fb);
      gl.viewport(0, 0, w, h);
      if (st.fade <= 0.0001) {
        gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      } else {
        const S = this.scene, r = st.rot;
        gl.useProgram(S.p);
        gl.uniform2f(S.u.uRes, w, h);
        gl.uniform4f(S.u.uViewport, 0, -Math.round((st.shift || 0) * h), w, h);   // vertical lens shift
        gl.uniform3fv(S.u.uCamPos, st.pos);
        gl.uniformMatrix3fv(S.u.uCamRot, false, [...r.right, ...r.up, ...r.fwd]);
        gl.uniform1f(S.u.uTanHalfFov, st.tanHalf);
        gl.uniform1f(S.u.uTime, st.diskTime);
        gl.uniform1f(S.u.uJetTime, st.jetTime);
        gl.uniform1f(S.u.uFrame, frame % 1024);
        gl.uniform1f(S.u.uStepScale, opts.quality || 1.0);
        gl.uniform1f(S.u.uPixAngle, 2 * st.tanHalf / h);
        gl.uniform1f(S.u.uDiskBright, pick(st.diskBright, 5.0));
        gl.uniform1f(S.u.uStarScale, pick(st.starScale, Math.min(1, Math.pow(h / 2160, 2))));
        gl.uniform1f(S.u.uJetBright, pick(st.jetBright, 0.035));
        gl.uniform1f(S.u.uSkyBright, pick(st.skyBright, 1.0));
        gl.uniform1f(S.u.uROut, 26.0);
        gl.uniform1f(S.u.uRBound, 28.0);
        gl.uniform1f(S.u.uTPeak, 6200.0);
        gl.uniform1f(S.u.uBeaming, pick(st.beaming, 0.85));
        gl.uniformMatrix3fv(S.u.uGalRot, false, this.galRot);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, this.noise); gl.uniform1i(S.u.uNoise, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.bb); gl.uniform1i(S.u.uBB, 1);
        const tiles = opts.tiles || 1;
        if (tiles > 1) {
          gl.enable(gl.SCISSOR_TEST);
          const th = Math.ceil(h / tiles);
          const px = new Float32Array(4);
          for (let i = 0; i < tiles; i++) {
            const y0 = i * th;
            gl.scissor(0, y0, w, Math.min(th, h - y0));
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.readPixels(0, Math.min(y0, h - 1), 1, 1, gl.RGBA, gl.FLOAT, px);
          }
          gl.disable(gl.SCISSOR_TEST);
        } else gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      // bloom down-chain
      const D = this.down, U = this.up, P = this.streakP, C = this.comp;
      gl.useProgram(D.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(D.u.uSrc, 0);
      let src = this.sceneT;
      for (let i = 0; i < this.mips.length; i++) {
        const dst = this.mips[i];
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
        gl.viewport(0, 0, dst.w, dst.h);
        gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.uniform2f(D.u.uSrcTexel, 1 / src.w, 1 / src.h);
        gl.uniform2f(D.u.uDstSize, dst.w, dst.h);
        gl.uniform1i(D.u.uFirst, i === 0 ? 1 : 0);
        gl.uniform1f(D.u.uThreshold, 0.0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        src = dst;
      }
      // anamorphic streak
      gl.useProgram(P.p);
      gl.uniform1i(P.u.uSrc, 0);
      let sSrc = this.mips[Math.min(2, this.mips.length - 1)];
      const steps = [1.0, 3.5, 9.0];
      for (let k = 0; k < steps.length; k++) {
        const dst = this.streakT[k % 2];
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
        gl.viewport(0, 0, dst.w, dst.h);
        gl.bindTexture(gl.TEXTURE_2D, sSrc.tex);
        gl.uniform2f(P.u.uSrcTexel, 1 / sSrc.w, 1 / sSrc.h);
        gl.uniform2f(P.u.uDstSize, dst.w, dst.h);
        gl.uniform1f(P.u.uStep, steps[k]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        sSrc = dst;
      }
      const streakTex = sSrc.tex;
      // bloom up-chain
      gl.useProgram(U.p);
      gl.uniform1i(U.u.uSrc, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = this.mips.length - 1; i > 0; i--) {
        const s = this.mips[i], dst = this.mips[i - 1];
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
        gl.viewport(0, 0, dst.w, dst.h);
        gl.bindTexture(gl.TEXTURE_2D, s.tex);
        gl.uniform2f(U.u.uSrcTexel, 1 / s.w, 1 / s.h);
        gl.uniform2f(U.u.uDstSize, dst.w, dst.h);
        gl.uniform1f(U.u.uRadius, 1.0);
        gl.uniform1f(U.u.uWeight, 1.0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);

      // composite
      if (!opts.toCanvas && !this.outT) this.outT = makeTarget(gl, w, h, false);
      gl.useProgram(C.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, opts.toCanvas ? null : this.outT.fb);
      gl.viewport(0, 0, w, h);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneT.tex); gl.uniform1i(C.u.uScene, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.mips[0].tex); gl.uniform1i(C.u.uBloom, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, streakTex); gl.uniform1i(C.u.uStreak, 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.overlayTex); gl.uniform1i(C.u.uOverlay, 3);
      gl.uniform2f(C.u.uRes, w, h);
      gl.uniform1f(C.u.uExposure, st.exposure);
      gl.uniform1f(C.u.uBloomStrength, st.bloom);
      gl.uniform1f(C.u.uStreakStrength, st.streak);
      gl.uniform1f(C.u.uFade, st.fade);
      gl.uniform1f(C.u.uOverlayOn, opts.overlayOn ? 1 : 0);
      gl.uniform1f(C.u.uFrame, frame % 4096);
      gl.uniform1f(C.u.uGrain, pick(opts.grain, 0.010));
      gl.uniform1f(C.u.uCA, 0.0045);
      gl.uniform2f(C.u.uGlarePos, st.glarePos ? st.glarePos[0] : 0.5, st.glarePos ? st.glarePos[1] : 0.5);
      gl.uniform1f(C.u.uGlare, st.glare || 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
    }

    readPixels() {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.outT.fb);
      const px = new Uint8Array(this.w * this.h * 4);
      gl.readPixels(0, 0, this.w, this.h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    }
  };

  // Camera helpers shared by the website
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  BH.vec = { sub, cross, norm, dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] };
  BH.lookRot = function (pos, target, rollDeg) {
    const f = norm(sub(target, pos));
    const r = norm(cross(f, [0, 1, 0]));
    const u = cross(r, f);
    const c = Math.cos(rollDeg * Math.PI / 180), s = Math.sin(rollDeg * Math.PI / 180);
    return {
      right: [r[0] * c + u[0] * s, r[1] * c + u[1] * s, r[2] * c + u[2] * s],
      up: [u[0] * c - r[0] * s, u[1] * c - r[1] * s, u[2] * c - r[2] * s],
      fwd: f,
    };
  };
})();
