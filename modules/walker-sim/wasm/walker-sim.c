/* Copyright (c) 2026 LFC Foundry. MIT License.
 * The inner loop of walker-sim for the common case (fixed weights, one start, no costs), in plain C compiled to WebAssembly.
 * It does exactly what the JavaScript loop in walker-sim.js does with the same random numbers, so the counts never differ. */
typedef unsigned char u8; typedef unsigned int u32; typedef int i32; typedef double f64;
#define EXPORT __attribute__((visibility("default")))
EXPORT i32 walk(u32 count, i32 start, i32 s0, i32 cap, const i32 *os, const f64 *cumN, const i32 *tg, const u8 *halt, const u8 *lut,
                f64 *moves, f64 *tab, const i32 *epOf, f64 *tcount, u32 *stuck) {
  u32 stuckHere = 0, x = (u32)s0;
  for (u32 w = 0; w < count; w++) {
    i32 v = start, steps = 0;
    while (halt[v] == 0 && steps < cap) {
      i32 sl = os[v];
      x = x + 0x6d2b79f5u;
      u32 t = (x ^ (x >> 15)) * (1u | x);
      t = (t + ((t ^ (t >> 7)) * (61u | t))) ^ t;
      t = t ^ (t >> 14);
      u32 e = lut[((u32)v << 8) + (t >> 24)];
      if (e != 255) sl += (i32)e;
      else { f64 r = (f64)t / 4294967296.0; while (cumN[sl] <= r) sl++; }
      moves[sl] += 1.0; v = tg[sl]; steps++;
    }
    tab[steps] += 1.0;
    i32 ep = epOf[v];
    if (ep >= 0) tcount[ep] += 1.0; else stuckHere++;
  }
  *stuck = stuckHere;
  return (i32)x;
}
