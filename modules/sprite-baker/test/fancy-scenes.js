/* sprite-baker: the pictures Fancy Banana's own triangle filler makes, compared byte for byte. Copyright (c) 2026 LFC Foundry. MIT License.
 * run.js calls this with the full module twice; test/lean.js calls it with the full module (for mesh, sphere and the other helpers) and a lean build (for Rast, tri and drawMesh),
 * so a lean build is held to the same 266 scenes. */
'use strict';
module.exports = function (SB, SBL, check) {
  var coverage = function (data) { var n = 0, i; for (i = 3; i < data.length; i += 4) if (data[i] === 255) n++; return n; };
/* 9. Fancy Banana's pictures: the same pixels as its own triangle filler. test/reference-tri.js is that filler, copied verbatim from Fancy's art.js;
   the same scenes are drawn through it and through sprite-baker (own ramps, texture, ridge, pose) and both buffers, color and depth, are compared byte for byte. */
(function () {
  var F = require('./reference-tri.js'), PI2 = Math.PI * 2, seed = 20261017, bytes = 0, scenes = 0, bad = [];
  function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  function makeTex() {   // 256 x 256 RGBA: noise colors, transparent patches, soft-alpha patches and a strong red patch (red > 200, green < 90)
    var d = new Uint8ClampedArray(256 * 256 * 4), x, y, i, k;
    for (y = 0; y < 256; y++) for (x = 0; x < 256; x++) {
      i = (y * 256 + x) * 4; k = ((x >> 5) * 7 + (y >> 5) * 13) % 6;
      d[i] = rnd() * 256; d[i + 1] = rnd() * 256; d[i + 2] = rnd() * 256;
      d[i + 3] = k === 0 ? 0 : k === 1 ? 1 + rnd() * 254 : k === 2 ? 0 : 255;
      if (k === 3) { d[i] = 201 + rnd() * 54; d[i + 1] = rnd() * 89; }
    }
    return d;
  }
  var texData = makeTex(), texRef = { d: texData }, texMat = { w: 256, h: 256, data: texData };
  var RIDGE = { 0: { freq: 5, dark: -0.86, darkScale: 0.93 }, 5: { freq: 5, dark: -0.86, darkScale: 0.78, lit: 0.9, litAdd: 0.06 } };
  function own(m, withTex) {   // a material carrying Fancy's own truncated ramp and its five lighting numbers
    var o = { lut: F.lut()[m], specular: 1, bounce: 1, pool: 1, rimLight: 1, edge: m === 1 ? 0.5 : 0.88 };
    if (RIDGE[m]) o.ridge = RIDGE[m];
    if (withTex) o.texture = texMat;
    return o;
  }
  function same(R, Q) { bytes += R.px.length + R.z.length * 4; return Buffer.compare(Buffer.from(R.px.buffer), Buffer.from(Q.px.buffer)) === 0 && Buffer.compare(Buffer.from(R.z.buffer), Buffer.from(Q.z.buffer)) === 0; }
  // Fancy's mesh loop, written out with the same arithmetic as drawMesh: turn, pose, scale, then two triangles a quad
  function refMesh(R, m, mi, withTex, view, pose) {
    var s = view.scale, ox = view.ox, oy = view.oy, rot = view.rot, cen = view.center || [0, 0, 0], cols = m.nv + 1, n = cols * (m.nu + 1), V = new Array(n), k, x, y, z, nx, ny, nz, i, j, a, b, c, d;
    for (k = 0; k < n; k++) {
      x = m.pos[k * 3]; y = m.pos[k * 3 + 1]; z = m.pos[k * 3 + 2]; nx = m.nrm[k * 3]; ny = m.nrm[k * 3 + 1]; nz = m.nrm[k * 3 + 2];
      if (rot) {
        x -= cen[0]; y -= cen[1]; z -= cen[2];
        var rx = rot[0] * x + rot[1] * y + rot[2] * z + cen[0], ry = rot[3] * x + rot[4] * y + rot[5] * z + cen[1], rz = rot[6] * x + rot[7] * y + rot[8] * z + cen[2];
        var qx = rot[0] * nx + rot[1] * ny + rot[2] * nz, qy = rot[3] * nx + rot[4] * ny + rot[5] * nz, qz = rot[6] * nx + rot[7] * ny + rot[8] * nz;
        x = rx; y = ry; z = rz; nx = qx; ny = qy; nz = qz;
      }
      var p = { x: x, y: y, z: z, nx: nx, ny: ny, nz: nz }; if (pose) p = pose(p);
      V[k] = F.V(p, s, s, ox, oy, ((k / cols) | 0) / m.nu, ((k % cols) / m.nv) * PI2);
    }
    for (i = 0; i < m.nu; i++) for (j = 0; j < m.nv; j++) {
      a = V[i * cols + j]; b = V[(i + 1) * cols + j]; c = V[(i + 1) * cols + j + 1]; d = V[i * cols + j + 1];
      F.tri(R, a, b, c, mi, withTex ? texRef : null); F.tri(R, a, c, d, mi, withTex ? texRef : null);
    }
  }
  function both(name, W, H, m, mi, withTex, view, pose) {
    var R = new F.Rast(W, H), Q = new SBL.Rast(W, H);
    refMesh(R, m, mi, withTex, view, pose);
    SBL.drawMesh(Q, m, own(mi, withTex), view, pose ? { pose: pose } : undefined);
    scenes++; if (!same(R, Q)) bad.push(name);
    return Q;
  }
  var ball = SB.mesh(SB.sphere(30), 40, 64), rodM = SB.mesh(SB.rod([-30, -10, 0], [30, 10, 10], 8, 5), 24, 20), glove = SB.mesh(SB.sphere([26, 20, 22]), 30, 40);
  var spin = function (p) { var c = Math.cos(0.6), s = Math.sin(0.6); return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c, nx: p.nx * c + p.nz * s, ny: p.ny, nz: -p.nx * s + p.nz * c }; };
  var view = function (phi) { return { scale: 1, ox: 48, oy: 48, rot: SB.rotationMatrix([1, 0, 0], phi), center: [0, 0, 0] }; };
  var q;
  for (q = 0; q < 8; q++) both('a textured sphere with ridges, roll ' + q, 100, 100, ball, 0, true, view(q * 0.8));                  // (a)
  for (q = 0; q < 8; q++) both('the coin with the lit ridge part and a spin pose, roll ' + q, 100, 100, ball, 5, false, view(q * 0.8), spin);   // (b)
  for (q = 0; q < 4; q++) both('the coin, textured, with a spin pose, roll ' + q, 100, 100, ball, 5, true, view(q * 1.7), spin);
  both('a rod without a texture', 100, 100, rodM, 2, false, view(0.4)); both('a ball without a texture', 100, 100, ball, 3, false, view(1.1));   // (c)
  both('the stem material on a rod, shaded only', 100, 100, rodM, 4, false, view(2.0));
  for (q = 0; q < 3; q++) both('the glove with edge 0.5, roll ' + q, 100, 100, glove, 1, false, view(q));                                         // (d)
  check('the pictures match Fancy\'s own triangle filler byte for byte (sphere with texture and ridge, coin with lit ridge and pose, rod, ball, glove edge 0.5)', bad.length === 0, bad.slice(0, 3).join('; '));
  // random triangles: 8-number vertices, any of Fancy's six ramps, with and without the picture, normals not unit length, u outside 0..1, v far outside one turn
  var many = 0, R, Q2, t, m, tex, v, tri;
  function vert() { return [rnd() * 70 - 5, rnd() * 70 - 5, rnd() * 20 - 10, rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 0.6, rnd() * 1.5 - 0.25, rnd() * 20 - 10]; }
  for (q = 0; q < 240; q++) {
    R = new F.Rast(60, 60); Q2 = new SBL.Rast(60, 60);
    for (t = 0; t < 6; t++) {
      m = (rnd() * 6) | 0; tex = rnd() < 0.6; tri = [vert(), vert(), vert()];
      F.tri(R, tri[0], tri[1], tri[2], m, tex ? texRef : null); SBL.tri(Q2, tri[0], tri[1], tri[2], own(m, tex));
    }
    many++; if (!same(R, Q2)) bad.push('random scene ' + q);
  }
  scenes += many;
  check('240 random scenes (six triangles each, any of the six ramps, with and without a picture) match Fancy\'s filler byte for byte', bad.length === 0, bad.slice(0, 3).join('; '));
  check('compared ' + scenes + ' scenes and ' + bytes + ' bytes of color and depth', scenes >= 200 && bytes > 0);
  // 6-number vertices with a textured material are drawn without the picture and the ridge (as the plain material would draw them)
  var Rp = new SBL.Rast(40, 40), Rq = new SBL.Rast(40, 40), A = [5, 5, 0, 0, 0, 1], B = [35, 8, 0, 0, 0, 1], C = [10, 35, 0, 0, 0, 1];
  SBL.tri(Rp, A, B, C, own(0, true)); SBL.tri(Rq, A, B, C, Object.assign(own(0, false), { ridge: undefined }));
  check('6-number vertices with a textured material draw the plain way', same(Rp, Rq));
  // the settings the reference does not use: u can wrap instead of clamp, and v wraps once per vWrap
  (function () {
    var T = { w: 256, h: 256, data: texData, uClamp: false, vWrap: 3 }, M = Object.assign(own(1, false), { texture: T }), P = [], k;
    function px(u, v) { var Rx = new SBL.Rast(30, 30); SBL.tri(Rx, [2, 2, 0, 0, 0, 1, u, v], [28, 3, 0, 0, 0, 1, u, v], [4, 28, 0, 0, 0, 1, u, v], M); return Buffer.from(Rx.px.buffer).toString('hex'); }
    check('with uClamp false, u wraps around (u and u + 1 give the same pixels); a flat v wraps once per vWrap', px(0.3, 1.1) === px(1.3, 1.1) && px(0.3, 1.1) === px(0.3, 1.1 + 3) && px(0.3, 1.1) !== px(0.3, 1.9));
  })();
  // a non-finite u or v skips the triangle whole (it must not poison the depth buffer)
  var Rn = new SBL.Rast(40, 40); SBL.tri(Rn, [5, 5, 0, 0, 0, 1, NaN, 0], [35, 8, 0, 0, 0, 1, 0, 0], [10, 35, 0, 0, 0, 1, 0, 0], own(0, true));
  check('a NaN picture coordinate skips the triangle and leaves the depth buffer clean', Rn.z.every(function (z) { return z === -1e9; }) && coverage(Rn.px) === 0);
})();
};
