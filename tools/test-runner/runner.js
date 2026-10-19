/*!
 * test-runner: the shared pieces every browser check and speed test in this repository needs, in one file. Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.1.0 (API 1)
 *
 *   const T = require('./tools/test-runner/runner.js');
 *   T.main(async (b, which) => {                       // b: the browser, already launched (or taken from a warm one); line 1 of the output is its real version
 *     const page = await b.newPage(); await page.goto(url); ...
 *   });                                                // run as: node my-check.js <chromium|firefox|webkit|epiphany> [out.json]
 *
 * Browsers: ungoogled Chromium and Firefox through puppeteer-core, WebKitGTK and GNOME Web through tools/webkit-driver (WebDriver, no packages).
 * Warm browsers: `node tools/test-runner/cli.js warm start` keeps the four browsers open; launch() then takes the one it needs instead of starting a new one.
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), cp = require('child_process');
const root = path.resolve(__dirname, '..', '..');
const BROWSERS = ['chromium', 'firefox', 'webkit', 'epiphany'];
const warmDir = () => process.env.TEST_RUNNER_WARM || path.join(os.tmpdir(), 'test-runner-warm');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/** What a warm browser left behind (or null when none is running): { pid, browser, version, endpoint | port + sessionId }. */
function warmInfo(which) {
  try { const i = JSON.parse(fs.readFileSync(path.join(warmDir(), which + '.json'), 'utf8')); return i && alive(i.pid) ? i : null; } catch (e) { return null; }
}

/** One check at a time per browser: two pages of one browser at once make timing flaky and some of them hang. Waits up to waitMs for the lock, then goes ahead and says so. */
async function lock(which, waitMs) {
  const f = path.join(warmDir(), which + '.lock'); fs.mkdirSync(warmDir(), { recursive: true });
  const end = Date.now() + (waitMs === undefined ? 120000 : waitMs);
  for (;;) {
    try { fs.writeFileSync(f, String(process.pid), { flag: 'wx' }); break; }
    catch (e) {
      let owner = 0; try { owner = +fs.readFileSync(f, 'utf8'); } catch (x) { /* gone */ }
      if (!owner || !alive(owner)) { try { fs.unlinkSync(f); } catch (x) { /* raced */ } continue; }
      if (Date.now() > end) { console.log('note: another check holds the ' + which + ' lock (pid ' + owner + '); going ahead anyway, so timings may be off'); return () => {}; }
      await sleep(200);
    }
  }
  let freed = false; const free = () => { if (!freed) { freed = true; process.removeListener('exit', free); try { fs.unlinkSync(f); } catch (e) { /* gone */ } } };
  process.on('exit', free);
  return free;
}

/* A file of export lines at ~/.lfc-browsers.env (written by the knowledge base's boot-browsers script) fills in whatever the environment does not already set. */
try {
  for (const m of fs.readFileSync(path.join(os.homedir(), '.lfc-browsers.env'), 'utf8').matchAll(/^export (\w+)=(.*)$/gm)) {
    if (m[1] === 'NFM_CHROME' && !process.env.CHROMIUM && m[2]) process.env.CHROMIUM = m[2];
    if (m[1] === 'FIREFOX' && !process.env.FIREFOX && m[2]) process.env.FIREFOX = m[2];
    if (m[1] === 'NFM_PUPPETEER' && !process.env.NFM_PUPPETEER && m[2]) process.env.NFM_PUPPETEER = m[2];
  }
} catch (e) { /* no file: the environment decides */ }
function needPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) { /* try the copy the boot script installed */ }
  try { if (process.env.NFM_PUPPETEER) return require(process.env.NFM_PUPPETEER); } catch (e) { /* none */ }
  try { return require('puppeteer-core'); } catch (e) { throw new Error('puppeteer-core was not found: run `npm i puppeteer-core` or put it on NODE_PATH (Chromium and Firefox are driven through it).'); }
}

/**
 * The browser handle every check uses: { version(), newPage(), close(), warm }. Takes a warm browser when `cli.js warm start` left one (close() then only lets go),
 * otherwise starts a new one (close() ends it). Env: CHROMIUM=/path/to/chrome, FIREFOX=/path/to/firefox.
 */
async function launch(which, opts) {
  opts = opts || {};
  if (!BROWSERS.includes(which)) throw new Error('browser must be one of ' + BROWSERS.join(', '));
  const webkit = which === 'webkit' || which === 'epiphany', warm = opts.cold ? null : warmInfo(which), release = opts.lock === false ? () => {} : await lock(which, opts.lockWaitMs);
  try {
    if (webkit) {
      const shim = require(path.join(root, 'tests', 'webkit-shim.js'));
      const h = warm ? await shim.attach(warm) : await shim.launch(which);
      return { warm: !!warm, version: h.version, newPage: h.newPage, close: async () => { release(); if (!warm) await h.close(); } };
    }
    const pup = needPuppeteer(), ff = which === 'firefox';
    let b;
    if (warm) b = await pup.connect({ browserWSEndpoint: warm.endpoint, protocol: ff ? 'webDriverBiDi' : undefined, protocolTimeout: 600000 });
    else if (ff) b = await pup.launch({ browser: 'firefox', executablePath: process.env.FIREFOX, headless: true, protocol: 'webDriverBiDi', protocolTimeout: 600000 });
    else b = await pup.launch({ executablePath: process.env.CHROMIUM, headless: true, protocolTimeout: 600000, args: ['--no-sandbox', '--disable-gpu'] });
    const opened = [];
    return {
      warm: !!warm, version: () => b.version(),
      newPage: async () => { const p = await b.newPage(); opened.push(p); return p; },
      close: async () => { release(); for (const p of opened) await p.close().catch(() => {}); await (warm ? b.disconnect() : b.close()); }
    };
  } catch (e) { release(); throw e; }
}

/** Starts a check from the command line: node check.js <browser> [out.json]. Prints the real version first, runs fn(b, which, outFile), closes the browser, exits 0 / 1 / 2. */
async function main(fn, usage) {
  const which = process.argv[2], outFile = process.argv[3];
  if (!BROWSERS.includes(which)) { console.log('usage: node ' + path.basename(process.argv[1]) + ' <' + BROWSERS.join('|') + '> [out.json]' + (usage ? '  ' + usage : '')); process.exit(2); }
  let b, code = 1;
  try {
    b = await launch(which); const t0 = Date.now(); console.log(await b.version() + (b.warm ? '  (warm)' : ''));
    const r = await fn(b, which, outFile); code = r === false ? 1 : 0;
    console.log('wall ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  } catch (e) { console.log('could not run: ' + (e && e.stack || e)); code = 1; }
  try { if (b) await b.close(); } catch (e) { /* closing may fail after a crash */ }
  process.exit(code);
}

/** A local server for pages and files: routes { '/page.html': string | Buffer | (url) => string | { body, type, headers } }. CSP and cache headers are yours to set. */
function serve(routes) {
  const srv = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x'), h = routes[u.pathname]; r.setHeader('cache-control', 'no-store');
    if (h === undefined) { r.writeHead(404); return r.end(); }
    let v = typeof h === 'function' ? h(u) : h; if (typeof v === 'string' || Buffer.isBuffer(v)) v = { body: v };
    r.setHeader('content-type', v.type || (u.pathname.endsWith('.js') ? 'text/javascript' : u.pathname.endsWith('.wasm') ? 'application/wasm' : 'text/html'));
    for (const k of Object.keys(v.headers || {})) r.setHeader(k, v.headers[k]);
    r.end(v.body);
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ base: 'http://127.0.0.1:' + srv.address().port, close: () => srv.close() })));
}

/** Opens a page, waits until window[key] (default __res) is set, returns it. A fresh page for each call keeps cold-start samples honest. */
async function pageResult(b, url, key, waitS) {
  key = key || '__res'; const p = await b.newPage(); await p.goto(url);
  let res = null; for (let i = 0, n = (waitS || 120) * 10; i < n && !res; i++) { res = await p.evaluate((k) => window[k] || null, key); if (!res) await sleep(100); }
  if (b.closePages !== false) await p.close().catch(() => {});
  return res || { error: 'no result in ' + (waitS || 120) + ' s' };
}

const median = (a) => { a = a.slice().sort((x, y) => x - y); return a.length ? a[a.length >> 1] : NaN; };

/**
 * Compares contenders fairly: every round runs each one once, in an order that turns around every round (a fixed order favors whoever runs second).
 * `names`: ['js', 'wasm']; `run(name)` returns a number (ms; may be async); the first round is a warm-up and is dropped. Resolves to { name: median }.
 */
async function rotate(names, reps, run) {
  const got = {}; names.forEach((n) => { got[n] = []; });
  for (let rep = 0; rep < reps + 1; rep++) {
    const order = rep % 2 ? names.slice().reverse() : names;
    for (const n of order) { const v = await run(n, rep); if (rep > 0) got[n].push(v); }
  }
  const out = {}; names.forEach((n) => { out[n] = median(got[n]); }); return out;
}

/** The same function as source text for a page: functions are sent to the page as text, so keep them free of outside names. */
const asText = (fn) => '(' + fn.toString() + ')';

/** The speed guard (owner's rule 2026-10-19): a slowdown of more than 5% needs the owner's OK. rows: [{ name, before, after }] in ms (smaller is better). Returns the rows with ratio and a flag. */
function speedGuard(rows, limit) {
  limit = limit === undefined ? 0.05 : limit;
  return rows.map((r) => { const ratio = r.before / r.after; return Object.assign({}, r, { ratio, slower: r.after > r.before * (1 + limit), verdict: r.after > r.before * (1 + limit) ? 'SLOWER than ' + Math.round(limit * 100) + '%' : ratio >= 1.05 ? 'faster' : 'same' }); });
}

/** A plain table in the terminal. columns: [{ key, title, align }] */
function table(rows, columns) {
  const cell = (r, c) => String(typeof c.key === 'function' ? c.key(r) : r[c.key]), w = columns.map((c) => Math.max(c.title.length, ...rows.map((r) => cell(r, c).length)));
  const line = (f) => columns.map((c, i) => c.align === 'left' ? f(c, i).padEnd(w[i]) : f(c, i).padStart(w[i])).join('  ');
  return [line((c) => c.title)].concat(rows.map((r) => line((c) => cell(r, c)))).join('\n');
}

module.exports = { BROWSERS, needPuppeteer, launch, main, serve, pageResult, rotate, median, asText, speedGuard, table, warmInfo, warmDir, lock, sleep, version: '1.1.0' };
