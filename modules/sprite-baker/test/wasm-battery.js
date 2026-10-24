/* sprite-baker-wasm: does the WebAssembly fill give the very same bytes of color and depth as sprite-baker's JavaScript? Copyright (c) 2026 LFC Foundry. MIT License.
 * One battery, used by run.js (in Node) and by tests/sprite-baker-wasm-browser.js (inside each real browser, one at a time), so both run the same scenes:
 *   26 mesh scenes (a textured sphere with ridges, the coin with a lit ridge and a spin pose, a rod, a ball, the glove), 800 random scenes (small meshes with random vertices,
 *   non-unit normals, picture coordinates far out of range, any of six ramps, with and without picture and ridge, culled or not), a picture over the wasm limit, a surface over the limit,
 *   and two surfaces drawn into by turns. Each one is drawn by SpriteBaker.Rast / drawMesh and by the add-on's Rast / drawMesh, and both buffers are compared byte for byte.
 * It is written in plain ES5 with no Node-only calls so a page can run it:  battery(SB, F, W)  with F = test/reference-tri.js (only its ramps are used) and W = SpriteBaker.wasm(); PO (optional) = the plain SpriteBaker.outline taken BEFORE the add-on was loaded, which turns on the outline twin test.
 * Returns { scenes, differing, names (the first few that differ), fallbacks (calls that W drew with the plain code), extra: { name: true/false } }. */
(function (root) {
  'use strict';
  function battery(SB, F, W, PO) {
    var PI2 = Math.PI * 2, seed = 20261018, scenes = 0, bad = [], extra = {};
    function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
    function makeTex(n) {
      var d = new Uint8ClampedArray(n * n * 4), x, y, i, k;
      for (y = 0; y < n; y++) for (x = 0; x < n; x++) {
        i = (y * n + x) * 4; k = ((x >> 5) * 7 + (y >> 5) * 13) % 6;
        d[i] = rnd() * 256; d[i + 1] = rnd() * 256; d[i + 2] = rnd() * 256; d[i + 3] = k === 0 ? 0 : k === 1 ? 1 + rnd() * 254 : k === 2 ? 0 : 255;
        if (k === 3) { d[i] = 201 + rnd() * 54; d[i + 1] = rnd() * 89; }
      }
      return d;
    }
    var TEXM = { w: 256, h: 256, data: makeTex(256) };
    var RIDGE = { 0: { freq: 5, dark: -0.86, darkScale: 0.93 }, 5: { freq: 5, dark: -0.86, darkScale: 0.78, lit: 0.9, litAdd: 0.06 } };
    function own(m, t, tex) { var o = { lut: F.lut()[m], specular: 1, bounce: 1, pool: 1, rimLight: 1, edge: m === 1 ? 0.5 : 0.88 }; if (RIDGE[m]) o.ridge = RIDGE[m]; if (t) o.texture = tex || TEXM; return o; }
    function same(R, Q) {
      var i;
      if (R.px.length !== Q.px.length || R.z.length !== Q.z.length) return false;
      for (i = 0; i < R.px.length; i++) if (R.px[i] !== Q.px[i]) return false;
      for (i = 0; i < R.z.length; i++) if (R.z[i] !== Q.z[i]) return false;
      return true;
    }
    function pair(w, h) { var R = new SB.Rast(w, h), Q = new W.Rast(w, h); return [R, Q]; }
    function note(name, ok) { scenes++; if (!ok) bad.push(name); return ok; }
    var ball = SB.mesh(SB.sphere(30), 40, 64), rodM = SB.mesh(SB.rod([-30, -10, 0], [30, 10, 10], 8, 5), 24, 20), glove = SB.mesh(SB.sphere([26, 20, 22]), 30, 40);
    var spin = function (p) { var c = Math.cos(0.6), s = Math.sin(0.6); return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c, nx: p.nx * c + p.nz * s, ny: p.ny, nz: -p.nx * s + p.nz * c }; };
    var view = function (phi) { return { scale: 1, ox: 48, oy: 48, rot: SB.rotationMatrix([1, 0, 0], phi), center: [0, 0, 0] }; };
    function mesh(name, m, mi, t, v, pose) {
      var P = pair(100, 100);
      SB.drawMesh(P[0], m, own(mi, t), v, pose ? { pose: pose } : undefined);
      W.drawMesh(P[1], m, own(mi, t), v, pose ? { pose: pose } : undefined);
      note(name, same(P[0], P[1]));
    }
    var q;
    for (q = 0; q < 8; q++) mesh('face sphere roll ' + q, ball, 0, true, view(q * 0.8));
    for (q = 0; q < 8; q++) mesh('coin ridge pose ' + q, ball, 5, false, view(q * 0.8), spin);
    for (q = 0; q < 4; q++) mesh('coin textured pose ' + q, ball, 5, true, view(q * 1.7), spin);
    mesh('rod', rodM, 2, false, view(0.4)); mesh('ball', ball, 3, false, view(1.1)); mesh('stem rod', rodM, 4, false, view(2));
    for (q = 0; q < 3; q++) mesh('glove ' + q, glove, 1, false, view(q));
    var meshScenes = scenes, meshBad = bad.length;
    // random small meshes: random vertices, normals that are not unit length, picture coordinates far out of range, culled or not
    function randMesh() {
      var nu = 1 + ((rnd() * 4) | 0), nv = 1 + ((rnd() * 5) | 0), n = (nu + 1) * (nv + 1), pos = new Float64Array(n * 3), nrm = new Float64Array(n * 3), uv = new Float64Array(n * 2), k;
      for (k = 0; k < n; k++) {
        pos[k * 3] = rnd() * 70 - 5; pos[k * 3 + 1] = rnd() * 70 - 5; pos[k * 3 + 2] = rnd() * 20 - 10;
        nrm[k * 3] = rnd() * 2 - 1; nrm[k * 3 + 1] = rnd() * 2 - 1; nrm[k * 3 + 2] = rnd() * 2 - 0.6;
        uv[k * 2] = rnd() * 1.5 - 0.25; uv[k * 2 + 1] = rnd() * 20 - 10;
      }
      return { nu: nu, nv: nv, pos: pos, nrm: nrm, uv: rnd() < 0.8 ? uv : null };
    }
    var N = 800, rbad = 0, t, m, tx, M, v;
    for (q = 0; q < N; q++) {
      var P2 = pair(60, 60);
      for (t = 0; t < 4; t++) {
        M = randMesh(); m = (rnd() * 6) | 0; tx = rnd() < 0.6; v = rnd() < 0.3 ? { scale: 0.8 + rnd() * 0.5, ox: rnd() * 8, oy: rnd() * 8, rot: SB.rotationMatrix([0, 1, 0], rnd() * 6), center: [30, 30, 0] } : undefined;
        var o = rnd() < 0.25 ? { cull: false } : rnd() < 0.2 ? { cull: -0.2 } : undefined;
        SB.drawMesh(P2[0], M, own(m, tx), v, o); W.drawMesh(P2[1], M, own(m, tx), v, o);
      }
      if (!note('random scene ' + q, same(P2[0], P2[1]))) rbad++;
    }
    // the cases where the wasm hands the call to the plain code: the picture is bigger than the wasm holds, the surface is bigger, the ridge-free and picture-free material is unaffected
    (function () {
      var big = { w: 512, h: 512, data: makeTex(512) }, P = pair(80, 80);
      SB.drawMesh(P[0], ball, own(0, true, big), view(0.5)); W.drawMesh(P[1], ball, own(0, true, big), view(0.5));
      extra['a 512 x 512 picture (over the wasm limit) gives the same pixels'] = note('over-limit picture', same(P[0], P[1]));
      var R = new SB.Rast(1100, 1000), Q = new W.Rast(1100, 1000), s = { scale: 8, ox: 550, oy: 500, rot: null };
      SB.drawMesh(R, ball, own(3, false), s); W.drawMesh(Q, ball, own(3, false), s);
      extra['a 1100 x 1000 surface (over the wasm limit) gives the same pixels'] = note('over-limit surface', same(R, Q));
      var A = pair(70, 70), B = pair(90, 50), step;
      for (step = 0; step < 6; step++) {
        SB.drawMesh(A[0], ball, own(step % 6, step % 2 === 0), view(step * 0.7)); W.drawMesh(A[1], ball, own(step % 6, step % 2 === 0), view(step * 0.7));
        SB.drawMesh(B[0], rodM, own((step + 2) % 6, false), view(step * 0.4)); W.drawMesh(B[1], rodM, own((step + 2) % 6, false), view(step * 0.4));
      }
      extra['two surfaces drawn into by turns both stay right'] = note('alternating surfaces', same(A[0], A[1]) && same(B[0], B[1]));
      var C = pair(40, 40), keep = C[1].toImageData(); SB.drawMesh(C[0], ball, own(3, false), { scale: 1, ox: 20, oy: 20 }); W.drawMesh(C[1], ball, own(3, false), { scale: 1, ox: 20, oy: 20 });
      var img1 = C[1].toImageData(), copy = img1.data.slice(), D = new W.Rast(30, 30); D.clear(); W.drawMesh(D, rodM, own(2, false), { scale: 1, ox: 15, oy: 15 });
      var same2 = true, i; for (i = 0; i < copy.length; i++) if (img1.data[i] !== copy[i]) same2 = false;
      extra['a picture handed out by toImageData is not changed by a Rast made later'] = note('toImageData copy', same2 && keep.data.length === 40 * 40 * 4);
      var E = new W.Rast(20, 20); E.setLight(-0.3, -0.5, 0.8); var E2 = new SB.Rast(20, 20); E2.setLight(-0.3, -0.5, 0.8);
      SB.drawMesh(E2, ball, own(3, false), { scale: 0.5, ox: 10, oy: 10 }); W.drawMesh(E, ball, own(3, false), { scale: 0.5, ox: 10, oy: 10 });
      extra['setLight on a wasm Rast moves the light the same way'] = note('setLight', same(E, E2));
      var F2 = new W.Rast(24, 24), F3 = new SB.Rast(24, 24); SB.drawMesh(F3, ball, own(3, false), { scale: 0.4, ox: 12, oy: 12 }); W.drawMesh(F2, ball, own(3, false), { scale: 0.4, ox: 12, oy: 12 });
      F2.clear(); F3.clear(); SB.drawMesh(F3, rodM, own(2, false), { scale: 0.3, ox: 12, oy: 12 }); W.drawMesh(F2, rodM, own(2, false), { scale: 0.3, ox: 12, oy: 12 });
      extra['clear() empties a wasm Rast and it draws again'] = note('clear', same(F2, F3));
      var G = new W.Rast(30, 30), H, thrown = false, G2 = new SB.Rast(30, 30);
      W.drawMesh(G, rodM, own(2, false), { scale: 0.3, ox: 15, oy: 15 }); G.release(); H = new W.Rast(30, 30); W.drawMesh(H, rodM, own(2, false), { scale: 0.3, ox: 15, oy: 15 });
      SB.drawMesh(G2, rodM, own(2, false), { scale: 0.3, ox: 15, oy: 15 });
      try { W.drawMesh(G, rodM, own(2, false), { scale: 0.3, ox: 15, oy: 15 }); } catch (e) { thrown = /released/.test(e.message); }
      extra['release() frees a Rast: the next Rast is right, drawing into the released one throws (wasm), and release() on a plain Rast does nothing'] = note('release', same(H, G2) && (W.available ? thrown : !thrown) && (G2.release(), true));
    })();
    // the last argument of drawMesh in every form the plain code accepts: null, undefined, {}, false, 0, { cull: null }, { cull: undefined }, { cull: false }, { cull: 0 }, { cull: -0.75 }.
    // These meshes and angles have triangles that face only slightly away (a closed sphere seen from the front has none that show), so a wrong cull value changes pixels; the guard below proves it
    (function () {
      var forms = [null, undefined, {}, false, 0, { cull: null }, { cull: undefined }, { cull: false }, { cull: 0 }, { cull: -0.75 }], same4 = true, k, s, torus = SB.mesh(SB.torus(22, 8), 30, 20), cap = SB.mesh(SB.capsule([-20, 0, 0], [20, 0, 0], 8), 24, 20);
      var scenesList = [[rodM, 2], [glove, 3], [glove, 0.3], [torus, 0.3], [torus, 2], [cap, 2]], sensitive = 0;
      for (s = 0; s < scenesList.length; s++) {
        var A = pair(100, 100), B = pair(100, 100), px;
        SB.drawMesh(A[0], scenesList[s][0], own(0, false), view(scenesList[s][1])); SB.drawMesh(B[0], scenesList[s][0], own(0, false), view(scenesList[s][1]), { cull: 0 });
        for (px = 0; px < A[0].px.length; px++) if (A[0].px[px] !== B[0].px[px]) { sensitive++; break; }
        for (k = 0; k < forms.length; k++) {
          var P = pair(100, 100);
          SB.drawMesh(P[0], scenesList[s][0], own(0, false), view(scenesList[s][1]), forms[k]);
          W.drawMesh(P[1], scenesList[s][0], own(0, false), view(scenesList[s][1]), forms[k]);
          scenes++;
          if (!same(P[0], P[1])) { same4 = false; bad.push('last argument ' + JSON.stringify(forms[k]) + ' scene ' + s); }
        }
      }
      extra['drawMesh with null, undefined, {}, false, 0 or an object with cull null, undefined, false, 0 or -0.75 as last argument gives the same pixels as the plain code (on scenes where the cull value shows)'] = same4 && sensitive >= 4;
    })();
    /* outline: SpriteBaker.outline after the add-on is loaded (wasm when it starts) against PO, the plain function taken before: random pictures, radii, colors and every case that must fall back */
    if (typeof PO === 'function') (function () {
      var n, ok = true, w, h, d, i, j, a, img, r, c, radii = [0, 0.4, 1, 1.5, 2, 2.5, 3, 4.4, 7, 12, -2, NaN], cols = [[14, 24, 40], [0, 0, 0], [255, 255, 255], [10.5, 200.25, 99.9], undefined, null, [300, -20, 128]], cnt = 0, mixed = true;
      function eq(A, B) { var k; if (A.width !== B.width || A.height !== B.height || A.data.length !== B.data.length) return false; for (k = 0; k < A.data.length; k++) if (A.data[k] !== B.data[k]) return false; return true; }
      function pic(w, h, kind) {
        var dd = new Uint8ClampedArray(w * h * 4), k, p, x, y;
        for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
          p = (y * w + x) * 4; k = rnd();
          if (kind === 0) { a = k < 0.5 ? 0 : k < 0.7 ? 255 : (rnd() * 256) | 0; }
          else if (kind === 1) { a = ((x - w / 2) * (x - w / 2) + (y - h / 2) * (y - h / 2)) < (Math.min(w, h) * 0.3) * (Math.min(w, h) * 0.3) ? 255 : 0; if (a && k < 0.2) a = 1 + ((rnd() * 254) | 0); }
          else a = k < 0.97 ? 0 : (rnd() * 256) | 0;
          dd[p] = rnd() * 256; dd[p + 1] = rnd() * 256; dd[p + 2] = rnd() * 256; dd[p + 3] = a;
        }
        return { width: w, height: h, data: dd };
      }
      for (n = 0; n < 240; n++) {
        w = 1 + ((rnd() * (n % 8 === 0 ? 170 : 60)) | 0); h = 1 + ((rnd() * (n % 8 === 0 ? 170 : 60)) | 0); img = pic(w, h, n % 3);
        r = radii[(rnd() * radii.length) | 0]; c = cols[(rnd() * cols.length) | 0];
        scenes++; if (!eq(PO(img, r, c), SB.outline(img, r, c))) { ok = false; bad.push('outline ' + w + 'x' + h + ' r' + r + ' ' + JSON.stringify(c)); }
      }
      extra['outline: 240 random pictures (1 to 170 pixels a side, three alpha patterns, 12 radii including 0, negative, fractional and NaN, 7 colors including fractional, out of range and none) give the same bytes as the plain function'] = ok;
      [[64, 2], [96, 2], [160, 3]].forEach(function (z) { var im = pic(z[0], z[0], 1); scenes++; if (!eq(PO(im, z[1], [14, 24, 40]), SB.outline(im, z[1], [14, 24, 40]))) mixed = false; });
      extra['outline: 64, 96 and 160 pixel pictures at radius 2, 2 and 3 give the same bytes'] = mixed;
      var big = pic(700, 700, 1), fb = true; scenes++;
      if (!eq(PO(big, 2, [1, 2, 3]), SB.outline(big, 2, [1, 2, 3]))) fb = false;
      var small = pic(30, 30, 0); scenes++; if (!eq(PO(small, 1e9, [1, 2, 3]), SB.outline(small, 1e9, [1, 2, 3]))) fb = false;
      extra['outline: a 700 x 700 picture and a radius of a billion (both over the wasm limits) fall back and give the same bytes'] = fb;
      var thrown = [undefined, null, {}, { width: 2, height: 2 }], tk = true;
      thrown.forEach(function (bad1) { var e1 = null, e2 = null; try { PO(bad1, 2, [0, 0, 0]); } catch (e) { e1 = e && e.constructor; } try { SB.outline(bad1, 2, [0, 0, 0]); } catch (e) { e2 = e && e.constructor; } scenes++; if (e1 !== e2) tk = false; });
      extra['outline: a missing or malformed picture throws the same kind of error as the plain function'] = tk;
      var sp = { width: 40, height: 30, data: new Uint8ClampedArray(40 * 30 * 4) }, keep = new Uint8ClampedArray(sp.data), same5;
      for (i = 0; i < 40 * 30; i++) sp.data[i * 4 + 3] = i % 7 === 0 ? 255 : 0; keep.set(sp.data);
      SB.outline(sp, 3, [9, 9, 9]); same5 = eq({ width: 40, height: 30, data: keep }, sp); scenes++;
      extra['outline: the picture handed in is not changed, and the result is a fresh Uint8ClampedArray'] = same5 && SB.outline(sp, 3, [9, 9, 9]).data instanceof Uint8ClampedArray && SB.outline(sp, 3, [9, 9, 9]).data !== sp.data;
      /* bakeSprite, bakeRoll and baker with an outline go through the same function: compare with the roll baked without it and outlined by the plain function */
      var scene = [{ mesh: SB.mesh(SB.sphere(11, [0, 0, 0]), 24, 36), material: SB.material([[0, 60, 20, 90], [0.5, 170, 90, 210], [1, 245, 210, 255]]) }], roll = true, plainRoll, withOl, fi;
      [[64, 2], [96, 2]].forEach(function (z) {
        plainRoll = SB.bakeRoll(scene, 6, z[0], { margin: 2 + z[1] }); withOl = SB.bakeRoll(scene, 6, z[0], { outline: { radius: z[1], color: [14, 24, 40] } });
        for (fi = 0; fi < 6; fi++) { scenes++; if (!eq(PO(plainRoll[fi], z[1], [14, 24, 40]), withOl[fi])) roll = false; }
      });
      extra['outline: bakeRoll with an outline (the baking code calls SpriteBaker.outline) equals the roll without it outlined by the plain function'] = roll;
      extra['outline: with the wasm running SpriteBaker.outline is the add-on\'s function, otherwise it is the plain one'] = W.available ? SB.outline !== PO : true;
    })();
    return { scenes: scenes, meshScenes: meshScenes, meshDiffering: meshBad, randomScenes: N, randomDiffering: rbad, differing: bad.length, names: bad.slice(0, 5), extra: extra };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = battery; else root.spriteBakerWasmBattery = battery;
})(typeof globalThis !== 'undefined' ? globalThis : this);
