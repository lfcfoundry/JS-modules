// Copyright (c) 2026 LFC Foundry. MIT License. The in-page half of the gpu-blur speed run (see run.js). It runs inside the browser; nothing here is shipped with the module.
// bench({ mode: 'main' | 'cold' | 'rest', quick }) -> plain object of medians. Lower is better for every number (milliseconds).
async function bench(arg) {
  const G = window.GpuBlur, med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; }, r1 = (x) => Math.round(x * 10) / 10;
  const rng = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
  const lab = (w, h) => { const u = new Uint8Array(w * h * 4), r = rng(3); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, e = ((x >> 5) + (y >> 5)) & 1; u[i] = x * 255 / w; u[i + 1] = e ? 220 : 40; u[i + 2] = y * 255 / h; u[i + 3] = 160 + ((r() * 90) | 0); } return u; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tick = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); }; c.port2.postMessage(0); });
  // the page-task probe: a message loop that never stops; its largest gap since reset() is the longest page task
  const P = { run: true, last: performance.now(), gap: 0, turns: 0 };
  { const ch = new MessageChannel(); ch.port1.onmessage = () => { const n = performance.now(); if (n - P.last > P.gap) P.gap = n - P.last; P.last = n; P.turns++; if (P.run) ch.port2.postMessage(0); }; ch.port2.postMessage(0); }
  P.reset = async () => { await sleep(25); await tick(); await tick(); P.gap = 0; P.last = performance.now(); };
  P.read = async () => { await tick(); await tick(); return P.gap; };
  const out = { mode: arg.mode, rows: [], notes: [] };
  const cvOf = (px, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.buffer, px.byteOffset, px.length), w, h), 0, 0); return c; };
  const vis = document.createElement('canvas'); vis.width = 64; vis.height = 64; const vg = vis.getContext('2d', { willReadFrequently: true }); document.body.appendChild(vis);
  const force = (cv) => { vg.drawImage(cv, 0, 0, 64, 64); vg.getImageData(0, 0, 1, 1); };   // draws the result and waits until the picture is really finished

  if (arg.mode === 'cold') {                   // first use on a fresh page: ready(), then the first 1920 x 1080 blur by the route auto picks
    const px = lab(1920, 1080), t0 = performance.now(); await P.reset();
    const info = await G.ready(); const tReady = performance.now() - t0; const gapReady = await P.read();
    await P.reset(); const t1 = performance.now(); const res = await G.blur(px, 1920, 1080, 12, { out: 'canvas' }); const call = performance.now() - t1; force(res.canvas); const ready = performance.now() - t1; const gap = await P.read();
    out.cold = { readyMs: r1(tReady), readyGap: r1(gapReady), route: res.route, call: r1(call), seen: r1(ready), gap: r1(gap), info };
    P.run = false; return out;
  }

  const R = 12, SIZES = arg.sizes || [[480, 270], [1920, 1080]], part = arg.part || 'all';
  await G.ready(); out.info = G.info();
  const routes = ['wasm', 'js', 'auto', 'webgl2'];     // the card way last, with a rest after it: its leftovers (software rendering threads, big textures) must not disturb the next route
  async function run(label, fn, reps, wantSeen) {      // fn() -> promise; returns medians of call, seen (when it draws), longest page task
    const calls = [], seens = [], gaps = [];
    for (let i = 0; i < reps + 1; i++) {
      await P.reset(); const t0 = performance.now(); let res, seen = null;
      res = await fn(); const t1 = performance.now();
      if (wantSeen && res && res.canvas) { force(res.canvas); seen = performance.now() - t0; }
      const gap = await P.read();
      if (i > 0) { calls.push(t1 - t0); gaps.push(gap); if (seen != null) seens.push(seen); }
    }
    return { call: r1(med(calls)), seen: seens.length ? r1(med(seens)) : null, gap: r1(med(gaps)), gapMax: r1(Math.max.apply(null, gaps)), used: null };
  }
  // ---- our routes
  if (part === 'sizes' || part === 'all') for (const [w, h] of SIZES) {
    const px = lab(w, h), cv = cvOf(px, w, h), big = w * h > 3e6, reps = arg.quick ? 3 : big ? 3 : 7;
    for (const route of routes) {
      if (route === 'js' && big && w * h > 8e6 && arg.quick) continue;
      const row = { size: w + 'x' + h, route, radius: R };
      let used = {};
      const mk = (src, o) => async () => { const res = await G.blur(src, w, h, R, Object.assign({ route }, o)); used[o.out] = res.route; return res; };
      row.bytesToCanvas = await run('b2c', mk(px, { out: 'canvas' }), reps, true);
      row.canvasToCanvas = await run('c2c', mk(cv, { out: 'canvas' }), reps, true);
      row.bytesToPixels = await run('b2p', mk(px, { out: 'pixels' }), reps, false);
      row.used = used;
      if (route === 'wasm' || route === 'js') {
        row.sync = await run('sync', async () => G.blurSync(px, w, h, R, { out: 'pixels', route }), reps, false);
      }
      out.rows.push(row);
      await sleep(route === 'webgl2' ? 1500 : 300);
    }
    if (w === 1920) {                         // radius sweep on the three fixed routes
      for (const rad of [4, 40]) for (const route of ['wasm', 'js', 'webgl2']) {
        const m = await run('rad', async () => { const res = await G.blur(px, w, h, rad, { route, out: 'canvas' }); return res; }, 3, true);
        out.rows.push({ size: w + 'x' + h, route, radius: rad, bytesToCanvas: m, used: {} });
        await sleep(route === 'webgl2' ? 1500 : 300);
      }
    }
  }
  // ---- picture match for the card route at 1920 x 1080 (against the plain JavaScript reference)
  if (part === 'match' || part === 'all') { const w = 1920, h = 1080, px = lab(w, h), ref = G.reference(px, w, h, R), gl = await G.blur(px, w, h, R, { out: 'pixels', route: 'webgl2' }), wa = await G.blur(px, w, h, R, { out: 'pixels', route: 'wasm' });
    const cmp = (a, b) => { let eq = 0, mx = 0, w1 = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (!d) eq++; if (d <= 1) w1++; if (d > mx) mx = d; } return { eqPct: 100 * eq / a.length, w1Pct: 100 * w1 / a.length, max: mx }; };
    out.match = { webgl2Ran: gl.route, webgl2: cmp(ref, gl.pixels), wasm: cmp(ref, wa.pixels) }; }
  // ---- the competitors, same picture, a blur that looks like sigma 6 (our radius 12)
  const comp = out.competitors = [];
  if (part === 'competitors' || part === 'all') for (const [w, h] of [[480, 270], [1920, 1080]]) {
    const px = lab(w, h), cv = cvOf(px, w, h), reps = 7;
    if (window.StackBlur) {
      const sb = window.StackBlur, rad = 15;
      comp.push(Object.assign({ size: w + 'x' + h, name: 'stackblur-canvas 3.0.1, imageDataRGBA (bytes in, bytes out; one block)', radius: 'its radius 15 (sigma about 6)' },
        await run('sb1', async () => { const id = new ImageData(new Uint8ClampedArray(px), w, h); sb.imageDataRGBA(id, 0, 0, w, h, rad); return null; }, reps, false)));
      comp.push(Object.assign({ size: w + 'x' + h, name: 'stackblur-canvas 3.0.1, canvasRGBA (canvas in place; one block)', radius: 'its radius 15' },
        await run('sb2', async () => { const c = cvOf(px, w, h); sb.canvasRGBA(c, 0, 0, w, h, rad); return null; }, reps, false)));
    }
    if (window.fx) {
      let fc = null; try { fc = window.fx.canvas(); } catch (e) { comp.push({ size: w + 'x' + h, name: 'glfx 0.0.4 triangleBlur', unavailable: String(e.message || e) }); }
      if (fc) comp.push(Object.assign({ size: w + 'x' + h, name: 'glfx 0.0.4 triangleBlur (WebGL 1; canvas in, drawn)', radius: 'its radius 15 (sigma about 6)' },
        await run('fx', async () => { const t = fc.texture(cv); fc.draw(t).triangleBlur(15).update(); t.destroy(); return { canvas: fc }; }, reps, true)));
    }
    const g2 = document.createElement('canvas').getContext('2d');
    if ('filter' in g2) {
      const dst = document.createElement('canvas'); dst.width = w; dst.height = h; const dg = dst.getContext('2d');
      const supported = (() => { dg.filter = 'blur(6px)'; return dg.filter === 'blur(6px)'; })();
      if (supported) comp.push(Object.assign({ size: w + 'x' + h, name: 'canvas ctx.filter = "blur(6px)" with drawImage (canvas in, drawn)', radius: 'blur(6px)' },
        await run('cf', async () => { dg.filter = 'blur(6px)'; dg.clearRect(0, 0, w, h); dg.drawImage(cv, 0, 0); dg.filter = 'none'; return { canvas: dst }; }, reps, true)));
      else comp.push({ size: w + 'x' + h, name: 'canvas ctx.filter = "blur(6px)"', unavailable: 'the filter property is not honored' });
    } else comp.push({ size: w + 'x' + h, name: 'canvas ctx.filter = "blur(6px)"', unavailable: 'no filter property on the 2D context' });
    if (window.CSS && CSS.supports && CSS.supports('filter', 'blur(6px)')) {            // a CSS filter on an element on the page: time until the second frame after setting it
      const el = cv; el.style.cssText = 'position:absolute;left:0;top:0;width:' + w + 'px;height:' + h + 'px;opacity:.01;pointer-events:none'; document.body.appendChild(el);
      const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
      const frames = []; const gaps = [];
      for (let i = 0; i < reps + 1; i++) {
        el.style.filter = 'none'; await raf(); await raf(); await P.reset();
        const t0 = performance.now(); el.style.filter = 'blur(' + (6 + (i % 2) * 0.01) + 'px)'; await raf(); await raf(); const dt = performance.now() - t0; const gap = await P.read();
        if (i > 0) { frames.push(dt); gaps.push(gap); }
      }
      el.remove();
      comp.push({ size: w + 'x' + h, name: 'CSS filter: blur(6px) on a canvas element (style change to the second frame; a frame is about 16.7 ms)', radius: 'blur(6px)', call: r1(med(frames)), seen: null, gap: r1(med(gaps)), gapMax: r1(Math.max.apply(null, gaps)) });
    } else comp.push({ size: w + 'x' + h, name: 'CSS filter: blur(6px)', unavailable: 'CSS.supports says no' });
  }
  P.run = false; return out;
}
