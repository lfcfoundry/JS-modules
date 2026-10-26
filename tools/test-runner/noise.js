/* Copyright (c) 2026 LFC Foundry. MIT License. The noise guard: a fixed calibration loop that tells whether a browser is quiet enough to time anything.
   Before a timing batch, run `guarded`; it calibrates, compares with the quiet baseline saved for that browser, and reruns the batch while the machine is noisy. */
'use strict';
const fs = require('fs'), path = require('path');
const LIMIT = 0.15;                                           // more than 15% off the quiet baseline = noisy (owner's rule 2026-10-25)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs in the page (sent as text): a fixed integer loop in chunks for `ms`; the rate is the median chunk, in million steps per second. */
function pageLoop(ms) {
  let x = 12345, chunks = [], end = performance.now() + ms;
  while (performance.now() < end) {
    const t0 = performance.now();
    for (let i = 0; i < 16000000; i++) x = (Math.imul(x, 1664525) + 1013904223 + (x >>> 15)) | 0;
    chunks.push(16000000 / 1000 / Math.max(performance.now() - t0, 0.001));
  }
  chunks.sort((a, b) => a - b);
  return { rate: chunks[chunks.length >> 1], best: chunks[chunks.length - 1], chunks: chunks.length, sink: x };
}

/** Where the baselines live: next to the ledger, so a machine restart keeps them. */
const baseFile = () => path.join(require('./ledger.js').dirOf(), 'noise-baseline.json');
const readBase = () => { try { return JSON.parse(fs.readFileSync(baseFile(), 'utf8')); } catch (e) { return {}; } };
const baselineFor = (which) => (readBase()[which] || null);
function saveBaseline(which, rate) { const all = readBase(); all[which] = { rate, saved: Date.now() }; fs.mkdirSync(path.dirname(baseFile()), { recursive: true }); fs.writeFileSync(baseFile(), JSON.stringify(all, null, 1)); }

/** One calibration in a browser handle from launch(): about `ms` (default 1500) of the fixed loop. Resolves to { rate, best, chunks }. */
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

/**
 * Runs `fn()` only on a quiet machine: calibrate, judge, and when noisy wait and try again (default 3 tries, 20 s apart, like the LFC-pack copy).
 * Resolves to { ok, tries, calibrations: [{ rate, off, noisy }], result }; ok is false when every try was noisy, and then nothing should be published.
 * With no saved baseline the batch runs once and `known` is false (the first calibration is returned so it can be saved).
 */
async function guarded(b, which, fn, opts) {
  opts = opts || {}; const base = opts.baseline || baselineFor(which), tries = opts.tries || 3, cal = [];
  for (let t = 1; t <= tries; t++) {
    const c = await (opts.calibrate || calibrate)(b, opts.ms), j = judge(c.rate, base && base.rate, opts.limit);
    cal.push({ rate: c.rate, off: j.off, noisy: j.noisy, known: j.known }); if (opts.log !== false) console.log('noise guard ' + (which || '') + ': ' + c.rate.toFixed(1) + ' M/s, ' + j.note + (j.noisy ? '  NOISY' : ''));
    if (!j.noisy) return { ok: true, known: j.known, tries: t, calibrations: cal, result: await fn() };
    if (t < tries) await sleep(opts.waitMs === undefined ? 20000 : opts.waitMs);
  }
  return { ok: false, known: true, tries, calibrations: cal, result: null };
}

module.exports = { LIMIT, pageLoop, calibrate, judge, guarded, baselineFor, saveBaseline, baseFile };
