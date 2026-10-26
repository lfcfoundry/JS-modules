/* Copyright (c) 2026 LFC Foundry. MIT License. Animation timing, name timing, picture filters and the GIF worker handler. */
'use strict';
const X = require('../gif-writer-fx.js'), G = require('../gif-writer.js'), Wk = require('../gif-writer-worker.js');
global.GifWriter = G; global.GifWriterFx = X;
let fails = 0; const ok = (c, t) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + t); };

/* delays: whole hundredths, never drifting */
const d25 = X.delaysCs(new Array(100).fill(40)); ok(d25.every((c) => c === 4), '25 FPS is exactly 4 hundredths a picture');
const d15 = X.delaysCs(new Array(150).fill(1000 / 15)); ok(Math.abs(d15.reduce((a, b) => a + b, 0) - 1000) <= 1 && d15.every((c) => c === 6 || c === 7), '15 FPS: 6s and 7s that add up to the true time (' + d15.reduce((a, b) => a + b, 0) + ' for 1000)');
ok(X.delaysCs([5, 5, 5]).every((c) => c >= 2), 'a picture is never shorter than 2 hundredths (browsers would stretch it)');
ok(X.delaysCs([2500])[0] === 250, 'a long hold keeps its time');

/* easing */
['linear', 'smooth', 'strong', 'out', 'inn'].forEach((n) => ok(X.ease(n, 0) === 0 && Math.abs(X.ease(n, 1) - 1) < 1e-9 && X.ease(n, 0.5) > 0 && X.ease(n, 0.5) < 1, 'easing "' + n + '" runs from 0 to 1'));
ok(X.speed('linear', 0.5) > 0.99 && X.speed('smooth', 0) < 0.05 && X.speed('smooth', 0.5) > 0.95, 'speed is 0 at rest and 1 at the fastest point');

/* turning plan */
let sp = X.spinPlan({ fps: 25, turns: 1, turnSec: 4, pauseSec: 0, ease: 'linear', arc: 360, names: 'always' });
ok(sp.length === 100 && Math.abs(sp[99].yaw - 2 * Math.PI) < 1e-9 && sp.every((f) => f.ms === 40 && f.a === 1), 'one steady turn: 100 pictures of 0.04 s, ending a full turn on');
sp = X.spinPlan({ fps: 25, turns: 3, turnSec: 2, pauseSec: 1.5, ease: 'smooth', arc: 360, names: 'always' });
const holds = sp.filter((f) => f.phase === 'hold'); ok(holds.length === 3 && holds.every((f) => f.ms === 1500), 'three turns with a 1.5 s pause after each: three one-picture holds (' + sp.length + ' pictures)');
ok(Math.abs(sp.reduce((a, f) => a + f.ms, 0) - (3 * 2000 + 3 * 1500)) < 1, 'total time = turns x seconds + pauses');
sp = X.spinPlan({ fps: 25, turns: 4, turnSec: 2, pauseSec: 1, ease: 'smooth', arc: 360, reverse: true, names: 'always' });
const ends = sp.filter((f, i) => sp[i + 1] && sp[i + 1].phase === 'hold' && f.phase === 'move' || (i === sp.length - 1)).map((f) => f.yaw);
ok(sp[sp.findIndex((f) => f.phase === 'hold') - 1].yaw > 6.28 && sp.some((f) => f.yaw < sp[sp.findIndex((f2) => f2.phase === 'hold')].yaw - 0.5 && f.phase === 'move' && f.yaw < 6.2 && f.yaw > 0.1), 'reversing: the second turn goes back down');
ok(Math.abs(sp[sp.length - 1].yaw) < 1e-9, 'an even number of reversed turns ends where it began');
sp = X.spinPlan({ fps: 25, turns: 3, turnSec: 2, pauseSec: 1, ease: 'linear', arc: 360, reverse: true, names: 'always' });
ok(sp.filter(function (f) { return f.phase === 'hold'; }).length === 4 && Math.abs(sp[sp.length - 1].yaw) < 1e-9, 'three reversed turns become four, so the pause where the GIF starts over also turns the spin around');
sp = X.spinPlan({ fps: 25, turns: 1, turnSec: 2, pauseSec: 1, ease: 'smooth', arc: 90, names: 'always' });
ok(Math.abs(sp[sp.length - 1].yaw) < 1e-9 && sp.filter((f) => f.phase === 'hold').length === 2, 'a 90 degree swing is made even (back and forth) so the loop has no jump');
sp = X.spinPlan({ fps: 25, turns: 2, turnSec: 2, pauseSec: 1, ease: 'smooth', names: 'still', fadeSec: 0.4 });
const fadeIn = sp.filter((f) => f.phase === 'hold' && f.ms === 40).map((f) => f.a); ok(fadeIn.length >= 6 && fadeIn[0] < fadeIn[fadeIn.length - 1] && sp.filter((f) => f.phase === 'hold' && f.ms > 100).every((f) => f.a === 1), 'names fade in during a pause and are full on the long hold');
ok(sp.filter((f) => f.phase === 'move').slice(-10).every((f) => f.a === 0), 'names are off while turning');
sp = X.spinPlan({ fps: 25, turns: 1, turnSec: 2, pauseSec: 0, ease: 'smooth', names: 'slowing' }); ok(sp[0].a > 0.8 && sp[25].a < 0.1 && sp[49].a > 0.8, 'names show when the turn slows down');
ok(X.spinPlan({ fps: 25, turns: 1, turnSec: 2, names: 'never' }).every((f) => f.a === 0), 'names never');
ok(X.stateNames('still', 0.5) === 0 && X.stateNames('still', 0) === 1 && X.stateNames('never', 0) === 0 && X.stateNames('always', 0.5) === 1, 'state names fade out mid-change');

/* filters */
const W = 64, H = 48, mk = () => { const a = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < W * H; i++) { a[i * 4] = (i * 7) & 255; a[i * 4 + 1] = (i * 3) & 255; a[i * 4 + 2] = (i * 11) & 255; a[i * 4 + 3] = 255; } return a; };
const base = mk(); const same = X.apply(mk(), W, H, X.plainFilter()); ok(Buffer.compare(Buffer.from(same), Buffer.from(base)) === 0, 'the plain filter changes nothing');
const f1 = (f) => X.apply(mk(), W, H, f), avg = (a) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += a[i] + a[i + 1] + a[i + 2]; return s / (a.length / 4 * 3); };
ok(avg(f1({ brightness: 0.4 })) > avg(base) + 10 && avg(f1({ brightness: -0.4 })) < avg(base) - 10, 'brightness moves the average');
const mono = f1({ tone: 'mono' }); ok([0, 100, 2000, 3000].every((i) => Math.abs(mono[i * 4] - mono[i * 4 + 1]) <= 1 && Math.abs(mono[i * 4 + 1] - mono[i * 4 + 2]) <= 1), 'black and white has equal red, green and blue');
const warm = f1({ warmth: 0.8 }); ok(warm[0] >= base[0] && warm[2] <= base[2], 'warm moves red up and blue down');
const vg = f1({ vignette: 1 }); ok(vg[0] === 0 || vg[0] < base[0] || base[0] === 0, 'vignette darkens the corner') ; const mid = ((H >> 1) * W + (W >> 1)) * 4; ok(Math.abs(vg[mid] - base[mid]) <= 3, 'vignette leaves the middle');
const bl = f1({ blur: 2 }); let varB = 0, varO = 0; for (let i = 0; i < base.length; i += 4) { varB += Math.abs(bl[i] - bl[(i + 4) % base.length]); varO += Math.abs(base[i] - base[(i + 4) % base.length]); } ok(varB < varO, 'blur smooths neighbors');
const gl = f1({ glow: 1 }); ok(avg(gl) >= avg(base), 'glow only adds light'); let alphaOk = true; [bl, gl, vg, warm].forEach((a) => { for (let i = 3; i < a.length; i += 4) if (a[i] !== 255) alphaOk = false; }); ok(alphaOk, 'alpha is never changed');
ok(X.cleanFilter({ brightness: 9, tone: 'x', glow: 'a', hue: -999 }).brightness === 1 && X.cleanFilter({ tone: 'x' }).tone === 'none' && X.cleanFilter({ hue: -999 }).hue === -180, 'filter settings are clamped and cleaned');
X.FILTER_PRESETS.forEach((p) => ok(Object.keys(p[1]).every((k) => k in X.plainFilter()), 'filter preset "' + p[0] + '" uses known settings'));

/* the worker handler writes a real GIF */
const out = []; const post = (m) => out.push(m); const pics = [mk(), mk()]; pics[1][0] = 255; pics[1][1] = 0;
Wk.handle({ t: 'init', w: W, h: H }, post);
Wk.handle({ t: 'filter', id: 'a', buf: pics[0].buffer.slice(0), w: W, h: H, f: { glow: 0.5, vignette: 0.5 } }, post); ok(out[0].t === 'filtered' && out[0].buf.byteLength === W * H * 4, 'the worker filters a picture');
Wk.handle({ t: 'palette', bufs: [pics[0].buffer.slice(0), pics[1].buffer.slice(0)] }, post); ok(out[1].t === 'ready', 'the worker builds the palette');
Wk.handle({ t: 'frame', id: 'f1', buf: pics[0].buffer.slice(0), ms: 40 }, post); Wk.handle({ t: 'frame', id: 'f2', buf: pics[1].buffer.slice(0), ms: 1500 }, post);
Wk.handle({ t: 'finish' }, post); const gif = new Uint8Array(out[out.length - 1].bytes);
ok(String.fromCharCode(...gif.slice(0, 6)) === 'GIF89a' && gif[gif.length - 1] === 0x3b, 'the worker writes a GIF (' + gif.length + ' bytes)');
{
  const G = require('../gif-writer.js'), mk = (r) => { const a = new Uint8ClampedArray(16 * 16 * 4); for (let i = 0; i < a.length; i += 4) { a[i] = r; a[i + 1] = 100; a[i + 2] = 100; a[i + 3] = 255; } return a; };
  const pal = [[100, 100, 100], [105, 100, 100]], run = (tol) => { const e = G.createEncoder(16, 16, pal, { loop: true, tolerance: tol }); e.add(mk(100), 40); e.add(mk(105), 40); e.finish(); return e.count(); };
  ok(run(0) === 2 && run(6) === 1, 'a color change smaller than the tolerance is left as it was (2 pictures exactly, 1 with tolerance 6)');
}
process.exit(fails ? 1 : 0);
