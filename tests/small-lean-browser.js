#!/usr/bin/env node
// The lean builds Fancy Banana asked for (back-close, wake-keeper, even-dt, quality-governor) in a real browser. Copyright (c) 2026 LFC Foundry. MIT License.
// Builds Fancy's set of cuts with each lean.py (comments removed), then in the page: (1) back-close: panel opens, closes by its own button, back request (the real Escape key) closes the
// newest panel and the other stays closable, no CloseWatcher; (2) wake-keeper: run starts, tab hidden, tab back, run ends, refused (8 s wait), lock released by the browser, no wake lock;
// (3) even-dt and quality-governor: the 26 frame series of modules/frame-kit/test/series.js against Fancy's own code, 0 differences required. Each situation prints ok, FAIL or "not available"
// ("not available" means this browser lacks the API; it is not a pass). The full files run the same tables, for comparison.
// Run one browser at a time: CHROMIUM=/path/to/chrome node tests/small-lean-browser.js   (FIREFOX=... for Firefox, WEBKIT=1 for WebKitGTK, WEBKIT=epiphany for GNOME Web)
// OUT=file.json also writes the rows. Needs puppeteer-core for Chromium and Firefox; WebKitGTK goes through tests/webkit-shim.js. Exit 2 (skipped) when nothing can run.
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const wd = require('./webkit-shim.js');
const root = path.resolve(__dirname, '..') + '/', M = root + 'modules/';
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (!exes.length) { console.log('skipped: needs CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1'); process.exit(2); }
// the wake lock only exists on a secure page, and http://localhost counts as one; about:blank does not
const server = require('http').createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end('<!doctype html><title>small lean</title><body>x'); });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'small-lean-'));
const lean = (mod, args, name) => { const out = path.join(tmp, name); const r = cp.spawnSync('python3', [M + mod + '/lean.py', ...args, '--no-comments', '-o', out], { encoding: 'utf8' }); if (r.status) throw new Error(r.stderr); return fs.readFileSync(out, 'utf8'); };
const rd = f => fs.readFileSync(f, 'utf8');
const SRC = {
  battery: rd(root + 'tests/small-lean-battery.js'),
  bcFull: rd(M + 'back-close/back-close.js'), bcLean: lean('back-close', ['--without', 'history,element,closeRoute,supported'], 'bc.js'),
  wkFull: rd(M + 'wake-keeper/wake-keeper.js'), wkLean: lean('wake-keeper', ['--without', 'idle,status,callbacks,inject'], 'wk.js'),
  edFull: rd(M + 'frame-kit/even-dt.js'), edLean: lean('frame-kit', ['--file', 'even-dt', '--without', 'options,stats,refreshRule'], 'ed.js'),
  qgFull: rd(M + 'frame-kit/quality-governor.js'), qgLean: lean('frame-kit', ['--file', 'quality-governor', '--without', 'options,control,errors,flipGuard,stats,stallRules,graceStart'], 'qg.js'),
  ref: rd(M + 'frame-kit/test/reference-frame.js'), series: rd(M + 'frame-kit/test/series.js'), compare: rd(M + 'frame-kit/test/lean-compare.js')
};

async function inPage(src, hasHooks) {
  const mod = s => { const m = { exports: {} }; new Function('module', 'exports', s)(m, m.exports); return m.exports; };
  const S = mod(src.battery), env = { G: window, node: false, CloseWatcher: typeof window.CloseWatcher === 'function' ? window.CloseWatcher : undefined, realWakeLock: false, settleMs: 40,
    sleep: ms => new Promise(r => setTimeout(r, ms)), tap: async () => { if (hasHooks) await window.__tap(); }, esc: async () => { if (hasHooks) { await window.__esc(); } } };
  const out = { rows: [], frame: null, errors: [], api: { CloseWatcher: !!env.CloseWatcher, wakeLock: !!navigator.wakeLock } };
  const run = async (label, fn) => { try { return await fn(); } catch (e) { out.errors.push(label + ': ' + (e && e.message)); return []; } };
  for (const [label, bc, wk] of [['Fancy\'s lean set', mod(src.bcLean), mod(src.wkLean)], ['full file', mod(src.bcFull), mod(src.wkFull)]]) {
    (await run(label + ' back-close', () => S.backCloseRows(bc, env))).forEach(r => { r.variant = label; out.rows.push(r); });
    (await run(label + ' wake-keeper', () => S.wakeKeeperRows(wk, env))).forEach(r => { r.variant = label; out.rows.push(r); });
  }
  const F = mod(src.ref), compare = mod(src.compare), series = mod(src.series)();
  const t0 = performance.now();
  const lean = compare(F, mod(src.edLean), mod(src.qgLean), series), full = compare(F, mod(src.edFull), mod(src.qgFull), series);
  out.frame = { series: series.length, frames: lean.evenFrames, govRuns: lean.govRuns, govChanges: lean.govChanges, leanEvenDiffs: lean.evenDiffs, leanGovDiffs: lean.govDiffs, fullEvenDiffs: full.evenDiffs, fullGovDiffs: full.govDiffs, fullEvenSeries: full.evenSeriesDiffering, ms: Math.round(performance.now() - t0), differing: lean.differing.slice(0, 3) };
  return out;
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const url = 'http://localhost:' + server.address().port + '/';
  let bad = 0; const all = [];
  for (const [kind, exe] of exes) {
    const t0 = Date.now();
    const b = kind === 'webkit' ? await wd.launch(exe === 'epiphany' ? 'epiphany' : 'webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' })
      : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    const version = await b.version(); console.log('Browser: ' + version);
    const p = await b.newPage(); const errs = []; p.on && p.on('pageerror', e => errs.push(String(e && e.message || e)));
    await p.goto(url);
    let hooks = false;
    if (kind !== 'webkit' && p.exposeFunction) { await p.exposeFunction('__tap', async () => { await p.mouse.click(5, 5); }); await p.exposeFunction('__esc', async () => { await p.keyboard.press('Escape'); await new Promise(r => setTimeout(r, 120)); }); hooks = true; }
    const r = await p.evaluate(inPage, SRC, hooks);
    console.log('  in this browser: CloseWatcher ' + (r.api.CloseWatcher ? 'yes' : 'no') + ', navigator.wakeLock ' + (r.api.wakeLock ? 'yes' : 'no'));
    for (const v of ["Fancy's lean set", 'full file']) {
      console.log('  ' + v + ':');
      r.rows.filter(x => x.variant === v).forEach(x => { console.log('    ' + (x.result === 'ok' ? 'ok           ' : x.result === 'FAIL' ? 'FAIL         ' : 'not available ') + x.module + ': ' + x.situation + ' -> ' + x.expect + (x.result === 'ok' ? '' : ' [' + x.note + ']')); });
    }
    const f = r.frame, fok = f.leanEvenDiffs === 0 && f.leanGovDiffs === 0;
    console.log('    ' + (fok ? 'ok           ' : 'FAIL         ') + "Fancy's lean set, even-dt and quality-governor: " + f.series + ' series, ' + f.frames + ' frame steps, ' + f.govRuns + ' governor runs (' + f.govChanges + ' level changes): ' + f.leanEvenDiffs + ' different steps, ' + f.leanGovDiffs + ' different runs (' + f.ms + ' ms for both builds)' + (fok ? '' : ' ' + f.differing.join('; ')));
    console.log('    for the record, the full frame-kit files differ from Fancy on ' + f.fullEvenDiffs + ' steps (' + f.fullEvenSeries + ' series) and ' + f.fullGovDiffs + ' governor runs');
    const fails = r.rows.filter(x => x.result === 'FAIL' && x.variant !== 'full file' ).length + (fok ? 0 : 1) + r.errors.length + errs.length;
    const na = r.rows.filter(x => x.result === 'not available' && x.variant === "Fancy's lean set").length;
    if (r.errors.length) console.log('    FAIL         errors: ' + r.errors.join('; '));
    if (errs.length) console.log('    FAIL         page error: ' + errs[0]);
    console.log('  ' + version + ': ' + fails + ' failures, ' + na + ' situations not available, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
    bad += fails; all.push({ version, api: r.api, rows: r.rows, frame: r.frame, errors: r.errors });
    if (p.close) await p.close(); await b.close();
  }
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(all, null, 1));
  fs.rmSync(tmp, { recursive: true, force: true }); server.close();
  console.log(bad ? bad + ' FAILED' : 'small lean browser checks passed');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
