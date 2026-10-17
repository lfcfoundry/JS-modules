'use strict';
/* Fancy Banana's triangle filler, copied VERBATIM from art.js (build 2026.10.17.0249, the 2026.10.17 save-kit source) so that a
   sprite-baker change can be tested for byte-identical pixels. Only the wrapper (this header, TU/TV and module.exports) is added.
   Copyright (c) 2026 LFC Foundry. MIT License. Usage: const F = require('./reference-tri.js'); F.Rast, F.tri, F.V, F.texAt, F.lut, F.RAMP. */
var TU = 256, TV = 256;   // texture size (art.js: TU = 256, TV = 256)
function texAt(T, u, v, out) {   // bilinear, wraps around the body (v), clamps along it (u)
  var x = Math.min(TU - 1.001, Math.max(0, u * TU - .5)), y = (((v / (2 * Math.PI)) * TV - .5) % TV + TV) % TV, x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, y1 = (y0 + 1) % TV, d = T.d, i00 = (y0 * TU + x0) * 4, i10 = i00 + 4, i01 = (y1 * TU + x0) * 4, i11 = i01 + 4;
  var w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy, a = d[i00 + 3] * w00 + d[i10 + 3] * w10 + d[i01 + 3] * w01 + d[i11 + 3] * w11;
  out[3] = a / 255; if (a < 1) { out[0] = out[1] = out[2] = 0; return; }
  out[0] = (d[i00] * d[i00 + 3] * w00 + d[i10] * d[i10 + 3] * w10 + d[i01] * d[i01 + 3] * w01 + d[i11] * d[i11 + 3] * w11) / a;
  out[1] = (d[i00 + 1] * d[i00 + 3] * w00 + d[i10 + 1] * d[i10 + 3] * w10 + d[i01 + 1] * d[i01 + 3] * w01 + d[i11 + 1] * d[i11 + 3] * w11) / a;
  out[2] = (d[i00 + 2] * d[i00 + 3] * w00 + d[i10 + 2] * d[i10 + 3] * w10 + d[i01 + 2] * d[i01 + 3] * w01 + d[i11 + 2] * d[i11 + 3] * w11) / a;
}
var RAMP = [   // per material: colour stops from shadow to light
  [[0, 150, 96, 4], [.3, 216, 164, 14], [.58, 250, 223, 50], [.84, 255, 241, 104], [1, 255, 251, 186]],   // 0 banana skin (a cool lemon yellow, so Fancy never matches the amber coins)
  [[0, 164, 176, 214], [.5, 216, 224, 246], [1, 255, 255, 255]],                                          // 1 glove
  [[0, 56, 36, 14], [.5, 112, 82, 34], [1, 190, 160, 84]],                                                // 2 stem (olive brown)
  [[0, 46, 26, 12], [.5, 104, 66, 32], [1, 172, 122, 72]],                                                // 3 tip (dark brown)
  [[0, 150, 18, 36], [.5, 226, 42, 64], [1, 255, 128, 140]],                                              // 4 scarf knot
  [[0, 126, 54, 2], [.3, 204, 100, 6], [.58, 248, 150, 14], [.84, 255, 196, 54], [1, 255, 234, 146]]       // 5 gold coin (a warm amber, clearly different from Fancy)
];
var LUT = null;
function lut() { if (LUT) return LUT; LUT = []; RAMP.forEach(function (R, m) { var a = new Uint8Array(256 * 3), i, j, t, A, B, f; for (i = 0; i < 256; i++) { t = i / 255; for (j = 0; j < R.length - 1 && t > R[j + 1][0]; j++); A = R[j]; B = R[Math.min(j + 1, R.length - 1)]; f = B[0] === A[0] ? 0 : Math.min(1, Math.max(0, (t - A[0]) / (B[0] - A[0]))); a[i * 3] = A[1] + (B[1] - A[1]) * f; a[i * 3 + 1] = A[2] + (B[2] - A[2]) * f; a[i * 3 + 2] = A[3] + (B[3] - A[3]) * f; } LUT.push(a); }); return LUT; }
var LX = -.42, LY = -.62, LZ = .66, HLX, HLY, HLZ;
(function () { var l = Math.sqrt(LX * LX + LY * LY + LZ * LZ), x, y, z; LX /= l; LY /= l; LZ /= l; x = LX; y = LY; z = LZ + 1; l = Math.sqrt(x * x + y * y + z * z); HLX = x / l; HLY = y / l; HLZ = z / l; })();
function Rast(w, h) { this.w = w; this.h = h; this.z = new Float32Array(w * h).fill(-1e9); this.px = new Uint8ClampedArray(w * h * 4); }
function tri(R, a, b, c, mat, T) {
  var w = R.w, h = R.h, x0 = a[0], y0 = a[1], x1 = b[0], y1 = b[1], x2 = c[0], y2 = c[1], area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (area === 0 || (a[5] + b[5] + c[5]) < -.75) return;   // degenerate, or facing well away (the depth buffer handles the rest)
  var minx = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxx = Math.min(w - 1, Math.ceil(Math.max(x0, x1, x2))), miny = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxy = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2)));
  var inv = 1 / area, x, y, px, py, w0, w1, w2, z, idx, nx, ny, nz, l, d, t, sp, i3, o, tc = [0, 0, 0, 0], L = lut()[mat], r, g, bl, wrap, rim, tu, tv, ridge, al, shade, ed, sp0;
  for (y = miny; y <= maxy; y++) for (x = minx; x <= maxx; x++) {
    px = x + .5; py = y + .5;
    w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * inv; w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * inv; w2 = 1 - w0 - w1;
    if (w0 < -1e-5 || w1 < -1e-5 || w2 < -1e-5) continue;
    z = w0 * a[2] + w1 * b[2] + w2 * c[2]; idx = y * w + x; if (z <= R.z[idx]) continue; R.z[idx] = z;
    nx = w0 * a[3] + w1 * b[3] + w2 * c[3]; ny = w0 * a[4] + w1 * b[4] + w2 * c[4]; nz = w0 * a[5] + w1 * b[5] + w2 * c[5]; l = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz + 1e-9); nx *= l; ny *= l; nz *= l;
    d = nx * LX + ny * LY + nz * LZ; wrap = d * .5 + .5; t = wrap * wrap * .35 + wrap * .65;                       // soft wrap lighting: the shadow side stays friendly
    rim = nx * .5 + ny * .72 + nz * .2; rim = rim > 0 ? rim * .16 : 0;                                                  // warm bounce light from below right
    t = t * .9 + rim; sp0 = nx * .55 + ny * .8; if (sp0 > .25) t -= (sp0 - .25) * .3;   // shade pooled low and to the right (Apple Press: the deep tone of the ramp collects there)
    sp = nx * HLX + ny * HLY + nz * HLZ; sp = sp > 0 ? Math.pow(sp, 16) * .55 + Math.pow(sp, 110) * .55 + Math.pow(sp, 380) * .5 : 0;                 // one big soft highlight
    tv = w0 * a[7] + w1 * b[7] + w2 * c[7];
    if (mat === 0 || mat === 5) { ridge = Math.cos(5 * tv); if (ridge < -.86) t *= mat === 5 ? .78 : .93; else if (mat === 5 && ridge > .9) t += .06; }                                           // faint valleys between the ridges
    if (nz < .34) t *= mat === 1 ? .5 + .5 * Math.max(0, nz) / .34 : .88 + .12 * Math.max(0, nz) / .34;   // darker toward the rim: round forms, and fists read apart
    t = t < 0 ? 0 : t > 1 ? 1 : t; i3 = ((t * 255) | 0) * 3; r = L[i3]; g = L[i3 + 1]; bl = L[i3 + 2];
    if (T) {
      tu = w0 * a[6] + w1 * b[6] + w2 * c[6]; texAt(T, tu, tv, tc); al = tc[3];
      if (al > 0) { shade = .66 + .5 * wrap; r = r * (1 - al) + tc[0] * shade * al; g = g * (1 - al) + tc[1] * shade * al; bl = bl * (1 - al) + tc[2] * shade * al; if (tc[0] > 200 && tc[1] < 90) sp *= .55; else sp *= 1 - al * .8; }
    }
    ed = nx > 0 && nz < .8 ? nx * Math.pow(1 - (nz > 0 ? nz : 0), 2.2) * .4 : 0;   // a cool white rim light on the right edge: bounced light from the scene (Apple Press)
    r += sp * 255 + ed * 255; g += sp * 255 + ed * 255; bl += sp * 235 + ed * 255;
    o = idx * 4; R.px[o] = r; R.px[o + 1] = g; R.px[o + 2] = bl; R.px[o + 3] = 255;
  }
}
function V(p, sx, sy, ox, oy, tu, tv) { return [ox + p.x * sx, oy + p.y * sy, p.z * sx, p.nx, p.ny, p.nz, tu, tv]; }

module.exports = { Rast: Rast, tri: tri, V: V, texAt: texAt, lut: lut, RAMP: RAMP, TU: TU, TV: TV, light: function () { return { L: [LX, LY, LZ], H: [HLX, HLY, HLZ] }; } };
