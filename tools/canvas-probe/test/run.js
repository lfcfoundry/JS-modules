/* Node-only tests for canvas-probe, using a fake 2D context (no browser). Run: node tools/canvas-probe/test/run.js
 * Copyright (c) 2026 LFC Foundry. MIT License. */
'use strict';
var path = require('path');
var CanvasProbe = require(path.join(__dirname, '..', 'src', 'canvas-probe.js'));
var pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) pass++; else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); } }

function Fake(w, h) { this.canvas = { width: w, height: h }; this.m = [1, 0, 0, 1, 0, 0]; this.s = {}; this.log = []; }
var P = Fake.prototype;
['save', 'restore', 'beginPath', 'fill', 'stroke', 'clip', 'clearRect', 'strokeRect', 'fillText', 'strokeText', 'measureText', 'createLinearGradient',
  'createRadialGradient', 'createPattern', 'putImageData', 'getImageData', 'fillRect', 'drawImage'].forEach(function (n) { P[n] = function () { this.log.push(n); return n; }; });
['reset', 'setTransform', 'translate', 'rotate', 'arc', 'arcTo', 'moveTo', 'lineTo', 'rect', 'ellipse', 'roundRect', 'quadraticCurveTo', 'bezierCurveTo',
  'setLineDash', 'createConicGradient'].forEach(function (n) { P[n] = function () { this.log.push(n); return n; }; });
P.scale = function (x, y) { this.m[0] *= x; this.m[3] *= y; };
P.getTransform = function () { return { a: this.m[0], b: this.m[1], c: this.m[2], d: this.m[3], e: this.m[4], f: this.m[5] }; };
['fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'font', 'shadowBlur', 'globalCompositeOperation', 'filter', 'imageSmoothingEnabled', 'shadowColor', 'lineCap',
  'textAlign', 'textBaseline'].forEach(function (n) {
  Object.defineProperty(P, n, { get: function () { return this.s[n]; }, set: function (v) { this.s[n] = v; }, configurable: true, enumerable: true });
});
// a fake canvas element: width/height accessors and getContext, so the probe can see size writes and creation options
function FakeCanvas(w, h) { this._w = w; this._h = h; this.ctx = null; }
var CP = FakeCanvas.prototype;
Object.defineProperty(CP, 'width', { get: function () { return this._w; }, set: function (v) { this._w = v; }, configurable: true, enumerable: true });
Object.defineProperty(CP, 'height', { get: function () { return this._h; }, set: function (v) { this._h = v; }, configurable: true, enumerable: true });
CP.getContext = function (type) { if (type !== '2d') return null; if (!this.ctx) { this.ctx = new Fake(0, 0); this.ctx.canvas = this; } return this.ctx; };
function mk(w, h, attrs, connected) { var cv = new FakeCanvas(w, h); cv.isConnected = !!connected; return cv.getContext('2d', attrs); }
var origFill = P.fillRect, origDraw = P.drawImage, origStyle = Object.getOwnPropertyDescriptor(P, 'fillStyle');
var img = { width: 100, height: 50 };

var pr = CanvasProbe.install({ prototypes: [P], canvasPrototypes: [CP], keep: 5 });
var c = new Fake(200, 100), f, r;

// 1. counting and the per-frame medians
for (f = 0; f < 3; f++) { c.fillRect(0, 0, 10, 10); c.fillRect(0, 0, 10, 10); c.beginPath(); pr.frame(); }
r = pr.report();
check('counts calls per frame', r.calls.fillRect.median === 2 && r.calls.beginPath.median === 1, r.calls);
check('the original methods still run', c.log.length === 9 && c.log[0] === 'fillRect');
check('frames seen and kept', r.frames === 3 && r.kept === 3);

// 2. save/restore balance: balanced, then an unmatched save, then an extra restore
pr.reset(); c.save(); c.save(); c.restore(); c.restore(); pr.frame();
r = pr.report(); check('balanced save/restore: no leak, deepest 2', r.saveRestore.leakFrames === 0 && r.saveRestore.deepest === 2 && r.saveRestore.openContextsNow === 0, r.saveRestore);
c.save(); pr.frame(); pr.frame();
r = pr.report(); check('an unmatched save is a leak at every frame end', r.saveRestore.leakFrames === 2 && r.saveRestore.openContextsNow === 1, r.saveRestore);
check('the text says slow leak', /slow leak/.test(pr.text()));
c.restore(); pr.frame(); c.restore();
r = pr.report(); check('restore with nothing to restore is counted and does not go negative', r.saveRestore.restoreWithoutSave === 1 && r.saveRestore.openContextsNow === 0, r.saveRestore);
var c2 = new Fake(10, 10); c2.save(); c2.save(); c.save();
check('depth is tracked per context', pr.report().saveRestore.openContextsNow === 2, pr.report().saveRestore);
c2.restore(); c2.restore(); c.restore();

// 3. drawImage audits
pr.reset(); c = new Fake(200, 100);
c.drawImage(img, 0, 0, 100, 50, 0, 0, 100, 50);                 // nine arguments, inside
c.drawImage(img, 0, 0, 120, 60, 0, 0, 120, 60);                 // sticks out on both axes
c.drawImage(img, 0, 0, 120, 50, 0, 0, 120, 50);                 // sticks out on one axis
c.drawImage(img, 0, 0, 20, 10);                                  // 100x50 drawn at 20x10: below half size
c.drawImage(img, 5, 5);                                          // plain, full size
pr.frame(); r = pr.report();
check('nine-argument calls counted', r.drawImage.nineArgument.median === 3, r.drawImage);
check('overhang on both axes and on one axis are told apart', r.drawImage.sourceOverhangBothAxes === 1 && r.drawImage.sourceOverhangOneAxis === 1, r.drawImage);
check('a draw shrunk below half size is counted', r.drawImage.belowHalfSize.median === 1, r.drawImage);
c.scale(0.25, 0.25); pr.reset(); c.drawImage(img, 0, 0); pr.frame();
check('the context transform counts toward the shrink', pr.report().drawImage.belowHalfSize.median === 1, pr.report().drawImage);
check('a null image does not throw', (function () { try { c.drawImage(null, 0, 0); return true; } catch (e) { return false; } })());

// 4. style writes and repeats
pr.reset(); c = new Fake(10, 10);
c.fillStyle = 'red'; c.fillStyle = 'red'; c.fillStyle = 'blue'; c.lineWidth = 2; c.lineWidth = 2;
pr.frame(); r = pr.report();
check('style writes counted, repeats told apart', r.styleWrites.perFrame.median === 5 && r.styleWrites.repeatShare === 0.4, r.styleWrites);
check('the value is really set', c.fillStyle === 'blue' && c.lineWidth === 2);

// 5. painted area
pr.reset(); c = new Fake(200, 100);
c.fillRect(0, 0, 200, 100); pr.frame();
check('a full-canvas fill is 1x the canvas', pr.report().paintedArea.median === 1, pr.report().paintedArea);
pr.reset(); c.fillRect(0, 0, 100, 100); c.fillRect(500, 500, 50, 50); pr.frame();
check('area is clipped to the canvas (a rectangle off the edge adds nothing)', pr.report().paintedArea.median === 0.5, pr.report().paintedArea);
pr.reset(); c.scale(2, 2); c.fillRect(0, 0, 50, 25); pr.frame();
check('the transform scales the painted area (50x25 at 2x = 5,000 of 20,000)', pr.report().paintedArea.median === 0.25, pr.report().paintedArea);

// 6. the ring keeps only the newest frames
pr.reset(); for (f = 0; f < 12; f++) { c = new Fake(10, 10); c.beginPath(); pr.frame(); }
check('only the newest frames are kept', pr.report().kept === 5 && pr.report().frames === 12, pr.report().frames);

// 7. text() before any frame, and the plain words after
pr.reset(); check('text() before a frame tells you what to do', /frame\(\)/.test(pr.text()));
c = new Fake(10, 10); c.beginPath(); pr.frame(); check('text() lists the calls', /beginPath 1/.test(pr.text()) && /Style writes/.test(pr.text()), pr.text());

// 8. uninstall puts everything back
pr.uninstall();
check('uninstall restores the methods', P.fillRect === origFill && P.drawImage === origDraw);
var d = Object.getOwnPropertyDescriptor(P, 'fillStyle'); check('uninstall restores the accessors', d.get === origStyle.get && d.set === origStyle.set);

// 9. bookkeeping errors never break the game: a context whose transform throws
var pr2 = CanvasProbe.install({ prototypes: [P] }), odd = new Fake(10, 10); odd.getTransform = function () { throw new Error('no'); };
check('a failing transform does not break drawImage', (function () { try { return odd.drawImage(img, 0, 0) === 'drawImage'; } catch (e) { return false; } })());
pr2.uninstall();

// ---- fixes from the 2026-10-15 audit (each failing case was reproduced before the fix) ----
var origReset = P.reset, origGetContext = CP.getContext, origWidth = Object.getOwnPropertyDescriptor(CP, 'width');
function fresh() { return CanvasProbe.install({ prototypes: [P], canvasPrototypes: [CP], keep: 120 }); }
var q, x, i, n;

// 10. reset() and a canvas size write empty the save stack
q = fresh(); x = mk(50, 50);
check('reset() is wrapped and still runs', (function () { var l = x.log.length; x.reset(); return x.log.length === l + 1 && x.log[l] === 'reset'; })());
x.save(); x.save(); x.reset(); q.frame(); r = q.report();
check('save, save, reset leaves no open context and no leak frame', r.saveRestore.openContextsNow === 0 && r.saveRestore.leakFrames === 0, r.saveRestore);
x.save(); x.reset(); x.restore(); r = q.report();
check('a restore after reset() counts as nothing to restore', r.saveRestore.restoreWithoutSave === 1, r.saveRestore);
q.reset(); x.save(); x.canvas.width = x.canvas.width; q.frame(); r = q.report();
check('writing canvas.width (even the same value) zeroes the save depth', r.saveRestore.openContextsNow === 0 && r.saveRestore.leakFrames === 0, r.saveRestore);
q.reset(); x.save(); x.canvas.height = 60; q.frame(); r = q.report();
check('writing canvas.height zeroes the save depth', r.saveRestore.openContextsNow === 0 && r.saveRestore.leakFrames === 0, r.saveRestore);
check('the size really changed', x.canvas.height === 60 && x.canvas.width === 50);
check('a size write on a canvas the probe never saw does not throw', (function () { try { new FakeCanvas(1, 1).width = 5; return true; } catch (e) { return false; } })());
q.reset(); x.save(); q.frame(); q.frame(); r = q.report();
check('a real unmatched save is still a leak', r.saveRestore.leakFrames === 2 && r.saveRestore.openContextsNow === 1, r.saveRestore);
x.restore(); q.uninstall();
check('uninstall puts reset, getContext and the size setter back', P.reset === origReset && CP.getContext === origGetContext && Object.getOwnPropertyDescriptor(CP, 'width').set === origWidth.set);

// 11. dropped contexts stop counting
var RealWR = global.WeakRef, refs = [];
global.WeakRef = function (t) { this.t = t; this.dead = false; refs.push(this); };
global.WeakRef.prototype.deref = function () { return this.dead ? undefined : this.t; };
q = fresh(); x = mk(20, 20); x.save(); q.frame();
check('before it is dropped the open save counts', q.report().saveRestore.leakFrames === 1 && q.report().saveRestore.openContextsNow === 1);
refs.forEach(function (w) { w.dead = true; }); q.frame();
r = q.report();
check('a dropped (garbage-collected) context stops counting as a leak', r.saveRestore.openContextsNow === 0 && r.saveRestore.leakFrames === 1, r.saveRestore);
q.uninstall(); global.WeakRef = RealWR;
q = fresh(); x = mk(20, 20); x.save(); q.forget(x); q.frame();
check('forget(ctx) drops a context by hand', q.report().saveRestore.openContextsNow === 0 && q.report().saveRestore.leakFrames === 0, q.report().saveRestore);
q.uninstall();

// 12. painted area is per canvas, and the main on-screen canvas has its own line
q = fresh(); var big = mk(4096, 4096), main = mk(400, 300, null, true);
big.fillRect(0, 0, 4096, 4096); main.fillRect(0, 0, 400, 300); q.frame(); r = q.report();
check('with a 4096x4096 buffer alive, a full fill of the on-screen 400x300 canvas reads 1', r.paintedArea.median === 1 && r.paintedArea.canvas === '400x300', r.paintedArea);
check('the buffer is reported on its own line, against its own size', r.paintedAreaOther.canvasesPerFrame.max === 1 && r.paintedAreaOther.busiest.max === 1, r.paintedAreaOther);
check('the text names the main canvas and the other canvases', /main canvas \(400x300\): 1 times/.test(q.text()) && /other canvases/.test(q.text()), q.text());
q.reset(); var plain = mk(400, 300); big.fillRect(0, 0, 10, 10); plain.fillRect(0, 0, 400, 300); q.frame();
check('with no on-screen canvas, the canvas painted most is the main one', q.report().paintedArea.median === 1 && q.report().paintedArea.canvas === '400x300', q.report().paintedArea);
q.uninstall();
q = CanvasProbe.install({ prototypes: [P], canvasPrototypes: [CP], mainCanvas: big.canvas });
big.fillRect(0, 0, 2048, 4096); main.fillRect(0, 0, 400, 300); q.frame();
check('opts.mainCanvas names the main canvas', q.report().paintedArea.median === 0.5 && q.report().paintedArea.canvas === '4096x4096', q.report().paintedArea);
q.uninstall();

// 13. unknown source sizes are not flagged
q = fresh(); x = mk(200, 100);
var vf = { displayWidth: 100, displayHeight: 50, codedWidth: 112, codedHeight: 64 };
var loading = { naturalWidth: 0, naturalHeight: 0, complete: false, width: 100, height: 50 };
var broken = { naturalWidth: 0, naturalHeight: 0, complete: true, width: 100, height: 50 };
var loaded = { naturalWidth: 100, naturalHeight: 50, complete: true, width: 100, height: 50 };
x.drawImage(vf, 0, 0, 100, 50, 0, 0, 100, 50); x.drawImage(loading, 0, 0, 120, 60, 0, 0, 120, 60); x.drawImage(broken, 0, 0, 120, 60, 0, 0, 120, 60);
x.drawImage(loaded, 0, 0, 100, 50, 0, 0, 100, 50); q.frame(); r = q.report();
check('a VideoFrame, an unloaded image and a broken image are not flagged', r.drawImage.sourceOverhangBothAxes === 0 && r.drawImage.sourceOverhangOneAxis === 0, r.drawImage);
check('unknown source sizes are counted and the text says they were not checked', r.drawImage.sourceSizeUnknown === 2 && /not known yet/.test(q.text()), r.drawImage);
x.drawImage(vf, 0, 0, 120, 60, 0, 0, 120, 60); x.drawImage(loaded, 0, 0, 120, 50, 0, 0, 120, 50); q.frame(); r = q.report();
check('a real overhang on a VideoFrame or a loaded image is still flagged', r.drawImage.sourceOverhangBothAxes === 1 && r.drawImage.sourceOverhangOneAxis === 1, r.drawImage);
check('a source with no usable size does not throw', (function () { try { x.drawImage({ width: { baseVal: 1 } }, 0, 0, 5, 5, 0, 0, 5, 5); x.drawImage('x', 0, 0); return true; } catch (e) { return false; } })());
q.uninstall();

// 14. auto: true does not record an empty first frame
var rafQ = [];
global.requestAnimationFrame = function (f) { rafQ.push(f); return rafQ.length; };
global.cancelAnimationFrame = function () { };
q = CanvasProbe.install({ prototypes: [P], canvasPrototypes: [CP], auto: true });
check('auto: no frame is recorded at install', q.report().frames === 0 && rafQ.length === 1, q.report().frames);
x = mk(10, 10); x.beginPath(); rafQ.shift()();
check('auto: the first frame holds what was drawn before it', q.report().frames === 1 && q.report().calls.beginPath.median === 1, q.report());
rafQ.shift()(); check('auto: it keeps going', q.report().frames === 2);
q.uninstall(); var late = rafQ.shift(); if (late) late();
check('auto: after uninstall the loop stops', q.report().frames === 2);
delete global.requestAnimationFrame; delete global.cancelAnimationFrame;

// 15. install never throws
var Frozen = function () { }; Frozen.prototype.fillRect = function () { }; Object.freeze(Frozen.prototype);
var qf, okInstall = true;
try { qf = CanvasProbe.install({ prototypes: [Frozen.prototype] }); qf.frame(); qf.text(); qf.uninstall(); } catch (e) { okInstall = false; }
check('install on a frozen prototype does not throw', okInstall);
check('the frozen methods are listed as skipped', qf.report().skipped.indexOf('fillRect') >= 0 && /Could not wrap/.test((function () { qf.frame(); return qf.text(); })()), qf.report().skipped);
var qn; okInstall = true;
try { qn = CanvasProbe.install({ prototypes: 5, canvasPrototypes: 7 }); qn.frame(); qn.report(); qn.text(); qn.uninstall(); } catch (e) { okInstall = false; }
check('install with nonsense options does not throw and gives a working probe', okInstall && typeof qn.frame === 'function' && /could not start/.test(qn.text()));

// 16. more calls and more styles are counted
q = fresh(); x = mk(50, 50);
var more = ['setTransform', 'translate', 'scale', 'rotate', 'arc', 'moveTo', 'lineTo', 'rect', 'ellipse', 'roundRect', 'setLineDash', 'createConicGradient'];
more.forEach(function (m) { x[m](1, 1); }); q.frame(); r = q.report();
check('the added calls are counted', more.every(function (m) { return r.calls[m] && r.calls[m].median === 1; }), r.calls);
x.filter = 'blur(2px)'; x.imageSmoothingEnabled = false; x.shadowColor = 'red'; x.lineCap = 'round'; q.frame(); r = q.report();
check('filter, imageSmoothingEnabled, shadowColor and lineCap writes are counted', r.styleWrites.perFrame.max === 4 && x.lineCap === 'round', r.styleWrites);
check('probe.calls and probe.styles list the additions', q.calls.indexOf('roundRect') >= 0 && q.styles.indexOf('lineCap') >= 0 && q.styles.indexOf('filter') >= 0);
q.uninstall();

// 17. text() prints the 95th percentile; problem totals cover everything since reset
q = fresh(); x = mk(50, 50);
for (i = 0; i < 100; i++) { n = i < 94 ? 1 : (i < 99 ? 10 : 100); while (n--) x.fill(); q.frame(); }
check('text() prints the 95th percentile and the worst', /fill 1 \(95th 10, worst 100\)/.test(q.text()), q.text());
q.uninstall();
q = CanvasProbe.install({ prototypes: [P], canvasPrototypes: [CP], keep: 3 }); x = mk(50, 50); x.save();
for (i = 0; i < 6; i++) q.frame();
r = q.report(); x.restore();
check('leak totals cover every frame since reset, not just the kept ones', r.kept === 3 && r.frames === 6 && r.saveRestore.leakFrames === 6, r.saveRestore);
check('the text says the totals are since reset', /since reset/.test(q.text()));
q.uninstall();

// 18. a path with no beginPath()
q = fresh(); x = mk(50, 50);
for (i = 0; i < 4; i++) { x.rect(0, 0, 5, 5); x.rect(1, 1, 5, 5); q.frame(); }
r = q.report().pathWithoutBeginPath;
check('a path that grows every frame with no beginPath() is flagged', r.growingNow === 1 && r.framesWithGrowingPath === 2 && r.longestPath === 8, r);
check('the text says a beginPath() is missing', /missing beginPath/.test(q.text()), q.text());
q.reset(); for (i = 0; i < 6; i++) { x.beginPath(); x.rect(0, 0, 5, 5); x.rect(1, 1, 5, 5); x.moveTo(0, 0); x.lineTo(2, 2); q.frame(); }
r = q.report().pathWithoutBeginPath;
check('a path restarted with beginPath() every frame is not flagged', r.growingNow === 0 && r.framesWithGrowingPath === 0 && r.longestPath === 4, r);
q.reset(); x.beginPath(); for (i = 0; i < 6; i++) { if (i === 0) { x.rect(0, 0, 5, 5); x.rect(0, 0, 5, 5); } q.frame(); }
check('a path built once and left alone is not flagged', q.report().pathWithoutBeginPath.framesWithGrowingPath === 0, q.report().pathWithoutBeginPath);
q.uninstall();

// 19. getImageData on a context made without willReadFrequently
var early = mk(10, 10), earlyTrue = mk(10, 10), earlyFalse = mk(10, 10);
early.getContextAttributes = undefined; earlyTrue.getContextAttributes = function () { return { willReadFrequently: true }; }; earlyFalse.getContextAttributes = function () { return { willReadFrequently: false }; };
q = fresh();
var wrfNo = mk(10, 10, {}), wrfYes = mk(10, 10, { willReadFrequently: true });
wrfNo.getImageData(0, 0, 1, 1); wrfNo.getImageData(0, 0, 1, 1); wrfYes.getImageData(0, 0, 1, 1); q.frame(); r = q.report().readback;
check('getImageData on a context made without the option is flagged', r.getImageDataWithoutWillReadFrequently === 2 && r.perFrame.median === 2, r);
early.getImageData(); earlyTrue.getImageData(); q.frame();
check('a context made before install, with no way to tell, is not flagged; one that says true is not flagged', q.report().readback.getImageDataWithoutWillReadFrequently === 2, q.report().readback);
earlyFalse.getImageData(); q.frame();
check('a context made before install that reports false is flagged', q.report().readback.getImageDataWithoutWillReadFrequently === 3, q.report().readback);
check('the text explains the fix', /willReadFrequently: true/.test(q.text()), q.text());
q.uninstall();
check('getImageData still runs through the wrapper', wrfNo.log[wrfNo.log.length - 1] === 'getImageData');

// ---- 1.1.0: per-frame total, check(limits), deep mode, one matrix read per draw ----
// a total per frame is not the sum of per-call medians: three methods busy in 2 of 5 frames each have median 0 but every frame holds 4 calls
q = fresh(); x = mk(50, 50);
for (i = 0; i < 5; i++) {
  if (i < 2) { x.fillRect(0, 0, 1, 1); x.fillRect(0, 0, 1, 1); x.fillRect(0, 0, 1, 1); x.fillRect(0, 0, 1, 1); }
  else if (i < 4) { x.clearRect(0, 0, 1, 1); x.clearRect(0, 0, 1, 1); x.clearRect(0, 0, 1, 1); x.clearRect(0, 0, 1, 1); }
  else { x.strokeRect(0, 0, 1, 1); x.strokeRect(0, 0, 1, 1); x.strokeRect(0, 0, 1, 1); x.strokeRect(0, 0, 1, 1); }
  q.frame();
}
r = q.report();
check('report has the per-frame total of wrapped calls', r.callsPerFrame.median === 4 && r.callsPerFrame.max === 4, r.callsPerFrame);
check('the sum of per-call medians would have said 0 here', r.calls.fillRect.median + r.calls.clearRect.median + r.calls.strokeRect.median === 0, r.calls);
check('the text gives the total', /Calls per frame: 4 in all/.test(q.text()), q.text());
check('check: a ceiling on the per-frame total fails when the median is over it', (function () { var v = q.check({ callsPerFrame: 3 }); return !v.ok && v.problems.length === 1 && /median 4/.test(v.problems[0]); })(), q.check({ callsPerFrame: 3 }));
check('check: at or under the ceiling passes', q.check({ callsPerFrame: 4 }).ok === true && q.check({ callsPerFrame: 4 }).problems.length === 0);
check('check: no ceiling given means calls are not judged', q.check().ok === true);
check('check: the 95th percentile ceiling is separate', !q.check({ callsPerFrameP95: 3 }).ok && q.check({ callsPerFrameP95: 4 }).ok);
check('check: null and Infinity switch a limit off', q.check({ callsPerFrame: null }).ok && q.check({ callsPerFrame: Infinity }).ok);
q.uninstall();

var v;
// check(): the defaults are the five things a test wants to be zero
q = fresh(); x = mk(50, 50);
check('check: no frames recorded is a problem, not a pass', (function () { var v = q.check(); return !v.ok && /No frames/.test(v.problems[0]); })());
for (i = 0; i < 3; i++) { x.save(); x.fillRect(0, 0, 5, 5); x.restore(); q.frame(); }
check('check: a clean run passes with the default limits', q.check().ok === true, q.check());
x.save(); q.frame();
v = q.check(); check('check: an unmatched save is a problem', !v.ok && v.problems.length === 1 && /unmatched save/.test(v.problems[0]), v);
check('check: leakFrames can allow it', q.check({ leakFrames: 5 }).ok === true);
x.restore(); q.frame(); x.restore(); q.frame();
v = q.check({ leakFrames: 5 }); check('check: restore with nothing to restore is a problem', !v.ok && /nothing to restore/.test(v.problems[0]), v);
check('check: restoreWithoutSave can allow it', q.check({ leakFrames: 5, restoreWithoutSave: 1 }).ok === true);
q.reset(); x.drawImage(img, 0, 0, 120, 60, 0, 0, 120, 60); q.frame();
v = q.check(); check('check: a source overhang is a problem', !v.ok && /sticks out/.test(v.problems[0]), v);
check('check: sourceOverhang can allow it', q.check({ sourceOverhang: 1 }).ok === true);
q.uninstall(); q = fresh(); x = mk(50, 50);
for (i = 0; i < 4; i++) { x.rect(0, 0, 5, 5); x.rect(1, 1, 5, 5); q.frame(); }
v = q.check(); check('check: a growing path is a problem', !v.ok && /no beginPath/.test(v.problems[0]), v);
check('check: several problems come back together', (function () { x.save(); q.frame(); var w = q.check({ callsPerFrame: 1 }); return !w.ok && w.problems.length === 3; })(), q.check({ callsPerFrame: 1 }));
q.uninstall();
check('check: a probe that could not start fails instead of throwing', (function () { var d = CanvasProbe.install({ prototypes: 5 }); var w = d.check(); return !w.ok && /could not start/.test(w.problems[0]); })());

// deep mode: off by default, counts draws with a filter, a shadow or a blend mode when on
function deepCtx() { var d = mk(40, 40); d.s.globalCompositeOperation = 'source-over'; d.s.filter = 'none'; d.s.shadowBlur = 0; return d; }
q = fresh(); x = deepCtx();
x.filter = 'blur(2px)'; x.drawImage(img, 0, 0); q.frame();
check('deep off: no costly-draw numbers, and the report says so', q.report().costlyDraws === null && q.report().deep === false && !/Deep mode/.test(q.text()), q.report().costlyDraws);
check('deep off: asking check() for a costly-draw limit says what is missing', (function () { var w = q.check({ withFilter: 0 }); return !w.ok && /deep: true/.test(w.problems[0]); })());
q.uninstall();
q = CanvasProbe.install({ prototypes: [P], canvasPrototypes: [CP], keep: 10, deep: true }); x = deepCtx();
for (i = 0; i < 3; i++) {
  x.filter = 'blur(2px)'; x.drawImage(img, 0, 0); x.fill(); x.filter = 'none';
  x.shadowBlur = 8; x.fillRect(0, 0, 5, 5); x.fillText('a', 0, 0); x.shadowBlur = 0;
  x.globalCompositeOperation = 'lighter'; x.stroke(); x.globalCompositeOperation = 'source-over';
  x.drawImage(img, 0, 0);                                    // plain: counted nowhere
  q.frame();
}
r = q.report().costlyDraws;
check('deep on: draws with a filter, a shadow and a blend mode are counted per frame', r.withFilter.median === 2 && r.withShadow.median === 2 && r.withBlendMode.median === 1, r);
check('deep on: the text says so and gives the numbers', /Deep mode is on/.test(q.text()) && /filter was set: 2 per frame/.test(q.text()), q.text());
check('deep on: check() can cap them', !q.check({ withFilter: 1 }).ok && q.check({ withFilter: 2, withShadow: 2, withBlendMode: 1 }).ok, q.check({ withFilter: 1 }));
check('deep on: a context with no filter or blend properties is not counted and does not throw', (function () { var bare = new Fake(5, 5); bare.s = {}; bare.drawImage(img, 0, 0); return true; })());
q.uninstall();

// one matrix read per drawImage (getTransform makes a new object every time)
q = fresh(); x = mk(40, 40);
var reads = 0, origGT = P.getTransform; P.getTransform = function () { reads++; return origGT.call(this); };
x.drawImage(img, 0, 0); x.drawImage(img, 0, 0, 10, 10); x.drawImage(img, 0, 0, 20, 20, 0, 0, 10, 10); x.fillRect(0, 0, 5, 5);
P.getTransform = origGT;
check('one matrix read per drawImage and fillRect', reads === 4, reads);
check('the painted area still comes out right after the change', (function () { q.frame(); return q.report().paintedArea.median > 0; })());
q.uninstall();

console.log((fail ? 'FAILED ' : 'all passed: ') + pass + ' checks' + (fail ? ', ' + fail + ' failed' : ''));
process.exit(fail ? 1 : 0);
