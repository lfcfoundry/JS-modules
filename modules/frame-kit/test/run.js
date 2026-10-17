/* frame-kit tests: Node only, no dependencies, fake clock. Run: node modules/frame-kit/test/run.js (exits non-zero on any failure).
   To run the same checks against another copy of the four files (for example an older version, to see which checks fail on it):
   FRAME_KIT_DIR=/path/to/folder node modules/frame-kit/test/run.js */
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const DIR = process.env.FRAME_KIT_DIR || path.join(__dirname, '..');
const EvenDt = require(path.join(DIR, 'even-dt.js'));
const QualityGovernor = require(path.join(DIR, 'quality-governor.js'));
const JobPump = require(path.join(DIR, 'job-pump.js'));
const FrameMeter = require(path.join(DIR, 'frame-meter.js'));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function near(a, b, tol, msg) { assert(Math.abs(a - b) <= tol, (msg || 'not near') + ': got ' + a + ', want ' + b + ' +/- ' + tol); }
function rng(seed) {   // mulberry32: small deterministic random numbers
  let a = seed >>> 0;
  return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function std(a) { let m = 0, v = 0; a.forEach(x => m += x); m /= a.length; a.forEach(x => v += (x - m) * (x - m)); return Math.sqrt(v / a.length); }

/* A realistic frame source: frame k is presented on the screen's beat at k*period, but the timestamp the browser reports is late/early by up to +/- jitter ms.
   Reported gaps therefore wobble, but their sum never drifts (a late frame is followed by an early one). */
function beatStream(period, jitter, frames, seed, t0) {
  const r = rng(seed), gaps = [];
  let prev = (t0 || 0);
  for (let k = 1; k <= frames; k++) { const t = (t0 || 0) + k * period + (r() * 2 - 1) * jitter; gaps.push(t - prev); prev = t; }
  return gaps;
}
function smoothAll(gaps, ev) { return gaps.map(g => ev.next(g)); }
function cumDiffMax(raw, out) { let a = 0, b = 0, m = 0; for (let i = 0; i < raw.length; i++) { a += raw[i]; b += out[i]; m = Math.max(m, Math.abs(a - b)); } return m; }

console.log('EvenDt');
[[60, 16.667, 2.0], [120, 8.333, 1.0], [144, 6.944, 0.8], [30, 33.333, 3.0]].forEach(function (c) {
  test(c[0] + ' Hz with jitter: period learned, output smoother, drift bounded', function () {
    const raw = beatStream(c[1], c[2], 800, c[0]), ev = new EvenDt(), out = smoothAll(raw, ev);
    near(ev.period, c[1], c[1] * 0.04, 'period');
    const rs = std(raw.slice(100)), os = std(out.slice(100));
    assert(os < rs * 0.35, 'smoothed std ' + os.toFixed(3) + ' should be well under raw std ' + rs.toFixed(3));
    assert(out.slice(100).every(x => x > 0 && Math.abs(x - c[1]) < c[1] * 0.1), 'every smoothed gap within 10% of the period');
    // The lag behind real time settles at (error of the learned period) / payback, so it is bounded but can reach a good part of one period.
    assert(cumDiffMax(raw, out) < c[1], 'total time lag stays under one period, got ' + cumDiffMax(raw, out).toFixed(2));
  });
});

test('first frames pass through raw until warm-up is done, then period is non-zero', function () {
  const ev = new EvenDt(), raw = beatStream(16.667, 2, 30, 7);
  for (let i = 0; i < 11; i++) assert(ev.next(raw[i]) === raw[i], 'frame ' + i + ' raw');
  assert(ev.period === 0, 'no period yet');
  ev.next(raw[11]);
  assert(ev.period > 0, 'period after warm-up');
});

test('reset() forgets the period and drift', function () {
  const ev = new EvenDt(); smoothAll(beatStream(16.667, 2, 100, 3), ev);
  assert(ev.period > 0); ev.reset();
  assert(ev.period === 0 && ev.drift === 0, 'cleared');
  assert(ev.next(17.1) === 17.1, 'raw again');
});

test('invalid gaps return 0 and out-of-range gaps pass through unlearned', function () {
  const ev = new EvenDt();
  assert(ev.next(NaN) === 0 && ev.next(-5) === 0 && ev.next(0) === 0 && ev.next(Infinity) === 0 && ev.next(undefined) === 0, 'invalid -> 0');
  assert(ev.next(500) === 500 && ev.next(1) === 1, 'out of range -> same');
  assert(ev._gaps.length === 0, 'none of them were learned from');
});

test('single long hitch: passes through, period unchanged, smoothing resumes', function () {
  const ev = new EvenDt(), raw = beatStream(16.667, 1.5, 400, 11);
  smoothAll(raw.slice(0, 200), ev);
  const p = ev.period;
  [200, 100, 40].forEach(function (h) {   // 200 and 100 are over maxGap (ignored entirely); 40 is 2.4 periods, so not close to a multiple
    assert(ev.next(h) === h, h + ' ms hitch returned unchanged');
  });
  assert(ev.drift === 0, 'owed drift is dropped at a gap that is not near a multiple');
  near(ev.period, p, 0.2, 'period after hitch');
  const after = smoothAll(raw.slice(200, 400), ev);
  assert(std(after) < std(raw.slice(200, 400)) * 0.35, 'smooth again after hitch');
});

test('a dropped frame (2 periods) is snapped to 2 periods, not to 1', function () {
  const ev = new EvenDt(); smoothAll(beatStream(16.667, 1, 100, 5), ev);
  near(ev.next(33.9), 2 * ev.period, 0.2, 'two-period gap');
});

test('variable-rate stream that changes steady rate (90 -> 75 -> 110 Hz): period re-learned, drift bounded', function () {
  const parts = [[1000 / 90, 300], [1000 / 75, 300], [1000 / 110, 300]];
  const raw = [], ev = new EvenDt(), out = [];
  parts.forEach(function (p, i) {
    const g = beatStream(p[0], 0.8, p[1], 20 + i);
    g.forEach(function (x) { raw.push(x); out.push(ev.next(x)); });
    near(ev.period, p[0], 0.4, 'period at end of segment ' + i);
  });
  assert(out.every(x => x > 0), 'positive');
  assert(cumDiffMax(raw, out) < 100, 'drift bounded (a brief mismatch while re-learning is allowed), got ' + cumDiffMax(raw, out).toFixed(1));
});

test('wandering variable-rate stream (random 12..30 ms): changes stay within the documented bounds', function () {
  const r = rng(99), ev = new EvenDt(), raw = [], out = [];
  let cur = 20, maxPer = 0, worst = 0;
  for (let i = 0; i < 3000; i++) {
    cur += (r() - 0.5) * 3; cur = Math.min(30, Math.max(12, cur));
    const g = cur + (r() - 0.5) * 2; raw.push(g); out.push(ev.next(g)); maxPer = Math.max(maxPer, ev.period);
    worst = Math.max(worst, Math.abs(out[i] - g));
  }
  // One gap moves by at most tolerance*period (the snap) plus payback*drift (the pay-back, itself at most tolerance*period) = 0.6 periods.
  assert(worst <= 0.6 * maxPer + 1e-9, 'largest change ' + worst.toFixed(2) + ' ms vs bound ' + (0.6 * maxPer).toFixed(2));
  // KNOWN LIMITATION: the owed drift (at most tolerance/payback = 7.5 periods) is forfeited whenever a gap passes through unsnapped, so on a stream
  // that never settles the game clock can slowly slip from real time. This loose guard only catches regressions; the README documents it.
  assert(cumDiffMax(raw, out) <= 20 * maxPer, 'lag ' + cumDiffMax(raw, out).toFixed(1) + ' ms vs guard ' + (20 * maxPer).toFixed(1));
});

console.log('QualityGovernor');
function drive(gov, gapFn, fromMs, toMs, state) {   // runs frames on a fake clock; returns the clock
  let t = fromMs;
  while (t < toMs) { const g = gapFn(t); t += g; gov.frame(g, t); }
  return t;
}

test('steady 60 Hz never changes level', function () {
  const log = [], gov = new QualityGovernor({ onChange: (l, p) => log.push([l, p]) });
  drive(gov, () => 16.667, 0, 60000);
  assert(gov.level === 0 && log.length === 0, 'level ' + gov.level);
});

test('slow stream (40 ms) steps down one level at a time, with the delay between steps, down to the bottom', function () {
  const times = [], gov = new QualityGovernor({ onChange: (l) => times.push(l) });
  let t = 0, stamps = [];
  const g2 = new QualityGovernor({ onChange: function () { stamps.push(t); } });
  while (t < 60000) { t += 40; g2.frame(40, t); gov.frame(40, t); }
  assert(gov.level === 4, 'reached lightest level, got ' + gov.level);
  assert(times.join() === '1,2,3,4', 'one at a time: ' + times.join());
  assert(stamps[0] > 3000, 'first step only after the 3 s grace, at ' + stamps[0]);
  for (let i = 1; i < stamps.length; i++) assert(stamps[i] - stamps[i - 1] > 3000, 'steps at least 3 s apart');
});

test('long fast stream steps back up, one level per 10+ s, back to 0', function () {
  const ups = [], gov = new QualityGovernor({ onChange: (l, p) => ups.push([l, p]) });
  let t = drive(gov, () => 40, 0, 30000);
  assert(gov.level === 4, 'down first, got ' + gov.level);
  ups.length = 0;
  const t1 = t;
  t = drive(gov, () => 16, t, t1 + 9000);
  assert(gov.level === 4, 'not up yet after 9 s of fast frames');
  t = drive(gov, () => 16, t, t1 + 80000);
  assert(gov.level === 0, 'back to 0, got ' + gov.level);
  assert(ups.length === 4 && ups.every(u => u[0] === u[1] - 1), 'four single steps up');
});

test('hysteresis: a stream hovering between the thresholds does not move the level', function () {
  const gov = new QualityGovernor();
  drive(gov, () => 20, 0, 120000);   // 20 ms: above the fast line (18.5), below the slow line (22)
  assert(gov.level === 0, 'stayed at 0, got ' + gov.level);
});

test('stalls over maxGap and bad numbers are ignored and break the slow streak', function () {
  const gov = new QualityGovernor();
  let t = 0;
  for (let i = 0; i < 20000; i++) { t += 40; gov.frame(40, t); if (i % 90 === 0) { gov.frame(500, t); gov.frame(NaN, t); gov.frame(-1, t); } }
  assert(gov.level === 0, 'streak never reached 100 frames, got ' + gov.level);
});

test('hold() drops the slow streak', function () {
  const gov = new QualityGovernor({ downDelay: 0 });
  let t = 10;
  for (let i = 0; i < 99; i++) { t += 40; gov.frame(40, t); if (i === 98) gov.hold(); }
  t += 40; gov.frame(40, t);
  assert(gov.level === 0, 'held');
});

test('KNOWN LIMITATION: a clean 30 Hz screen is stepped down by default', function () {
  const gov = new QualityGovernor();
  drive(gov, () => 33.333, 0, 60000);
  assert(gov.level === 4, 'it (wrongly, but as documented) steps all the way down, got ' + gov.level);
});

test('expectedPeriod fixes it: clean 30 Hz stays at 0, and a genuinely slow 30 Hz-screen (e.g. 60 ms) still steps down', function () {
  const a = new QualityGovernor({ expectedPeriod: 33.333 });
  drive(a, () => 33.333, 0, 60000);
  assert(a.level === 0, 'clean 30 Hz stays, got ' + a.level);
  const b = new QualityGovernor({ expectedPeriod: 33.333 });
  drive(b, () => 60, 0, 60000);
  assert(b.level > 0, 'slow stream still steps down');
});

test('expectedPeriod scales thresholds for 144 Hz too', function () {
  const gov = new QualityGovernor({ expectedPeriod: 6.944 });
  near(gov.slowAbove, 6.944 * 22 / 16.7, 1e-9); near(gov.fastBelow, 6.944 * 18.5 / 16.7, 1e-9);
  drive(gov, () => 6.944, 0, 60000);
  assert(gov.level === 0);
  drive(gov, () => 14, 60000, 120000);   // 144 Hz screen running at 71 fps is slow for it
  assert(gov.level > 0, 'steps down at 14 ms on a 6.9 ms screen');
});

test('defaults are exactly the original constants', function () {
  const g = new QualityGovernor();
  near(g.slowAbove, 22, 1e-9); near(g.fastBelow, 18.5, 1e-9);
  assert(g.slowFrames === 100 && g.downDelay === 3000 && g.fastMs === 10000 && g.upDelay === 10000 && g.smoothing === 0.06 && g.levels === 5 && g.maxGap === 100);
});

test('force() sets the level, clamps, notifies once, and restarts the delay clock', function () {
  const log = [], gov = new QualityGovernor({ levels: 3, onChange: (l, p) => log.push([l, p]) });
  gov.frame(16, 5000);
  gov.force(2); gov.force(2); assert(gov.level === 2 && log.length === 1, 'one notification');
  gov.force(99); assert(gov.level === 2);
  gov.force(-4); assert(gov.level === 0 && log.length === 2);
  let t = 5000;
  for (let i = 0; i < 400; i++) { t += 40; gov.frame(40, t); if (t < 5000 + 3000) assert(gov.level === 0, 'delay respected after force'); }
  assert(gov.level === 2, 'then steps down to the clamped bottom (levels=3), got ' + gov.level);
});

test('enabled = false freezes the governor', function () {
  const gov = new QualityGovernor({ enabled: false });
  drive(gov, () => 40, 0, 30000);
  assert(gov.level === 0);
});

console.log('JobPump');
function clock() { return { t: 0, now() { return this.t; } }; }

test('respects its budget (overshoots by at most one step) and finishes all work', function () {
  const c = clock(), pump = new JobPump({ now: () => c.now() }), done = [];
  for (let i = 0; i < 100; i++) pump.add(() => { c.t += 1.5; done.push(i); });
  let frames = 0, worst = 0;
  while (true) {
    const t0 = c.t, more = pump.run(5); frames++; worst = Math.max(worst, c.t - t0);
    if (!more) break;
    assert(frames < 1000, 'runaway');
  }
  assert(done.length === 100 && done.every((v, i) => v === i), 'all ran, in order');
  assert(worst <= 5 + 1.5 + 1e-9, 'worst frame ' + worst + ' ms');
  assert(frames > 20 && frames <= 40, 'spread over frames, got ' + frames);
  assert(pump.size === 0);
});

test('run(0) still makes progress (1 step); minSteps is honored', function () {
  const c = clock(), pump = new JobPump({ now: () => c.now() });
  let n = 0;
  for (let i = 0; i < 10; i++) pump.add(() => { c.t += 1; n++; });
  assert(pump.run(0) === true && n === 1, 'one step');
  assert(pump.run(0, 3) === true && n === 4, 'three more');
  assert(pump.run(Infinity) === false && n === 10, 'Infinity drains');
});

test('generators resume in order, one slice per yield, across frames', function () {
  const c = clock(), pump = new JobPump({ now: () => c.now() }), log = [];
  pump.add(function* () { for (let i = 0; i < 5; i++) { c.t += 2; log.push('A' + i); yield; } });
  pump.add(() => { c.t += 2; log.push('plain'); });
  pump.add(function* () { for (let i = 0; i < 3; i++) { c.t += 2; log.push('B' + i); yield; } });
  assert(pump.size === 3, 'size counts jobs');
  let frames = 0;
  while (pump.run(5)) frames++;
  assert(log.join() === 'A0,A1,A2,A3,A4,plain,B0,B1,B2', log.join());
  assert(frames >= 3, 'took several frames: ' + frames);
});

test('a half-finished generator keeps its local state between frames', function () {
  const c = clock(), pump = new JobPump({ now: () => c.now() });
  let total = 0;
  pump.add(function* () { let sum = 0; for (let i = 1; i <= 10; i++) { sum += i; c.t += 1; yield; } total = sum; });
  let frames = 0;
  while (pump.run(3)) frames++;
  assert(total === 55 && frames >= 3, 'sum ' + total + ' in ' + frames + ' frames');
});

test('accepts a generator object directly; add() chains; rejects other values', function () {
  const pump = new JobPump(); let n = 0;
  pump.add((function* () { n++; yield; n++; })()).add(() => { n += 10; });
  while (pump.run(1000)) { /* drain */ }
  assert(n === 12);
  let threw = false; try { pump.add(42); } catch (e) { threw = e instanceof TypeError; }
  assert(threw, 'TypeError');
});

test('jobs may add jobs; they run after the current queue', function () {
  const pump = new JobPump(), log = [];
  pump.add(() => { log.push(1); pump.add(() => log.push(3)); });
  pump.add(() => log.push(2));
  pump.run(Infinity);
  assert(log.join() === '1,2,3', log.join());
});

test('clear() empties the queue and closes half-finished generators (finally runs)', function () {
  const c = clock(), pump = new JobPump({ now: () => c.now() }); let closed = false, ran = 0;
  pump.add(function* () { try { for (;;) { c.t += 1; ran++; yield; } } finally { closed = true; } });
  pump.add(() => { ran += 100; });
  pump.run(0);
  assert(pump.size === 2 && ran === 1);
  pump.clear();
  assert(pump.size === 0 && closed, 'cleared and closed');
  assert(pump.run(10) === false && ran === 1, 'nothing runs afterwards');
});

test('a throwing job is dropped; without onError run() rethrows and the rest still run later', function () {
  const pump = new JobPump(); const log = [];
  pump.add(() => { throw new Error('boom'); }).add(() => log.push('after'));
  let msg = ''; try { pump.run(Infinity); } catch (e) { msg = e.message; }
  assert(msg === 'boom' && pump.size === 1, 'rethrown, failed job dropped');
  pump.run(Infinity); assert(log.join() === 'after');
});

test('onError receives errors from plain and generator jobs and the queue continues', function () {
  const errs = [], log = [], pump = new JobPump({ onError: e => errs.push(e.message) });
  pump.add(() => { throw new Error('plain'); });
  pump.add(function* () { yield; throw new Error('gen'); });
  pump.add(() => log.push('ok'));
  while (pump.run(1000)) { /* drain */ }
  assert(errs.join() === 'plain,gen' && log.join() === 'ok', errs.join() + ' / ' + log.join());
});

test('run() called from inside a job does nothing nested', function () {
  const pump = new JobPump(); let inner = null;
  pump.add(() => { inner = pump.run(1000); });
  pump.add(() => {});
  pump.run(0);
  assert(inner === true, 'nested call reports work remaining without running it');
  assert(pump.size === 1);
});

test('large queue (20000 jobs) drains in order and compacts', function () {
  const pump = new JobPump(); let last = -1, ok = true;
  for (let i = 0; i < 20000; i++) pump.add(() => { if (i !== last + 1) ok = false; last = i; });
  let frames = 0; while (pump.run(0, 700)) frames++;
  assert(ok && last === 19999 && pump.size === 0 && frames > 20);
});

test('real clock: default now() works and a 3 ms budget is respected within a step', function () {
  const pump = new JobPump();
  for (let i = 0; i < 50; i++) pump.add(() => { const b = Date.now(); while (Date.now() - b < 1); });
  const t0 = Date.now(); pump.run(3);
  assert(Date.now() - t0 < 3 + 25, 'about 3 ms, got ' + (Date.now() - t0));
  assert(pump.size > 0 && pump.size < 50);
});

/* ---- FrameMeter ---- */
function feed(m, gaps, work) { let now = 1000; m.frame(now); gaps.forEach((g, i) => { now += g; m.frame(now, work ? work[i] : undefined); }); return now; }

test('FrameMeter: steady 60 Hz reads 60 fps, small worst, smooth', function () {
  const m = new FrameMeter(); feed(m, new Array(120).fill(16.67), new Array(120).fill(4));
  near(m.fps, 60, 1.5, 'fps'); assert(m.worstMs <= 17, 'worst ' + m.worstMs); assert(m.verdict() === 'smooth');
  assert(m.lines(['quality 0']).join('|') === m.fps + ' fps|worst ' + m.worstMs + ' ms|quality 0|smooth', m.lines(['quality 0']).join('|'));
});

test('FrameMeter: a long frame while the game worked little is the device', function () {
  const m = new FrameMeter(); const g = new Array(60).fill(16.67), w = new Array(60).fill(4); g[40] = 120; w[40] = 6;
  feed(m, g, w); const h = m.hitches(); assert(h.count === 1 && h.device === 1 && h.game === 0, JSON.stringify(h)); assert(m.verdict() === '1 hitch: the device', m.verdict());
});

test('FrameMeter: a long frame while the game worked most of it is the game', function () {
  const m = new FrameMeter(); const g = new Array(60).fill(16.67), w = new Array(60).fill(4); g[30] = 90; w[30] = 80;
  feed(m, g, w); assert(m.verdict() === '1 hitch: the game', m.verdict());
});

test('FrameMeter: both causes, plural words, unknown without work time', function () {
  let m = new FrameMeter(); let g = new Array(80).fill(16.67), w = new Array(80).fill(4); g[20] = 100; w[20] = 90; g[50] = 100; w[50] = 5; feed(m, g, w);
  assert(m.verdict() === '2 hitches: both', m.verdict());
  m = new FrameMeter(); g = new Array(40).fill(16.67); g[20] = 100; feed(m, g); assert(m.verdict() === '1 hitch: cause unknown', m.verdict());
});

test('FrameMeter: the rule is relative and has a floor (30 Hz steady is smooth; a 45 ms blip at 60 Hz is not a hitch)', function () {
  let m = new FrameMeter(); feed(m, new Array(60).fill(33.3)); assert(m.verdict() === 'smooth', m.verdict());
  m = new FrameMeter(); const g = new Array(60).fill(16.67); g[30] = 45; feed(m, g); assert(m.verdict() === 'smooth', 'floor ' + m.verdict());
  m = new FrameMeter(); const g2 = new Array(60).fill(33.3); g2[30] = 60; feed(m, g2); assert(m.verdict() === 'smooth', 'less than 2x the average');
});

test('FrameMeter: old hitches leave the window', function () {
  const m = new FrameMeter({ windowMs: 2000 }); const g = new Array(300).fill(16.67); g[10] = 150; feed(m, g, new Array(300).fill(3));
  assert(m.hitches().count === 0, 'the 150 ms hitch is older than 2 s'); assert(m.verdict() === 'smooth');
});

test('FrameMeter: tap delay is the median of input to next frame; stale or negative values are dropped', function () {
  const m = new FrameMeter(); let now = 1000; m.frame(now);
  [10, 12, 40, 11, 13].forEach(d => { m.input(now + 2); now += d + 2; m.frame(now, 3); });
  near(m.tapMs(), 12, 0.6, 'median'); assert(m.lines().indexOf('tap ' + m.tapMs() + ' ms') > 0);
  m.input(now + 5000); now += 16; m.frame(now); near(m.tapMs(), 12, 0.6, 'a future timestamp is ignored');
  const e = new FrameMeter(); e.frame(10); e.frame(26); assert(e.tapMs() === -1 && e.lines().every(l => !/^tap/.test(l)), 'no taps, no tap line');
});

test('FrameMeter: report refreshes about every interval and reset clears everything', function () {
  const m = new FrameMeter({ everyMs: 500 }); let now = 0, refreshed = 0; m.frame(now);
  for (let i = 0; i < 120; i++) { now += 16.67; if (m.frame(now)) refreshed++; }
  assert(refreshed >= 3 && refreshed <= 5, 'refreshed ' + refreshed); m.reset(); assert(m.fps === 0 && m.verdict() === 'smooth' && m.tapMs() === -1);
});

/* ---- Fixes from the 2026-10 audit ---- */
console.log('Audit fixes');

test('each file is sloppy at the top level (its strict mode is inside the wrapper) and still exports and sets its global', function () {
  [['even-dt.js', 'EvenDt'], ['quality-governor.js', 'QualityGovernor'], ['job-pump.js', 'JobPump'], ['frame-meter.js', 'FrameMeter']].forEach(function (f) {
    const src = fs.readFileSync(path.join(DIR, f[0]), 'utf8');
    assert(/MIT License, Copyright \(c\) 2026 LFC Foundry/.test(src.split('\n')[0]), f[0] + ' keeps its header line');
    const ctx = {}; vm.createContext(ctx);
    vm.runInContext(src + '\n;var __top = (function () { return this === undefined ? "strict" : "sloppy"; })();', ctx);
    assert(ctx.__top === 'sloppy', f[0] + ' must not make the page strict, got ' + ctx.__top);
    assert(typeof ctx[f[1]] === 'function', f[0] + ' sets the global ' + f[1]);
  });
});

test('EvenDt: on a 480 Hz screen the default minGap biases the learned period high; minGap 0.5 does not (documented)', function () {
  const raw = beatStream(1000 / 480, 0.5, 800, 5), a = new EvenDt(), b = new EvenDt({ minGap: 0.5 });
  raw.forEach(g => { a.next(g); b.next(g); });
  assert(a.period > 1000 / 480 * 1.04, 'default learns a period that is too long: ' + a.period.toFixed(3));
  near(b.period, 1000 / 480, 1000 / 480 * 0.03, 'minGap 0.5 period');
});

/* FrameMeter */
function runFrames(m, gaps, work) { let now = 1000, worstSeen = 0; m.frame(now); gaps.forEach((g, i) => { now += g; if (m.frame(now, work)) worstSeen = Math.max(worstSeen, m.worstMs); }); return worstSeen; }

test('FrameMeter: a tab that comes back after a long hidden spell is not a hitch and does not inflate the worst gap', function () {
  const m = new FrameMeter(), g = new Array(180).fill(16.67); g[60] = 30000;
  const worst = runFrames(m, g, 3);
  assert(m.verdict() === 'smooth', 'verdict ' + m.verdict());
  assert(worst < 40, 'worst gap ' + worst);
  assert(m.pauses === 1, 'one pause skipped');
  near(m.fps, 60, 2, 'fps recovers');
});

test('FrameMeter: pause() skips the next gap even when it is shorter than pauseGapMs', function () {
  const m = new FrameMeter(); let now = 1000; m.frame(now);
  for (let i = 0; i < 20; i++) { now += 16.67; m.frame(now, 3); }
  m.pause(); now += 400; m.frame(now, 3);
  for (let i = 0; i < 20; i++) { now += 16.67; m.frame(now, 3); }
  assert(m.verdict() === 'smooth', 'verdict ' + m.verdict());
  const n = new FrameMeter(); now = 1000; n.frame(now);
  for (let i = 0; i < 20; i++) { now += 16.67; n.frame(now, 3); }
  now += 400; n.frame(now, 3);
  assert(n.verdict() !== 'smooth', 'without pause() a 400 ms gap is a hitch');
  const k = new FrameMeter({ pauseGapMs: 200 }); now = 1000; k.frame(now);
  for (let i = 0; i < 20; i++) { now += 16.67; k.frame(now, 3); }
  now += 400; k.frame(now, 3); assert(k.verdict() === 'smooth', 'a smaller pauseGapMs also skips it');
});

test('FrameMeter: while document.hidden is true frames are skipped, not measured', function () {
  const m = new FrameMeter(); let now = 1000; m.frame(now);
  for (let i = 0; i < 20; i++) { now += 16.67; m.frame(now, 3); }
  global.document = { hidden: true };
  try { now += 300; m.frame(now, 3); } finally { delete global.document; }
  for (let i = 0; i < 20; i++) { now += 16.67; m.frame(now, 3); }
  assert(m.verdict() === 'smooth' && m.pauses === 1, m.verdict() + ' / pauses ' + m.pauses);
});

test('FrameMeter: a tap stamped a little after the frame time counts as 0 ms; a far mismatch is dropped and counted', function () {
  const e = new FrameMeter(); let now = 1000; e.frame(now);
  e.input(now + 20 + 5); now += 20; e.frame(now, 3);
  assert(e.tapMs() === 0, 'clamped to 0, got ' + e.tapMs());
  e.input(now + 5000); now += 16; e.frame(now, 3);
  assert(e.tapMs() === 0 && e.tapsDropped === 1, 'far future dropped and counted: ' + e.tapsDropped);
});

test('FrameMeter: junk input never throws', function () {
  const m = new FrameMeter();
  m.frame(NaN); m.frame(undefined); m.frame('x'); m.input('x'); m.input(NaN); m.input(-5); m.frame(0); m.frame(16);
  assert(typeof m.verdict() === 'string' && m.lines().length >= 3);
});

/* JobPump */
test('JobPump: a bare performance.now is accepted (no Illegal invocation) and a broken clock falls back to the default', function () {
  if (typeof performance === 'undefined' || typeof performance.now !== 'function') return;
  const a = new JobPump({ now: performance.now }); let n = 0;
  for (let i = 0; i < 20; i++) a.add(() => { n++; });
  while (a.run(5)) { /* drain */ }
  assert(n === 20, 'ran ' + n);
  const b = new JobPump({ now: function () { throw new Error('clock broke'); } }); let m = 0;
  for (let i = 0; i < 20; i++) b.add(() => { m++; });
  while (b.run(5)) { /* drain */ }
  assert(m === 20, 'ran ' + m);
  const c = new JobPump({ now: function () { return 'soon'; } }); c.add(() => { m++; }); c.run(5);
  assert(m === 21, 'a clock that answers with a string is replaced');
});

/* A clock that only shows multiples of tickMs, while each step really takes stepMs and the rest of the frame takes drawMs. */
function coarseRig(tickMs, stepMs, drawMs, opts, jobs) {
  const st = { real: 0 };
  const pump = new JobPump(Object.assign({ now: () => Math.floor(st.real / tickMs) * tickMs }, opts));
  let done = 0; for (let i = 0; i < jobs; i++) pump.add(() => { st.real += stepMs; done++; });
  const spans = []; let frames = 0;
  while (pump.size > 0) {
    const r0 = st.real, rem = pump.run(4); spans.push(st.real - r0); st.real += drawMs; if (++frames > 5000) break;
    if (!rem) break;
  }
  return { spans, frames, done, pump };
}

test('JobPump: on a 16.67 ms clock a 4 ms budget no longer eats a whole frame (steps are counted once the clock is frozen)', function () {
  const r = coarseRig(16.667, 1, 7, { clockStepMs: 16.667 }, 400);
  assert(r.done === 400, 'all work ran: ' + r.done);
  assert(Math.max.apply(null, r.spans) <= 8.0001, 'worst run took ' + Math.max.apply(null, r.spans).toFixed(2) + ' ms of real time');
});

test('JobPump: the same without being told the clock step: it learns it within a few frames', function () {
  const r = coarseRig(16.667, 1, 7, {}, 400);
  assert(r.done === 400, 'all work ran');
  const later = r.spans.slice(40);
  assert(Math.max.apply(null, later) <= 8.0001, 'after warm-up the worst run took ' + Math.max.apply(null, later).toFixed(2) + ' ms');
  near(r.pump.clockStepMs, 16.667, 0.01, 'learned tick');
});

test('JobPump: a fine clock with tiny steps is not held back by the coarse-clock rule', function () {
  const st = { real: 0 }, pump = new JobPump({ now: () => st.real }); let n = 0;
  for (let i = 0; i < 5000; i++) pump.add(() => { st.real += 0.01; n++; });
  pump.run(4); pump.run(4);
  assert(n > 500, 'two runs did ' + n + ' steps');
});

test('JobPump: clear() then add() inside a job keeps the new job', function () {
  const pump = new JobPump(); const log = [];
  pump.add(() => { log.push('first'); pump.clear(); pump.add(() => { log.push('new'); }); });
  pump.add(() => { log.push('old'); });
  while (pump.run(1000)) { /* drain */ }
  assert(log.join() === 'first,new' && pump.size === 0, log.join());
  const p2 = new JobPump(); const l2 = [];
  p2.add(function* () { l2.push('g1'); p2.clear(); p2.add(() => { l2.push('after'); }); yield; l2.push('never'); });
  p2.run(Infinity); assert(l2.join() === 'g1,after', l2.join());
});

/* QualityGovernor */
function device(gov, slowAtZero, fromMs, toMs) {   // level 0 is too heavy (40 ms frames), every other level is fine (16 ms)
  let t = fromMs; while (t < toMs) { const g = gov.level === 0 && slowAtZero ? 40 : 16; t += g; gov.frame(g, t); } return t;
}

test('QualityGovernor: flip-flop guard stops the slow up/down cycle and stays at the lighter level', function () {
  const log = [], gov = new QualityGovernor({ levels: 3, flipLimit: 3, onChange: (l, p) => log.push([l, p]) });
  device(gov, true, 0, 600000);
  assert(log.length <= 8, 'changes: ' + log.length);
  assert(gov.level === 1 && gov.gaveUp, 'stays at 1, level ' + gov.level);
  assert(gov.flips === 3, 'three reversals counted: ' + gov.flips);
});

test('QualityGovernor: the guard is off unless you ask for it', function () {
  const gov = new QualityGovernor({ levels: 3 });
  assert(gov.flipLimit === 0, 'default flipLimit ' + gov.flipLimit);
  device(gov, true, 0, 600000);
  assert(!gov.gaveUp && gov.flips === 0, 'no give-up by default');
});

test('QualityGovernor: flipLimit 0 keeps the old endless cycle', function () {
  const log = [], gov = new QualityGovernor({ levels: 3, flipLimit: 0, onChange: (l, p) => log.push([l, p]) });
  device(gov, true, 0, 600000);
  assert(log.length > 30 && !gov.gaveUp && gov.flips === 0, 'changes: ' + log.length);
});

test('QualityGovernor: each reversal doubles the wait before the level is tried again', function () {
  const ups = [], gov = new QualityGovernor({ levels: 3, flipLimit: 5, onChange: (l, p) => { if (l < p) ups.push(t); } });
  let t = 0; while (t < 400000) { const g = gov.level === 0 ? 40 : 16; t += g; gov.frame(g, t); }
  assert(ups.length >= 4, 'ups ' + ups.length);
  const gaps = []; for (let i = 1; i < ups.length; i++) gaps.push(ups[i] - ups[i - 1]);
  assert(gaps[1] > gaps[0] * 1.6 && gaps[2] > gaps[1] * 1.6, 'wait grows: ' + gaps.map(Math.round).join(', '));
});

test('QualityGovernor: a device that is only slow once is not penalised, and a real step up later still works', function () {
  const gov = new QualityGovernor({ levels: 3 });
  let t = device(gov, true, 0, 20000);   // down to 1, up to 0, then (slow again) down to 1: one reversal
  t = device(gov, false, t, t + 200000);
  assert(gov.level === 0 && !gov.gaveUp, 'recovered to 0, level ' + gov.level);
});

test('QualityGovernor: force() starts the guard over', function () {
  const gov = new QualityGovernor({ levels: 3, flipLimit: 3 });
  device(gov, true, 0, 600000); assert(gov.gaveUp);
  gov.force(0); assert(!gov.gaveUp && gov.flips === 0 && gov.level === 0);
  gov.force(2); gov.resetGuard();
});

test('QualityGovernor: a long stall ends the "fast in a row" total', function () {
  const gov = new QualityGovernor({ levels: 3 }); let t = drive(gov, () => 40, 0, 20000);
  assert(gov.level === 2, 'bottom first, got ' + gov.level);
  t = drive(gov, () => 16, t, t + 9000);
  t += 5000; gov.frame(5000, t);            // the tab was hidden, now it is back
  t = drive(gov, () => 16, t, t + 2500);    // 9 s + 2.5 s, but not in a row
  assert(gov.level === 2, 'must not step up on 11.5 s that include a stall, got ' + gov.level);
  t = drive(gov, () => 16, t, t + 12000);
  assert(gov.level === 1, 'steps up after a real 10 s calm spell, got ' + gov.level);
});

test('QualityGovernor: the stall is seen from the clock too, and hold() ends the fast total', function () {
  const gov = new QualityGovernor({ levels: 3 }); let t = drive(gov, () => 40, 0, 20000);
  t = drive(gov, () => 16, t, t + 9000);
  t += 5000; gov.frame(16, t);              // the caller capped the gap, the clock still jumped
  t = drive(gov, () => 16, t, t + 2500);
  assert(gov.level === 2, 'clock jump counts as a stall, got ' + gov.level);
  const h = new QualityGovernor({ levels: 3 }); t = drive(h, () => 40, 0, 20000);
  t = drive(h, () => 16, t, t + 9000); h.hold(); t = drive(h, () => 16, t, t + 2500);
  assert(h.level === 2, 'hold() restarts the fast total, got ' + h.level);
});

test('QualityGovernor: a device that is always slower than maxGap now steps down; isolated stalls still change nothing', function () {
  const first = function (gap, o) { let at = null, x = 1000; const g = new QualityGovernor(Object.assign({ levels: 3, onChange: () => { if (at === null) at = x - 1000; } }, o || {}));
    for (; x < 121000 && at === null; x += gap) g.frame(gap, x); return at; };
  assert(first(150) !== null && first(150) < 20000, '6.7 fps: ' + first(150));
  assert(first(1000) !== null, '1 fps never stepped down');
  assert(first(150, { stallRun: 1000000 }) === null, 'stallRun huge = the old blind spot');
  const log = [], gov = new QualityGovernor({ levels: 3, onChange: l => log.push(l) });
  let x = 1000; for (let i = 0; i < 3000; i++) { const gap = (i % 200 >= 198) ? 300 : 16.7; x += gap; gov.frame(gap, x); }   // two long gaps in a row, over and over
  assert(log.length === 0, 'isolated stalls changed the level: ' + log.join(','));
});

test('QualityGovernor: stepUp:false only ever steps down', function () {
  const log = [], gov = new QualityGovernor({ levels: 3, stepUp: false, onChange: l => log.push(l) });
  let t = drive(gov, () => 40, 0, 20000); assert(gov.level === 2, 'bottom first, got ' + gov.level);
  drive(gov, () => 16, t, t + 120000); assert(gov.level === 2 && log.join() === '1,2', 'stayed down: ' + log.join());
  const up = new QualityGovernor({ levels: 3 }); t = drive(up, () => 40, 0, 20000); drive(up, () => 16, t, t + 60000); assert(up.level < 2, 'default still steps up');
});

test('QualityGovernor: lock() freezes the level, unlock() lets it move again from a clean count', function () {
  const log = [], gov = new QualityGovernor({ levels: 3, onChange: l => log.push(l) });
  assert(gov.lock() === gov && gov.locked);
  let t = drive(gov, () => 40, 0, 30000); assert(gov.level === 0 && log.length === 0, 'locked but moved');
  gov.unlock(); assert(!gov.locked);
  drive(gov, () => 40, t, t + 30000); assert(gov.level === 2, 'moves after unlock, got ' + gov.level);
});

test('QualityGovernor: a throwing onChange never leaves a half-changed state or escapes frame()', function () {
  const errs = []; let calls = 0;
  const gov = new QualityGovernor({ levels: 3, onChange: () => { calls++; throw new Error('bad callback'); }, onError: e => errs.push(e.message) });
  drive(gov, () => 40, 0, 30000);
  assert(gov.level === 2 && calls === 2 && errs.length === 2, 'level ' + gov.level + ', calls ' + calls);
  assert(gov.lastError && gov.lastError.message === 'bad callback');
  const f = new QualityGovernor({ levels: 3, onChange: () => { throw new Error('forced'); }, onError: () => { throw new Error('and the handler too'); } });
  f.force(2); assert(f.level === 2, 'force() survives a throwing callback and handler');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
