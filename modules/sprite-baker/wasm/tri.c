/* sprite-baker wasm fill kernel (experiment). Same arithmetic as sprite-baker.js tri()/triUV(), operation for operation, no fused multiply-add,
   no fast-math. Math.pow and Math.cos are imported from the page, except the two cheap cases below that are computed here and
   guarded: results within 1e-8 of a rounding edge are redone with the page's own functions, as the JS does for the highlight. */
/* Lean builds: -DNO_TEXTURE leaves the picture-on-the-surface code out, -DNO_RIDGE the ridge lines (and the cosine). features() tells the glue which parts this file has. */
#ifdef NO_TEXTURE
#define HAS_TEXTURE 0
#else
#define HAS_TEXTURE 1
#endif
#ifdef NO_RIDGE
#define HAS_RIDGE 0
#else
#define HAS_RIDGE 1
#endif
typedef unsigned long long u64;
typedef unsigned int u32;
typedef unsigned char u8;
#define IMP(n) __attribute__((import_module("env"), import_name(n)))
IMP("pow") double js_pow(double, double);
IMP("cos") double js_cos(double);

typedef struct {
  double lx, ly, lz, hx, hy, hz, kSpec, kBounce, kPool, kRim, kEdge, cull;
  double rF, rDark, rScale, rLit, rAdd, sBase, sWrap, vWrap;
  int w, h, ridge, hasLit, tex, uClamp, tw, th;
  u32 lut, td, z, px;
} Job;

#define MIN(p, q) ((p) < (q) ? (p) : (q))
#define MAX(p, q) ((p) > (q) ? (p) : (q))
#define INL static inline __attribute__((always_inline))

/* musl fmod (MIT): exact, same as JavaScript's % */
static double fmod_(double x, double y) {
  union { double f; u64 i; } ux = {x}, uy = {y};
  int ex = ux.i >> 52 & 0x7ff, ey = uy.i >> 52 & 0x7ff, sx = ux.i >> 63; u64 i;
  if (uy.i << 1 == 0 || y != y || ex == 0x7ff) return (x * y) / (x * y);
  if (ux.i << 1 <= uy.i << 1) { if (ux.i << 1 == uy.i << 1) return 0 * x; return x; }
  if (!ex) { for (i = ux.i << 12; i >> 63 == 0; ex--, i <<= 1) {} ux.i <<= -ex + 1; } else { ux.i &= -1ULL >> 12; ux.i |= 1ULL << 52; }
  if (!ey) { for (i = uy.i << 12; i >> 63 == 0; ey--, i <<= 1) {} uy.i <<= -ey + 1; } else { uy.i &= -1ULL >> 12; uy.i |= 1ULL << 52; }
  for (; ex > ey; ex--) { i = ux.i - uy.i; if (i >> 63 == 0) { if (i == 0) return 0 * x; ux.i = i; } ux.i <<= 1; }
  i = ux.i - uy.i; if (i >> 63 == 0) { if (i == 0) return 0 * x; ux.i = i; }
  for (; ux.i >> 52 == 0; ux.i <<= 1, ex--) {}
  if (ex > 0) { ux.i -= 1ULL << 52; ux.i |= (u64)ex << 52; } else { ux.i >>= -ex + 1; }
  ux.i |= (u64)sx << 63;
  return ux.f;
}
INL double jsmod(double a, double m) { /* a % m for m > 0 */
  if (a >= 0 && a < m) return a;
  if (a >= m && a < 2 * m) return a - m;
  return fmod_(a, m);
}

/* cos by fdlibm kernels, |x| below 1e5, error under 1e-15; caller guards the near-threshold cases */
INL double cos_(double x) {
  const double inv = 6.36619772367581382433e-01, p1 = 1.57079632673412561417e+00, p1t = 6.07710050650619224932e-11;
  double n = __builtin_rint(x * inv), y = (x - n * p1) - n * p1t, z = y * y, v;
  int q = ((int)n) & 3;
  if (q & 1) {
    double r;
    r = 8.33333333332248946124e-03 + z * (-1.98412698298579493134e-04 + z * (2.75573137070700676789e-06 + z * (-2.50507602534068634195e-08 + z * 1.58969099521155010221e-10)));
    v = z * y;
    v = y + v * (-1.66666666666666324348e-01 + z * r);
    return (q == 1) ? -v : v;
  } else {
    double r = z * z * (4.16666666666666019037e-02 + z * (-1.38888888888741095749e-03 + z * (2.48015872894767294178e-05 + z * (-2.75573143513906633035e-07 + z * (2.08757232129817482790e-09 + z * -1.13596475577881948265e-11)))));
    v = 1.0 - 0.5 * z + r;
    return (q == 0) ? v : -v;
  }
}

/* x^2.2 for x in (0, 1]: exp(2.2 ln x), relative error under 1e-13 */
INL double pow22(double x) {
  union { double f; u64 i; } u = {x};
  int e = (int)((u.i >> 52) & 0x7ff) - 1023;
  u.i = (u.i & 0x000fffffffffffffULL) | 0x3ff0000000000000ULL;
  double m = u.f;
  if (m > 1.4142135623730951) { m *= 0.5; e++; }
  double s = (m - 1) / (m + 1), s2 = s * s;
  double ln = 2 * s * (1 + s2 * (1.0 / 3 + s2 * (1.0 / 5 + s2 * (1.0 / 7 + s2 * (1.0 / 9 + s2 * (1.0 / 11 + s2 * (1.0 / 13 + s2 * (1.0 / 15 + s2 * (1.0 / 17 + s2 * (1.0 / 19))))))))));
  double L = ln + e * 6.93147180559945286227e-01 + e * 2.319046813846299558e-17;
  double y = 2.2 * L, k = __builtin_rint(y * 1.44269504088896338700);
  double r = (y - k * 6.93147180369123816490e-01) - k * 1.90821492927058770002e-10;
  double p = 1 + r * (1 + r * (1.0 / 2 + r * (1.0 / 6 + r * (1.0 / 24 + r * (1.0 / 120 + r * (1.0 / 720 + r * (1.0 / 5040 + r * (1.0 / 40320 + r * (1.0 / 362880 + r * (1.0 / 3628800 + r * (1.0 / 39916800 + r * (1.0 / 479001600))))))))))));
  union { double f; u64 i; } sc = {0};
  sc.i = (u64)((long long)k + 1023) << 52;
  return p * sc.f;
}

INL u8 clamp8(double v) { return v <= 0 ? 0 : v >= 255 ? 255 : (u8)__builtin_rint(v); }

INL void fill_tri(const Job *J, const double *a, const double *b, const double *c, const int uv) {
  const int w = J->w, h = J->h;
  float *zbuf = (float *)J->z; u8 *out = (u8 *)J->px; const u8 *lut = (const u8 *)J->lut, *td = (const u8 *)J->td;
  const double x0 = a[0], y0 = a[1], x1 = b[0], y1 = b[1], x2 = c[0], y2 = c[1];
  const double area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (area == 0 || !(area - area == 0)) return;
  double mnx = MIN(MIN(x0, x1), x2), mxx = MAX(MAX(x0, x1), x2);
  double mny = MIN(MIN(y0, y1), y2), mxy = MAX(MAX(y0, y1), y2);
  double fminx = __builtin_floor(mnx), fminy = __builtin_floor(mny);
  int minx = fminx > 0 ? (int)fminx : 0, miny = fminy > 0 ? (int)fminy : 0;
  double cmx = __builtin_ceil(mxx), cmy = __builtin_ceil(mxy);
  int maxx = cmx < w - 1 ? (int)cmx : w - 1, maxy = cmy < h - 1 ? (int)cmy : h - 1;
  const double inv = 1 / area;
  const double lx = J->lx, ly = J->ly, lz = J->lz, hx = J->hx, hy = J->hy, hz = J->hz;
  const double kSpec = J->kSpec, kBounce = J->kBounce, kPool = J->kPool, kRim = J->kRim, kEdge = J->kEdge;
  const double a2 = a[2], b2 = b[2], c2 = c[2], a3 = a[3], b3 = b[3], c3 = c[3], a4 = a[4], b4 = b[4], c4 = c[4], a5 = a[5], b5 = b[5], c5 = c[5];
  const double a6 = uv ? a[6] : 0, b6 = uv ? b[6] : 0, c6 = uv ? c[6] : 0, a7 = uv ? a[7] : 0, b7 = uv ? b[7] : 0, c7 = uv ? c[7] : 0;
  const int tw = J->tw, th = J->th, T = HAS_TEXTURE && uv && J->tex, Rg = HAS_RIDGE && uv && J->ridge, hasLit = J->hasLit, uClamp = J->uClamp;
  const double rF = J->rF, rDark = J->rDark, rScale = J->rScale, rLit = J->rLit, rAdd = J->rAdd, sBase = J->sBase, sWrap = J->sWrap, vWrap = J->vWrap;
  int x, y;
  for (y = miny; y <= maxy; y++) {
    const double py = y + 0.5, dy0 = y0 - py, dy1 = y1 - py, dy2 = y2 - py;
    for (x = minx; x <= maxx; x++) {
      const double px = x + 0.5;
      const double w0 = ((x1 - px) * dy2 - (x2 - px) * dy1) * inv;
      const double w1 = ((x2 - px) * dy0 - (x0 - px) * dy2) * inv;
      const double w2 = 1 - w0 - w1;
      if (w0 < -1e-5 || w1 < -1e-5 || w2 < -1e-5) continue;
      double z = w0 * a2 + w1 * b2 + w2 * c2;
      if (!(z - z == 0)) continue;
      const int idx = y * w + x;
      if (z <= zbuf[idx]) continue;
      zbuf[idx] = (float)z;
      double nx = w0 * a3 + w1 * b3 + w2 * c3, ny = w0 * a4 + w1 * b4 + w2 * c4, nz = w0 * a5 + w1 * b5 + w2 * c5;
      const double l = 1 / __builtin_sqrt(nx * nx + ny * ny + nz * nz + 1e-9);
      nx *= l; ny *= l; nz *= l;
      const double wrap = (nx * lx + ny * ly + nz * lz) * 0.5 + 0.5;
      double t = wrap * wrap * 0.35 + wrap * 0.65;
      const double rim = nx * 0.5 + ny * 0.72 + nz * 0.2;
      t = t * 0.9 + (rim > 0 ? rim * kBounce : 0);
      double sp = nx * 0.55 + ny * 0.8;
      if (sp > 0.25) t -= (sp - 0.25) * kPool;
      sp = nx * hx + ny * hy + nz * hz;
      const int hot = sp > 0;
      double sq;
      if (hot) {
        double p2 = sp * sp, p4 = p2 * p2, p8 = p4 * p4, p16 = p8 * p8, p32 = p16 * p16, p64 = p32 * p32, p128 = p64 * p64;
        sq = (p16 * 0.55 + p64 * p32 * p8 * p4 * p2 * 0.55 + p128 * p128 * p64 * p32 * p16 * p8 * p4 * 0.5) * kSpec;
      } else sq = 0;
      if (Rg) {
        const double tv = w0 * a7 + w1 * b7 + w2 * c7, arg = rF * tv;
        double rd;
        if (!(arg > -1e5 && arg < 1e5)) rd = js_cos(arg);
        else {
          rd = cos_(arg);
          if (__builtin_fabs(rd - rDark) < 1e-9 || (hasLit && __builtin_fabs(rd - rLit) < 1e-9)) rd = js_cos(arg);
        }
        if (rd < rDark) t *= rScale; else if (hasLit && rd > rLit) t += rAdd;
      }
      if (nz < 0.34) t *= kEdge + (1 - kEdge) * (nz > 0 ? nz : 0) / 0.34;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const int i3 = ((int)(t * 255)) * 3;
      double r = lut[i3], g = lut[i3 + 1], bl = lut[i3 + 2], dmp = 1;
      if (T) {
        const double tu = w0 * a6 + w1 * b6 + w2 * c6, tv2 = w0 * a7 + w1 * b7 + w2 * c7;
        double tx = uClamp ? MIN(tw - 1.001, MAX(0, tu * tw - 0.5)) : jsmod(jsmod(tu * tw - 0.5, tw) + tw, tw);
        double ty = jsmod(jsmod((tv2 / vWrap) * th - 0.5, th) + th, th);
        const int x0i = (int)tx, y0i = (int)ty;
        const double fx = tx - x0i, fy = ty - y0i;
        const int y1i = (y0i + 1) % th;
        const int i00 = (y0i * tw + x0i) * 4, i10 = uClamp ? i00 + 4 : (y0i * tw + (x0i + 1) % tw) * 4, i01 = (y1i * tw + x0i) * 4, i11 = uClamp ? i01 + 4 : (y1i * tw + (x0i + 1) % tw) * 4;
        const double w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        const double aa = td[i00 + 3] * w00 + td[i10 + 3] * w10 + td[i01 + 3] * w01 + td[i11 + 3] * w11, al = aa / 255;
        if (al > 0) {
          double tr, tg, tb;
          if (aa < 1) { tr = tg = tb = 0; }
          else {
            tr = (td[i00] * td[i00 + 3] * w00 + td[i10] * td[i10 + 3] * w10 + td[i01] * td[i01 + 3] * w01 + td[i11] * td[i11 + 3] * w11) / aa;
            tg = (td[i00 + 1] * td[i00 + 3] * w00 + td[i10 + 1] * td[i10 + 3] * w10 + td[i01 + 1] * td[i01 + 3] * w01 + td[i11 + 1] * td[i11 + 3] * w11) / aa;
            tb = (td[i00 + 2] * td[i00 + 3] * w00 + td[i10 + 2] * td[i10 + 3] * w10 + td[i01 + 2] * td[i01 + 3] * w01 + td[i11 + 2] * td[i11 + 3] * w11) / aa;
          }
          const double shade = sBase + sWrap * wrap;
          r = r * (1 - al) + tr * shade * al; g = g * (1 - al) + tg * shade * al; bl = bl * (1 - al) + tb * shade * al;
          dmp = tr > 200 && tg < 90 ? 0.55 : 1 - al * 0.8;
        }
      }
      const int edOn = nx > 0 && nz < 0.8;
      double ed = edOn ? nx * pow22(1 - (nz > 0 ? nz : 0)) * kRim : 0;
      const int o = idx * 4;
      double v0, v1, v2;
      if (uv) { sq *= dmp; v0 = r + (sq * 255 + ed * 255); v1 = g + (sq * 255 + ed * 255); v2 = bl + (sq * 235 + ed * 255); }
      else { v0 = r + sq * 255 + ed * 255; v1 = g + sq * 255 + ed * 255; v2 = bl + sq * 235 + ed * 255; }
      if ((hot || edOn) && (__builtin_fabs(v0 - __builtin_floor(v0) - 0.5) < 1e-8 || __builtin_fabs(v1 - __builtin_floor(v1) - 0.5) < 1e-8 || __builtin_fabs(v2 - __builtin_floor(v2) - 0.5) < 1e-8)) {
        if (hot) sq = (js_pow(sp, 16) * 0.55 + js_pow(sp, 110) * 0.55 + js_pow(sp, 380) * 0.5) * kSpec;
        if (hot && uv) sq *= dmp;
        if (edOn) ed = nx * js_pow(1 - (nz > 0 ? nz : 0), 2.2) * kRim;
        if (uv) { v0 = r + (sq * 255 + ed * 255); v1 = g + (sq * 255 + ed * 255); v2 = bl + (sq * 235 + ed * 255); }
        else { v0 = r + sq * 255 + ed * 255; v1 = g + sq * 255 + ed * 255; v2 = bl + sq * 235 + ed * 255; }
      }
      out[o] = clamp8(v0); out[o + 1] = clamp8(v1); out[o + 2] = clamp8(v2); out[o + 3] = 255;
    }
  }
}

INL int finite_sum(const double *a, const double *b, const double *c, int n) {
  double s = a[0] + a[1] + a[2] + a[3] + a[4] + a[5] + b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + c[0] + c[1] + c[2] + c[3] + c[4] + c[5];
  if (n > 6) s += 0; /* the JS adds the two picture coordinates in a separate check */
  return s - s == 0;
}

static void one(const Job *J, const double *a, const double *b, const double *c, int stride) {
  if (J->cull == J->cull && a[5] + b[5] + c[5] < J->cull) return;
  if (!finite_sum(a, b, c, stride)) return;
  if (stride > 7 && (J->tex || J->ridge)) {
    double s = a[6] + a[7] + b[6] + b[7] + c[6] + c[7];
    if (!(s - s == 0)) return;
    fill_tri(J, a, b, c, 1);
  } else fill_tri(J, a, b, c, 0);
}

/* fill n triangles; tris holds 3 vertices each, `stride` numbers per vertex (6 plain, 8 with u and v) */
void fill(const Job *J, const double *tris, int n, int stride) {
  int i;
  for (i = 0; i < n; i++) { const double *a = tris + i * 3 * stride; one(J, a, a + stride, a + 2 * stride, stride); }
}

/* fill a grid of (nu + 1) x (nv + 1) vertices as quads, two triangles each (a,b,c then a,c,d), the way drawMesh does */
void fill_mesh(const Job *J, const double *V, int nu, int nv, int stride) {
  int cols = nv + 1, i, j;
  for (i = 0; i < nu; i++) for (j = 0; j < nv; j++) {
    const double *a = V + (i * cols + j) * stride, *b = V + ((i + 1) * cols + j) * stride, *c = V + ((i + 1) * cols + j + 1) * stride, *d = V + (i * cols + j + 1) * stride;
    one(J, a, b, c, stride); one(J, a, c, d, stride);
  }
}

/* outline: the same arithmetic as outline() in sprite-baker.js, operation for operation. src and data are w * h RGBA pixels, offX/offY hold nOff whole-pixel offsets (the JavaScript
   makes them), c0..c2 are the outline color as doubles. Rounding is half to even, like a Uint8ClampedArray store. */
static inline u8 q8(double v) { v = __builtin_rint(v); return (u8)(v < 0 ? 0 : v > 255 ? 255 : v); }
void outline(const u8 *src, u8 *data, int w, int h, const int *offX, const int *offY, int nOff, double c0, double c1, double c2) {
  int x, y, k;
  for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
    int o = (y * w + x) << 2, sa = src[o + 3], oa = 0;
    double ra;
    if (sa != 255) {
      for (k = 0; k < nOff; k++) {
        int dx = x - offX[k], dy = y - offY[k], ox;
        if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue;
        ox = src[((dy * w + dx) << 2) + 3];
        if (ox > oa) { oa = ox; if (oa == 255) break; }
      }
    }
    ra = sa + (double)(oa * (255 - sa)) / 255.0;
    if (ra > 0) {
      double bk = (double)(255 - sa);
      data[o] = q8((src[o] * (double)sa + c0 * (double)oa * bk / 255.0) / ra);
      data[o + 1] = q8((src[o + 1] * (double)sa + c1 * (double)oa * bk / 255.0) / ra);
      data[o + 2] = q8((src[o + 2] * (double)sa + c2 * (double)oa * bk / 255.0) / ra);
      data[o + 3] = q8(ra);
    } else { data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 0; }
  }
}

/* bit 0: has the texture code, bit 1: has the ridge code */
int features(void) { return HAS_TEXTURE | (HAS_RIDGE << 1); }
