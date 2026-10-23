#!/usr/bin/env node
// gpu-blur real-browser check (pass or fail; no speed numbers). Copyright (c) 2026 LFC Foundry. MIT License.
// In each real browser, one at a time, on pages that ship only `script-src 'self' 'wasm-unsafe-eval'` (no unsafe-eval, no blob:, no worker):
//   (1) the picture from every route that can run here (webgl2, wasm, js) against the plain JavaScript reference: wasm and JavaScript must be byte-identical,
//       the card route must be 99.5% or more equal values (the project's picture rule; the exact share is printed);
//   (2) every kind of source (canvas, ImageBitmap, ImageData, bytes) and every kind of result (canvas, pixels, a texture in your own WebGL 2 context);
//   (3) the fallbacks, each on its own page: no WebGL 2 (getContext refuses), a lost card (WEBGL_lose_context), no WebAssembly, a policy without 'wasm-unsafe-eval';
//   (4) a page task never longer than TASK_MS (default 8) while a 1920 x 1080 blur runs through blur() on the route auto picks (printed always; counted as a failure only with STRICT_TASK=1).
// Run one browser at a time: CHROMIUM=/path/to/chrome node tests/gpu-blur-browser.js   (FIREFOX=... for Firefox, WEBKIT=1 for WebKitGTK, WEBKIT=epiphany for GNOME Web)
// FIREFOX_GL=1 starts Firefox with a window (run it under xvfb-run when there is no screen) and turns WebGL 2 on, so the card route can run in it too.
// Needs puppeteer-core for Chromium and Firefox; WebKitGTK goes through tests/webkit-shim.js. Exit 2 (skipped) when nothing can run. Exit 1 on a failed check.
'use strict';
const path = require('path'), fs = require('fs'), http = require('http');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const wd = require('./webkit-shim.js');
const root = path.resolve(__dirname, '..') + '/';
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (!exes.length) { console.log('skipped: needs CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1'); process.exit(2); }
const SRC = fs.readFileSync(path.join(root, process.env.GPU_BLUR_FILE || 'modules/gpu-blur/gpu-blur.js'), 'utf8');
const TASK_MS = +process.env.TASK_MS || 8;

const PRE = {
  nogl: 'var o=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t){if(t==="webgl2"||t==="webgl")return null;return o.apply(this,arguments)};if(self.OffscreenCanvas){var o2=OffscreenCanvas.prototype.getContext;OffscreenCanvas.prototype.getContext=function(t){if(t==="webgl2"||t==="webgl")return null;return o2.apply(this,arguments)}}',
  nowasm: 'Object.defineProperty(self,"WebAssembly",{value:undefined,configurable:true});',
  capture: 'window.__gls=[];var o=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t){var g=o.apply(this,arguments);if(g&&t==="webgl2")window.__gls.push(g);return g}',
  none: ''
};
const POLICY = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; img-src data:";
const POLICY_NOWASM = "default-src 'self'; script-src 'self'; img-src data:";

// everything below runs inside the page
async function inPage(arg) {
  const G = window.GpuBlur, out = { checks: {}, notes: [] };
  const mark = (k, ok) => { out.checks[k] = !!ok; };
  const rng = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
  const lab = (w, h, opaque) => { const u = new Uint8Array(w * h * 4), r = rng(3); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, e = ((x >> 5) + (y >> 5)) & 1; u[i] = x * 255 / w; u[i + 1] = e ? 220 : 40; u[i + 2] = y * 255 / h; u[i + 3] = opaque ? 255 : 160 + ((r() * 90) | 0); } return u; };
  const cmp = (a, b) => { let eq = 0, w1 = 0, mx = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (!d) eq++; if (d <= 1) w1++; if (d > mx) mx = d; } return { eq: 100 * eq / a.length, w1: 100 * w1 / a.length, max: mx }; };
  const fmt = (c) => c.eq.toFixed(3) + '% equal, ' + c.w1.toFixed(3) + '% within 1 level, largest ' + c.max;
  const canvasBytes = (cv) => { const g = cv.getContext('2d', { willReadFrequently: true }); return g.getImageData(0, 0, cv.width, cv.height).data; };
  const t0 = performance.now();
  const info = await G.ready(); out.info = info;
  const w = 480, h = 270, r = 12, px = lab(w, h, false), opq = lab(w, h, true), ref = G.reference(px, w, h, r), refO = G.reference(opq, w, h, r);
  out.page = arg.variant;

  if (arg.variant === 'main') {
    // (1) every route against the reference
    out.routes = {};
    for (const route of ['js', 'wasm', 'webgl2']) {
      const res = await G.blur(px, w, h, r, { out: 'pixels', route }); const c = cmp(ref, res.pixels);
      out.routes[route] = { ran: res.route, match: fmt(c), eq: c.eq };
      if (route === 'js') mark('js route: same bytes as the reference', res.route === 'js' && c.eq === 100);
      if (route === 'wasm') mark('wasm route runs and gives the same bytes as JavaScript', res.route === 'wasm' && c.eq === 100);
      if (route === 'webgl2') { if (res.route === 'webgl2') mark('webgl2 route: picture match 99.5% or better (' + fmt(c) + ')', c.eq >= 99.5); else out.notes.push('webgl2 route could not run here; it gave way to ' + res.route); }
    }
    const sync = G.blurSync(px, w, h, r, { out: 'pixels' }); mark('blurSync gives the same bytes as the reference', sync.route !== 'webgl2' && cmp(ref, sync.pixels).eq === 100);
    // (2) kinds of source and result
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cg = cv.getContext('2d'); const id = new ImageData(new Uint8ClampedArray(opq), w, h); cg.putImageData(id, 0, 0);
    const bmp = await createImageBitmap(cv);
    const kinds = { bytes: opq, clamped: new Uint8ClampedArray(opq), imageData: id, canvas: cv, bitmap: bmp };
    for (const route of ['wasm', 'webgl2']) {
      if (route === 'webgl2' && !out.routes.webgl2.ran.startsWith('webgl2')) continue;
      for (const k of Object.keys(kinds)) {
        const res = await G.blur(kinds[k], w, h, r, { out: 'pixels', route }); const c = cmp(refO, res.pixels);
        mark(route + ' route, source ' + k + ': same picture (' + fmt(c) + ')', res.route === route && (route === 'wasm' ? c.eq === 100 : c.eq >= 99.5));
      }
    }
    for (const route of ['js', 'wasm', 'webgl2']) {
      const res = await G.blur(opq, w, h, r, { out: 'canvas', route });
      if (route === 'webgl2' && res.route !== 'webgl2') continue;
      const got = canvasBytes(res.canvas), c = cmp(refO, got);
      mark(route + ' route, result as a canvas (upright, ' + w + ' x ' + h + '): same picture (' + fmt(c) + ')', res.canvas.width === w && res.canvas.height === h && (route === 'webgl2' ? c.eq >= 99.5 : c.eq === 100));
    }
    // a canvas result for a semi-transparent picture: both routes pass through the same premultiplied canvas, so compare them to each other
    { const a = await G.blur(px, w, h, r, { out: 'canvas', route: 'wasm' }), b = await G.blur(px, w, h, r, { out: 'canvas', route: 'webgl2' });
      if (b.route === 'webgl2') { const c = cmp(canvasBytes(a.canvas), canvasBytes(b.canvas)); out.notes.push('semi-transparent picture drawn through a canvas, webgl2 against wasm: ' + fmt(c) + ' (a canvas keeps premultiplied colors and each route gets into it by a different browser conversion)'); mark('semi-transparent picture drawn through a canvas: webgl2 and wasm agree to within 3 levels in 95% of values', c.eq >= 95 && c.max <= 3); } }
    // two different canvases blurred at the same time must not read each other's pixels (the reading canvas is shared by one job at a time)
    for (const route of ['wasm', 'js']) {
      const pa = lab(w, h, true), pb = new Uint8ClampedArray(pa.length); for (let i = 0; i < pb.length; i += 4) { pb[i] = 255 - pa[i]; pb[i + 1] = pa[i + 2]; pb[i + 2] = pa[i + 1]; pb[i + 3] = 255; }
      const mk = (d) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(d), w, h), 0, 0); return c; };
      const ca = mk(pa), cb = mk(pb), want = [G.reference(canvasBytes(ca), w, h, r), G.reference(canvasBytes(cb), w, h, r)];
      const rs = await Promise.all([G.blur(ca, w, h, r, { out: 'pixels', route, budget: 0.01 }), G.blur(cb, w, h, r, { out: 'pixels', route, budget: 0.01 }), G.blur(ca, w, h, r, { out: 'pixels', route, budget: 0.01 })]);
      mark(route + ' route, three canvases blurred at once: each answer is its own picture', cmp(want[0], rs[0].pixels).eq === 100 && cmp(want[1], rs[1].pixels).eq === 100 && cmp(want[0], rs[2].pixels).eq === 100);
    }
    { const into = document.createElement('canvas'); const res = await G.blur(opq, w, h, r, { out: 'canvas', into }); mark('opts.into draws into your canvas', res.canvas === into && into.width === w); }
    // a texture in your own context; the state of that context is left as it was
    { const c2 = document.createElement('canvas'); c2.width = 64; c2.height = 64; const gl = c2.getContext('webgl2');
      if (gl) {
        const tex0 = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex0); gl.enable(gl.BLEND); gl.activeTexture(gl.TEXTURE3); const before = [gl.getParameter(gl.CURRENT_PROGRAM), gl.getParameter(gl.ACTIVE_TEXTURE), gl.isEnabled(gl.BLEND), gl.isEnabled(gl.DEPTH_TEST), gl.getParameter(gl.FRAMEBUFFER_BINDING)];
        gl.activeTexture(gl.TEXTURE0); const bound0 = gl.getParameter(gl.TEXTURE_BINDING_2D); gl.activeTexture(gl.TEXTURE3);
        const res = await G.blur(opq, w, h, r, { out: 'texture', gl });
        gl.activeTexture(gl.TEXTURE0); const bound0b = gl.getParameter(gl.TEXTURE_BINDING_2D); gl.activeTexture(gl.TEXTURE3);
        const after = [gl.getParameter(gl.CURRENT_PROGRAM), gl.getParameter(gl.ACTIVE_TEXTURE), gl.isEnabled(gl.BLEND), gl.isEnabled(gl.DEPTH_TEST), gl.getParameter(gl.FRAMEBUFFER_BINDING)];
        mark('texture result: route webgl2, a texture of the right size, and your context state is as it was', res.route === 'webgl2' && !!res.texture && res.width === w && res.height === h && before.every((v, i) => v === after[i]) && bound0 === bound0b);
        const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, res.texture, 0);
        const got = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, got); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const c = cmp(refO, got); mark('texture result holds the picture (' + fmt(c) + ')', c.eq >= 99.5);
      } else out.notes.push('no WebGL 2 context for the texture check');
    }
    // sizes that break careless shaders and kernels
    for (const [sw, sh] of [[1, 1], [1, 37], [37, 1], [16, 16], [17, 33], [100, 3]]) {
      const p = lab(sw, sh, false), rf = G.reference(p, sw, sh, 9), a = await G.blur(p, sw, sh, 9, { out: 'pixels', route: 'wasm' }), b = await G.blur(p, sw, sh, 9, { out: 'pixels', route: 'webgl2' });
      mark('small picture ' + sw + ' x ' + sh + ': wasm equals reference' + (b.route === 'webgl2' ? ', webgl2 within 99.5%' : ''), cmp(rf, a.pixels).eq === 100 && (b.route !== 'webgl2' || cmp(rf, b.pixels).eq >= 99.5));
    }
    for (const rad of [0, 1, 5, 30, 100]) {
      const rf = G.reference(opq, w, h, rad), b = await G.blur(opq, w, h, rad, { out: 'pixels', route: 'webgl2' });
      if (b.route === 'webgl2') { const c = cmp(rf, b.pixels); mark('webgl2 radius ' + rad + ': picture match 99.5% or better (' + fmt(c) + ')', c.eq >= 99.5); }
    }
    // (4) page tasks while a 1080p blur runs by the route auto picks
    const W = 1920, H = 1080, big = lab(W, H, false), cvb = document.createElement('canvas'); cvb.width = W; cvb.height = H; cvb.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(big), W, H), 0, 0);
    let run = true, last = performance.now(), gap = 0; const ch = new MessageChannel();
    ch.port1.onmessage = () => { const n = performance.now(); if (n - last > gap) gap = n - last; last = n; if (run) ch.port2.postMessage(0); };
    ch.port2.postMessage(0); await new Promise(r => setTimeout(r, 100));
    const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
    out.tasks = {};
    for (const route of ['auto', 'webgl2', 'wasm', 'js']) {
      const worst = []; let used = '';
      for (let i = 0; i < 3; i++) { await new Promise(r => setTimeout(r, 60)); gap = 0; last = performance.now(); const t = performance.now(); const res = await G.blur(cvb, W, H, 12, { out: 'canvas', route }); used = res.route; await tick(); await tick(); worst.push(gap); out.ms = performance.now() - t; }
      out.tasks[route] = { ran: used, longest: Math.max.apply(null, worst) };
    }
    run = false;
    out.floor = (function () { return null; })();
  }

  if (arg.variant === 'nogl') {
    const res = await G.blur(px, w, h, r, { out: 'canvas' }), res2 = await G.blur(px, w, h, r, { out: 'canvas', route: 'webgl2' });
    mark('no WebGL 2: auto picks wasm and the picture is right', info.webgl2 === false && info.canvasRoute === 'wasm' && res.route === 'wasm' && cmp(ref, G.blurSync(px, w, h, r, { out: 'pixels' }).pixels).eq === 100);
    mark('no WebGL 2: route webgl2 gives way to wasm', res2.route === 'wasm');
    let threw = false; try { await G.blur(px, w, h, r, { out: 'texture', gl: { isContextLost() { return true; } } }); } catch (e) { threw = true; }
    mark('no WebGL 2: a texture request without a usable context fails with an error, not a wrong picture', threw);
  }
  if (arg.variant === 'nowasm') {
    const res = await G.blur(px, w, h, r, { out: 'pixels' }), c = cmp(ref, res.pixels);
    mark('no WebAssembly: ' + (info.webgl2Worth ? 'auto draws on the card or' : '') + ' pixels come from plain JavaScript with the same bytes', info.wasm === false && res.route === 'js' && c.eq === 100);
    const cv = await G.blur(px, w, h, r, { out: 'canvas' }); out.routes = { canvas: cv.route }; mark('no WebAssembly: a drawn picture still comes back', !!cv.canvas && (cv.route === 'js' || cv.route === 'webgl2'));
  }
  if (arg.variant === 'nopolicy') {
    mark('a policy without wasm-unsafe-eval: wasm is refused, JavaScript answers with the same bytes', info.wasm === false && (await G.blur(px, w, h, r, { out: 'pixels' })).route === 'js' && cmp(ref, (await G.blur(px, w, h, r, { out: 'pixels' })).pixels).eq === 100);
  }
  if (arg.variant === 'lost') {
    const res = await G.blur(opq, w, h, r, { out: 'canvas', route: 'webgl2' }), gl = window.__gls && window.__gls[0];
    if (res.route !== 'webgl2' || !gl) { out.notes.push('no card context to lose here'); }
    else {
      const ext = gl.getExtension('WEBGL_lose_context');
      ext.loseContext();
      const a = await G.blur(opq, w, h, r, { out: 'canvas', route: 'webgl2' }), c = cmp(refO, canvasBytes(a.canvas));
      mark('lost card: the next blur still answers (route ' + a.route + ') with the right picture (' + fmt(c) + ')', a.route !== 'webgl2' && c.eq === 100);
      const auto = await G.blur(opq, w, h, r, { out: 'canvas' }); mark('lost card: auto does not use it', auto.route !== 'webgl2');
      ext.restoreContext(); for (let i = 0; i < 60 && gl.isContextLost(); i++) await new Promise(r => setTimeout(r, 50));
      if (!gl.isContextLost()) { await new Promise(r => setTimeout(r, 100)); const b = await G.blur(opq, w, h, r, { out: 'canvas', route: 'webgl2' }); const c2 = cmp(refO, canvasBytes(b.canvas)); mark('restored card: webgl2 works again with the right picture (' + fmt(c2) + ')', b.route === 'webgl2' && c2.eq >= 99.5); }
      else out.notes.push('the browser did not restore the lost context in 3 s');
    }
  }
  out.ms = performance.now() - t0;
  return out;
}

function pageHtml(v) {
  return '<!doctype html><meta charset=utf-8><title>gpu-blur ' + v + '</title>' + (PRE[v] ? '<script src="/pre-' + v + '.js"></script>' : '') + '<script src="/gpu-blur.js"></script><body>x';
}

(async () => {
  const srv = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x'), p = u.pathname;
    if (p === '/gpu-blur.js') { r.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); return r.end(SRC); }
    const m = p.match(/^\/pre-(\w+)\.js$/); if (m && PRE[m[1]] !== undefined) { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end(PRE[m[1]]); }
    const v = u.searchParams.get('v') || 'main', pre = { main: 'none', nogl: 'nogl', nowasm: 'nowasm', nopolicy: 'none', lost: 'capture' }[v] || 'none';
    r.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': v === 'nopolicy' ? POLICY_NOWASM : POLICY, 'cache-control': 'no-store' });
    r.end(pageHtml(pre === 'none' ? 'none' : pre));
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  let fails = 0;
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await wd.launch(exe === 'epiphany' ? 'epiphany' : 'webkitgtk') : kind === 'firefox' ? await pp.launch(Object.assign({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi', protocolTimeout: 0 }, process.env.FIREFOX_GL ? { headless: false, env: Object.assign({}, process.env, { LIBGL_ALWAYS_SOFTWARE: '1' }), extraPrefsFirefox: { 'webgl.force-enabled': true, 'webgl.enable-webgl2': true } } : {})) : await pp.launch({ executablePath: exe, headless: true, protocolTimeout: 0, args: ['--no-sandbox'] });
    console.log('Browser: ' + await b.version());
    const page = await b.newPage();
    for (const v of ['main', 'nogl', 'nowasm', 'nopolicy', 'lost']) {
      await page.goto('http://127.0.0.1:' + port + '/?v=' + v);
      let o; try { o = await page.evaluate(inPage, { variant: v }); } catch (e) { console.log('  FAIL page ' + v + ' crashed: ' + String(e && e.message || e).slice(0, 300)); fails++; continue; }
      if (v === 'main') {
        console.log('  found: wasm ' + o.info.wasm + ', webgl2 ' + o.info.webgl2 + ' (worth it: ' + o.info.webgl2Worth + (o.info.glMs != null ? '; 480 x 270 probe ' + o.info.glMs.toFixed(1) + ' ms against wasm ' + (o.info.wasmMs == null ? 'n/a' : o.info.wasmMs.toFixed(1)) + ' ms' : '') + '), drawn pictures by ' + o.info.canvasRoute + ', pixels by ' + o.info.pixelsRoute);
        for (const k of Object.keys(o.routes)) console.log('  route ' + k + ' ran as ' + o.routes[k].ran + ': ' + o.routes[k].match);
        console.log('  longest page task during a 1920 x 1080 canvas blur (ms, lower is better): ' + Object.keys(o.tasks).map(k => k + ' (' + o.tasks[k].ran + ') ' + o.tasks[k].longest.toFixed(1)).join(', '));
        if (process.env.STRICT_TASK) for (const k of Object.keys(o.tasks)) { const ok = o.tasks[k].longest <= TASK_MS; console.log((ok ? '  ok   ' : '  FAIL ') + 'page task on route ' + k + ' at most ' + TASK_MS + ' ms'); if (!ok) fails++; }
      }
      for (const n of o.notes) console.log('  note: ' + n);
      for (const k of Object.keys(o.checks)) { console.log((o.checks[k] ? '  ok   ' : '  FAIL ') + '[' + v + '] ' + k); if (!o.checks[k]) fails++; }
    }
    await b.close();
  }
  srv.close(); console.log(fails ? fails + ' check(s) failed' : 'all checks passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
