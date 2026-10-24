/* stage-curtains velvet pixel loop (WebAssembly). Copyright (c) 2026 LFC Foundry. MIT License.
 * The same arithmetic, in the same order, as the row() loop of velvetPainter in ../stage-curtains.js (no fused multiply-add, no fast-math), so every pixel byte is
 * the same. What wasm cannot repeat bit for bit stays in JavaScript and arrives as tables: the per-row light, fan and wobble (sin and pow) and the leading-edge
 * factor of each column (sin and pow). No libm, no allocation: the caller passes every table by address, and `out` receives rows y0 .. y1 - 1 packed from its start.
 *
 * Tables (f64): hgt[n], T85[n], T6[n], THEM[n], TSL[n], crAt[ncr], crW2[ncr], edge[cw], grain[64 * 64], rows[3 * ch] (light, fan, wob per row),
 * aux[6 * n + 2 * cw]: per fold column ui six values (hem = ch - THEM[ui], the shade T85 * TSL (already lifted), T6, the gold base 0.5 + 0.6 * hgt, a crease flag, 0),
 * then per canvas column two values (X = c2 / k, ed = 1 - X / PW). All of them are the very same expressions row() evaluates, only computed once per column instead of once per pixel.
 * prm (f64): 0 PW, 1 k, 2 ch, 3 warm, 4 B0, 5 B1, 6 B2, 7 grain amount, 8 lift (0 or 1, folded into aux), 9 stepped (0 or 1). */
typedef unsigned char u8;
typedef unsigned int u32;

/* JavaScript's Math.round: halves go up. (Not floor(x + 0.5), which differs for 0.49999999999999994.) */
static inline double jsround(double x) { double f = __builtin_floor(x); return (x - f >= 0.5) ? f + 1 : f; }
/* what assigning a double to a Uint8ClampedArray element does: NaN and below 1/2 give 0, above 255 gives 255, halves to even. The two clamps first, then the
 * add-and-subtract of 1.5 * 2^52 rounds half to even without a branch (the value is in 0 .. 255 by then), then a plain conversion. (NaN fails both compares, as in JavaScript: 0.) */
static inline u32 clamp8(double v) { v = v > 255 ? 255 : v; v = v > 0 ? v : 0; const double M = 6755399441055744.0; return (u32)(int)((v + M) - M); }

void paint(u8 *out, int cw, int ch, int y0, int y1, int n, int ncr,
           const double *hgt, const double *T85, const double *T6, const double *THEM, const double *TSL,
           const double *crAt, const double *crW2, const double *edge, const double *grain,
           const double *prm, const double *rows, const double *aux) {
  const double PW = prm[0], k = prm[1], warm = prm[3], B0 = prm[4], B1 = prm[5], B2 = prm[6], gam = prm[7];
  const int stepped = prm[9] != 0;
  const double *colt = aux + 6 * n;
  (void)hgt; (void)T85; (void)T6; (void)THEM; (void)TSL;
  for (int y = y0; y < y1; y++) {
    const double light = rows[3 * y], fan = rows[3 * y + 1], wob = rows[3 * y + 2];
    const double l5 = light > 0.5 ? light : 0.5;
    const double *grow = grain + (y & 63) * 64;
    u32 *orow = (u32 *)(out + (y - y0) * cw * 4);
    for (int c2 = 0; c2 < cw; c2++) {
      const double X = colt[2 * c2], ed = colt[2 * c2 + 1];
      const double u = PW - (PW - X) * fan + wob * ed + 2;
      int ui;   /* jsround(u) clamped to 1 .. n - 2, without the double round trip */
      if (u < 1.5) ui = 1; else if (u >= n - 1.5) ui = n - 2; else { const int f = (int)u; ui = f + (u - f >= 0.5); }
      const double *P = aux + 6 * ui;
      const double hem = P[0];
      u32 pv;
      if (y > hem + 1.5 * k) pv = 0xFF08080Eu;   /* dark floor under the hem: bytes 14, 8, 8, 255 */
      else {
        double sh = P[1];
        if (P[4] != 0) for (int ci = 0; ci < ncr; ci++) { const double d = __builtin_fabs(u - crAt[ci]); if (d < crW2[ci]) sh *= 0.55 + 0.45 * (d / crW2[ci]); }
        sh *= edge[c2];
        sh *= light * (1 + grow[c2 & 63] * gam);
        double R = B0 * sh * warm, G = B1 * sh, B = B2 * sh;
        const double sheen = P[2] * light;
        R += (255 - R) * sheen; G += (255 - G) * sheen * 0.7; B += (255 - B) * sheen * 0.5;
        if (y > hem - 2.5 * k) { const double gl = P[3] * l5; R = 231 * gl; G = 180 * gl; B = 58 * gl; }
        if (stepped) { R = jsround(R / 20) * 20; G = jsround(G / 20) * 20; B = jsround(B / 20) * 20; }
        pv = clamp8(R) | (clamp8(G) << 8) | (clamp8(B) << 16) | 0xFF000000u;
      }
      orow[c2] = pv;
    }
  }
}
