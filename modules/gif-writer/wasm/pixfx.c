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

/* rows then columns, running sums, edge pixel repeated; sums is w*4 ints of scratch */
void blur(const u8* src, u8* dst, u8* tmp, int w, int h, int r, int* sums) {
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
static inline int clamp8(double v) { v = __builtin_rint(v); return v < 0 ? 0 : v > 255 ? 255 : (int)v; }   /* a Uint8ClampedArray store: nearest, ties to even, clamped */
/* px[i] = px[i] + amt * (px[i] - blurred[i]) for the color bytes */
void unsharp(u8* px, const u8* bl, int n4, double amt) { int i; for (i = 0; i < n4; i++) if ((i & 3) != 3) px[i] = (u8)clamp8(px[i] + amt * (px[i] - bl[i])); }
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
/* bilinear blow-up of the blurred glow, screen-blended onto the picture */
void glow_up(u8* px, const u8* sb, int w, int h, int sw, int sh, double g) {
  int xx, yy, i;
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
}
/* color matrix (m: 9 doubles), warmth, curve (lut), optional vignette */
void grade(u8* px, int w, int h, const double* m, const u8* lut, double wr, int vig, double cx, double cy, double inv, double vs) {
  int n = w * h, i, xi = 0, yi = 0; u8* p = px;
  for (i = 0; i < n; i++, p += 4) {
    double r = p[0], g = p[1], b = p[2];
    double nr = m[0] * r + m[1] * g + m[2] * b + wr, ng = m[3] * r + m[4] * g + m[5] * b, nb = m[6] * r + m[7] * g + m[8] * b - wr;
    nr = lut[nr < 0 ? 0 : nr > 255 ? 255 : (int)nr]; ng = lut[ng < 0 ? 0 : ng > 255 ? 255 : (int)ng]; nb = lut[nb < 0 ? 0 : nb > 255 ? 255 : (int)nb];
    if (vig) { double x = xi - cx, y = yi - cy, d = (x * x + y * y) * inv, k2 = 1 - vs * d * d; nr *= k2; ng *= k2; nb *= k2; }
    p[0] = (u8)clamp8(nr); p[1] = (u8)clamp8(ng); p[2] = (u8)clamp8(nb);
    if (++xi == w) { xi = 0; yi++; }
  }
}
