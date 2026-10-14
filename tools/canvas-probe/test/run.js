/* Node-only tests for canvas-probe, using a fake 2D context (no browser). Run: node tools/canvas-probe/test/run.js */
'use strict';
var path = require('path');
var CanvasProbe = require(path.join(__dirname, '..', 'src', 'canvas-probe.js'));
var pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) pass++; else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); } }

function Fake(w, h) { this.canvas = { width: w, height: h }; this.m = [1, 0, 0, 1, 0, 0]; this.s = {}; this.log = []; }
var P = Fake.prototype;
['save', 'restore', 'beginPath', 'fill', 'stroke', 'clip', 'clearRect', 'strokeRect', 'fillText', 'strokeText', 'measureText', 'createLinearGradient',
  'createRadialGradient', 'createPattern', 'putImageData', 'getImageData', 'fillRect', 'drawImage'].forEach(function (n) { P[n] = function () { this.log.push(n); return n; }; });
P.scale = function (x, y) { this.m[0] *= x; this.m[3] *= y; };
P.getTransform = function () { return { a: this.m[0], b: this.m[1], c: this.m[2], d: this.m[3], e: this.m[4], f: this.m[5] }; };
['fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'font', 'shadowBlur', 'globalCompositeOperation'].forEach(function (n) {
  Object.defineProperty(P, n, { get: function () { return this.s[n]; }, set: function (v) { this.s[n] = v; }, configurable: true, enumerable: true });
});
var origFill = P.fillRect, origDraw = P.drawImage, origStyle = Object.getOwnPropertyDescriptor(P, 'fillStyle');
var img = { width: 100, height: 50 };

var pr = CanvasProbe.install({ prototypes: [P], keep: 5 });
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

console.log((fail ? 'FAILED ' : 'all passed: ') + pass + ' checks' + (fail ? ', ' + fail + ' failed' : ''));
process.exit(fail ? 1 : 0);
