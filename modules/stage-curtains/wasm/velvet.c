/* stage-curtains velvet pixel loop (WebAssembly, SIMD). Copyright (c) 2026 LFC Foundry. MIT License.
 * Four pixels at a time in single precision (f32x4). Same picture as the row() loop of velvetPainter in ../stage-curtains.js to within a few counts (see the picture gate in
 * test/run.js), not byte for byte: the f32 rounding can move a value by one count, and a fold column index that sits exactly on a half can land on its neighbor.
 * Stepped curtains (and the last cw % 4 columns of a row) take the scalar double loop (the row values stay doubles there), which is exact: the same bytes as row().
 * Tables as in the scalar kernel (f64): hgt, T85, T6, THEM, TSL, crAt, crW2, edge, grain, prm, rows, aux; plus A (f32): per fold column 8 values (shade, T6, gold base, hem, 0 0 0 0),
 * then n crease flags, then X, ed and the leading-edge factor per canvas column (cw + 8 each), then the 64 * 64 grain. */
#include <wasm_simd128.h>
typedef unsigned char u8; typedef unsigned int u32;
static inline double jsround(double x) { double f = __builtin_floor(x); return (x - f >= 0.5) ? f + 1 : f; }
static inline u32 cl(double v) { return (u32)(u8)(v > 255 ? 255 : (v > 0 ? __builtin_rint(v) : 0)); }
void paint(u8 *out, int cw, int ch, int y0, int y1, int n, int ncr,
           const double *hgt, const double *T85, const double *T6, const double *THEM, const double *TSL,
           const double *crAt, const double *crW2, const double *edge, const double *grain,
           const double *prm, const double *rows, const double *aux, const float *A) {
  const double PW = prm[0], k = prm[1], warm = prm[3], B0 = prm[4], B1 = prm[5], B2 = prm[6], gam = prm[7];
  const float *ptab = A, *flag = A + 8 * n, *X32 = flag + n, *ED32 = X32 + cw + 8, *EDG32 = ED32 + cw + 8, *GR32 = EDG32 + cw + 8;
  const double *colt = aux + 6 * n;
  const v128_t vPW = wasm_f32x4_splat((float)PW), v2 = wasm_f32x4_splat(2.f), vh = wasm_f32x4_splat(.5f), vone = wasm_f32x4_splat(1.f), v255 = wasm_f32x4_splat(255.f);
  const v128_t vgam = wasm_f32x4_splat((float)gam), vB0 = wasm_f32x4_splat((float)(B0 * warm)), vB1 = wasm_f32x4_splat((float)B1), vB2 = wasm_f32x4_splat((float)B2);
  const v128_t v07 = wasm_f32x4_splat(.7f), v05 = wasm_f32x4_splat(.5f), vk15 = wasm_f32x4_splat((float)(1.5 * k)), vk25 = wasm_f32x4_splat((float)(2.5 * k));
  const v128_t vnm = wasm_i32x4_splat(n - 2), vone_i = wasm_i32x4_splat(1);
  const v128_t g231 = wasm_f32x4_splat(231.f), g180 = wasm_f32x4_splat(180.f), g58 = wasm_f32x4_splat(58.f);
  const v128_t vfloor = wasm_i32x4_splat(0xFF08080E), alpha = wasm_i32x4_splat((int)0xFF000000u), zero = wasm_i32x4_splat(0), m255 = wasm_i32x4_splat(255);
  const int stepped = prm[9] != 0;
  const int cend = stepped ? 0 : (cw & ~3);
  for (int y = y0; y < y1; y++) {
    const double lightd = rows[3 * y];
    const float light = (float)lightd, fanf = (float)rows[3 * y + 1], wobf = (float)rows[3 * y + 2];
    const v128_t vl = wasm_f32x4_splat(light), vfan = wasm_f32x4_splat(fanf), vwob = wasm_f32x4_splat(wobf), vl5 = wasm_f32x4_splat(light > .5f ? light : .5f);
    const v128_t vlg = wasm_f32x4_splat(light);
    const float *grow = GR32 + (y & 63) * 64;
    u32 *orow = (u32 *)(out + (y - y0) * cw * 4);
    const v128_t vy = wasm_f32x4_splat((float)y);
    int c2 = 0;
    for (; c2 < cend; c2 += 4) {
      v128_t X = wasm_v128_load(X32 + c2), ed = wasm_v128_load(ED32 + c2);
      v128_t u = wasm_f32x4_add(wasm_f32x4_add(wasm_f32x4_sub(vPW, wasm_f32x4_mul(wasm_f32x4_sub(vPW, X), vfan)), wasm_f32x4_mul(vwob, ed)), v2);
      v128_t ui = wasm_i32x4_trunc_sat_f32x4(wasm_f32x4_add(u, vh));   /* trunc of u+.5 ; negative -> 0 or neg, clamped below (floor differs only <0) */
      ui = wasm_i32x4_max(ui, vone_i); ui = wasm_i32x4_min(ui, vnm);
      int i0 = wasm_i32x4_extract_lane(ui, 0), i1 = wasm_i32x4_extract_lane(ui, 1), i2 = wasm_i32x4_extract_lane(ui, 2), i3 = wasm_i32x4_extract_lane(ui, 3);
      v128_t r0 = wasm_v128_load(ptab + 8 * i0), r1 = wasm_v128_load(ptab + 8 * i1), r2 = wasm_v128_load(ptab + 8 * i2), r3 = wasm_v128_load(ptab + 8 * i3);
      /* transpose 4x4: rows = (sh0,t6,gold,hem) per pixel */
      v128_t a0 = wasm_i32x4_shuffle(r0, r1, 0, 4, 1, 5), a1 = wasm_i32x4_shuffle(r2, r3, 0, 4, 1, 5), a2 = wasm_i32x4_shuffle(r0, r1, 2, 6, 3, 7), a3 = wasm_i32x4_shuffle(r2, r3, 2, 6, 3, 7);
      v128_t sh = wasm_i32x4_shuffle(a0, a1, 0, 1, 4, 5), t6 = wasm_i32x4_shuffle(a0, a1, 2, 3, 6, 7), gold = wasm_i32x4_shuffle(a2, a3, 0, 1, 4, 5), hem = wasm_i32x4_shuffle(a2, a3, 2, 3, 6, 7);
      if (flag[i0] != 0.f || flag[i1] != 0.f || flag[i2] != 0.f || flag[i3] != 0.f) {
        for (int ci = 0; ci < ncr; ci++) {
          v128_t d = wasm_f32x4_abs(wasm_f32x4_sub(u, wasm_f32x4_splat((float)crAt[ci]))), w2 = wasm_f32x4_splat((float)crW2[ci]);
          v128_t m = wasm_f32x4_lt(d, w2);
          v128_t f = wasm_f32x4_add(wasm_f32x4_splat(.55f), wasm_f32x4_mul(wasm_f32x4_splat(.45f), wasm_f32x4_div(d, w2)));
          sh = wasm_f32x4_mul(sh, wasm_v128_bitselect(f, vone, m));
        }
      }
      sh = wasm_f32x4_mul(sh, wasm_v128_load(EDG32 + c2));
      sh = wasm_f32x4_mul(sh, wasm_f32x4_mul(vl, wasm_f32x4_add(vone, wasm_f32x4_mul(wasm_v128_load(grow + (c2 & 63)), vgam))));
      v128_t R = wasm_f32x4_mul(vB0, sh), G = wasm_f32x4_mul(vB1, sh), B = wasm_f32x4_mul(vB2, sh);
      v128_t sheen = wasm_f32x4_mul(t6, vl);
      R = wasm_f32x4_add(R, wasm_f32x4_mul(wasm_f32x4_sub(v255, R), sheen));
      G = wasm_f32x4_add(G, wasm_f32x4_mul(wasm_f32x4_sub(v255, G), wasm_f32x4_mul(sheen, v07)));
      B = wasm_f32x4_add(B, wasm_f32x4_mul(wasm_f32x4_sub(v255, B), wasm_f32x4_mul(sheen, v05)));
      v128_t isgold = wasm_f32x4_gt(vy, wasm_f32x4_sub(hem, vk25)), isfloor = wasm_f32x4_gt(vy, wasm_f32x4_add(hem, vk15));
      if (wasm_v128_any_true(isgold)) {
        v128_t gl = wasm_f32x4_mul(gold, vl5);
        R = wasm_v128_bitselect(wasm_f32x4_mul(g231, gl), R, isgold); G = wasm_v128_bitselect(wasm_f32x4_mul(g180, gl), G, isgold); B = wasm_v128_bitselect(wasm_f32x4_mul(g58, gl), B, isgold);
      }
      v128_t Ri = wasm_i32x4_trunc_sat_f32x4(wasm_f32x4_nearest(R)), Gi = wasm_i32x4_trunc_sat_f32x4(wasm_f32x4_nearest(G)), Bi = wasm_i32x4_trunc_sat_f32x4(wasm_f32x4_nearest(B));
      Ri = wasm_i32x4_min(wasm_i32x4_max(Ri, zero), m255); Gi = wasm_i32x4_min(wasm_i32x4_max(Gi, zero), m255); Bi = wasm_i32x4_min(wasm_i32x4_max(Bi, zero), m255);
      v128_t pv = wasm_v128_or(wasm_v128_or(Ri, wasm_i32x4_shl(Gi, 8)), wasm_v128_or(wasm_i32x4_shl(Bi, 16), alpha));
      pv = wasm_v128_bitselect(vfloor, pv, isfloor);
      wasm_v128_store(orow + c2, pv);
    }
    /* scalar tail: same math in f64 */
    for (; c2 < cw; c2++) {
      const double X = colt[2 * c2], ed = colt[2 * c2 + 1];
      const double u = PW - (PW - X) * rows[3 * y + 1] + rows[3 * y + 2] * ed + 2;
      int ui; if (u < 1.5) ui = 1; else if (u >= n - 1.5) ui = n - 2; else { const int f = (int)u; ui = f + (u - f >= 0.5); }
      const double *P = aux + 6 * ui; const double hem = P[0]; u32 pv;
      if (y > hem + 1.5 * k) pv = 0xFF08080Eu;
      else {
        double sh = P[1];
        if (P[4] != 0) for (int ci = 0; ci < ncr; ci++) { const double d = __builtin_fabs(u - crAt[ci]); if (d < crW2[ci]) sh *= 0.55 + 0.45 * (d / crW2[ci]); }
        sh *= edge[c2]; sh *= lightd * (1 + grain[(y & 63) * 64 + (c2 & 63)] * gam);
        double R = B0 * sh * warm, G = B1 * sh, B = B2 * sh; const double sheen = P[2] * lightd;
        R += (255 - R) * sheen; G += (255 - G) * sheen * 0.7; B += (255 - B) * sheen * 0.5;
        if (y > hem - 2.5 * k) { const double gl = P[3] * (lightd > 0.5 ? lightd : 0.5); R = 231 * gl; G = 180 * gl; B = 58 * gl; }
        if (stepped) { R = jsround(R / 20) * 20; G = jsround(G / 20) * 20; B = jsround(B / 20) * 20; }
        pv = cl(R) | (cl(G) << 8) | (cl(B) << 16) | 0xFF000000u;
      }
      orow[c2] = pv;
    }
  }
}
