/* Copyright (c) 2026 LFC Foundry. MIT License.
 * WebAssembly twin of the heavy loops in src/gifx.js (box blur, unsharp, glow down and up, color grade with vignette). Same integer and double
 * arithmetic in the same order as the JavaScript, so the bytes come out identical (test/gifx-wasm.test.js). The JavaScript stays the fallback.
 * Build: sh wasm/build.sh && python3 wasm/embed.py && node tools/build.mjs */
#include <wasm_simd128.h>
typedef unsigned char u8;
typedef unsigned int u32;

static inline v128_t load4(const u8* p) { return wasm_u32x4_extend_low_u16x8(wasm_u16x8_extend_low_u8x16(wasm_v128_load32_zero(p))); }
static inline void store4(u8* p, v128_t v) { v128_t n = wasm_u16x8_narrow_i32x4(v, v); wasm_v128_store32_lane(p, wasm_u8x16_narrow_i16x8(n, n), 0); }
static inline v128_t scale(v128_t s, int inv) { return wasm_u32x4_shr(wasm_i32x4_add(wasm_i32x4_mul(s, wasm_i32x4_splat(inv)), wasm_i32x4_splat(32768)), 16); }

/* rows then columns, running sums, edge pixel repeated; sums is w*4 ints of scratch.
 * Experimental: when (2r+1)*255 fits 16 bits (r <= 128) the sums live in 16-bit lanes, two pixels (rows: two rows) per register;
 * scale() is the same integer formula, (s * inv + 32768) >> 16, done with a widening 16 x 16 -> 32 multiply, so the bytes do not change. */
static inline v128_t ld2(const u8* p) { return wasm_u16x8_extend_low_u8x16(wasm_v128_load64_zero(p)); }
static inline v128_t ldp(const u8* p, const u8* q) { v128_t v = wasm_v128_load32_zero(p); v = wasm_v128_load32_lane(q, v, 1); return wasm_u16x8_extend_low_u8x16(v); }
static inline v128_t scale8(v128_t s, v128_t vinv, v128_t half) {
  v128_t lo = wasm_u32x4_shr(wasm_i32x4_add(wasm_u32x4_extmul_low_u16x8(s, vinv), half), 16);
  v128_t hi = wasm_u32x4_shr(wasm_i32x4_add(wasm_u32x4_extmul_high_u16x8(s, vinv), half), 16);
  v128_t n = wasm_u16x8_narrow_i32x4(lo, hi); return wasm_u8x16_narrow_i16x8(n, n);
}
static void blur32(const u8* src, u8* dst, u8* tmp, int w, int h, int r, int* sums) {
  int d = 2 * r + 1, inv = 65536 / d, W4 = w * 4, y, x, i, k;
  for (y = 0; y < h; y++) {
    const u8* row = src + y * W4; u8* trow = tmp + y * W4;
    v128_t s = wasm_i32x4_splat(0);
    for (i = -r; i <= r; i++) s = wasm_i32x4_add(s, load4(row + (i < 0 ? 0 : i >= w ? w - 1 : i) * 4));
    for (x = 0; x < w; x++) {
      store4(trow + x * 4, scale(s, inv));
      s = wasm_i32x4_add(s, wasm_i32x4_sub(load4(row + (x + r + 1 >= w ? w - 1 : x + r + 1) * 4), load4(row + (x - r < 0 ? 0 : x - r) * 4)));
    }
  }
  for (k = 0; k < W4; k++) sums[k] = 0;
  for (i = -r; i <= r; i++) { const u8* t = tmp + (i < 0 ? 0 : i >= h ? h - 1 : i) * W4; for (k = 0; k < W4; k += 4) wasm_v128_store(sums + k, wasm_i32x4_add(wasm_v128_load(sums + k), load4(t + k))); }
  for (y = 0; y < h; y++) {
    u8* o = dst + y * W4; const u8* a = tmp + (y + r + 1 >= h ? h - 1 : y + r + 1) * W4; const u8* b = tmp + (y - r < 0 ? 0 : y - r) * W4;
    for (k = 0; k < W4; k += 4) {
      v128_t s = wasm_v128_load(sums + k); store4(o + k, scale(s, inv));
      wasm_v128_store(sums + k, wasm_i32x4_add(s, wasm_i32x4_sub(load4(a + k), load4(b + k))));
    }
  }
}
void blur(const u8* src, u8* dst, u8* tmp, int w, int h, int r, int* sums) {
  if (r > 128) { blur32(src, dst, tmp, w, h, r, sums); return; }
  int d = 2 * r + 1, inv = 65536 / d, W4 = w * 4, y, x, i, k;
  v128_t vinv = wasm_i16x8_splat((short)inv), half = wasm_i32x4_splat(32768);
  for (y = 0; y < h; y += 2) {
    const u8* r0 = src + y * W4; const u8* r1 = y + 1 < h ? r0 + W4 : r0;
    u8* t0 = tmp + y * W4; u8* t1 = y + 1 < h ? t0 + W4 : 0;
    v128_t s = wasm_i16x8_splat(0);
    for (i = -r; i <= r; i++) { int o = (i < 0 ? 0 : i >= w ? w - 1 : i) * 4; s = wasm_i16x8_add(s, ldp(r0 + o, r1 + o)); }
    for (x = 0; x < w; x++) {
      v128_t q = scale8(s, vinv, half);
      wasm_v128_store32_lane(t0 + x * 4, q, 0); if (t1) wasm_v128_store32_lane(t1 + x * 4, q, 1);
      int a = (x + r + 1 >= w ? w - 1 : x + r + 1) * 4, c = (x - r < 0 ? 0 : x - r) * 4;
      s = wasm_i16x8_add(s, wasm_i16x8_sub(ldp(r0 + a, r1 + a), ldp(r0 + c, r1 + c)));
    }
  }
  unsigned short* su = (unsigned short*)sums;   /* w*4 u16 sums: half the scratch the 32-bit form used */
  int k8 = W4 & ~7;
  for (k = 0; k < W4; k++) su[k] = 0;
  for (i = -r; i <= r; i++) { const u8* t = tmp + (i < 0 ? 0 : i >= h ? h - 1 : i) * W4; for (k = 0; k < W4; k++) su[k] += t[k]; }
  for (y = 0; y < h; y++) {
    u8* o = dst + y * W4; const u8* a = tmp + (y + r + 1 >= h ? h - 1 : y + r + 1) * W4; const u8* b = tmp + (y - r < 0 ? 0 : y - r) * W4;
    for (k = 0; k < k8; k += 8) {
      v128_t s = wasm_v128_load(su + k); wasm_v128_store64_lane(o + k, scale8(s, vinv, half), 0);
      wasm_v128_store(su + k, wasm_i16x8_add(s, wasm_i16x8_sub(ld2(a + k), ld2(b + k))));
    }
    for (; k < W4; k++) { unsigned s = su[k]; o[k] = (u8)((s * (unsigned)inv + 32768u) >> 16); su[k] = (unsigned short)(s + a[k] - b[k]); }
  }
}
static inline int clamp8(double v) { v = __builtin_rint(v); return v < 0 ? 0 : v > 255 ? 255 : (int)v; }   /* a Uint8ClampedArray store: nearest, ties to even, clamped */
/* px[i] = px[i] + amt * (px[i] - blurred[i]) for the color bytes. One pixel (4 bytes) per step as two pairs of doubles: the same double math
 * (sub, mul, add, nearest-even, clamp) as the scalar form, so the same bytes; alpha is kept. */
void unsharp(u8* px, const u8* bl, int n4, double amt) {
  v128_t va = wasm_f64x2_splat(amt), z = wasm_f64x2_splat(0), m = wasm_f64x2_splat(255);
  int i = 0;
  for (; i + 4 <= n4; i += 4) {
    v128_t p = load4(px + i), q = load4(bl + i);
    v128_t pl = wasm_f64x2_convert_low_i32x4(p), ql = wasm_f64x2_convert_low_i32x4(q);
    v128_t ph = wasm_f64x2_convert_low_i32x4(wasm_i32x4_shuffle(p, p, 2, 3, 0, 1)), qh = wasm_f64x2_convert_low_i32x4(wasm_i32x4_shuffle(q, q, 2, 3, 0, 1));
    v128_t rl = wasm_f64x2_min(wasm_f64x2_max(wasm_f64x2_nearest(wasm_f64x2_add(pl, wasm_f64x2_mul(va, wasm_f64x2_sub(pl, ql)))), z), m);
    v128_t rh = wasm_f64x2_min(wasm_f64x2_max(wasm_f64x2_nearest(wasm_f64x2_add(ph, wasm_f64x2_mul(va, wasm_f64x2_sub(ph, qh)))), z), m);
    v128_t il = wasm_i32x4_trunc_sat_f64x2_zero(rl), ih = wasm_i32x4_trunc_sat_f64x2_zero(rh);
    v128_t r = wasm_i32x4_shuffle(il, ih, 0, 1, 4, 5);
    r = wasm_i32x4_replace_lane(r, 3, px[i + 3]);
    store4(px + i, r);
  }
  for (; i < n4; i++) if ((i & 3) != 3) px[i] = (u8)clamp8(px[i] + amt * (px[i] - bl[i]));
}
/* quarter-size copy (4x4 averages) with the bright pass */
void glow_down(const u8* src, u8* small, int w, int sw, int sh) {
  int sx, sy, dx, dy;
  for (sy = 0; sy < sh; sy++) for (sx = 0; sx < sw; sx++) {
    int r0 = 0, g0 = 0, b0 = 0;
    for (dy = 0; dy < 4; dy++) { const u8* p = src + ((sy * 4 + dy) * w + sx * 4) * 4; for (dx = 0; dx < 4; dx++, p += 4) { r0 += p[0]; g0 += p[1]; b0 += p[2]; } }
    r0 >>= 4; g0 >>= 4; b0 >>= 4;
    int l = (r0 * 54 + g0 * 183 + b0 * 19) >> 8; double k = l > 150 ? (double)(l - 150) / (double)(255 - 150) : 0.0; u8* o = small + (sy * sw + sx) * 4;
    o[0] = (u8)clamp8(r0 * k); o[1] = (u8)clamp8(g0 * k); o[2] = (u8)clamp8(b0 * k); o[3] = 255;
  }
}
/* bilinear blow-up of the blurred glow, screen-blended onto the picture. The column terms (x0, x1, tx) are worked out once per column with the same
 * expressions as before (they do not depend on the row), so the doubles and the bytes are the same. colx: scratch of 2 * w ints + w doubles. */
static int GX[8192 * 2]; static double GT[8192];
void glow_up(u8* px, const u8* sb, int w, int h, int sw, int sh, double g) {
  int xx, yy, i;
  if (w > 8192) {   /* very wide: the old way */
    for (yy = 0; yy < h; yy++) {
      double fy = (yy + 0.5) / 4 - 0.5; if (fy < 0) fy = 0; if (fy > sh - 1) fy = sh - 1; int y0 = (int)fy, y1 = y0 + 1 < sh - 1 ? y0 + 1 : sh - 1; double ty = fy - y0;
      for (xx = 0; xx < w; xx++) {
        double fx = (xx + 0.5) / 4 - 0.5; if (fx < 0) fx = 0; if (fx > sw - 1) fx = sw - 1; int x0 = (int)fx, x1 = x0 + 1 < sw - 1 ? x0 + 1 : sw - 1; double tx = fx - x0;
        const u8 *a = sb + (y0 * sw + x0) * 4, *b = sb + (y0 * sw + x1) * 4, *c = sb + (y1 * sw + x0) * 4, *d = sb + (y1 * sw + x1) * 4; u8* p = px + (yy * w + xx) * 4;
        for (i = 0; i < 3; i++) {
          double bv = (a[i] * (1 - tx) + b[i] * tx) * (1 - ty) + (c[i] * (1 - tx) + d[i] * tx) * ty; bv = bv * g; if (bv > 255) bv = 255;
          int av = p[i]; p[i] = (u8)(255 - (((int)((255 - av) * (255 - bv))) >> 8));
        }
      }
    }
    return;
  }
  for (xx = 0; xx < w; xx++) {
    double fx = (xx + 0.5) / 4 - 0.5; if (fx < 0) fx = 0; if (fx > sw - 1) fx = sw - 1; int x0 = (int)fx, x1 = x0 + 1 < sw - 1 ? x0 + 1 : sw - 1;
    GX[2 * xx] = x0 * 4; GX[2 * xx + 1] = x1 * 4; GT[xx] = fx - x0;
  }
  for (yy = 0; yy < h; yy++) {
    double fy = (yy + 0.5) / 4 - 0.5; if (fy < 0) fy = 0; if (fy > sh - 1) fy = sh - 1; int y0 = (int)fy, y1 = y0 + 1 < sh - 1 ? y0 + 1 : sh - 1; double ty = fy - y0, uy = 1 - ty;
    const u8 *r0 = sb + y0 * sw * 4, *r1 = sb + y1 * sw * 4; u8* p = px + yy * w * 4;
    for (xx = 0; xx < w; xx++, p += 4) {
      double tx = GT[xx], ux = 1 - tx; const u8 *a = r0 + GX[2 * xx], *b = r0 + GX[2 * xx + 1], *c = r1 + GX[2 * xx], *d = r1 + GX[2 * xx + 1];
      for (i = 0; i < 3; i++) {
        double bv = (a[i] * ux + b[i] * tx) * uy + (c[i] * ux + d[i] * tx) * ty; bv = bv * g; if (bv > 255) bv = 255;
        int av = p[i]; p[i] = (u8)(255 - (((int)((255 - av) * (255 - bv))) >> 8));
      }
    }
  }
}
/* color matrix (m: 9 doubles), warmth, curve (lut), optional vignette. Two pixels per step in pairs of doubles, the same operations in the same
 * order as the scalar form ((m0 r + m1 g) + m2 b) + wr, so the same doubles and bytes. */
static inline void grade1(u8* p, const double* m, const u8* lut, double wr, int vig, double x, double y, double inv, double vs) {
  double r = p[0], g = p[1], b = p[2];
  double nr = m[0] * r + m[1] * g + m[2] * b + wr, ng = m[3] * r + m[4] * g + m[5] * b, nb = m[6] * r + m[7] * g + m[8] * b - wr;
  nr = lut[nr < 0 ? 0 : nr > 255 ? 255 : (int)nr]; ng = lut[ng < 0 ? 0 : ng > 255 ? 255 : (int)ng]; nb = lut[nb < 0 ? 0 : nb > 255 ? 255 : (int)nb];
  if (vig) { double d = (x * x + y * y) * inv, k2 = 1 - vs * d * d; nr *= k2; ng *= k2; nb *= k2; }
  p[0] = (u8)clamp8(nr); p[1] = (u8)clamp8(ng); p[2] = (u8)clamp8(nb);
}
void grade(u8* px, int w, int h, const double* m, const u8* lut, double wr, int vig, double cx, double cy, double inv, double vs) {
  v128_t M0 = wasm_f64x2_splat(m[0]), M1 = wasm_f64x2_splat(m[1]), M2 = wasm_f64x2_splat(m[2]), M3 = wasm_f64x2_splat(m[3]), M4 = wasm_f64x2_splat(m[4]), M5 = wasm_f64x2_splat(m[5]);
  v128_t M6 = wasm_f64x2_splat(m[6]), M7 = wasm_f64x2_splat(m[7]), M8 = wasm_f64x2_splat(m[8]), WR = wasm_f64x2_splat(wr), Z = wasm_f64x2_splat(0), F = wasm_f64x2_splat(255);
  v128_t ONE = wasm_f64x2_splat(1), VS = wasm_f64x2_splat(vs), INV = wasm_f64x2_splat(inv);
  if (vig) { u8* p = px; for (int yi = 0; yi < h; yi++) for (int xi = 0; xi < w; xi++, p += 4) grade1(p, m, lut, wr, 1, xi - cx, yi - cy, inv, vs); return; }   /* vignette: the scalar form was faster */
  for (int yi = 0; yi < h; yi++) {
    u8* p = px + yi * w * 4; double y = yi - cy; v128_t YY = wasm_f64x2_splat(y * y);
    int xi = 0;
    for (; xi + 2 <= w; xi += 2, p += 8) {
      v128_t q = wasm_u16x8_extend_low_u8x16(wasm_v128_load64_zero(p));          /* r0 g0 b0 a0 r1 g1 b1 a1 as 16-bit */
      v128_t lo = wasm_u32x4_extend_low_u16x8(q), hi = wasm_u32x4_extend_high_u16x8(q);
      v128_t R = wasm_f64x2_convert_low_i32x4(wasm_i32x4_shuffle(lo, hi, 0, 4, 0, 4));
      v128_t G = wasm_f64x2_convert_low_i32x4(wasm_i32x4_shuffle(lo, hi, 1, 5, 1, 5));
      v128_t B = wasm_f64x2_convert_low_i32x4(wasm_i32x4_shuffle(lo, hi, 2, 6, 2, 6));
      v128_t nr = wasm_f64x2_add(wasm_f64x2_add(wasm_f64x2_add(wasm_f64x2_mul(M0, R), wasm_f64x2_mul(M1, G)), wasm_f64x2_mul(M2, B)), WR);
      v128_t ng = wasm_f64x2_add(wasm_f64x2_add(wasm_f64x2_mul(M3, R), wasm_f64x2_mul(M4, G)), wasm_f64x2_mul(M5, B));
      v128_t nb = wasm_f64x2_sub(wasm_f64x2_add(wasm_f64x2_add(wasm_f64x2_mul(M6, R), wasm_f64x2_mul(M7, G)), wasm_f64x2_mul(M8, B)), WR);
      /* index: below 0 -> 0, above 255 -> 255, else truncate (the same as clamping first, then truncating) */
      v128_t ir = wasm_i32x4_trunc_sat_f64x2_zero(wasm_f64x2_min(wasm_f64x2_max(nr, Z), F));
      v128_t ig = wasm_i32x4_trunc_sat_f64x2_zero(wasm_f64x2_min(wasm_f64x2_max(ng, Z), F));
      v128_t ib = wasm_i32x4_trunc_sat_f64x2_zero(wasm_f64x2_min(wasm_f64x2_max(nb, Z), F));
      int r0 = lut[wasm_i32x4_extract_lane(ir, 0)], r1 = lut[wasm_i32x4_extract_lane(ir, 1)];
      int g0 = lut[wasm_i32x4_extract_lane(ig, 0)], g1 = lut[wasm_i32x4_extract_lane(ig, 1)];
      int b0 = lut[wasm_i32x4_extract_lane(ib, 0)], b1 = lut[wasm_i32x4_extract_lane(ib, 1)];
      if (!vig) { p[0] = (u8)r0; p[1] = (u8)g0; p[2] = (u8)b0; p[4] = (u8)r1; p[5] = (u8)g1; p[6] = (u8)b1; continue; }   /* a table byte through clamp8 is itself */
      double x0 = xi - cx, x1 = xi + 1 - cx;
      v128_t X = wasm_f64x2_make(x0, x1);
      v128_t d = wasm_f64x2_mul(wasm_f64x2_add(wasm_f64x2_mul(X, X), YY), INV);
      v128_t k2 = wasm_f64x2_sub(ONE, wasm_f64x2_mul(wasm_f64x2_mul(VS, d), d));
      v128_t vr = wasm_f64x2_mul(wasm_f64x2_make(r0, r1), k2), vg = wasm_f64x2_mul(wasm_f64x2_make(g0, g1), k2), vb = wasm_f64x2_mul(wasm_f64x2_make(b0, b1), k2);
      vr = wasm_i32x4_trunc_sat_f64x2_zero(wasm_f64x2_min(wasm_f64x2_max(wasm_f64x2_nearest(vr), Z), F));
      vg = wasm_i32x4_trunc_sat_f64x2_zero(wasm_f64x2_min(wasm_f64x2_max(wasm_f64x2_nearest(vg), Z), F));
      vb = wasm_i32x4_trunc_sat_f64x2_zero(wasm_f64x2_min(wasm_f64x2_max(wasm_f64x2_nearest(vb), Z), F));
      p[0] = (u8)wasm_i32x4_extract_lane(vr, 0); p[1] = (u8)wasm_i32x4_extract_lane(vg, 0); p[2] = (u8)wasm_i32x4_extract_lane(vb, 0);
      p[4] = (u8)wasm_i32x4_extract_lane(vr, 1); p[5] = (u8)wasm_i32x4_extract_lane(vg, 1); p[6] = (u8)wasm_i32x4_extract_lane(vb, 1);
    }
    for (; xi < w; xi++, p += 4) grade1(p, m, lut, wr, vig, xi - cx, y, inv, vs);
  }
}
