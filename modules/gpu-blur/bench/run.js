#!/usr/bin/env node
// Copyright (c) 2026 LFC Foundry. MIT License. The Node half of the gpu-blur speed run: serves the module and the page, drives ONE browser, writes JSON. Node does not time anything.
// node run.js <chromium|firefox|webkit|epiphany> out.json [main|cold|all] [quick]      env: COMP=/folder/with/node_modules (stackblur-canvas, glfx), COLD_REPS (default 7)
// Firefox needs a screen for WebGL 2: run it as  xvfb-run -a -s "-screen 0 1280x1024x24" node run.js firefox ...  (runall.sh does).
// Lower is better for every number. Run one browser at a time under `flock /tmp/browser-timing.lock` (runall.sh does).
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..', '..', '..');
const which = process.argv[2], outFile = process.argv[3], mode = process.argv[4] || 'all', quick = process.argv[5] === 'quick';
const MOD = fs.readFileSync(path.join(REPO, process.env.GPU_BLUR_FILE || 'modules/gpu-blur/gpu-blur.js'), 'utf8'), PAGE = fs.readFileSync(path.join(__dirname, 'bench-page.js'), 'utf8');
const COMP = process.env.COMP || '/tmp/claude-0/npmtry';
const libs = {}; try { libs['/stackblur.js'] = fs.readFileSync(path.join(COMP, 'node_modules/stackblur-canvas/dist/stackblur.min.js'), 'utf8'); } catch (e) {} try { libs['/glfx.js'] = fs.readFileSync(path.join(COMP, 'node_modules/glfx/glfx.js'), 'utf8'); } catch (e) {}
const POLICY = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; img-src data:";
(async () => {
  const srv = http.createServer((q, r) => {
    const u = q.url.split('?')[0], js = (t) => { r.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); r.end(t); };
    if (u === '/gpu-blur.js') return js(MOD); if (libs[u]) return js(libs[u]);
    r.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': POLICY, 'cache-control': 'no-store' });
    r.end('<!doctype html><meta charset=utf-8><title>gpu-blur bench</title>' + Object.keys(libs).map((k) => '<script src="' + k + '"></script>').join('') + '<script src="/gpu-blur.js"></script><body style="margin:0">x');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port + '/';
  let b;
  if (which === 'webkit' || which === 'epiphany') b = await require(path.join(REPO, 'tests/webkit-shim.js')).launch(which);
  else { const pp = require('puppeteer-core'); b = which === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: '/home/claude/browsers/firefox/firefox', headless: false, protocolTimeout: 0, protocol: 'webDriverBiDi', env: Object.assign({}, process.env, { LIBGL_ALWAYS_SOFTWARE: '1' }), extraPrefsFirefox: { 'privacy.reduceTimerPrecision': false, 'webgl.force-enabled': true, 'webgl.enable-webgl2': true, 'dom.max_script_run_time': 0 } }) : await pp.launch({ executablePath: '/home/claude/browsers/ungoogled-chromium-155.0.8059.39-1-x86_64_linux/chrome', headless: true, protocolTimeout: 0, args: ['--no-sandbox'] }); }
  const version = await b.version(), res = { browser: version, which, quick, when: new Date().toISOString() };
  const page = await b.newPage(); page.setDefaultTimeout && page.setDefaultTimeout(0);
  const call = (fn, a) => page.evaluate(new Function('arg', PAGE + '\nreturn bench(arg);'), a);
  // WebKit shim wants a real function: wrap the source as a function whose toString is the code
  const run = async (a) => { const f = function () {}; f.toString = () => 'function (arg) { ' + PAGE + '\nreturn bench(arg); }'; return which === 'webkit' || which === 'epiphany' ? page.evaluate(f, a) : page.evaluate('(async () => {' + PAGE + '\nreturn bench(' + JSON.stringify(a) + ');})()'); };
  if (mode === 'cold' || mode === 'all') {
    res.cold = []; const n = +process.env.COLD_REPS || (quick ? 2 : 7);
    for (let i = 0; i < n; i++) { await page.goto(base + '?cold=' + i); res.cold.push((await run({ mode: 'cold' })).cold); }
  }
  if (mode === 'main' || mode === 'all') {
    await page.goto(base + '?main'); res.rows = [];
    const sizes = quick ? [[480, 270], [1920, 1080]] : [[128, 72], [480, 270], [1280, 720], [1920, 1080], [3840, 2160]];
    for (const sz of sizes) { await page.goto(base + '?size=' + sz.join('x')); const m = await run({ mode: 'main', quick, part: 'sizes', sizes: [sz] }); res.info = res.info || m.info; res.rows.push.apply(res.rows, m.rows); console.log(version, 'size', sz.join('x'), 'done'); }
    await page.goto(base + '?match'); const mm = await run({ mode: 'main', quick, part: 'match' }); res.match = mm.match;
    await page.goto(base + '?comp'); const cc = await run({ mode: 'main', quick, part: 'competitors' }); res.competitors = cc.competitors;
  }
  fs.writeFileSync(outFile, JSON.stringify(res)); console.log(version, 'done', outFile);
  await b.close(); srv.close(); process.exit(0);
})().catch((e) => { console.error('FAILED', e && e.stack || e); process.exit(1); });
