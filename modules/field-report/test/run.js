#!/usr/bin/env node
/* field-report checks that need no browser. Plain Node (18+), no packages. Copyright (c) 2026 LFC Foundry. MIT License.
 * Run:  node modules/field-report/test/run.js          (exit code 1 on any failure)
 * A small fake window and document stand in for the browser: event listeners, a frame loop we turn by hand, elements that remember their
 * style and children. The real-browser checks are in tests/field-report-browser.js (Chromium, Firefox, WebKitGTK, GNOME Web). */
'use strict';
const fs = require('fs'), path = require('path');
const FR = require('../field-report.js');
let pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); } }

function fakeEl(tag) {
  const e = { tagName: tag.toUpperCase(), style: {}, children: [], attrs: {}, listeners: {}, textContent: '', value: '', clicked: 0 };
  e.appendChild = c => { e.children.push(c); c.parent = e; return c; };
  e.removeChild = c => { e.children = e.children.filter(x => x !== c); return c; };
  Object.defineProperty(e, 'firstChild', { get: () => e.children[0] });
  e.setAttribute = (k, v) => { e.attrs[k] = v; };
  e.addEventListener = (t, f) => { (e.listeners[t] = e.listeners[t] || []).push(f); };
  e.click = () => { e.clicked++; (e.listeners.click || []).forEach(f => f({})); };
  return e;
}
function fakeEnv(o) {
  o = o || {};
  const wl = {}, dl = {}, frames = [], body = fakeEl('body'), downloads = [];
  const win = { innerWidth: 400, innerHeight: 800, devicePixelRatio: 2, screen: { width: 400, height: 800 },
    addEventListener: (t, f) => { (wl[t] = wl[t] || []).push(f); }, removeEventListener: (t, f) => { wl[t] = (wl[t] || []).filter(x => x !== f); },
    requestAnimationFrame: f => { frames.push(f); return frames.length; }, cancelAnimationFrame: () => {} };
  const doc = { visibilityState: 'visible', body, createElement: tag => { const e = fakeEl(tag); if (tag === 'a') e.click = () => { downloads.push({ href: e.href, name: e.download }); }; return e; },
    addEventListener: (t, f) => { (dl[t] = dl[t] || []).push(f); }, removeEventListener: (t, f) => { dl[t] = (dl[t] || []).filter(x => x !== f); } };
  const env = { win, doc, wl, dl, frames, body, downloads,
    fire: (t, ev) => (wl[t] || []).slice().forEach(f => f(ev)), fireDoc: (t, ev) => (dl[t] || []).slice().forEach(f => f(ev)),
    tick(ms, n) { let ts = env.ts || 1000; for (let i = 0; i < (n || 1); i++) { ts += ms; const fs2 = frames.splice(0); fs2.forEach(f => f(ts)); } env.ts = ts; },
    tap(x, y) { env.fire('pointerdown', { clientX: x, clientY: y }); } };
  return env;
}
const saved = {};
function install(env, extra) {
  ['window', 'document', 'Blob', 'URL', 'PerformanceObserver'].forEach(k => { saved[k] = Object.getOwnPropertyDescriptor(globalThis, k); });
  globalThis.window = env.win; globalThis.document = env.doc;
  Object.defineProperty(globalThis, 'PerformanceObserver', { value: undefined, configurable: true, writable: true });
  if (extra && extra.noBlob) { Object.defineProperty(globalThis, 'Blob', { value: undefined, configurable: true, writable: true }); }
}
function uninstall() { Object.keys(saved).forEach(k => { if (saved[k]) Object.defineProperty(globalThis, k, saved[k]); else delete globalThis[k]; }); }
function withEnv(fn, extra) { const env = fakeEnv(); install(env, extra); const origErr = console.error, origWarn = console.warn; console.error = () => {}; console.warn = () => {}; const q = [origErr, origWarn]; try { fn(env, q); } finally { console.error = origErr; console.warn = origWarn; uninstall(); } }

// ---- pure helpers ----
const even = Array.from({ length: 120 }, () => 16.67);
let s = FR.frameStats(even);
check('frameStats: even 16.67 ms frames are 60 FPS, nothing over 33 ms', Math.abs(s.fps - 60) < 0.1 && s.over33 === 0 && Math.abs(s.low1 - 60) < 0.1 && s.slowest.length === 5, s);
const bumpy = even.slice(); bumpy[10] = 120; bumpy[50] = 60; bumpy[90] = 40;
s = FR.frameStats(bumpy);
check('frameStats: counts frames over 33, 50 and 100 ms and lists the slowest', s.over33 === 3 && s.over50 === 2 && s.over100 === 1 && s.slowest[0] === 120 && s.slowest[1] === 60, s);
check('frameStats: an empty list is all zeros', FR.frameStats([]).frames === 0 && FR.frameStats([]).fps === 0);
let v = FR.speedVerdict(FR.frameStats(even), [], 400, 60);
check('verdict: steady 60 FPS is "smooth" and says the numbers', v.grade === 'smooth' && /60 FPS on average \(higher is better\)/.test(v.text), v);
v = FR.speedVerdict(FR.frameStats(Array.from({ length: 120 }, () => 40)), [], 400, 60);
check('verdict: 25 FPS on a 60 FPS page is "slow"', v.grade === 'slow', v);
v = FR.speedVerdict(FR.frameStats(bumpy), [{ name: 'bake', ms: 90 }], 4000, 60);
check('verdict: a 120 ms frame and a 90 ms task are both called out', /took 120 ms/.test(v.text) && /heavy task took 90 ms/.test(v.text) && /first paint came after 4000 ms/.test(v.text), v);
v = FR.speedVerdict(FR.frameStats([16, 16]), [], 0, 60);
check('verdict: too few frames says so instead of guessing', v.grade === 'not enough', v);
v = FR.speedVerdict(FR.frameStats(Array.from({ length: 120 }, () => 33.3)), [], 0, 30);
check('verdict: the target FPS is respected (30 FPS is smooth for a 30 FPS page)', v.grade === 'smooth', v);

// ---- frames and reports ----
withEnv(env => {
  const fr = FR.start({ name: 'test-game', version: '2026.10.22.1700' });
  env.tick(16.67, 90); fr.mark('first-screen');
  const r = fr.task('bake', () => 7);
  fr.time('load-level', 41.5);
  const sp = fr.speedText();
  check('the version in the header comment matches the VERSION constant (FR.version)', (function () { var h = /Version (\d+\.\d+\.\d+)/.exec(fs.readFileSync(path.join(__dirname, '..', 'field-report.js'), 'utf8')); return !!h && h[1] === FR.version; })(), FR.version);
  check('speedText: has the title, page name and version, verdict, frames and tasks', /^# Speed report/.test(sp) && /test-game 2026\.10\.22\.1700/.test(sp) && /## Verdict/.test(sp) && /Smooth\./.test(sp) && /\| Frames recorded \| 89 \|/.test(sp) && /load-level \| 41\.5/.test(sp) && /first-screen/.test(sp), sp);
  check('task(): returns the function result and records the time', r === 7 && fr.speed().tasks.some(t => t.name === 'bake'));
  let threw = false; try { fr.task('boom', () => { throw new Error('x'); }); } catch (e) { threw = true; }
  check('task(): a throwing job still records its time and rethrows', threw && fr.speed().tasks.some(t => t.name === 'boom'));
  env.doc.visibilityState = 'hidden'; env.fireDoc('visibilitychange'); env.tick(500, 3); env.doc.visibilityState = 'visible'; env.fireDoc('visibilitychange'); env.tick(16.67, 3);
  check('frames: frames while the page is hidden are not recorded', fr.speed().stats.over100 === 0 && fr.speed().stats.frames <= 93, fr.speed().stats);
  fr.stop();
});
withEnv(env => {
  const fr = FR.start({ frames: false });
  check('frames:false starts no frame loop', env.frames.length === 0);
  check('speedText without frames says so and does not crash', /No frames were recorded/.test(fr.speedText()));
  fr.stop();
});

// ---- errors ----
withEnv((env, q) => {
  const fr = FR.start({ name: 'g' });
  check('errors: a clean page says no errors were recorded', /No errors were recorded/.test(fr.errorsText()));
  const err = new Error('boom'); err.name = 'TypeError';
  env.fire('error', { error: err, message: 'x', filename: 'http://h/app.js', lineno: 12, colno: 5, target: env.win });
  env.fire('error', { target: { tagName: 'IMG', src: 'http://h/missing.png' } });
  env.fire('unhandledrejection', { reason: new Error('nope') });
  env.fire('unhandledrejection', { reason: 'plain string' });
  env.fireDoc('securitypolicyviolation', { violatedDirective: 'script-src', blockedURI: 'eval' });
  console.error('bad thing', { a: 1 }); console.warn('careful');
  const e = fr.errors();
  check('errors: uncaught error with file and line', e[0].kind === 'error' && /TypeError: boom \(app\.js:12:5\)/.test(e[0].text), e[0]);
  check('errors: a failed image load names the file', e[1].kind === 'failed to load' && /<img> http:\/\/h\/missing\.png/.test(e[1].text), e[1]);
  check('errors: promise rejections (error object and plain value)', e[2].kind === 'promise rejected' && /Error: nope/.test(e[2].text) && e[3].text === 'plain string', e.slice(2, 4));
  check('errors: page-policy block', e[4].kind === 'page policy block' && /script-src blocked eval/.test(e[4].text), e[4]);
  check('errors: console.error and console.warn are kept', e[5].kind === 'console.error' && /bad thing \{"a":1\}/.test(e[5].text) && e[6].kind === 'console.warn', e.slice(5));
  for (let i = 0; i < 5; i++) console.error('again');
  check('errors: repeated lines are counted, not listed again', fr.errors().filter(x => x.text === 'again').length === 1 && fr.errors().find(x => x.text === 'again').count === 5);
  const txt = fr.errorsText();
  check('errorsText: summary line, table and a stack section', /\*\*\d+ error line\(s\), \d+ different:\*\*/.test(txt) && /\| # \| Seconds in \| Kind \| Times \| What \|/.test(txt) && /Stack of #1/.test(txt) && /# Error log/.test(txt), txt.slice(0, 600));
  fr.stop();
});
withEnv(() => {
  const fr = FR.start({});
  for (let i = 0; i < 250; i++) console.error('line ' + i);
  check('errors: only the last 200 different lines are kept and the drop is reported', fr.errors().length === 200 && /50 older line\(s\) were dropped/.test(fr.errorsText()));
  fr.stop();
});
withEnv((env, q) => {
  const before = console.error;
  const fr = FR.start({});
  check('console is wrapped while running', console.error !== before);
  fr.stop();
  check('stop() puts the original console back and removes the listeners', console.error === before && (env.wl.error || []).length === 0 && (env.wl.pointerdown || []).length === 0);
});
withEnv(() => {
  let orig = console.error;
  const calls = []; console.error = function () { calls.push([].slice.call(arguments)); };
  const fr = FR.start({});
  console.error('x', 2);
  check('the page\'s own console.error still runs with the same arguments', calls.length === 1 && calls[0][0] === 'x' && calls[0][1] === 2);
  fr.stop(); console.error = orig;
});
withEnv(() => {
  const calls = []; const o2 = console.warn; console.warn = function () { calls.push(1); };
  const fr = FR.start({ console: false });
  console.warn('quiet');
  check('console:false leaves the console alone', fr.errors().length === 0 && calls.length === 1);
  fr.stop(); console.warn = o2;
});

// ---- the hidden tap spot and the panel ----
withEnv(env => {
  const fr = FR.start({ name: 'g', version: '1' });
  for (let i = 0; i < 4; i++) env.tap(10, 10);
  check('taps: four taps in the corner do not open anything', !fr.isOpen() && env.body.children.length === 0);
  env.tap(10, 10);
  check('taps: the fifth tap opens the panel with the two buttons and Close', fr.isOpen() && env.body.children.length === 1);
  const card = env.body.children[0].firstChild, labels = card.children.map(c => c.textContent);
  check('panel: speed, error log and close buttons, at least 48 px tall', ['Save speed report', 'Save error log', 'Close'].every(l => labels.includes(l)) && card.children.filter(c => c.tagName === 'BUTTON').every(b => b.style.minHeight === '48px'), labels);
  card.children.find(c => c.textContent === 'Close').click();
  check('panel: Close removes it', !fr.isOpen() && env.body.children.length === 0);
  fr.stop();
});
withEnv(env => {
  const fr = FR.start({});
  env.tap(10, 10); env.tap(10, 10); env.tap(200, 400); env.tap(10, 10); env.tap(10, 10); env.tap(10, 10);
  check('taps: a tap elsewhere starts the count again', !fr.isOpen());
  fr.stop();
});
withEnv(env => {
  const fr = FR.start({ within: 100 });
  const realNow = performance.now.bind(performance); let t = realNow(); const sp = performance.now; performance.now = () => t;
  try { for (let i = 0; i < 5; i++) { env.tap(10, 10); t += 300; } } finally { performance.now = sp; }
  check('taps: five slow taps (spread over more than the time limit) do not open it', !fr.isOpen());
  fr.stop();
});
withEnv(env => {
  const fr = FR.start({ corner: 'bottom-right', taps: 3 });
  env.tap(10, 10); env.tap(10, 10); env.tap(10, 10);
  check('corner: a tap in the wrong corner does nothing', !fr.isOpen());
  env.tap(390, 790); env.tap(395, 795); env.tap(399, 799);
  check('corner and taps options: bottom-right, 3 taps', fr.isOpen());
  fr.stop();
});
withEnv(env => {
  const fr = FR.start({ name: 'g' });
  const reports = fr.saveSpeed();
  check('save without a handler: a file download link is clicked with a dated .md name', env.downloads.length === 1 && /^g-speed-\d{8}-\d{4}\.md$/.test(env.downloads[0].name), env.downloads);
  fr.stop();
});
withEnv(env => {
  const got = [];
  const fr = FR.start({ name: 'g', onSave: (text, file, kind) => got.push([text, file, kind]) });
  fr.open(); const card = env.body.children[0].firstChild;
  card.children.find(c => c.textContent === 'Save speed report').click(); card.children.find(c => c.textContent === 'Save error log').click();
  check('onSave replaces the download and gets the text, file name and kind', got.length === 2 && got[0][2] === 'speed' && got[1][2] === 'errors' && /^g-speed-/.test(got[0][1]) && /^# Speed report/.test(got[0][0]) && /^# Error log/.test(got[1][0]), got.map(g => g.slice(1)));
  fr.stop();
});
withEnv(env => {
  const fr = FR.start({ name: 'g' });
  Object.defineProperty(globalThis, 'URL', { value: {}, configurable: true, writable: true });
  fr.open(); const card = env.body.children[0].firstChild;
  card.children.find(c => c.textContent === 'Save error log').click();
  check('no download possible: the text is shown in a box to copy', card.children.some(c => c.tagName === 'TEXTAREA' && /# Error log/.test(c.value)), card.children.map(c => c.tagName));
  fr.stop();
});
check('start() without a window returns a quiet object that does not throw', (() => { const fr = FR.start({}); fr.mark('x'); fr.speedText(); fr.errorsText(); fr.open(); fr.stop(); return fr.supported === false; })());

// ---- house rules ----
const src = fs.readFileSync(path.join(__dirname, '..', 'field-report.js'), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/mg, '$1').replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''");
check('no network: no fetch, XMLHttpRequest, sendBeacon, WebSocket, Image or import()', !/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\b|\bnew Image\b|\bimport\(/.test(code));
check('no eval and no new Function', !/\beval\s*\(|new Function/.test(code));
const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/mg, '$1');
check('no style tag and no cssText or style attribute: safe under a strict page policy', !/createElement\('style'\)|cssText|setAttribute\('style'/.test(noComments));
const bad = (code.match(/\basync\b|\bawait\b|=>|\bconst\b|\blet\b|`|\bclass\b|\.\.\./g) || []);
check('ES5 syntax (no async/await, arrows, const/let, template strings, classes, spread)', bad.length === 0, bad.slice(0, 5));
check('keeps the header "Copyright (c) 2026 LFC Foundry. MIT License"', src.indexOf('Copyright (c) 2026 LFC Foundry. MIT License') >= 0);

console.log(`field-report: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
