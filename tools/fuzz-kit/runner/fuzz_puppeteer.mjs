#!/usr/bin/env node
// Run a fuzz-kit adapter against a page with Puppeteer (Chrome, or stock Firefox over WebDriver BiDi).
// Copyright (c) 2026 LFC Foundry. MIT License. https://github.com/lfcfoundry/JS-modules
//   node runner/fuzz_puppeteer.mjs URL ADAPTER.js [--seeds 1-20] [--ops 400] [--browser chrome|firefox] [--executable /path/to/browser] [--viewport 412x892]
//       [--shrink] [--shrink-tries 200] [--shrink-secs 30] [--seed-secs 120] [--bundle DIR] [--throttle 4] [--real-input] [--junk-text] [--junk-skip "a,b"]
//       [--ignore-console REGEX]... [--allow-console-errors] [--allow-navigation] [--hang-trace] [--init "JS"] [--mobile]
//       [--jobs 4] [--swarm 0.3] [--check-repeat] [--replay FILE]   (what they do: see the top of runner/fuzz_playwright.py)
// Same options, behavior and output as runner/fuzz_playwright.py (read the top of that file for what each one does). Differences: --throttle needs Chrome
// (Firefox has no CPU throttling over WebDriver BiDi); the browser path comes from --executable, else the FIREFOX variable (for --browser firefox) or the CHROME variable (for --browser chrome).
// Needs: npm install puppeteer (and, for Firefox, `npx puppeteer browsers install firefox`, or --executable). This runner is run by hand; no automatic test starts a real browser with it.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url'; import { spawn } from 'node:child_process';
const here = path.dirname(fileURLToPath(import.meta.url));
const core = fs.readFileSync(path.join(here, '..', 'src', 'fuzz-core.js'), 'utf8');
const driver = fs.readFileSync(path.join(here, 'page-driver.js'), 'utf8');

export const DEFAULTS = { shrink: false, shrinkTries: 200, shrinkSecs: 30, seedSecs: 120, throttle: 1, realInput: false, junkText: false, junkSkip: [], ignoreConsole: [], allowConsoleErrors: false, allowNavigation: false, bundle: null, hangTrace: false, init: null, mobile: false };
const dumpPage = () => {   // runs in the page: what the app saved
  function dump(name) { try { var s = window[name], o = {}, i, k; for (i = 0; i < s.length; i++) { k = s.key(i); o[k] = s.getItem(k); } return o; } catch (e) { return 'unavailable: ' + e; } }
  return { url: location.href, localStorage: dump('localStorage'), sessionStorage: dump('sessionStorage'), cookie: document.cookie };
};
class Hung extends Error { }
const stripHash = u => String(u).split('#')[0];
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Resolve with fn()'s answer, or reject after ms (a hung page can make driver calls wait for ever).
const within = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' timed out after ' + ms + ' ms')), ms).unref?.())]);

export const consoleIgnored = (text, patterns) => patterns.some(p => new RegExp(p).test(text));
export function realRequest(req, vw, vh) {   // check a real-input request from the page; null when not acceptable
  if (!req || typeof req !== 'object') return null;
  const clamp = (v, hi) => Math.min(Math.max(Number(v), 0), hi - 1);
  if ((req.t === 'click' || req.t === 'move') && Number.isFinite(req.x) && Number.isFinite(req.y) && Math.abs(req.x) < 1e6 && Math.abs(req.y) < 1e6) return { t: req.t, x: clamp(req.x, vw), y: clamp(req.y, vh) };
  if (req.t === 'press' && typeof req.key === 'string' && /^[A-Za-z0-9]{1,12}$/.test(req.key)) return { t: 'press', key: req.key };
  return null;
}
export function shrinkLines(sh) {   // the plain-words report for the 'shrunk' part of a result
  if (!sh) return [];
  if (!sh.repeats) return ['       shrink: the failure did NOT repeat when the same recorded operations were replayed on a reset app, so it was not shrunk (the app may not reset fully between tries, or may depend on time or hidden randomness). The seed and the tail above are the evidence.'];
  let script = JSON.stringify(sh.script || []); if (script.length > 1500) script = script.slice(0, 1500) + '...(cut)';
  const cut = sh.stopped ? ` (stopped at the ${sh.stopped} cap, so it may not be the shortest)` : '', f = sh.finding || {};
  return [`       shrunk ${sh.from} -> ${sh.to} operations in ${sh.tries} tries, ${((sh.ms || 0) / 1000).toFixed(1)}s${cut}: ${(sh.ops || []).join(', ')}`,
    '       replay with run(0, { script }): ' + script,
    '       it fails with: ' + JSON.stringify({ i: f.i, op: f.op, what: f.what }).slice(0, 400)];
}
async function saveBundle(page, dir, seed, r, gone) {   // screenshot, saved-data dump and findings for a failing seed
  fs.mkdirSync(dir, { recursive: true }); const notes = [];
  try { await within(page.screenshot({ path: path.join(dir, `seed-${seed}.png`) }), gone ? 3000 : 8000, 'screenshot'); } catch (e) { notes.push('no screenshot: ' + String(e.message || e).split('\n')[0].slice(0, 120)); }
  if (gone) notes.push('no saved-data dump: the page is hung or gone');
  else { try { fs.writeFileSync(path.join(dir, `seed-${seed}-storage.json`), JSON.stringify(await within(page.evaluate(dumpPage), 8000, 'storage dump'), null, 1)); } catch (e) { notes.push('no saved-data dump: ' + String(e.message || e).split('\n')[0].slice(0, 120)); } }
  fs.writeFileSync(path.join(dir, `seed-${seed}-findings.json`), JSON.stringify({ seed, ops: r.ops, fails: r.fails, shrunk: r.shrunk, notes }, null, 1));
  return notes;
}
async function doReal(page, req, vp) {
  const ok = realRequest(req, vp.width, vp.height); if (!ok) return;
  if (ok.t === 'click') await page.mouse.click(ok.x, ok.y); else if (ok.t === 'move') await page.mouse.move(ok.x, ok.y); else await page.keyboard.press(ok.key === 'Space' ? ' ' : ok.key);   // Firefox over WebDriver BiDi does not know the name "Space" (found in a Firefox 157 run); a single space works everywhere
}
async function pump(page, deadline, vp) {   // wait for the page's answer; carry out real-input requests; throw Hung when the deadline passes
  for (;;) {
    const left = deadline - Date.now(); if (left <= 0) throw new Hung();
    try { await page.waitForFunction('window.__fuzzR || window.__fuzzNeed', { polling: 50, timeout: left + 1 }); } catch (e) { if (e && e.name === 'TimeoutError') throw new Hung(); throw e; }
    const need = await page.evaluate(() => window.__fuzzTake());
    if (need) { await doReal(page, need, vp); await page.evaluate(() => window.__fuzzGive()); continue; }
    return page.evaluate(() => window.__fuzzR);
  }
}

// One seed in a fresh context. browser: a Puppeteer Browser (or anything with the same few methods).
export async function runSeed(browser, url, adapter, seed, ops, viewport = { width: 412, height: 892 }, stopAt = null, kw = {}) {
  const o = { ...DEFAULTS, ...kw }, ctx = await browser.createBrowserContext(), page = await ctx.newPage();
  const perr = [], guard = [], st = { armed: false, start: '', mark: '' };
  await page.setViewport(o.mobile ? { ...viewport, isMobile: true, hasTouch: true } : viewport); page.setDefaultTimeout(60000);
  if (o.init) await page.evaluateOnNewDocument(o.init);   // runs before the page's own scripts
  page.on('dialog', d => { d.dismiss().catch(() => { }); });   // an alert() would freeze the page for ever; Playwright dismisses these by itself
  page.on('pageerror', e => perr.push('pageerror: ' + e));
  page.on('console', m => {
    if (m.type() === 'error') { if (!o.allowConsoleErrors && !consoleIgnored(m.text(), o.ignoreConsole)) perr.push('console.error: ' + m.text()); }
    else if (m.type() === 'debug' && m.text().startsWith('__fuzz-op ')) st.mark = m.text().slice(10);
  });
  page.on('error', () => guard.push('the page crashed'));
  page.on('close', () => { if (st.armed) guard.push('the page was closed'); });
  page.on('popup', p => { if (st.armed) guard.push('the page opened a new tab or window: ' + String(p && p.url ? p.url() : '').slice(0, 200)); });
  page.on('framenavigated', f => { if (st.armed && f === page.mainFrame() && !o.allowNavigation && stripHash(f.url()) !== st.start) guard.push('the page left the start page: now at ' + f.url().slice(0, 200)); });
  const t0 = Date.now(); let r = null, hung = false;
  try {
    if (o.throttle > 1) await page.emulateCPUThrottling(o.throttle);
    await page.goto(url); st.start = stripHash(page.url());
    await page.evaluate(core + '\n;0'); await page.evaluate(driver + '\n;0'); await page.evaluate(adapter + '\n;0');
    st.armed = true;
    const drv = { shrink: o.shrink, shrinkTries: o.shrinkTries, shrinkSecs: o.shrinkSecs, junkText: o.junkText, junkSkip: o.junkSkip, real: o.realInput, trace: o.hangTrace };
    for (const k of ['swarm', 'repeat', 'script']) if (o[k]) drv[k] = o[k];   // only when asked for, so the plain call is unchanged
    if (stopAt !== null && stopAt !== undefined) drv.stopAt = stopAt;
    await page.evaluate((s, n, d) => window.__fuzzStart(s, n, d), seed, ops, drv);
    r = await pump(page, Date.now() + o.seedSecs * 1000 + (o.shrink ? (o.shrinkSecs + 5) * 1000 : 0), viewport);
  } catch (e) {
    if (e instanceof Hung) { hung = true; r = { seed, ops: 0, visited: {}, fails: [{ i: -1, op: 'hung', what: `no answer after ${o.seedSecs}s: the page is stuck (an endless loop?). Last operation it reported: ${st.mark || 'unknown (run again with --hang-trace to name it)'}`, tail: [] }] }; }
    else r = { seed, ops: 0, visited: {}, fails: [{ i: -1, op: 'harness', what: 'EXC ' + String(e).slice(0, 300), tail: [] }] };
  }
  if (!r || typeof r !== 'object') r = { seed, ops: 0, visited: {}, fails: [{ i: -1, op: 'harness', what: 'no result from the page', tail: [] }] };
  if (r.error) r = { seed, ops: 0, visited: {}, fails: [{ i: -1, op: 'harness', what: String(r.error).slice(0, 300), tail: [] }] };
  if (st.armed && !hung) { try { if (page.isClosed()) { if (!guard.includes('the page was closed')) guard.push('the page was closed'); } else if (!o.allowNavigation && stripHash(page.url()) !== st.start) guard.push('the page left the start page: now at ' + page.url().slice(0, 200)); } catch (e) { } }
  for (const g of new Set(guard)) r.fails.push({ i: -1, op: 'page-guard', what: g, tail: [] });
  for (const e of perr.slice(0, 3)) r.fails.push({ i: -1, op: 'pageerror', what: e.slice(0, 300), tail: [] });
  r.secs = (Date.now() - t0) / 1000;
  if (r.fails.length && o.bundle) { try { r.bundleNotes = await saveBundle(page, o.bundle, seed, r, hung || guard.length > 0); } catch (e) { r.bundleNotes = ['bundle failed: ' + String(e).slice(0, 120)]; } }
  st.armed = false;
  try { await within(ctx.close(), 10000, 'closing the context'); } catch (e) { }   // closing the context also kills a hung page
  return r;
}

// The browser path is chosen per browser: the FIREFOX variable is for Firefox only (it used to be passed to Chrome too).
export const pickExecutable = (browserName, flagValue, env) => flagValue || (browserName === 'firefox' ? env.FIREFOX : env.CHROME) || undefined;

export function parseSeeds(spec) {   // '1-5,9,12-14' -> [1,2,3,4,5,9,12,13,14]
  const out = [];
  for (const part of String(spec).split(',')) { const [a, b] = part.trim().split('-').map(Number); for (let k = a; k <= (b || a); k++) out.push(k); }
  return out;
}
export function repeatReport(first, again) {   // plain words for --check-repeat. first: the run that also repeated in the same page; again: the same seed in a fresh page
  const samePage = first.repeat && first.repeat.same, freshSame = first.hash === again.hash && first.fails.length === again.fails.length;
  if (samePage && freshSame) return [true, `repeat check: the app repeats exactly (seed ${first.seed} gave fingerprint ${first.hash} three times). Shrinking can be trusted.`];
  const why = !freshSame ? 'the same seed gave a different run in a fresh page, so the app depends on time or hidden randomness (stop its clock, seed its random generator, drive time with a step function)'
    : "the same seed gave a different run the second time in the same page, so the adapter's __fuzzConfig does not reset the app fully (--shrink would then fail to repeat the failure)";
  return [false, 'repeat check: NOT REPEATABLE: ' + why + '.'];
}
function printSeed(seed, r, bundle) {
  if (r.fails.length) {
    console.log(` FAIL seed ${seed}: ${r.fails.length} finding(s) after ${r.ops} ops`);
    for (const f of r.fails.slice(0, 3)) console.log('      ', JSON.stringify({ ...f, tail: f.tail.slice(-14) }).slice(0, 700));
    for (const l of shrinkLines(r.shrunk)) console.log(l);
    for (const n of r.bundleNotes || []) console.log('       bundle:', n);
    if (bundle) console.log('       bundle saved in', bundle);
  } else console.log(` ok   seed ${seed}: ${r.ops} ops ${r.secs.toFixed(1)}s visited=${JSON.stringify(r.visited)}`);
}
function runJobs(argv, seeds, jobs, bundle) {   // child processes, one browser each; their per-seed answers come back as JSON lines
  const base = []; for (let i = 0; i < argv.length; i++) { if (argv[i] === '--seeds' || argv[i] === '--jobs') { i++; continue; } if (argv[i] === '--check-repeat') continue; base.push(argv[i]); }
  const chunks = Array.from({ length: jobs }, (_, j) => seeds.filter((_, i) => i % jobs === j)).filter(c => c.length);
  let bad = 0, total = 0;
  return Promise.all(chunks.map(ch => new Promise(res => {
    const pr = spawn(process.execPath, [fileURLToPath(import.meta.url), ...base, '--seeds', ch.join(','), '--jobs', '1', '--json-lines'], { stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = '';
    pr.stdout.on('data', d => { buf += d; let k; while ((k = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, k).trim(); buf = buf.slice(k + 1);
      if (line.startsWith('{')) { const m = JSON.parse(line); total += m.r.ops; bad += m.r.fails.length ? 1 : 0; printSeed(m.seed, m.r, bundle); } else if (line) console.log(line); } });
    pr.on('close', res);
  }))).then(() => ({ bad, total }));
}
async function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(['--shrink', '--real-input', '--junk-text', '--allow-console-errors', '--allow-navigation', '--hang-trace', '--mobile', '--check-repeat', '--json-lines']);
  const pos = argv.filter((x, i) => !x.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && !flags.has(argv[i - 1])));
  const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
  const optAll = n => argv.reduce((acc, x, i) => (x === '--' + n && argv[i + 1] !== undefined ? acc.concat(argv[i + 1]) : acc), []);
  const has = n => argv.includes('--' + n);
  const [url, adapterPath] = pos;
  if (!url || !adapterPath) { console.error('usage: node runner/fuzz_puppeteer.mjs URL ADAPTER.js [--seeds 1-20] [--ops 400] [--browser chrome|firefox] [--executable PATH] [--shrink] [--seed-secs 120] [--bundle DIR] (see the top of this file)'); process.exit(2); }
  const adapter = fs.readFileSync(adapterPath, 'utf8'), ops = +opt('ops', 400), [vw, vh] = opt('viewport', '412x892').split('x').map(Number);
  const browserName = opt('browser', 'chrome'), throttle = +opt('throttle', 1);
  if (throttle > 1 && browserName !== 'chrome') { console.error('--throttle works only with --browser chrome (Firefox over WebDriver BiDi has no CPU throttling).'); process.exit(2); }
  const ignoreConsole = optAll('ignore-console');
  for (const p of ignoreConsole) { try { new RegExp(p); } catch (e) { console.error(`--ignore-console ${JSON.stringify(p)} is not a valid regular expression`); process.exit(2); } }
  const kw = { shrink: has('shrink'), shrinkTries: +opt('shrink-tries', DEFAULTS.shrinkTries), shrinkSecs: +opt('shrink-secs', DEFAULTS.shrinkSecs), seedSecs: +opt('seed-secs', DEFAULTS.seedSecs), throttle, realInput: has('real-input'), junkText: has('junk-text'),
    junkSkip: opt('junk-skip', '').split(',').filter(Boolean), ignoreConsole, allowConsoleErrors: has('allow-console-errors'), allowNavigation: has('allow-navigation'), bundle: opt('bundle', null), hangTrace: has('hang-trace'), init: opt('init', null), mobile: has('mobile'), swarm: +opt('swarm', 0) };
  let seeds = parseSeeds(opt('seeds', '1-10')); const jobs = +opt('jobs', 1), jsonLines = has('json-lines'), t0 = Date.now();
  if (opt('replay', null)) {
    const data = JSON.parse(fs.readFileSync(opt('replay'), 'utf8')), script = data && data.shrunk && data.shrunk.script ? data.shrunk.script : data;
    if (!Array.isArray(script)) { console.error('--replay: ' + opt('replay') + ' has no recorded script (a --bundle findings file needs a shrunk script: run with --shrink --bundle)'); process.exit(2); }
    if (data && data.seed !== undefined) seeds = [data.seed]; else seeds = seeds.slice(0, 1);
    kw.script = script;
  }
  if (jobs > 1 && seeds.length > 1 && !has('check-repeat')) {
    const { bad, total } = await runJobs(argv, seeds, jobs, kw.bundle);
    console.log(`fuzz: ${seeds.length} seeds, ${total} ops, ${bad} seeds with findings, wall ${Math.round((Date.now() - t0) / 1000)}s, ${jobs} browsers at once`); process.exit(bad ? 1 : 0);
  }
  const { default: puppeteer } = await import('puppeteer');
  const executablePath = pickExecutable(browserName, opt('executable', undefined), process.env);
  const browser = await puppeteer.launch({ browser: browserName, executablePath, headless: true, args: browserName === 'chrome' ? ['--no-sandbox'] : [] });
  let bad = 0, total = 0;
  if (has('check-repeat')) {
    const first = await runSeed(browser, url, adapter, seeds[0], ops, { width: vw, height: vh }, null, { ...kw, repeat: true }), again = await runSeed(browser, url, adapter, seeds[0], ops, { width: vw, height: vh }, null, kw);
    const [good, line] = repeatReport(first, again); console.log(' ' + line); if (!good) bad++;
  }
  for (const seed of seeds) {
    const r = await runSeed(browser, url, adapter, seed, ops, { width: vw, height: vh }, null, kw);
    total += r.ops;
    if (jsonLines) { console.log(JSON.stringify({ seed, r })); continue; }
    if (r.fails.length) bad++;
    printSeed(seed, r, kw.bundle);
  }
  await browser.close();
  if (!jsonLines) console.log(`fuzz: ${seeds.length} seeds, ${total} ops, ${bad} seeds with findings, wall ${Math.round((Date.now() - t0) / 1000)}s`);
  process.exit(bad ? 1 : 0);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
