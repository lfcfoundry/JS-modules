// Copyright (c) 2026 LFC Foundry. MIT License.
// bdec.wasm: bit-packed number columns ('B' kind) read straight from their bytes.
// decB: unpack n values of w bits (LSB first) to doubles, out[i] = (v + mn) / sc (sc == 1: no divide); the same doubles as colB in flat.js.
// sumI / grpI (aggregate): exact whole-number sums of the raw codes, so the caller divides once per scale.
// Every input needs 8 readable bytes past its data (the caller zero-fills them).
typedef unsigned long long u64; typedef unsigned int u32; typedef unsigned char u8;
static inline u64 ld64(const u8* p) { u64 x; __builtin_memcpy(&x, p, 8); return x; }
__attribute__((export_name("decB"))) void decB(const u8* in, u32 n, u32 w, double mn, double sc, double* out) {
  u64 mask = (1ull << w) - 1, bp = 0; u32 i;
  if (sc == 1.0) { for (i = 0; i < n; i++) { out[i] = (double)((ld64(in + (bp >> 3)) >> (bp & 7)) & mask) + mn; bp += w; } return; }
  for (i = 0; i < n; i++) { out[i] = ((double)((ld64(in + (bp >> 3)) >> (bp & 7)) & mask) + mn) / sc; bp += w; }
}
// acc[0] += sum of codes (exact below 2^53, the caller checks), acc[1] += count; np = 0: no null plane (n values), else n rows with bit 1 = null
__attribute__((export_name("sumI"))) void sumI(const u8* in, const u8* np, u32 n, u32 w, double* acc) {
  u64 mask = (1ull << w) - 1, bp = 0, s = 0; u32 i, c = 0;
  if (!np) { for (i = 0; i < n; i++) { s += (ld64(in + (bp >> 3)) >> (bp & 7)) & mask; bp += w; } c = n; }
  else for (i = 0; i < n; i++) { u64 h = 1 ^ ((np[i >> 3] >> (i & 7)) & 1); s += ((ld64(in + (bp >> 3)) >> (bp & 7)) & mask) & (0 - h); bp += w & (u32)(0 - h); c += (u32)h; }   // no branch on the null bit: random nulls cost a mispredict each
  acc[0] += (double)s; acc[1] += c;
}
// per group: k = kw-bit code of row i (one code per row), sums[k] += value code, cnts[k] += 1; rows whose value is null are skipped
__attribute__((export_name("grpI"))) void grpI(const u8* in, const u8* np, u32 n, u32 w, const u8* kin, u32 kw, u64* sums, u32* cnts) {
  u64 mask = (1ull << w) - 1, kmask = (1ull << kw) - 1, bp = 0, kp = 0; u32 i, k;
  if (!np) { for (i = 0; i < n; i++, kp += kw) { k = (u32)((ld64(kin + (kp >> 3)) >> (kp & 7)) & kmask); sums[k] += (ld64(in + (bp >> 3)) >> (bp & 7)) & mask; cnts[k]++; bp += w; } return; }
  for (i = 0; i < n; i++, kp += kw) { u64 h = 1 ^ ((np[i >> 3] >> (i & 7)) & 1); k = (u32)((ld64(kin + (kp >> 3)) >> (kp & 7)) & kmask); sums[k] += ((ld64(in + (bp >> 3)) >> (bp & 7)) & mask) & (0 - h); cnts[k] += (u32)h; bp += w & (u32)(0 - h); }   // no branch on the null bit
}
// popc: the number of 1 bits in len bytes at p (presence-bit counts of flat blocks; reads 8 bytes at a time, so p needs 8 readable bytes past len)
__attribute__((export_name("popc"))) u32 popc(const u8* p, u32 len) {
  u32 c = 0, i = 0; for (; i + 8 <= len; i += 8) c += (u32)__builtin_popcountll(ld64(p + i));
  for (; i < len; i++) c += (u32)__builtin_popcount(p[i]); return c;
}
