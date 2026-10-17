/* ppmd7.c: PPMd var.H (7-Zip "PPMd7") decoder for WebAssembly. Copyright (c) 2026 LFC Foundry. MIT License.
   A line-for-line transliteration of modules/ppmd-decode/ppmd-decode.js (itself a port of the public-domain Ppmd7.c / Ppmd7Dec.c by Igor
   Pavlov, from the 7-Zip / LZMA SDK; the algorithm is Dmitry Shkarin's PPMd var.H). Same model memory layout, same byte offsets ("refs").

   decode(src, srcLen, out, outSize, order, memSize, modelBase, scratch) works on the module's imported memory; every pointer is a byte address in it.
   modelBase must have memSize + 16 zeroed bytes (4 - memSize % 4 alignment bytes, the model, 12 spare), scratch 20,480 zeroed bytes. The caller (ppmd-decode-wasm.js)
   checks the arguments the same way ppmd-decode.js does before it calls. Division by zero is guarded because JavaScript gives 0 there where WebAssembly would trap. */
typedef unsigned char u8;
typedef unsigned short u16;
typedef unsigned int u32;
typedef int i32;
typedef unsigned long long u64;

#define MAX_FREQ 124
#define NUM_INDEXES 38
#define DUMMY_SEE 400

static u8 *B;                 /* model base: refs are offsets from here */
#define M8(o)  (*(u8 *)(B + (o)))
#define M16(o) (*(u16 *)(B + (o)))
#define M32(o) (*(u32 *)(B + (o)))

static const u8 expEscape[16] = {25, 14, 9, 7, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2, 2};
static const u16 initBinEsc[8] = {0x3CDD, 0x1F3F, 0x59BF, 0x48F3, 0x64A1, 0x5ABC, 0x6632, 0x6051};
/* All big work arrays live in a zeroed scratch block the caller provides (so the .wasm file carries no zero data):
   byte offsets inside it */
static u8 *Z;
#define binSumm  ((u16 *)(Z + 0))        /* 128*64 u16 = 16384 bytes */
#define seeSumm  ((u16 *)(Z + 16384))    /* 401 u16 -> up to 17186 */
#define freeList ((u32 *)(Z + 17188))    /* 38 u32 -> 17340 */
#define ps       ((u32 *)(Z + 17344))    /* 256 u32 -> 18368 */
#define seeShift (Z + 18368)             /* 401 */
#define seeCount (Z + 18772)             /* 401 */
#define charMask (Z + 19176)             /* 256 */
#define indx2Units (Z + 19432)           /* 38 */
#define units2Indx (Z + 19472)           /* 129 */
#define ns2Indx    (Z + 19604)           /* 256 */
#define ns2bsIndx  (Z + 19860)           /* 256 */
#define hb2Flag    (Z + 20116)           /* 256 */
#define SCRATCH_BYTES 20480

static u32 minContext, maxContext, foundState, head, alignOffset, memSize;
static u32 orderFall, order, initEsc, prevSuccess, hiBitsFlag, glueCount, loUnit, hiUnit, text, unitsStart, escFreqOut;
static i32 runLength, initRL;

static u32 getSucc(u32 s) { return (u32)M16(s + 2) | ((u32)M16(s + 4) << 16); }
static void setSucc(u32 s, u32 v) { M16(s + 2) = (u16)v; M16(s + 4) = (u16)(v >> 16); }
static void copyState(u32 d, u32 s) { M16(d) = M16(s); M16(d + 2) = M16(s + 2); M16(d + 4) = M16(s + 4); }
static void swapStates(u32 a, u32 b) { copyState(head, a); copyState(a, b); copyState(b, head); }

static void insertNode(u32 node, u32 indx) { M32(node) = freeList[indx]; freeList[indx] = node; }
static u32 removeNode(u32 indx) { u32 node = freeList[indx]; freeList[indx] = M32(node); return node; }
static void insertBlock(u32 ptr, u32 nu) {
  u32 i = units2Indx[nu - 1], k;
  if (indx2Units[i] != nu) { k = indx2Units[--i]; insertNode(ptr + k * 12, nu - k - 1); }
  insertNode(ptr, i);
}
static void splitBlock(u32 ptr, u32 oldIndx, u32 newIndx) {
  insertBlock(ptr + indx2Units[newIndx] * 12, indx2Units[oldIndx] - indx2Units[newIndx]);
}
static void glueFreeBlocks(void) {
  u32 n = head, i, nu, next, node, node2, prev2, next2;
  glueCount = 255;
  for (i = 0; i < NUM_INDEXES; i++) {
    nu = indx2Units[i]; next = freeList[i]; freeList[i] = 0;
    while (next != 0) {
      node = next; M32(node + 4) = n; M32(n + 8) = node; n = node; next = M32(node);
      M16(node) = 0; M16(node + 2) = (u16)nu;
    }
  }
  M16(head) = 1; M32(head + 4) = n; M32(n + 8) = head;
  if (loUnit != hiUnit) M16(loUnit) = 1;
  while (n != head) {
    node = n; nu = M16(node + 2);
    for (;;) {
      node2 = node + nu * 12; nu += M16(node2 + 2);
      if (M16(node2) != 0 || nu >= 0x10000) break;
      prev2 = M32(node2 + 8); next2 = M32(node2 + 4);
      M32(prev2 + 4) = next2; M32(next2 + 8) = prev2;
      M16(node + 2) = (u16)nu;
    }
    n = M32(node + 4);
  }
  for (n = M32(head + 4); n != head;) {
    node = n; next = M32(node + 4);
    for (nu = M16(node + 2); nu > 128; nu -= 128, node += 128 * 12) insertNode(node, NUM_INDEXES - 1);
    insertBlock(node, nu);
    n = next;
  }
}
static u32 allocUnitsRare(u32 indx) {
  u32 i, numBytes, ret;
  if (glueCount == 0) { glueFreeBlocks(); if (freeList[indx] != 0) return removeNode(indx); }
  i = indx;
  do {
    if (++i == NUM_INDEXES) {
      numBytes = indx2Units[indx] * 12; glueCount--;
      if (unitsStart - text > numBytes) { unitsStart -= numBytes; return unitsStart; }
      return 0;
    }
  } while (freeList[i] == 0);
  ret = removeNode(i); splitBlock(ret, i, indx);
  return ret;
}
static u32 allocUnits(u32 indx) {
  u32 numBytes, ret;
  if (freeList[indx] != 0) return removeNode(indx);
  numBytes = indx2Units[indx] * 12;
  if (numBytes <= hiUnit - loUnit) { ret = loUnit; loUnit += numBytes; return ret; }
  return allocUnitsRare(indx);
}
static void copyUnits(u32 dst, u32 src, u32 nu) {
  u32 d = dst, s = src, e = dst + nu * 12;
  while (d < e) { M32(d) = M32(s); d += 4; s += 4; }
}
static u32 shrinkUnits(u32 oldPtr, u32 oldNU, u32 newNU) {
  u32 i0 = units2Indx[oldNU - 1], i1 = units2Indx[newNU - 1], ptr;
  if (i0 == i1) return oldPtr;
  if (freeList[i1] != 0) { ptr = removeNode(i1); copyUnits(ptr, oldPtr, newNU); insertNode(oldPtr, i0); return ptr; }
  splitBlock(oldPtr, i0, i1);
  return oldPtr;
}

static void restartModel(void) {
  u32 i, s;
  for (i = 0; i < NUM_INDEXES; i++) freeList[i] = 0;
  text = alignOffset;
  hiUnit = text + memSize;
  loUnit = unitsStart = hiUnit - ((memSize >> 3) / 12) * 84;
  glueCount = 0;
  orderFall = order;
  runLength = initRL = -(i32)(order < 12 ? order : 12) - 1;
  prevSuccess = 0;
  hiUnit -= 12;
  minContext = maxContext = hiUnit;
  M32(minContext + 8) = 0; M16(minContext) = 256; M16(minContext + 2) = 257;
  foundState = loUnit; M32(minContext + 4) = loUnit;
  loUnit += 128 * 12;
  for (i = 0; i < 256; i++) { s = foundState + i * 6; M8(s) = (u8)i; M8(s + 1) = 1; setSucc(s, 0); }
  for (i = 0; i < 8192; i++) binSumm[i] = (u16)(16384 - initBinEsc[i & 7] / ((i >> 6) + 2));
  for (i = 0; i < DUMMY_SEE; i++) { seeShift[i] = 3; seeSumm[i] = (u16)((5 * (i >> 4) + 10) << 3); seeCount[i] = 4; }
}

static u32 createSuccessors(int skip) {
  u32 c = minContext, upBranch = getSucc(foundState), numPs = 0;
  u32 fSym = M8(foundState), s, successor, upSym, upFreq, cf, s0, c1;
  if (!skip) ps[numPs++] = foundState;
  while (M32(c + 8) != 0) {
    c = M32(c + 8);
    if (M16(c) != 1) { s = M32(c + 4); while (M8(s) != fSym) s += 6; } else s = c + 2;
    successor = getSucc(s);
    if (successor != upBranch) { c = successor; if (numPs == 0) return c; break; }
    ps[numPs++] = s;
  }
  upSym = M8(upBranch);
  if (M16(c) == 1) upFreq = M8(c + 3);
  else {
    s = M32(c + 4);
    while (M8(s) != upSym) s += 6;
    cf = M8(s + 1) - 1;
    s0 = (u32)((i32)M16(c + 2) - (i32)M16(c) - (i32)cf);
    if ((u64)2 * cf <= s0) upFreq = (1 + ((u64)5 * cf > s0 ? 1 : 0)) & 255;
    else upFreq = (1 + (s0 ? (u32)(((u64)2 * cf + (u64)3 * s0 - 1) / ((u64)2 * s0)) : 0)) & 255;
  }
  do {
    if (hiUnit != loUnit) { hiUnit -= 12; c1 = hiUnit; }
    else if (freeList[0] != 0) c1 = removeNode(0);
    else { c1 = allocUnitsRare(0); if (c1 == 0) return 0; }
    M16(c1) = 1; M8(c1 + 2) = (u8)upSym; M8(c1 + 3) = (u8)upFreq;
    setSucc(c1 + 2, upBranch + 1);
    M32(c1 + 8) = c;
    setSucc(ps[--numPs], c1);
    c = c1;
  } while (numPs != 0);
  return c;
}

static void updateModel(void) {
  u32 fs = foundState, fSym = M8(fs), fFreq = M8(fs + 1);
  u32 fSuccessor = getSucc(fs), successor, c, s, ns, ns1, cs, oldNU, i, ptr, oldPtr, sfq, cf;
  i32 s0, sf;
  if (fFreq < MAX_FREQ / 4 && M32(minContext + 8) != 0) {
    c = M32(minContext + 8);
    if (M16(c) == 1) { s = c + 2; if (M8(s + 1) < 32) M8(s + 1)++; }
    else {
      s = M32(c + 4);
      if (M8(s) != fSym) {
        do { s += 6; } while (M8(s) != fSym);
        if (M8(s + 1) >= M8(s - 5)) { swapStates(s, s - 6); s -= 6; }
      }
      if (M8(s + 1) < MAX_FREQ - 9) { M8(s + 1) += 2; M16(c + 2) += 2; }
    }
  }
  if (orderFall == 0) {
    minContext = maxContext = createSuccessors(1);
    if (minContext == 0) { restartModel(); return; }
    setSucc(foundState, minContext);
    return;
  }
  M8(text++) = (u8)fSym;
  successor = text;
  if (text >= unitsStart) { restartModel(); return; }
  if (fSuccessor != 0) {
    if (fSuccessor <= successor) {
      cs = createSuccessors(0);
      if (cs == 0) { restartModel(); return; }
      fSuccessor = cs;
    }
    if (--orderFall == 0) { successor = fSuccessor; if (maxContext != minContext) text--; }
  } else {
    setSucc(foundState, successor);
    fSuccessor = minContext;
  }
  ns = M16(minContext);
  s0 = (i32)M16(minContext + 2) - (i32)ns - ((i32)fFreq - 1);
  for (c = maxContext; c != minContext; c = M32(c + 8)) {
    ns1 = M16(c);
    if (ns1 != 1) {
      if ((ns1 & 1) == 0) {
        oldNU = ns1 >> 1;
        i = units2Indx[oldNU - 1];
        if (i != units2Indx[oldNU]) {
          ptr = allocUnits(i + 1);
          if (ptr == 0) { restartModel(); return; }
          oldPtr = M32(c + 4);
          copyUnits(ptr, oldPtr, oldNU);
          insertNode(oldPtr, i);
          M32(c + 4) = ptr;
        }
      }
      sfq = M16(c + 2);
      M16(c + 2) = (u16)(sfq + (2 * ns1 < ns ? 1 : 0) + 2 * ((4 * ns1 <= ns && sfq <= 8 * ns1) ? 1 : 0));
    } else {
      s = allocUnits(0);
      if (s == 0) { restartModel(); return; }
      copyState(s, c + 2);
      M32(c + 4) = s;
      if (M8(s + 1) < MAX_FREQ / 4 - 1) M8(s + 1) <<= 1; else M8(s + 1) = MAX_FREQ - 4;
      M16(c + 2) = (u16)(M8(s + 1) + initEsc + (ns > 3 ? 1 : 0));
    }
    sfq = M16(c + 2);
    cf = 2 * fFreq * (sfq + 6);
    sf = s0 + (i32)sfq;
    if ((i32)cf < 6 * sf) {
      cf = 1 + ((i32)cf > sf ? 1 : 0) + ((i32)cf >= 4 * sf ? 1 : 0);
      M16(c + 2) = (u16)(sfq + 3);
    } else {
      cf = 4 + ((i32)cf >= 9 * sf ? 1 : 0) + ((i32)cf >= 12 * sf ? 1 : 0) + ((i32)cf >= 15 * sf ? 1 : 0);
      M16(c + 2) = (u16)(sfq + cf);
    }
    s = M32(c + 4) + ns1 * 6;
    setSucc(s, successor);
    M8(s) = (u8)fSym; M8(s + 1) = (u8)cf;
    M16(c) = (u16)(ns1 + 1);
  }
  maxContext = minContext = fSuccessor;
}

static void rescale(void) {
  u32 mc = minContext, stats = M32(mc + 4), s = foundState;
  u32 tf, s1, adder, sumFreq, i, numStats0, n0, n1;
  i32 escFreq;
  copyState(head, s);
  for (; s != stats; s -= 6) copyState(s, s - 6);
  copyState(s, head);
  escFreq = (i32)M16(mc + 2) - M8(s + 1);
  M8(s + 1) += 4;
  adder = orderFall != 0 ? 1 : 0;
  M8(s + 1) = (u8)((M8(s + 1) + adder) >> 1);
  sumFreq = M8(s + 1);
  i = M16(mc) - 1;
  do {
    s += 6;
    escFreq -= M8(s + 1);
    M8(s + 1) = (u8)((M8(s + 1) + adder) >> 1);
    sumFreq += M8(s + 1);
    if (M8(s + 1) > M8(s - 5)) {
      s1 = s; copyState(head, s1); tf = M8(s1 + 1);
      do { copyState(s1, s1 - 6); s1 -= 6; } while (s1 != stats && tf > M8(s1 - 5));
      copyState(s1, head);
    }
  } while (--i);
  if (M8(s + 1) == 0) {
    numStats0 = M16(mc);
    do { i++; s -= 6; } while (M8(s + 1) == 0);
    escFreq += (i32)i;
    M16(mc) = (u16)(numStats0 - i);
    if (M16(mc) == 1) {
      tf = M8(stats + 1);
      do { tf = tf - (tf >> 1); escFreq = (i32)((u32)escFreq >> 1); } while (escFreq > 1);
      foundState = mc + 2;
      copyState(foundState, stats);
      M8(foundState + 1) = (u8)tf;
      insertNode(stats, units2Indx[((numStats0 + 1) >> 1) - 1]);
      return;
    }
    n0 = (numStats0 + 1) >> 1;
    n1 = (M16(mc) + 1) >> 1;
    if (n0 != n1) M32(mc + 4) = shrinkUnits(stats, n0, n1);
  }
  M16(mc + 2) = (u16)(sumFreq + escFreq - ((u32)escFreq >> 1));
  foundState = M32(mc + 4);
}

static u32 makeEscFreq(u32 numMasked) {
  u32 mc = minContext, ns = M16(mc), nonMasked = ns - numMasked, see, r;
  if (ns != 256) {
    see = ns2Indx[nonMasked - 1] * 16 +
      (nonMasked < (u32)((i32)M16(M32(mc + 8)) - (i32)ns) ? 1 : 0) +
      2 * (M16(mc + 2) < 11 * ns ? 1 : 0) +
      4 * (numMasked > nonMasked ? 1 : 0) +
      hiBitsFlag;
    r = seeSumm[see] >> seeShift[see];
    seeSumm[see] = (u16)(seeSumm[see] - r);
    escFreqOut = r + (r == 0 ? 1 : 0);
  } else { see = DUMMY_SEE; escFreqOut = 1; }
  return see;
}

static void nextContext(void) {
  u32 c = getSucc(foundState);
  if (orderFall == 0 && c > text) minContext = maxContext = c; else updateModel();
}
static void update1(void) {
  u32 s = foundState;
  M8(s + 1) += 4; M16(minContext + 2) += 4;
  if (M8(s + 1) > M8(s - 5)) {
    swapStates(s, s - 6);
    foundState = s -= 6;
    if (M8(s + 1) > MAX_FREQ) rescale();
  }
  nextContext();
}
static void update1_0(void) {
  prevSuccess = (2 * M8(foundState + 1) > M16(minContext + 2)) ? 1 : 0;
  runLength += (i32)prevSuccess;
  M16(minContext + 2) += 4; M8(foundState + 1) += 4;
  if (M8(foundState + 1) > MAX_FREQ) rescale();
  nextContext();
}
static void updateBin(void) {
  if (M8(foundState + 1) < 128) M8(foundState + 1)++;
  prevSuccess = 1; runLength++;
  nextContext();
}
static void update2(void) {
  M16(minContext + 2) += 4; M8(foundState + 1) += 4;
  if (M8(foundState + 1) > MAX_FREQ) rescale();
  runLength = initRL;
  updateModel();
}

static u32 divz(u32 a, u32 b) { return b ? a / b : 0; }   /* JS: x / 0 is Infinity, and Infinity >>> 0 is 0 */

/* result: 0 ok, 1 the compressed data ended early, 2 corrupt data, 3 bad stream header */

__attribute__((export_name("decode")))
int decode(const u8 *src, u32 srcLen, u8 *out, u32 outSize, u32 ord, u32 mem, u8 *modelBase, u8 *scratch) {
  u32 rng = 0xFFFFFFFFu, cd = ((u32)src[1] << 24) | ((u32)src[2] << 16) | ((u32)src[3] << 8) | src[4];
  u32 sp = 5, n, mc, ns, s, i, count, hiCnt, sf, f, prob, idx, bound, numMasked, num, k, see, freqSum, pp;
  int sym;
  u8 *mask;
  u32 step, m;

  B = modelBase; Z = scratch; mask = charMask; order = ord; memSize = mem;
  /* static tables (Ppmd7_Construct) */
  for (i = 0, k = 0; i < NUM_INDEXES; i++) {
    step = i >= 12 ? 4 : (i >> 2) + 1;
    do { units2Indx[k++] = (u8)i; } while (--step);
    indx2Units[i] = (u8)k;
  }
  units2Indx[128] = 255;
  for (i = m = 0, k = 1; i < 256; i++) {
    ns2bsIndx[i] = (u8)(i < 2 ? i * 2 : i < 11 ? 4 : 6);
    hb2Flag[i] = i > 63 ? 8 : 0;
    ns2Indx[i] = (u8)m;
    if (--k == 0) { k = m++ < 3 ? 1 : m - 2; }
  }
  alignOffset = 4 - (memSize & 3);
  head = alignOffset + memSize;
  restartModel();
  seeShift[DUMMY_SEE] = 7; seeSumm[DUMMY_SEE] = 0; seeCount[DUMMY_SEE] = 64;
  if (cd == 0xFFFFFFFFu) return 3;
  for (n = 0; n < outSize; n++) {
    sym = -1;
    while (rng < 16777216u) {
      if (sp >= srcLen) return 1;
      cd = (cd << 8) | src[sp++]; rng <<= 8;
    }
    mc = minContext;
    ns = M16(mc);
    if (ns != 1) {
      s = M32(mc + 4);
      sf = M16(mc + 2);
      rng = divz(rng, sf);
      count = divz(cd, rng);
      hiCnt = M8(s + 1);
      if (count < hiCnt) {
        rng = rng * hiCnt;
        foundState = s; sym = M8(s);
        update1_0();
        goto done;
      }
      prevSuccess = 0;
      i = ns - 1;
      do {
        s += 6;
        f = M8(s + 1);
        hiCnt += f;
        if (hiCnt > count) {
          cd = cd - (hiCnt - f) * rng;
          rng = rng * f;
          foundState = s; sym = M8(s);
          update1();
          goto done;
        }
      } while (--i);
      if (count >= sf) { sym = -2; goto done; }
      hiBitsFlag = hb2Flag[M8(foundState)];
      cd = cd - hiCnt * rng;
      rng = rng * (sf - hiCnt);
      for (i = 0; i < 256; i++) mask[i] = 255;
      mask[M8(s)] = 0;
      i = ns - 1;
      do { s -= 6; mask[M8(s)] = 0; } while (--i);
    } else {
      hiBitsFlag = hb2Flag[M8(foundState)];
      idx = (M8(mc + 3) - 1) * 64 + prevSuccess + ns2bsIndx[M16(M32(mc + 8)) - 1] + hiBitsFlag + 2 * hb2Flag[M8(mc + 2)] + (((u32)(runLength >> 26)) & 0x20);
      prob = binSumm[idx];
      bound = (rng >> 14) * prob;
      if (cd < bound) {
        rng = bound;
        binSumm[idx] = (u16)(prob + 128 - ((prob + 32) >> 7));
        foundState = mc + 2; sym = M8(mc + 2);
        updateBin();
        goto done;
      }
      cd = cd - bound; rng = rng - bound;
      prob = prob - ((prob + 32) >> 7);
      binSumm[idx] = (u16)prob;
      initEsc = expEscape[prob >> 10];
      for (i = 0; i < 256; i++) mask[i] = 255;
      mask[M8(mc + 2)] = 0;
      prevSuccess = 0;
    }
    for (;;) {
      while (rng < 16777216u) {
        if (sp >= srcLen) return 1;
        cd = (cd << 8) | src[sp++]; rng <<= 8;
      }
      numMasked = M16(minContext);
      do {
        orderFall++;
        if (M32(minContext + 8) == 0) { sym = -1; goto done; }
        minContext = M32(minContext + 8);
      } while (M16(minContext) == numMasked);
      mc = minContext;
      hiCnt = 0;
      s = M32(mc + 4);
      i = 0;
      num = M16(mc) - numMasked;
      do {
        i32 kk = (i32)(signed char)mask[M8(s)];
        hiCnt += M8(s + 1) & kk;
        ps[i] = s;
        s += 6;
        i -= kk;
      } while (i != num);
      see = makeEscFreq(numMasked);
      freqSum = escFreqOut + hiCnt;
      rng = divz(rng, freqSum);
      count = divz(cd, rng);
      if (count < hiCnt) {
        pp = 0; hiCnt = 0;
        while ((hiCnt += M8(ps[pp] + 1)) <= count) pp++;
        s = ps[pp];
        f = M8(s + 1);
        cd = cd - (hiCnt - f) * rng;
        rng = rng * f;
        if (seeShift[see] < 7) {
          k = (seeCount[see] - 1) & 255;
          seeCount[see] = (u8)k;
          if (k == 0) {
            seeSumm[see] = (u16)(seeSumm[see] << 1);
            seeCount[see] = (u8)((3 << seeShift[see]) & 255);
            seeShift[see]++;
          }
        }
        foundState = s; sym = M8(s);
        update2();
        goto done;
      }
      if (count >= freqSum) { sym = -2; goto done; }
      cd = cd - hiCnt * rng;
      rng = rng * (freqSum - hiCnt);
      seeSumm[see] = (u16)(seeSumm[see] + freqSum);
      do { mask[M8(ps[--i])] = 0; } while (i != 0);
    }
  done:
    if (sym < 0) return 2;
    out[n] = (u8)sym;
  }
  return 0;
}
