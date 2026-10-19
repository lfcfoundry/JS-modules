/* stage-curtains velvet pixel loop (WebAssembly). Copyright (c) 2026 LFC Foundry. MIT License.
 * The same arithmetic, in the same order, as the row() loop of velvetPainter in ../stage-curtains.js (no fused multiply-add, no fast-math), so every pixel byte is
 * the same. What wasm cannot repeat bit for bit stays in JavaScript and arrives as tables: the per-row light, fan and wobble (sin and pow) and the leading-edge
 * factor of each column (sin and pow). No libm, no allocation: the caller passes every table by address, and `out` receives rows y0 .. y1 - 1 packed from its start.
 *
 * Tables (f64): hgt[n], T85[n], T6[n], THEM[n], TSL[n], crAt[ncr], crW2[ncr], edge[cw], grain[64 * 64], rows[3 * ch] (light, fan, wob per row).
 * prm (f64): 0 PW, 1 k, 2 ch, 3 warm, 4 B0, 5 B1, 6 B2, 7 grain amount, 8 lift (0 or 1), 9 stepped (0 or 1). */
typedef unsigned char u8;
#define FN(x) __builtin_rint(x)

/* JavaScript's Math.round: halves go up. (Not floor(x + 0.5), which differs for 0.49999999999999994.) */
static inline double jsround(double x) { double f = __builtin_floor(x); return (x - f >= 0.5) ? f + 1 : f; }
/* what assigning a double to a Uint8ClampedArray element does: NaN and below 1/2 give 0, above 255 gives 255, halves to even */
static inline u8 clamp8(double v) { return (u8)(v > 255 ? 255 : (v > 0 ? FN(v) : 0)); }

void paint(u8 *out, int cw, int ch, int y0, int y1, int n, int ncr,
           const double *hgt, const double *T85, const double *T6, const double *THEM, const double *TSL,
           const double *crAt, const double *crW2, const double *edge, const double *grain,
           const double *prm, const double *rows) {
  const double PW = prm[0], k = prm[1], warm = prm[3], B0 = prm[4], B1 = prm[5], B2 = prm[6], gam = prm[7];
  const int lift = prm[8] != 0, stepped = prm[9] != 0;
  for (int y = y0; y < y1; y++) {
    const double light = rows[3 * y], fan = rows[3 * y + 1], wob = rows[3 * y + 2];
    for (int c2 = 0; c2 < cw; c2++) {
      const int o = ((y - y0) * cw + c2) * 4;
      const double X = c2 / k;
      const double ed = 1 - X / PW;
      const double u = PW - (PW - X) * fan + wob * ed + 2;
      const double ru = jsround(u);
      const int ui = ru < 1 ? 1 : (ru > n - 2 ? n - 2 : (int)ru);
      const double hem = ch - THEM[ui];
      if (y > hem + 1.5 * k) { out[o] = 14; out[o + 1] = 8; out[o + 2] = 8; out[o + 3] = 255; continue; }
      double sh = T85[ui] * TSL[ui];
      if (lift) sh = 0.34 + sh * 0.66;
      for (int ci = 0; ci < ncr; ci++) { const double d = __builtin_fabs(u - crAt[ci]); if (d < crW2[ci]) sh *= 0.55 + 0.45 * (d / crW2[ci]); }
      sh *= edge[c2];
      sh *= light * (1 + grain[(y & 63) * 64 + (c2 & 63)] * gam);
      double R = B0 * sh * warm, G = B1 * sh, B = B2 * sh;
      const double sheen = T6[ui] * light;
      R += (255 - R) * sheen; G += (255 - G) * sheen * 0.7; B += (255 - B) * sheen * 0.5;
      if (y > hem - 2.5 * k) { const double gl = (0.5 + 0.6 * hgt[ui]) * (light > 0.5 ? light : 0.5); R = 231 * gl; G = 180 * gl; B = 58 * gl; }
      if (stepped) { R = jsround(R / 20) * 20; G = jsround(G / 20) * 20; B = jsround(B / 20) * 20; }
      out[o] = clamp8(R); out[o + 1] = clamp8(G); out[o + 2] = clamp8(B); out[o + 3] = 255;
    }
  }
}
