/* Copyright (c) 2026 LFC Foundry. MIT License.
 * gpu-blur WebAssembly kernel: a picture blur made of three box passes along each axis (a close Gaussian), RGBA8, one pixel per 128-bit lane
 * group. Every pass keeps a running sum, so the work does not grow with the radius. Integers only inside the sums, so the result is exact:
 * out = floor(sum / n + 0.5) with n = 2 * b + 1, edges repeat the border pixel at every pass. gpu-blur.js has a plain JavaScript twin that gives
 * the same bytes; tests compare them.
 *
 * Two exports, so the caller can cut the job into short slices:
 *   hrows(A, B, rowA, rowB, w, y0, y1, b)           rows y0..y1-1: three horizontal passes, picture A -> picture B (rows are independent)
 *   vcols(B, A, stA, stB, col, w, h, x0, x1, b)     columns x0..x1-1 (at most 16): three vertical passes, picture B -> picture A
 * rowA and rowB are scratch rows (w * 4 bytes each); stA and stB are scratch strips (h * 16 * 4 bytes each); col is 16 * 16 bytes.
 * Build: sh wasm/build.sh   (clang 18 or newer with the wasm32 target; no fast-math, no fused multiply-add).
 */
#include <wasm_simd128.h>
typedef unsigned char u8;

static inline v128_t ldi(const u8 *p) { /* 4 bytes -> i32x4 */
  v128_t v = wasm_v128_load32_zero(p);
  v = wasm_u16x8_extend_low_u8x16(v);
  return wasm_u32x4_extend_low_u16x8(v);
}
static inline void sti(u8 *p, v128_t sum, v128_t inv) { /* i32x4 -> 4 bytes, round to nearest */
  v128_t f = wasm_f32x4_add(wasm_f32x4_mul(wasm_f32x4_convert_i32x4(sum), inv), wasm_f32x4_splat(0.5f));
  v128_t r = wasm_i32x4_trunc_sat_f32x4(f);
  r = wasm_u16x8_narrow_i32x4(r, r);
  r = wasm_u8x16_narrow_i16x8(r, r);
  *(int *)p = wasm_i32x4_extract_lane(r, 0);
}

/* one box pass along a row of n pixels */
static void box_row(const u8 *s, u8 *d, int n, int b, v128_t inv) {
  v128_t sum = wasm_i32x4_mul(ldi(s), wasm_i32x4_splat(b + 1));
  for (int t = 1; t <= b; t++) sum = wasm_i32x4_add(sum, ldi(s + (long)(t < n ? t : n - 1) * 4));
  for (int x = 0; x < n; x++) {
    sti(d + (long)x * 4, sum, inv);
    int a = x + b + 1; if (a > n - 1) a = n - 1;
    int c = x - b; if (c < 0) c = 0;
    sum = wasm_i32x4_add(sum, wasm_i32x4_sub(ldi(s + (long)a * 4), ldi(s + (long)c * 4)));
  }
}

/* one box pass down a strip of sw pixel columns, n rows; ss and ds are the bytes between rows of source and destination */
static void box_strip(const u8 *s, long ss, u8 *d, long ds, int sw, int n, int b, v128_t inv, v128_t *col) {
  for (int x = 0; x < sw; x++) {
    v128_t sum = wasm_i32x4_mul(ldi(s + (long)x * 4), wasm_i32x4_splat(b + 1));
    for (int t = 1; t <= b; t++) sum = wasm_i32x4_add(sum, ldi(s + (long)(t < n ? t : n - 1) * ss + (long)x * 4));
    col[x] = sum;
  }
  for (int y = 0; y < n; y++) {
    int a = y + b + 1; if (a > n - 1) a = n - 1;
    int c = y - b; if (c < 0) c = 0;
    const u8 *ra = s + (long)a * ss, *rc = s + (long)c * ss; u8 *rd = d + (long)y * ds;
    for (int x = 0; x < sw; x++) {
      v128_t v = col[x];
      sti(rd + (long)x * 4, v, inv);
      col[x] = wasm_i32x4_add(v, wasm_i32x4_sub(ldi(ra + (long)x * 4), ldi(rc + (long)x * 4)));
    }
  }
}

__attribute__((export_name("hrows"))) void hrows(const u8 *A, u8 *B, u8 *rowA, u8 *rowB, int w, int y0, int y1, int b) {
  v128_t inv = wasm_f32x4_splat(1.0f / (float)(2 * b + 1));
  for (int y = y0; y < y1; y++) {
    box_row(A + (long)y * w * 4, rowA, w, b, inv);
    box_row(rowA, rowB, w, b, inv);
    box_row(rowB, B + (long)y * w * 4, w, b, inv);
  }
}

__attribute__((export_name("vcols"))) void vcols(const u8 *B, u8 *A, u8 *stA, u8 *stB, v128_t *col, int w, int h, int x0, int x1, int b) {
  v128_t inv = wasm_f32x4_splat(1.0f / (float)(2 * b + 1));
  int sw = x1 - x0; long sb = (long)sw * 4;
  box_strip(B + (long)x0 * 4, (long)w * 4, stA, sb, sw, h, b, inv, col);
  box_strip(stA, sb, stB, sb, sw, h, b, inv, col);
  box_strip(stB, sb, A + (long)x0 * 4, (long)w * 4, sw, h, b, inv, col);
}
