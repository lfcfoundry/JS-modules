/* Copyright (c) 2026 LFC Foundry. MIT License.
 * CRC-32 (the zip checksum) for zip-open.js, "slicing by 16": sixteen table lookups handle sixteen bytes at once. Same answers as the JavaScript loop in zip-open.js.
 * init() fills the 16 tables (16 KB); crc(ptr, length, state) runs from the running state (start with -1; the final answer is state ^ -1). Build: wasm/build.sh, then wasm/embed.py. */
typedef unsigned int u32; typedef unsigned char u8;
#ifndef SLICE
#define SLICE 16
#endif
static u32 T[SLICE][256];
void init(void) {
  u32 i, c, k;
  for (i = 0; i < 256; i++) { c = i; for (k = 0; k < 8; k++) c = (c & 1) ? (c >> 1) ^ 0xedb88320u : c >> 1; T[0][i] = c; }
  for (i = 0; i < 256; i++) { c = T[0][i]; for (k = 1; k < SLICE; k++) { c = T[0][c & 255] ^ (c >> 8); T[k][i] = c; } }
}
u32 crc(const u8 *p, u32 n, u32 s) {
#if SLICE == 16
  while (n >= 16) {
    u32 a = (*(const u32 *)p) ^ s, b = *(const u32 *)(p + 4), c = *(const u32 *)(p + 8), d = *(const u32 *)(p + 12);
    s = T[15][a & 255] ^ T[14][(a >> 8) & 255] ^ T[13][(a >> 16) & 255] ^ T[12][a >> 24] ^ T[11][b & 255] ^ T[10][(b >> 8) & 255] ^ T[9][(b >> 16) & 255] ^ T[8][b >> 24]
      ^ T[7][c & 255] ^ T[6][(c >> 8) & 255] ^ T[5][(c >> 16) & 255] ^ T[4][c >> 24] ^ T[3][d & 255] ^ T[2][(d >> 8) & 255] ^ T[1][(d >> 16) & 255] ^ T[0][d >> 24];
    p += 16; n -= 16;
  }
#else
  while (n >= 8) {
    u32 a = (*(const u32 *)p) ^ s, b = *(const u32 *)(p + 4);
    s = T[7][a & 255] ^ T[6][(a >> 8) & 255] ^ T[5][(a >> 16) & 255] ^ T[4][a >> 24] ^ T[3][b & 255] ^ T[2][(b >> 8) & 255] ^ T[1][(b >> 16) & 255] ^ T[0][b >> 24];
    p += 8; n -= 8;
  }
#endif
  while (n--) s = T[0][(s ^ *p++) & 255] ^ (s >> 8);
  return s;
}
