/* Copyright (c) 2026 LFC Foundry. MIT License. The noise guard: a fixed calibration loop that tells whether a browser is quiet enough to time anything.
   Before a timing batch, run `guarded`; it calibrates, compares with the quiet baseline saved for that browser, and reruns the batch while the machine is noisy. */
'use strict';
const fs = require('fs'), path = require('path');
const LIMIT = 0.15;                                           // more than 15% off the quiet baseline = noisy (owner's rule 2026-10-25)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs in the page (sent as text). Three fixed parts, each about ms/3, timed in chunks and recorded apart so the cause shows:
 * int = integer loop (CPU speed); json = parse and stringify of a fixed generated blob (allocation and garbage collection, what hurts string-heavy timings); copy = typed-array copies (memory bandwidth).
 * Each part's rate is its median chunk (million steps, KB or MB per second); `rate` is the geometric mean of the three medians, `best` the same from each part's best chunk.
 */
function pageLoop(ms) {
  const each = Math.max(ms / 3, 50), med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  const run = (work, units) => {                               // work() does one chunk; units = what one chunk is worth
    const rates = [], end = performance.now() + each;
    do { const t0 = performance.now(); work(); rates.push(units / Math.max(performance.now() - t0, 0.001)); } while (performance.now() < end);
    return { rate: med(rates), best: Math.max.apply(null, rates), chunks: rates.length };
  };
  let sink = 0;
  const rows = []; for (let i = 0; i < 1500; i++) rows.push({ id: i, name: 'row-' + i, tags: ['a' + (i % 7), 'b' + (i % 13)], v: i * 1.5, ok: i % 3 === 0, note: 'x'.repeat(i % 40) });
  const blob = JSON.stringify(rows), src = new Uint8Array(1 << 21), dst = new Uint8Array(1 << 21); for (let i = 0; i < src.length; i++) src[i] = i * 31;
  const parts = {
    int: run(() => { let x = 12345; for (let i = 0; i < 16000000; i++) x = (Math.imul(x, 1664525) + 1013904223 + (x >>> 15)) | 0; sink ^= x; }, 16000),
    json: run(() => { for (let i = 0; i < 30; i++) sink += JSON.stringify(JSON.parse(blob)).length; }, 30 * blob.length / 1000),
    copy: run(() => { for (let i = 0; i < 200; i++) { dst.set(src); dst[i] ^= 1; } sink += dst[5]; }, 200 * 2)
  };
  const g = (k) => Math.pow(parts.int[k] * parts.json[k] * parts.copy[k], 1 / 3);
  return { rate: g('rate'), best: g('best'), parts, sink };
}

/** Where the baselines live: next to the ledger, so a machine restart keeps them. */
const baseFile = () => path.join(require('./ledger.js').dirOf(), 'noise-baseline.json');
const readBase = () => { try { return JSON.parse(fs.readFileSync(baseFile(), 'utf8')); } catch (e) { return {}; } };
const baselineFor = (which) => (readBase()[which] || null);
function saveBaseline(which, rate, parts) { const all = readBase(); all[which] = { rate, parts: parts || null, saved: Date.now() }; fs.mkdirSync(path.dirname(baseFile()), { recursive: true }); fs.writeFileSync(baseFile(), JSON.stringify(all, null, 1)); }

/** One calibration in a browser handle from launch(): about `ms` (default 1500) of the fixed work. Resolves to { rate, best, parts: { int, json, copy } }. */
async function calibrate(b, ms) {
  const p = await b.newPage();
  try { return await p.evaluate('(' + pageLoop.toString() + ')(' + (ms || 1500) + ')'); } finally { await p.close().catch(() => {}); }
}

/** Pure: is `rate` more than `limit` away from the baseline rate (slower is the usual noise; much faster also means the baseline is stale)? */
function judge(rate, base, limit) {
  limit = limit === undefined ? LIMIT : limit;
  if (!base) return { noisy: false, known: false, off: 0, note: 'no baseline saved for this browser; run: node tools/test-runner/cli.js calibrate <browser> --save' };
  const off = rate / base - 1;
  return { noisy: Math.abs(off) > limit, known: true, off, note: (off >= 0 ? '+' : '') + (off * 100).toFixed(1) + '% vs quiet baseline' };
}

/** Pure: judges each part against the baseline's parts (and the overall rate when the baseline has no parts); noisy when any one is off by more than `limit`. */
function judgeAll(c, base, limit) {
  if (!base) return judge(c.rate, null, limit);
  const names = c.parts && base.parts ? Object.keys(base.parts) : [], res = names.map((k) => Object.assign({ part: k }, judge(c.parts[k].rate, base.parts[k].rate, limit)));
  if (!res.length) return judge(c.rate, base.rate, limit);
  const worst = res.reduce((w, r) => (Math.abs(r.off) > Math.abs(w.off) ? r : w));
  return { noisy: res.some((r) => r.noisy), known: true, off: worst.off, parts: res, note: res.map((r) => r.part + ' ' + (r.off >= 0 ? '+' : '') + (r.off * 100).toFixed(1) + '%').join(', ') + ' vs quiet baseline' };
}

/**
 * Runs `fn()` only on a quiet machine: calibrate, judge, and when noisy wait and try again (default 3 tries, 20 s apart, like the LFC-pack copy).
 * Resolves to { ok, tries, calibrations: [{ rate, off, noisy }], result }; ok is false when every try was noisy, and then nothing should be published.
 * With no saved baseline the batch runs once and `known` is false (the first calibration is returned so it can be saved).
 */
async function guarded(b, which, fn, opts) {
  opts = opts || {}; const base = opts.baseline || baselineFor(which), tries = opts.tries || 3, cal = [];
  for (let t = 1; t <= tries; t++) {
    const c = await (opts.calibrate || calibrate)(b, opts.ms), j = judgeAll(c, base, opts.limit);
    cal.push({ rate: c.rate, parts: c.parts || null, off: j.off, noisy: j.noisy, known: j.known }); if (opts.log !== false) console.log('noise guard ' + (which || '') + ': ' + c.rate.toFixed(1) + ' M/s, ' + j.note + (j.noisy ? '  NOISY' : ''));
    if (!j.noisy) return { ok: true, known: j.known, tries: t, calibrations: cal, result: await fn() };
    if (t < tries) await sleep(opts.waitMs === undefined ? 20000 : opts.waitMs);
  }
  return { ok: false, known: true, tries, calibrations: cal, result: null };
}

module.exports = { LIMIT, pageLoop, calibrate, judge, judgeAll, guarded, baselineFor, saveBaseline, baseFile };
