/* ab-sequential 1.0.0: paired A/B timing that stops as soon as the answer is clear.
   Node only, no dependencies, no browser inside (you pass the function that times one run). American English.
   A = before, B = after, smaller times are better. Each round times A and B once, order turning around every round,
   and the per-round ratio B/A is kept (paired, so a slow stretch that hits both cancels out).
   After minRounds the 90% interval of the MEDIAN ratio (bootstrap, seeded, so the same samples always give the same verdict) is checked:
     lower end above 1+limit  -> 'slower'  (stop: confidently more than limit slower)
     upper end below 1+limit  -> 'ok'      (stop: confidently not more than limit slower; 'faster' when also below 1-limit)
     otherwise keep sampling to maxRounds, then 'inconclusive' (put it on a card; do not guess).
   'noisy' is set when the spread of the ratios is wide (MAD-based sigma > noisySigma, default 0.15), the same 15% idea as the noise guard. */
'use strict';
const median = (a) => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2; };
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
/** 90% bootstrap interval of the median of x (log ratios). */
function medianCI(x, B = 300, level = 0.9) {
  const r = rng(12345 + x.length), n = x.length, m = [];
  for (let b = 0; b < B; b++) { const s = new Array(n); for (let i = 0; i < n; i++) s[i] = x[(r() * n) | 0]; m.push(median(s)); }
  m.sort((a, b) => a - b); const lo = m[Math.floor(((1 - level) / 2) * B)], hi = m[Math.min(B - 1, Math.ceil((1 - (1 - level) / 2) * B) - 1)];
  return [lo, hi];
}
const sigma = (x) => { const md = median(x); return 1.4826 * median(x.map((v) => Math.abs(v - md))); };
/** Decide from a list of per-round ratios (B/A). Pure; the simulator and the runner share it. */
function decide(ratios, o) {
  o = Object.assign({ limit: 0.05, minRounds: 4, noisySigma: 0.15, level: 0.9 }, o);
  const x = ratios.map(Math.log), med = median(x), L = Math.log(1 + o.limit);
  const [lo, hi] = ratios.length >= 2 ? medianCI(x, 300, o.level) : [-Infinity, Infinity];
  const out = { rounds: ratios.length, ratio: Math.exp(med), low: Math.exp(lo), high: Math.exp(hi), sigma: ratios.length > 2 ? sigma(x) : NaN, verdict: 'more', done: false };
  out.noisy = out.sigma > o.noisySigma;
  if (ratios.length >= o.minRounds) {
    if (lo > L) { out.verdict = 'slower'; out.done = true; }
    else if (hi < L) { out.verdict = hi < -L ? 'faster' : 'ok'; out.done = true; }
  }
  return out;
}
/** Runs it. timeA/timeB: async () => ms for one run. Options: limit .05, warmup 1 round (dropped), minRounds 4, maxRounds 16. */
async function abSequential(timeA, timeB, o) {
  o = Object.assign({ limit: 0.05, warmup: 1, minRounds: 4, maxRounds: 16 }, o);
  const ratios = []; let d;
  for (let rep = 0; rep < o.warmup + o.maxRounds; rep++) {
    let a, b;
    if (rep % 2) { b = await timeB(); a = await timeA(); } else { a = await timeA(); b = await timeB(); }
    if (rep < o.warmup) continue;
    ratios.push(b / a); d = decide(ratios, o);
    if (d.done) break;
  }
  if (!d.done) d.verdict = 'inconclusive';
  d.ratios = ratios; return d;
}
module.exports = { abSequential, decide, medianCI, median, version: '1.0.0' };
