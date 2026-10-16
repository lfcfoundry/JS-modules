/* Node-only tests for sprite-baker, no dependencies. Run: node modules/sprite-baker/test/run.js   (exits non-zero on any failure) */
'use strict';
var SB = require('../sprite-baker.js');

var failed = 0, passed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok   ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail ? '  (' + detail + ')' : '')); }
}

/* FNV-1a over the bytes of an RGBA image: a stable fingerprint of a render. */
function hash(img) {
  var h = 0x811c9dc5, d = img.data, i;
  for (i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return ('00000000' + h.toString(16)).slice(-8);
}
function same(a, b) { return hash(a) === hash(b); }
function coverage(data) { var n = 0, i; for (i = 3; i < data.length; i += 4) if (data[i] === 255) n++; return n; }

var RED = SB.material([[0, 200, 0, 0]]);       // one-stop ramps give a constant base color
var BLUE = SB.material([[0, 0, 0, 200]]);
var WARM = SB.material([[0, 90, 40, 20], [0.5, 220, 140, 60], [1, 255, 230, 160]]);
var COOL = SB.material([[0, 20, 40, 90], [0.5, 80, 140, 220], [1, 200, 230, 255]]);

console.log('sprite-baker tests');

/* 1. runs in Node without a canvas */
check('no canvas needed (ImageData absent in Node)', typeof ImageData === 'undefined' && typeof document === 'undefined');
var plain = new SB.Rast(2, 2).toImageData();
check('toImageData returns a plain { width, height, data } in Node', plain.width === 2 && plain.height === 2 && plain.data.length === 16);

/* 2. sphere coverage within 2% of pi r^2 */
(function () {
  var r = 40, rast = new SB.Rast(120, 120), m = SB.mesh(SB.sphere(r), 48, 96);
  SB.drawMesh(rast, m, WARM, { ox: 60, oy: 60 });
  var got = coverage(rast.px), want = Math.PI * r * r, err = Math.abs(got - want) / want;
  check('sphere r=40 coverage within 2% of pi r^2', err < 0.02, 'got ' + got + ', want ' + want.toFixed(1) + ', err ' + (err * 100).toFixed(2) + '%');
})();

/* 3. nearer triangle wins regardless of draw order */
(function () {
  function triPair(nearFirst) {
    var rast = new SB.Rast(16, 16), near = [[2, 2, 10, 0, 0, 1], [14, 2, 10, 0, 0, 1], [8, 14, 10, 0, 0, 1]], far = [[2, 14, -10, 0, 0, 1], [14, 14, -10, 0, 0, 1], [8, 1, -10, 0, 0, 1]];
    if (nearFirst) { SB.tri(rast, near[0], near[1], near[2], RED); SB.tri(rast, far[0], far[1], far[2], BLUE); }
    else { SB.tri(rast, far[0], far[1], far[2], BLUE); SB.tri(rast, near[0], near[1], near[2], RED); }
    return rast;
  }
  function px(rast, x, y) { var o = (y * rast.w + x) * 4; return [rast.px[o], rast.px[o + 1], rast.px[o + 2], rast.px[o + 3]]; }
  var a = triPair(true), b = triPair(false), pa = px(a, 8, 6), pb = px(b, 8, 6);   // (8,6) lies inside both triangles
  check('nearer (red, z=10) wins when drawn first', pa[3] === 255 && pa[0] > pa[2], JSON.stringify(pa));
  check('nearer (red, z=10) wins when drawn last', pb[3] === 255 && pb[0] > pb[2], JSON.stringify(pb));
  check('both draw orders give the identical raster', hash({ data: a.px }) === hash({ data: b.px }));
  check('far-only pixel is the far triangle (blue)', px(a, 3, 12)[2] > px(a, 3, 12)[0] && px(a, 3, 12)[3] === 255);
})();

/* 4. ramp LUT endpoints and interpolation */
(function () {
  var m = SB.material([[0, 10, 20, 30], [0.5, 100, 110, 120], [1, 250, 240, 230]]), L = m.lut;
  check('LUT has 256 RGB entries', L.length === 768);
  check('LUT[0] is the first stop', L[0] === 10 && L[1] === 20 && L[2] === 30);
  check('LUT[255] is the last stop', L[765] === 250 && L[766] === 240 && L[767] === 230);
  check('LUT midpoint is near the middle stop', Math.abs(L[128 * 3] - 100) <= 2, 'got ' + L[128 * 3]);
  var mono = true, i;
  for (i = 1; i < 256; i++) if (L[i * 3] < L[(i - 1) * 3]) mono = false;
  check('LUT red channel rises monotonically for a rising ramp', mono);
  var one = SB.material([[0.3, 5, 6, 7]]).lut;
  check('a one-stop ramp is constant', one[0] === 5 && one[765] === 5 && one[767] === 7);
})();

/* 5. rotation helpers */
(function () {
  var p = [3, -2, 5], q = SB.rotateX(p, Math.PI / 2), r = SB.rotateAxis(p, [1, 0, 0], Math.PI / 2);
  function near(a, b) { return a.every(function (v, i) { return Math.abs(v - b[i]) < 1e-9; }); }
  check('rotateX equals rotateAxis about [1,0,0]', near(q, r));
  var top = SB.rotateX([0, -1, 0], Math.PI / 2);
  check('positive rotateX turns the top (-y) toward the viewer (+z)', Math.abs(top[1]) < 1e-9 && Math.abs(top[2] - 1) < 1e-9, JSON.stringify(top));
  var about = SB.rotateX([0, 5, 0], Math.PI, 3);   // a half turn about the line y=3 sends y=5 to y=1
  check('rotateX about a center height', Math.abs(about[1] - 1) < 1e-9 && Math.abs(about[2]) < 1e-9, JSON.stringify(about));
  check('a full turn returns the point exactly', SB.rotateX(p, 2 * Math.PI).every(function (v, i) { return v === p[i]; }), JSON.stringify(SB.rotateX(p, 2 * Math.PI)));
  var six = SB.rotateAxis([0, 0, 0, 0, -1, 0], [1, 0, 0], Math.PI / 2);
  check('six-number form turns the normal too', six.length === 6 && Math.abs(six[5] - 1) < 1e-9);
})();

/* 6. finite-difference normals agree with the true sphere normals */
(function () {
  var exact = SB.mesh(SB.sphere(10), 12, 18), fn = SB.sphere(10);
  var fd = SB.mesh(function (u, v) { return fn(u, v).slice(0, 3); }, 12, 18), worst = 1, k, d;
  for (k = 0; k < exact.nrm.length; k += 3) {
    d = exact.nrm[k] * fd.nrm[k] + exact.nrm[k + 1] * fd.nrm[k + 1] + exact.nrm[k + 2] * fd.nrm[k + 2];
    if (d < worst) worst = d;
  }
  check('finite-difference normals match analytic (incl. poles and auto-orientation)', worst > 0.999, 'worst dot ' + worst.toFixed(5));
})();

/* 7. outline pass grows coverage */
(function () {
  var scene = [{ fn: SB.sphere(10), nu: 16, nv: 24, material: WARM }];
  var plainImg = SB.bakeSprite(scene, 40, { scale: 1.5 }), outlined = SB.bakeSprite(scene, 40, { scale: 1.5, outline: { radius: 2, color: [0, 0, 0] } });
  var a = 0, b = 0, i;
  for (i = 3; i < plainImg.data.length; i += 4) { a += plainImg.data[i]; b += outlined.data[i]; }
  check('outline adds opaque pixels around the shape', b > a * 1.15, 'alpha sum ' + a + ' -> ' + b);
})();

/* 8. a rolled torus: N differing frames, and a full turn loops exactly */
var ringScene = [
  { fn: SB.torus(12, 4), nu: 40, nv: 14, material: WARM },
  { fn: SB.sphere(4.5, [0, -12, 0]), nu: 10, nv: 16, material: COOL }   // a bead at the top of the ring breaks the ring's own symmetry
];
var ringOpts = { ss: 2, outline: { radius: 1, color: [30, 20, 10] } };
var frames = SB.bakeRoll(ringScene, 8, [48, 48], ringOpts);
(function () {
  check('bakeRoll returns 8 frames of the requested size', frames.length === 8 && frames.every(function (f) { return f.width === 48 && f.height === 48; }));
  var seen = {};
  frames.forEach(function (f) { seen[hash(f)] = 1; });
  check('all 8 frames differ from each other', Object.keys(seen).length === 8, Object.keys(seen).length + ' distinct');
  var full = SB.bakeSprite(ringScene, [48, 48], { ss: 2, outline: ringOpts.outline, phi: 2 * Math.PI });
  check('frame 0 equals the pose after a full turn (frame 8)', same(frames[0], full));
  var again = SB.bakeRoll(ringScene, 8, [48, 48], ringOpts);
  check('baking twice gives identical frames', frames.every(function (f, i) { return same(f, again[i]); }));
  var half = SB.bakeSprite(ringScene, [48, 48], { ss: 2, outline: ringOpts.outline, phi: Math.PI });
  check('frame 4 equals a direct half-turn render', same(frames[4], half));
})();

/* 9. light direction matters */
(function () {
  var scene = [{ fn: SB.sphere(10), nu: 16, nv: 24, material: WARM }];
  var left = SB.bakeSprite(scene, 40, { light: [-1, -0.5, 0.8] }), right = SB.bakeSprite(scene, 40, { light: [1, -0.5, 0.8] });
  function lum(img, x, y) { var o = (y * img.width + x) * 4; return img.data[o] + img.data[o + 1] + img.data[o + 2]; }
  check('light from the left lights the left side more', lum(left, 12, 20) > lum(left, 28, 20));
  check('light from the right lights the right side more', lum(right, 28, 20) > lum(right, 12, 20));
})();

/* 10. deterministic output hash. If you change the shading on purpose, update this constant. */
(function () {
  var scene = [{ fn: SB.capsule([-12, 0, 0], [12, 0, 0], 7, { lobes: 5, depth: 0.08 }), nu: 40, nv: 28, material: COOL }];
  var img = SB.bakeRoll(scene, 4, [64, 40], { ss: 2, outline: { radius: 1.5, color: [10, 10, 30] } })[1];
  var h = hash(img);
  check('pinned hash of a lobed capsule roll frame', h === 'f6b27a8b', 'hash ' + h);
  var all = SB.bakeRoll(scene, 4, [64, 40], { ss: 2 }), distinct = {};
  all.forEach(function (f) { distinct[hash(f)] = 1; });
  check('lobed capsule frames differ (the roll is visible)', Object.keys(distinct).length === 4);
})();

/* 11. a non-finite depth must not poison the depth buffer, and a NaN point must not reach the auto-fit */
(function () {
  function px(rast, x, y) { var o = (y * rast.w + x) * 4; return [rast.px[o], rast.px[o + 1], rast.px[o + 2], rast.px[o + 3]]; }
  var rast = new SB.Rast(16, 16), n = [0, 0, 1];
  function v(x, y, z) { return [x, y, z].concat(n); }
  SB.tri(rast, v(1, 1, 5), v(15, 1, 5), v(8, 15, 5), RED);          // A: valid, z = 5
  SB.tri(rast, v(1, 1, NaN), v(15, 1, 5), v(8, 15, 5), BLUE);       // B: one NaN height, covers the same pixels
  SB.tri(rast, v(1, 1, 1), v(15, 1, 1), v(8, 15, 1), BLUE);         // C: valid but farther than A (z = 1)
  var p = px(rast, 8, 6);
  check('a triangle with a NaN height is skipped; the nearer red triangle stays on top', p[3] === 255 && p[0] > p[2], JSON.stringify(p));
  var zs = true, i;
  for (i = 0; i < rast.z.length; i++) if (rast.z[i] !== rast.z[i]) zs = false;
  check('no NaN ever reaches the depth buffer', zs);
  var r2 = new SB.Rast(16, 16);
  SB.tri(r2, v(1, 1, 5), v(15, 1, Infinity), v(8, 15, 5), RED);
  SB.tri(r2, [1, 1, 5, 0, 0, NaN], v(15, 1, 5), v(8, 15, 5), RED);
  check('infinite heights and NaN normals are skipped too (nothing drawn)', coverage(r2.px) === 0);

  var sph = SB.sphere(10);
  function holey(u, vv) { return (u === 0.25 && vv === 0.5) ? [NaN, NaN, NaN, 0, 0, 1] : sph(u, vv); }
  var img = SB.bakeSprite([{ fn: holey, nu: 16, nv: 24, material: WARM }], 40, { axis: [0, 1, 0], phi: 0.5 });
  var cov = coverage(img.data);
  check('a NaN mesh point leaves the auto-fit scale finite (a y-axis roll still draws a round sprite)', cov > 200 && cov < 1200 && img.data[3] === 0 && img.data[(20 * 40 + 20) * 4 + 3] === 255, 'coverage ' + cov);
})();

/* 12. size ceiling: ss is lowered automatically, can be overridden, and an impossible size gives null */
(function () {
  var scene = [{ fn: SB.sphere(10), nu: 12, nv: 18, material: WARM }];
  check('default ceiling is documented as a number', SB.DEFAULT_MAX_PIXELS === 4194304);
  var a = SB.baker(scene, 64, { ss: 8, maxPixels: 64 * 64 * 4 });
  check('maxPixels lowers ss (64 x 64 at ss 8 under 4x the pixels gives ss 2)', a.count === 12 && a.ss === 2, 'ss ' + a.ss);
  var b = SB.baker(scene, 1200, { ss: 8 });
  check('the default ceiling lowers ss for a 1200 x 1200 sprite to 1', b.count === 12 && b.ss === 1, 'ss ' + b.ss);
  var c = SB.baker(scene, 1024, { ss: 4 });
  check('a 1024 x 1024 sprite at ss 4 is baked at ss 2 by default', c.ss === 2, 'ss ' + c.ss);
  var d = SB.baker(scene, 64, { ss: 8, maxPixels: Infinity });
  check('maxPixels: Infinity keeps the ss you asked for', d.ss === 8, 'ss ' + d.ss);
  var e = SB.baker(scene, 3000, {});
  check('a picture over the ceiling even at ss 1 gives an inert baker (count 0, reason too-big)', e.count === 0 && e.reason === 'too-big' && e.frame(0) === null && e.next() === null);
  check('bakeSprite and bakeRoll return null for it', SB.bakeSprite(scene, 3000) === null && SB.bakeRoll(scene, 4, 3000) === null);
  var capped = SB.bakeSprite(scene, 48, { ss: 6, maxPixels: 48 * 48 * 4 });
  check('a capped bake still returns the requested size with pixels', capped.width === 48 && capped.height === 48 && coverage(capped.data) > 100);
})();

/* 13. no throw on empty sizes or counts; a zero axis does not shrink the shape */
(function () {
  var scene = [{ fn: SB.sphere(10), nu: 12, nv: 18, material: WARM }], res = [];
  function safe(fn) { try { return fn(); } catch (e) { return 'threw ' + e.message; } }
  check('bakeRoll with size 0 returns null', safe(function () { return SB.bakeRoll(scene, 4, 0); }) === null);
  check('bakeRoll with [0, 40] returns null', safe(function () { return SB.bakeRoll(scene, 4, [0, 40]); }) === null);
  check('bakeRoll with frames 0 returns null', safe(function () { return SB.bakeRoll(scene, 0, 32); }) === null);
  check('bakeRoll with frames missing returns null', safe(function () { return SB.bakeRoll(scene, undefined, 32); }) === null);
  check('bakeSprite with size NaN, null or undefined returns null', safe(function () { return [SB.bakeSprite(scene, NaN), SB.bakeSprite(scene, null), SB.bakeSprite(scene)]; }).every(function (x) { return x === null; }));
  check('toImageData-style call on a zero-size Rast does not throw', typeof safe(function () { return new SB.Rast(0, 0).toImageData(); }) === 'object');

  var m = SB.rotationMatrix([0, 0, 0], 1);
  check('a zero axis gives the identity matrix', m.join() === '1,0,0,0,1,0,0,0,1', m.join());
  check('a NaN angle gives the identity matrix', SB.rotationMatrix([1, 0, 0], NaN).join() === '1,0,0,0,1,0,0,0,1');
  var still = SB.bakeSprite(scene, 40, { scale: 1.5 }), zero = SB.bakeSprite(scene, 40, { scale: 1.5, axis: [0, 0, 0], phi: 1 });
  check('a zero roll axis leaves the sprite at full size (same picture as no turn)', same(still, zero));
})();

/* 14. baker: bake in slices, pixel-identical to bakeRoll */
(function () {
  var all = SB.bakeRoll(ringScene, 8, [48, 48], ringOpts);
  var optsBefore = JSON.stringify(ringOpts);
  var b = SB.baker(ringScene, [48, 48], { frames: 8, ss: 2, outline: ringOpts.outline });
  check('baker reports count, size and the ss it used', b.count === 8 && b.width === 48 && b.height === 48 && b.ss === 2 && b.index === 0);
  var i, ident = true, got = [];
  for (i = 0; i < 8; i++) { got.push(b.next()); if (!got[i] || Buffer.compare(Buffer.from(got[i].data), Buffer.from(all[i].data)) !== 0) ident = false; }
  check('next() x 8 gives frames byte-identical to bakeRoll', ident);
  check('next() returns null after the last frame, reset() starts over', b.next() === null && b.reset().next() !== null && b.index === 1);
  var out = b.frame(5);
  check('frame(i) works in any order and matches bakeRoll', Buffer.compare(Buffer.from(out.data), Buffer.from(all[5].data)) === 0 && same(b.frame(0), all[0]));
  check('frame() gives null for an index outside 0..count-1 or not an integer', b.frame(-1) === null && b.frame(8) === null && b.frame(1.5) === null && b.frame('2') === null && b.frame(NaN) === null);
  check('frames own their pixel arrays (rendering frame 1 does not change frame 0)', hash(got[0]) === hash(all[0]) && got[0].data !== got[1].data);
  check('bakeRoll does not change the caller\'s opts', JSON.stringify(ringOpts) === optsBefore && ringOpts.frames === undefined);

  var caps = [{ fn: SB.capsule([-12, 0, 0], [12, 0, 0], 7, { lobes: 5, depth: 0.08 }), nu: 40, nv: 28, material: COOL }];
  var pinned = SB.baker(caps, [64, 40], { frames: 4, ss: 2, outline: { radius: 1.5, color: [10, 10, 30] } }).frame(1);
  check('baker frame 1 of the lobed capsule matches the pinned hash', hash(pinned) === 'f6b27a8b', 'hash ' + hash(pinned));

  var half = SB.baker(ringScene, [48, 48], { frames: 4, turn: Math.PI, ss: 2 }), direct = SB.bakeSprite(ringScene, [48, 48], { ss: 2, phi: Math.PI / 2 });
  check('opts.turn spreads the frames over that angle (frame 2 of 4 over pi is a quarter turn)', same(half.frame(2), direct));
  check('baker with size 0 or frames 0 is inert, not a throw', SB.baker(ringScene, 0, {}).count === 0 && SB.baker(ringScene, 32, { frames: 0 }).reason === 'frames');
})();

/* 15. toCanvas: null instead of a throw, and the willReadFrequently option, with a small fake browser */
(function () {
  var calls = [], mode = 'ok';
  function FakeImageData(data, w, h) {
    if (!(w > 0) || !(h > 0)) throw new Error('IndexSizeError');
    if (data.length !== w * h * 4) throw new Error('InvalidStateError');
    this.data = data; this.width = w; this.height = h;
  }
  var fakeDoc = { createElement: function (tag) {
    var c = { tag: tag, width: 0, height: 0, put: 0 };
    c.getContext = function (kind, o) { calls.push([kind, o]); return mode === 'nocontext' ? null : { putImageData: function () { c.put++; } }; };
    return c;
  } };
  var img = { width: 4, height: 3, data: new Uint8ClampedArray(48) };
  function safe(fn) { try { return fn(); } catch (e) { return 'threw ' + e.message; } }

  check('toCanvas returns null (no throw) when there is no document', safe(function () { return SB.toCanvas(img); }) === null);
  global.document = fakeDoc; global.ImageData = FakeImageData;
  try {
    var c1 = safe(function () { return SB.toCanvas(img); });
    check('toCanvas builds a canvas of the image size', c1 && c1.width === 4 && c1.height === 3 && c1.put === 1, String(c1));
    check('default getContext call is unchanged: getContext(\'2d\') with no options', calls[0][0] === '2d' && calls[0][1] === undefined);
    var c2 = safe(function () { return SB.toCanvas(img, { willReadFrequently: true }); });
    check('opts.willReadFrequently passes the flag to getContext', c2 && calls[1][0] === '2d' && calls[1][1] && calls[1][1].willReadFrequently === true);
    SB.toCanvas(img, {});
    check('an empty options object leaves getContext alone', calls[2][1] === undefined);
    check('toCanvas works as an array map callback (index is not taken for options)', safe(function () { return [img].map(SB.toCanvas)[0]; }) && calls[3][1] === undefined);
    mode = 'nocontext';
    check('toCanvas returns null when getContext gives nothing', safe(function () { return SB.toCanvas(img); }) === null);
    mode = 'ok';
    check('toCanvas returns null for a zero-size image', safe(function () { return SB.toCanvas({ width: 0, height: 0, data: new Uint8ClampedArray(0) }); }) === null);
    check('toCanvas returns null for nothing, or data of the wrong length', safe(function () { return [SB.toCanvas(null), SB.toCanvas({ width: 2, height: 2, data: new Uint8ClampedArray(3) })]; }).every(function (x) { return x === null; }));
    check('toImageData of a zero-size image falls back to a plain object, no throw', typeof safe(function () { return SB.toImageData({ width: 0, height: 0, data: new Uint8ClampedArray(0) }); }) === 'object');
  } finally {
    delete global.document; delete global.ImageData;   // neither existed in Node before (checked at the top of this file)
  }
})();

/* 16. alphaMask and hit: threshold, color, bad input, ceiling */
(function () {
  function safe(fn) { try { return fn(); } catch (e) { return 'threw ' + e.message; } }
  var img = { width: 4, height: 1, data: new Uint8ClampedArray([10, 20, 30, 0,  10, 20, 30, 8,  10, 20, 30, 9,  10, 20, 30, 255]) };
  var before = Array.prototype.join.call(img.data), m = SB.alphaMask(img);
  check('alphaMask keeps the size and returns a new { width, height, data }', m && m.width === 4 && m.height === 1 && m.data.length === 16 && m.data !== img.data);
  check('default threshold 8 means alpha ABOVE 8 (0 and 8 out, 9 and 255 in)', m && [0, 1, 2, 3].map(function (i) { return m.data[i * 4 + 3]; }).join() === '0,0,255,255');
  check('default color is opaque white, outside pixels are all zero', m && m.data.slice(8, 12).join() === '255,255,255,255' && m.data.slice(0, 8).join() === '0,0,0,0,0,0,0,0');
  check('alphaMask does not change its source', Array.prototype.join.call(img.data) === before);
  var hi = SB.alphaMask(img, { threshold: 100 }), lo = SB.alphaMask(img, { threshold: 0 });
  check('threshold 100 keeps only the opaque pixel; threshold 0 keeps every pixel with any alpha', hi.data[11] === 0 && hi.data[15] === 255 && lo.data[7] === 255 && lo.data[3] === 0);
  var col = SB.alphaMask(img, { color: [1, 2, 3] }), col4 = SB.alphaMask(img, { color: [1, 2, 3, 128] });
  check('opts.color sets the mask color (alpha 255, or the fourth number)', col.data.slice(12, 16).join() === '1,2,3,255' && col4.data.slice(12, 16).join() === '1,2,3,128');
  var bad = [undefined, null, 5, 'x', {}, [], { width: 2, height: 2 }, { width: 2, height: 2, data: new Uint8ClampedArray(3) }, { width: 0, height: 0, data: new Uint8ClampedArray(0) },
    { width: 1.5, height: 2, data: new Uint8ClampedArray(12) }, { width: 2, height: 2, data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, { get width() { throw new Error('boom'); } }];
  check('alphaMask returns null, never throws, for bad pictures', bad.every(function (b) { return safe(function () { return SB.alphaMask(b); }) === null; }));
  check('alphaMask returns null for a bad threshold or color', [{ threshold: NaN }, { threshold: '8' }, { color: 'red' }, { color: [1, 2] }, { color: [1, 2, NaN] }, { color: [1, 2, 3, 'x'] }].every(function (o) { return safe(function () { return SB.alphaMask(img, o); }) === null; }));
  check('alphaMask respects the size ceiling (opts.maxPixels)', SB.alphaMask(img, { maxPixels: 3 }) === null && SB.alphaMask(img, { maxPixels: 4 }) !== null);
  check('alphaMask refuses a picture over the default ceiling (2048 x 2049)', SB.alphaMask({ width: 2048, height: 2049, data: new Uint8ClampedArray(2048 * 2049 * 4) }) === null);
  check('hit is true inside the mask and false on empty pixels', SB.hit(m, 2, 0) && SB.hit(m, 3.9, 0.5) && !SB.hit(m, 0, 0) && !SB.hit(m, 1, 0));
  check('hit is false outside the picture or for bad input, never throws', [[m, -1, 0], [m, 4, 0], [m, 0, 1], [m, NaN, 0], [null, 0, 0], [{}, 0, 0], [m], [5, 1, 1]].every(function (a) { return safe(function () { return SB.hit(a[0], a[1], a[2]); }) === false; }));
  var real = SB.alphaMask(SB.bakeSprite([{ fn: SB.sphere(10), nu: 12, nv: 18, material: WARM }], 40, { scale: 1.5 }));
  check('mask of a baked sphere: center inside, corner outside', SB.hit(real, 20, 20) && !SB.hit(real, 1, 1));
})();

/* 17. toSheet: frame order, padding, wrapping, bad input, ceiling */
(function () {
  function safe(fn) { try { return fn(); } catch (e) { return 'threw ' + e.message; } }
  function pic(w, h, v) { var d = new Uint8ClampedArray(w * h * 4), i; for (i = 0; i < d.length; i++) d[i] = v; return { width: w, height: h, data: d }; }
  function at(sheet, x, y) { return sheet.image.data[(y * sheet.width + x) * 4]; }
  var a = pic(4, 2, 10), b = pic(3, 5, 20), c = pic(2, 2, 30);
  var s = SB.toSheet([a, b, c]);
  check('toSheet returns image, frames, width and height (canvas null in Node)', s && s.image && s.frames.length === 3 && s.canvas === null && s.width === s.image.width && s.height === s.image.height);
  check('frames are in input order, in one row, with the default padding of 1', s && JSON.stringify(s.frames) === JSON.stringify([{ x: 0, y: 0, w: 4, h: 2 }, { x: 5, y: 0, w: 3, h: 5 }, { x: 9, y: 0, w: 2, h: 2 }]));
  check('sheet is as wide as the row (padding only between pictures) and as tall as the tallest', s && s.width === 11 && s.height === 5 && s.image.data.length === 11 * 5 * 4);
  check('pixels land inside their frames and padding stays transparent', s && at(s, 0, 0) === 10 && at(s, 3, 1) === 10 && at(s, 4, 0) === 0 && at(s, 5, 0) === 20 && at(s, 7, 4) === 20 && at(s, 9, 1) === 30 && at(s, 0, 2) === 0);
  var p0 = SB.toSheet([a, b], { padding: 0 }), p3 = SB.toSheet([a, b], { padding: 3 });
  check('opts.padding 0 packs tight; padding 3 leaves 3 pixels', p0.frames[1].x === 4 && p0.width === 7 && p3.frames[1].x === 7 && p3.width === 10);
  var w = SB.toSheet([a, b, c], { maxWidth: 8 });
  check('rows wrap at opts.maxWidth (second row starts below the first row plus padding)', w && JSON.stringify(w.frames) === JSON.stringify([{ x: 0, y: 0, w: 4, h: 2 }, { x: 5, y: 0, w: 3, h: 5 }, { x: 0, y: 6, w: 2, h: 2 }]) && w.width === 8 && w.height === 8);
  check('every frame stays within maxWidth and frames never overlap', (function () {
    var many = [], i, f, g, j, ok = true, t;
    for (i = 0; i < 12; i++) many.push(pic(3 + i % 4, 2 + i % 3, i + 1));
    t = SB.toSheet(many, { maxWidth: 12 });
    if (!t || t.frames.length !== 12) return false;
    for (i = 0; i < 12; i++) {
      f = t.frames[i];
      if (f.x + f.w > 12 || f.w !== many[i].width || f.h !== many[i].height || at(t, f.x, f.y) !== i + 1) ok = false;
      for (j = 0; j < i; j++) { g = t.frames[j]; if (f.x < g.x + g.w && g.x < f.x + f.w && f.y < g.y + g.h && g.y < f.y + f.h) ok = false; }
    }
    return ok;
  })());
  check('toSheet does not change its inputs', a.data[0] === 10 && a.data.length === 32);
  var bad = [undefined, null, 5, 'x', {}, [], [a, null], [a, { width: 2, height: 2 }], [a, pic(2, 2, 1).width], [pic(3000, 1, 1)]];
  check('toSheet returns null, never throws, for bad lists (incl. a picture wider than maxWidth)', bad.every(function (x) { return safe(function () { return SB.toSheet(x); }) === null; }));
  check('toSheet returns null for bad padding or maxWidth', [{ padding: -1 }, { padding: NaN }, { padding: '1' }, { padding: Infinity }, { maxWidth: 0 }, { maxWidth: NaN }].every(function (o) { return safe(function () { return SB.toSheet([a], o); }) === null; }));
  check('ceiling: a sheet over opts.maxPixels is refused, at the limit it is allowed (11 x 5 = 55)', SB.toSheet([a, b, c], { maxPixels: 54 }) === null && SB.toSheet([a, b, c], { maxPixels: 55 }) !== null);
  check('ceiling: one picture over opts.maxPixels is refused', SB.toSheet([a], { maxPixels: 7 }) === null);
  check('ceiling: padding counts (two 2048 x 1024 pictures stack to 2048 x 2049, over the default 4,194,304)', SB.toSheet([pic(2048, 1024, 1), pic(2048, 1024, 2)]) === null && SB.toSheet([pic(2048, 1024, 1), pic(2048, 1024, 2)], { padding: 0 }) !== null);
  var rolled = SB.bakeRoll(ringScene, 4, [16, 16], { ss: 1 }), sheet = SB.toSheet(rolled, { padding: 2, maxWidth: 40 });
  check('baked frames pack into a sheet (4 of 16 x 16 at maxWidth 40 and padding 2: two rows of two)', sheet && sheet.width === 34 && sheet.height === 34 && sheet.frames[2].y === 18);
  check('version is 1.2.0', SB.version === '1.2.0');
})();

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
