/* ppmd-decode: a PPMd (variant H, "PPMd7" as 7-Zip writes it) decoder. Copyright (c) 2026 LFC Foundry. MIT License. https://github.com/JNFoo/JS-modules
   Version 2026.10.15.2155

   Decodes a raw PPMd7 stream (the range-coder bytes 7-Zip stores inside a .7z archive; no header) into a Uint8Array.

     ppmd7Decode(src, outSize, order, memSize, opts)
       src      Uint8Array: the compressed bytes, exactly as 7-Zip writes them (the first byte is always 0)
       outSize  the exact number of bytes the result has (the stream has no end marker that is checked)
       order    model order, 2..64: the same value the encoder used
       memSize  model memory in bytes, 2048..2147483616: the SAME value the encoder used. The model restarts when this memory is full,
                so a different value gives garbage, not an error.
       opts     { maxSize }  (optional) refuse to allocate a result bigger than this. Use it when outSize comes from a file you did not pack yourself.

     ppmd7Decode.fromProps(src, outSize, props, opts)  the same, with order and memSize read from the 5-byte property blob a .7z archive
                keeps for the PPMd coder (1 byte order, 4 bytes memSize little-endian). Defined in the export block at the bottom.

   Throws an Error (never loops longer than outSize symbols) when the input is cut short (noticed as soon as the decoder needs a byte that is
   not there), when the stream is corrupt in a way the model can see, when an argument is out of range, and when the memory cannot be allocated.
   There is no checksum in the stream, so check the result yourself if you need to (the packer's loader does).

   The algorithm is Dmitry Shkarin's PPMd var.H. This JavaScript is a fresh port of the public-domain C code by Igor Pavlov
   (Ppmd7.c and Ppmd7Dec.c from the 7-Zip / LZMA SDK) and checked byte for byte against that code's encoder.

   Memory layout: the whole model lives in ONE ArrayBuffer, viewed as bytes (U8), 16-bit words (U16) and 32-bit words (U32).
   Everything is addressed by byte offsets ("refs"); offset 0 means "null". Blocks are made of 12-byte units, so every unit start is
   4-byte aligned. The views share one buffer, so a little-endian machine is required (every browser target is; other machines get an Error).
   Offsets are used with signed 32-bit shifts, which is why memSize stops below 2 GB.

     Context (1 unit):  u16 numStats @0, u16 summFreq @2, u32 stats @4, u32 suffix @8
                        (a context with one symbol keeps that State inside itself, starting at byte 2: symbol @2, freq @3, successor @4..7)
     State (6 bytes):   u8 symbol @0, u8 freq @1, successor as two u16 @2 and @4
     Free node (unit):  u32 next-in-list @0 (normal lists); while gluing: u16 stamp @0, u16 nu @2, u32 next @4, u32 prev @8

   This file is deliberately not wrapped in a UMD function: tools/ppmd-pack cuts it at the line that starts with the export block and pastes
   everything above into every packed page, so the decoder must stay ONE function with nothing else at the top level. The packer also drops
   lines that end in the marker comment "lean-cut" (checks meant for input you did not pack yourself) and turns every `throw new Error('...')`
   into a bare throw, so keep each such line self-contained. Keep it plain ASCII (the packed page is read as windows-1252). */
function ppmd7Decode(src, outSize, order, memSize, opts) {
  "use strict";
  var MAX_FREQ = 124, NUM_INDEXES = 38;
  var srcLen = src.length, out, buf;

  if (!(order >= 2 && order <= 64 && order === (order | 0) && memSize >= 2048 && memSize <= 2147483616 && memSize === (memSize | 0))) throw new Error('PPMd: order must be 2-64 and memSize 2048-2147483616 (whole numbers)');   // lean-cut
  if (!(outSize >= 0 && outSize === Math.floor(outSize))) throw new Error('PPMd: outSize must be a whole number of bytes');   // lean-cut
  if (opts && opts.maxSize !== undefined && !(outSize <= opts.maxSize)) throw new Error('PPMd: the result would be ' + outSize + ' bytes, more than the allowed maxSize of ' + opts.maxSize);   // lean-cut
  if (new Uint8Array(new Uint32Array([1]).buffer)[0] !== 1) throw new Error('PPMd: this decoder needs a little-endian machine');   // lean-cut
  if (outSize === 0) { return new Uint8Array(0); }   // lean-cut
  if (srcLen < 5 || src[0] !== 0) throw new Error('PPMd: bad stream header');   // lean-cut

  /* ---- static tables (Ppmd7_Construct) ---- */
  var indx2Units = new Uint8Array(NUM_INDEXES);
  var units2Indx = new Uint8Array(128);
  var ns2Indx = new Uint8Array(256);
  var ns2bsIndx = new Uint8Array(256);
  var hb2Flag = new Uint8Array(256);
  var expEscape = [25, 14, 9, 7, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2, 2];
  var initBinEsc = [0x3CDD, 0x1F3F, 0x59BF, 0x48F3, 0x64A1, 0x5ABC, 0x6632, 0x6051];
  var i, k, m, step;
  for (i = 0, k = 0; i < NUM_INDEXES; i++) {
    step = i >= 12 ? 4 : (i >> 2) + 1;
    do { units2Indx[k++] = i; } while (--step);
    indx2Units[i] = k;
  }
  for (i = m = 0, k = 1; i < 256; i++) {
    ns2bsIndx[i] = i < 2 ? i * 2 : i < 11 ? 4 : 6;
    hb2Flag[i] = i > 63 ? 8 : 0;
    ns2Indx[i] = m;
    if (--k === 0) { k = m++ < 3 ? 1 : m - 2; }
  }

  /* ---- model memory ---- */
  var alignOffset = 4 - (memSize & 3);          /* so that alignOffset+size is a multiple of 4 */
  var head = alignOffset + memSize;             /* the 12 spare bytes at the end: list head for glue, 6-byte scratch state otherwise */
  try { out = new Uint8Array(outSize); buf = new ArrayBuffer(alignOffset + memSize + 12); /* +12: list head node used by glue */ } catch (e) { throw new Error('PPMd: cannot allocate ' + outSize + ' result bytes and ' + memSize + ' model bytes'); }
  var U8 = new Uint8Array(buf), U16 = new Uint16Array(buf), U32 = new Uint32Array(buf);
  var freeList = new Int32Array(NUM_INDEXES);
  var binSumm = new Uint16Array(128 * 64);
  /* SEE contexts: 25 rows x 16, plus the dummy one at index 400 */
  var seeSumm = new Uint16Array(401), seeShift = new Uint8Array(401), seeCount = new Uint8Array(401);
  var DUMMY_SEE = 400;
  var charMask = new Int8Array(256);             /* -1 = symbol still possible, 0 = masked */
  var ps = new Int32Array(256);                  /* scratch list of state refs */

  /* model registers (Ppmd7 struct fields) */
  var minContext = 0, maxContext = 0, foundState = 0;
  var orderFall = 0, initEsc = 0, prevSuccess = 0, hiBitsFlag = 0;
  var runLength = 0, initRL = 0, glueCount = 0;
  var loUnit = 0, hiUnit = 0, text = 0, unitsStart = 0;
  var escFreqOut = 0;                            /* second result of makeEscFreq */

  /* ---- small accessors ---- */
  function getSucc(s) { return U16[(s >> 1) + 1] | (U16[(s >> 1) + 2] << 16); }
  function setSucc(s, v) { U16[(s >> 1) + 1] = v & 0xFFFF; U16[(s >> 1) + 2] = v >>> 16; }
  function copyState(dst, srcS) {                /* 6-byte copy */
    var d = dst >> 1, s = srcS >> 1;
    U16[d] = U16[s]; U16[d + 1] = U16[s + 1]; U16[d + 2] = U16[s + 2];
  }
  function swapStates(a, b) { copyState(head, a); copyState(a, b); copyState(b, head); }

  /* ---- sub-allocator (units of 12 bytes, 38 size classes) ---- */
  function insertNode(node, indx) {
    U32[node >> 2] = freeList[indx];
    freeList[indx] = node;
  }
  function removeNode(indx) {
    var node = freeList[indx];
    freeList[indx] = U32[node >> 2];
    return node;
  }
  function insertBlock(ptr, nu) {                /* put a free block of nu units into the lists (in two pieces if nu is no class size) */
    var i = units2Indx[nu - 1], k;
    if (indx2Units[i] !== nu) {
      k = indx2Units[--i];
      insertNode(ptr + k * 12, nu - k - 1);
    }
    insertNode(ptr, i);
  }
  function splitBlock(ptr, oldIndx, newIndx) {
    insertBlock(ptr + indx2Units[newIndx] * 12, indx2Units[oldIndx] - indx2Units[newIndx]);
  }
  /* Merge neighboring free blocks, then refill the free lists. */
  function glueFreeBlocks() {
    var n = head, i, nu, next, node, node2, prev2, next2;
    glueCount = 255;
    /* build one doubly-linked list of all free blocks */
    for (i = 0; i < NUM_INDEXES; i++) {
      nu = indx2Units[i];
      next = freeList[i];
      freeList[i] = 0;
      while (next !== 0) {
        node = next;
        U32[(node >> 2) + 1] = n;          /* node.next = n */
        U32[(n >> 2) + 2] = node;          /* n.prev = node */
        n = node;
        next = U32[node >> 2];
        U16[node >> 1] = 0;                /* stamp 0 = free */
        U16[(node >> 1) + 1] = nu;
      }
    }
    U16[head >> 1] = 1;
    U32[(head >> 2) + 1] = n;
    U32[(n >> 2) + 2] = head;
    if (loUnit !== hiUnit) { U16[loUnit >> 1] = 1; }
    /* glue each free block with the free blocks that follow it in memory */
    while (n !== head) {
      node = n;
      nu = U16[(node >> 1) + 1];
      for (;;) {
        node2 = node + nu * 12;
        nu += U16[(node2 >> 1) + 1];
        if (U16[node2 >> 1] !== 0 || nu >= 0x10000) { break; }
        prev2 = U32[(node2 >> 2) + 2];
        next2 = U32[(node2 >> 2) + 1];
        U32[(prev2 >> 2) + 1] = next2;
        U32[(next2 >> 2) + 2] = prev2;
        U16[(node >> 1) + 1] = nu;
      }
      n = U32[(node >> 2) + 1];
    }
    /* put the blocks back into the size-class lists */
    for (n = U32[(head >> 2) + 1]; n !== head;) {
      node = n;
      next = U32[(node >> 2) + 1];
      for (nu = U16[(node >> 1) + 1]; nu > 128; nu -= 128, node += 128 * 12) {
        insertNode(node, NUM_INDEXES - 1);
      }
      insertBlock(node, nu);
      n = next;
    }
  }
  function allocUnitsRare(indx) {
    var i, numBytes, ret;
    if (glueCount === 0) {
      glueFreeBlocks();
      if (freeList[indx] !== 0) { return removeNode(indx); }
    }
    i = indx;
    do {
      if (++i === NUM_INDEXES) {
        numBytes = indx2Units[indx] * 12;
        glueCount--;
        if (unitsStart - text > numBytes) { unitsStart -= numBytes; return unitsStart; }
        return 0;
      }
    } while (freeList[i] === 0);
    ret = removeNode(i);
    splitBlock(ret, i, indx);
    return ret;
  }
  function allocUnits(indx) {
    var numBytes, ret;
    if (freeList[indx] !== 0) { return removeNode(indx); }
    numBytes = indx2Units[indx] * 12;
    if (numBytes <= hiUnit - loUnit) {
      ret = loUnit;
      loUnit += numBytes;
      return ret;
    }
    return allocUnitsRare(indx);
  }
  function copyUnits(dst, srcP, nu) {
    var d = dst >> 2, s = srcP >> 2, e = d + nu * 3;
    while (d < e) { U32[d++] = U32[s++]; }
  }
  function shrinkUnits(oldPtr, oldNU, newNU) {
    var i0 = units2Indx[oldNU - 1], i1 = units2Indx[newNU - 1], ptr;
    if (i0 === i1) { return oldPtr; }
    if (freeList[i1] !== 0) {
      ptr = removeNode(i1);
      copyUnits(ptr, oldPtr, newNU);
      insertNode(oldPtr, i0);
      return ptr;
    }
    splitBlock(oldPtr, i0, i1);
    return oldPtr;
  }

  /* ---- model (re)initialization ---- */
  function restartModel() {
    var i, s;
    freeList.fill(0);
    text = alignOffset;
    hiUnit = text + memSize;
    loUnit = unitsStart = hiUnit - (((memSize >>> 3) / 12) | 0) * 84;
    glueCount = 0;
    orderFall = order;
    runLength = initRL = -(order < 12 ? order : 12) - 1;
    prevSuccess = 0;
    hiUnit -= 12;
    minContext = maxContext = hiUnit;          /* the order-0 context */
    U32[(minContext >> 2) + 2] = 0;            /* suffix */
    U16[minContext >> 1] = 256;                /* numStats */
    U16[(minContext >> 1) + 1] = 257;          /* summFreq */
    foundState = loUnit;
    U32[(minContext >> 2) + 1] = loUnit;       /* stats */
    loUnit += 128 * 12;
    for (i = 0; i < 256; i++) {
      s = foundState + i * 6;
      U8[s] = i;
      U8[s + 1] = 1;
      setSucc(s, 0);
    }
    for (i = 0; i < 8192; i++) { binSumm[i] = 16384 - ((initBinEsc[i & 7] / ((i >> 6) + 2)) | 0); }
    for (i = 0; i < DUMMY_SEE; i++) { seeShift[i] = 3; seeSumm[i] = (5 * (i >> 4) + 10) << 3; seeCount[i] = 4; }
  }

  /* ---- model update ---- */
  function createSuccessors(skip) {
    var c = minContext, upBranch = getSucc(foundState), numPs = 0;
    var fSym = U8[foundState], s, successor, upSym, upFreq, cf, s0, c1;
    if (!skip) { ps[numPs++] = foundState; }
    while (U32[(c >> 2) + 2] !== 0) {
      c = U32[(c >> 2) + 2];
      if (U16[c >> 1] !== 1) {
        s = U32[(c >> 2) + 1];
        while (U8[s] !== fSym) { s += 6; }
      } else {
        s = c + 2;
      }
      successor = getSucc(s);
      if (successor !== upBranch) {
        c = successor;
        if (numPs === 0) { return c; }
        break;
      }
      ps[numPs++] = s;
    }
    upSym = U8[upBranch];
    if (U16[c >> 1] === 1) {
      upFreq = U8[c + 3];
    } else {
      s = U32[(c >> 2) + 1];
      while (U8[s] !== upSym) { s += 6; }
      cf = U8[s + 1] - 1;
      s0 = (U16[(c >> 1) + 1] - U16[c >> 1] - cf) >>> 0;
      upFreq = (1 + ((2 * cf <= s0) ? (5 * cf > s0 ? 1 : 0) : (((2 * cf + 3 * s0 - 1) / (2 * s0)) >>> 0))) & 255;
    }
    do {
      if (hiUnit !== loUnit) {
        hiUnit -= 12;
        c1 = hiUnit;
      } else if (freeList[0] !== 0) {
        c1 = removeNode(0);
      } else {
        c1 = allocUnitsRare(0);
        if (c1 === 0) { return 0; }
      }
      U16[c1 >> 1] = 1;                        /* numStats = 1 */
      U8[c1 + 2] = upSym;
      U8[c1 + 3] = upFreq;
      setSucc(c1 + 2, upBranch + 1);
      U32[(c1 >> 2) + 2] = c;                  /* suffix */
      setSucc(ps[--numPs], c1);
      c = c1;
    } while (numPs !== 0);
    return c;
  }

  function updateModel() {
    var fs = foundState, fSym = U8[fs], fFreq = U8[fs + 1];
    var fSuccessor = getSucc(fs), successor, c, s, s0, ns, ns1, cf, sf, cs;
    var oldNU, i, ptr, oldPtr, sfq;
    if (fFreq < MAX_FREQ / 4 && U32[(minContext >> 2) + 2] !== 0) {
      c = U32[(minContext >> 2) + 2];
      if (U16[c >> 1] === 1) {
        s = c + 2;
        if (U8[s + 1] < 32) { U8[s + 1]++; }
      } else {
        s = U32[(c >> 2) + 1];
        if (U8[s] !== fSym) {
          do { s += 6; } while (U8[s] !== fSym);
          if (U8[s + 1] >= U8[s - 5]) {
            swapStates(s, s - 6);
            s -= 6;
          }
        }
        if (U8[s + 1] < MAX_FREQ - 9) {
          U8[s + 1] += 2;
          U16[(c >> 1) + 1] += 2;
        }
      }
    }
    if (orderFall === 0) {
      minContext = maxContext = createSuccessors(true);
      if (minContext === 0) { restartModel(); return; }
      setSucc(foundState, minContext);
      return;
    }
    U8[text++] = fSym;
    successor = text;
    if (text >= unitsStart) { restartModel(); return; }
    if (fSuccessor !== 0) {
      if (fSuccessor <= successor) {
        cs = createSuccessors(false);
        if (cs === 0) { restartModel(); return; }
        fSuccessor = cs;
      }
      if (--orderFall === 0) {
        successor = fSuccessor;
        if (maxContext !== minContext) { text--; }
      }
    } else {
      setSucc(foundState, successor);
      fSuccessor = minContext;
    }
    ns = U16[minContext >> 1];
    s0 = U16[(minContext >> 1) + 1] - ns - (fFreq - 1);
    for (c = maxContext; c !== minContext; c = U32[(c >> 2) + 2]) {
      ns1 = U16[c >> 1];
      if (ns1 !== 1) {
        if ((ns1 & 1) === 0) {
          /* the stats array is full: grow it by one unit */
          oldNU = ns1 >> 1;
          i = units2Indx[oldNU - 1];
          if (i !== units2Indx[oldNU]) {
            ptr = allocUnits(i + 1);
            if (ptr === 0) { restartModel(); return; }
            oldPtr = U32[(c >> 2) + 1];
            copyUnits(ptr, oldPtr, oldNU);
            insertNode(oldPtr, i);
            U32[(c >> 2) + 1] = ptr;
          }
        }
        sfq = U16[(c >> 1) + 1];
        U16[(c >> 1) + 1] = sfq + (2 * ns1 < ns ? 1 : 0) + 2 * ((4 * ns1 <= ns && sfq <= 8 * ns1) ? 1 : 0);
      } else {
        s = allocUnits(0);
        if (s === 0) { restartModel(); return; }
        copyState(s, c + 2);
        U32[(c >> 2) + 1] = s;
        if (U8[s + 1] < MAX_FREQ / 4 - 1) { U8[s + 1] <<= 1; } else { U8[s + 1] = MAX_FREQ - 4; }
        U16[(c >> 1) + 1] = U8[s + 1] + initEsc + (ns > 3 ? 1 : 0);
      }
      sfq = U16[(c >> 1) + 1];
      cf = 2 * fFreq * (sfq + 6);
      sf = s0 + sfq;
      if (cf < 6 * sf) {
        cf = 1 + (cf > sf ? 1 : 0) + (cf >= 4 * sf ? 1 : 0);
        U16[(c >> 1) + 1] = sfq + 3;
      } else {
        cf = 4 + (cf >= 9 * sf ? 1 : 0) + (cf >= 12 * sf ? 1 : 0) + (cf >= 15 * sf ? 1 : 0);
        U16[(c >> 1) + 1] = sfq + cf;
      }
      s = U32[(c >> 2) + 1] + ns1 * 6;
      setSucc(s, successor);
      U8[s] = fSym;
      U8[s + 1] = cf;
      U16[c >> 1] = ns1 + 1;
    }
    maxContext = minContext = fSuccessor;
  }

  /* Halve all frequencies of minContext (when one exceeds MAX_FREQ). */
  function rescale() {
    var mc = minContext, stats = U32[(mc >> 2) + 1], s = foundState;
    var tf, s1, adder, sumFreq, escFreq, i, numStats0, n0, n1;
    /* move the found state to the front */
    copyState(head, s);
    for (; s !== stats; s -= 6) { copyState(s, s - 6); }
    copyState(s, head);
    escFreq = U16[(mc >> 1) + 1] - U8[s + 1];
    U8[s + 1] += 4;
    adder = orderFall !== 0 ? 1 : 0;
    U8[s + 1] = (U8[s + 1] + adder) >> 1;
    sumFreq = U8[s + 1];
    i = U16[mc >> 1] - 1;
    do {
      s += 6;
      escFreq -= U8[s + 1];
      U8[s + 1] = (U8[s + 1] + adder) >> 1;
      sumFreq += U8[s + 1];
      if (U8[s + 1] > U8[s - 5]) {
        s1 = s;
        copyState(head, s1);
        tf = U8[s1 + 1];
        do {
          copyState(s1, s1 - 6);
          s1 -= 6;
        } while (s1 !== stats && tf > U8[s1 - 5]);
        copyState(s1, head);
      }
    } while (--i);
    if (U8[s + 1] === 0) {
      numStats0 = U16[mc >> 1];
      do { i++; s -= 6; } while (U8[s + 1] === 0);
      escFreq += i;
      U16[mc >> 1] = numStats0 - i;
      if (U16[mc >> 1] === 1) {
        /* only one symbol left: it moves into the context itself */
        tf = U8[stats + 1];
        do {
          tf = tf - (tf >> 1);
          escFreq >>>= 1;
        } while (escFreq > 1);
        foundState = mc + 2;
        copyState(foundState, stats);
        U8[foundState + 1] = tf;
        insertNode(stats, units2Indx[((numStats0 + 1) >> 1) - 1]);
        return;
      }
      n0 = (numStats0 + 1) >> 1;
      n1 = (U16[mc >> 1] + 1) >> 1;
      if (n0 !== n1) { U32[(mc >> 2) + 1] = shrinkUnits(stats, n0, n1); }
    }
    U16[(mc >> 1) + 1] = sumFreq + escFreq - (escFreq >>> 1);
    foundState = U32[(mc >> 2) + 1];
  }

  /* SEE: returns the SEE slot; the escape frequency goes into escFreqOut. */
  function makeEscFreq(numMasked) {
    var mc = minContext, ns = U16[mc >> 1], nonMasked = ns - numMasked, see, r;
    if (ns !== 256) {
      see = ns2Indx[nonMasked - 1] * 16 +
        (nonMasked < ((U16[U32[(mc >> 2) + 2] >> 1] - ns) >>> 0) ? 1 : 0) +
        2 * (U16[(mc >> 1) + 1] < 11 * ns ? 1 : 0) +
        4 * (numMasked > nonMasked ? 1 : 0) +
        hiBitsFlag;
      r = seeSumm[see] >> seeShift[see];
      seeSumm[see] -= r;
      escFreqOut = r + (r === 0 ? 1 : 0);
    } else {
      see = DUMMY_SEE;
      escFreqOut = 1;
    }
    return see;
  }

  function nextContext() {
    var c = getSucc(foundState);
    if (orderFall === 0 && c > text) { minContext = maxContext = c; } else { updateModel(); }
  }
  function update1() {
    var s = foundState;
    U8[s + 1] += 4;
    U16[(minContext >> 1) + 1] += 4;
    if (U8[s + 1] > U8[s - 5]) {
      swapStates(s, s - 6);
      foundState = s -= 6;
      if (U8[s + 1] > MAX_FREQ) { rescale(); }
    }
    nextContext();
  }
  function update1_0() {
    prevSuccess = (2 * U8[foundState + 1] > U16[(minContext >> 1) + 1]) ? 1 : 0;
    runLength += prevSuccess;
    U16[(minContext >> 1) + 1] += 4;
    U8[foundState + 1] += 4;
    if (U8[foundState + 1] > MAX_FREQ) { rescale(); }
    nextContext();
  }
  function updateBin() {
    if (U8[foundState + 1] < 128) { U8[foundState + 1]++; }
    prevSuccess = 1;
    runLength++;
    nextContext();
  }
  function update2() {
    U16[(minContext >> 1) + 1] += 4;
    U8[foundState + 1] += 4;
    if (U8[foundState + 1] > MAX_FREQ) { rescale(); }
    runLength = initRL;
    updateModel();
  }

  /*
   * The main decoding loop: decodes outSize symbols with the 7z range decoder.
   * Range, Code and the read position live in local variables here (fast).
   * Normalization (pulling in new bytes while Range < 2^24) is done lazily,
   * right before Range and Code are needed next; this consumes exactly the
   * same bytes in the same order as the reference decoder.
   */
  function decodeAll() {
    var u8 = U8, u16 = U16, u32 = U32, mask = charMask, psl = ps;
    var rng = 0xFFFFFFFF, cd = ((src[1] << 24) | (src[2] << 16) | (src[3] << 8) | src[4]) >>> 0;
    var sp = 5, n, mc, ns, s, i, count, hiCnt, sf, sym, f, prob, idx, bound;
    var numMasked, num, k, see, freqSum, pp;
    if (cd === 0xFFFFFFFF) throw new Error('PPMd: bad stream header');
    for (n = 0; n < outSize; n++) {
      sym = -1;
      while (rng < 16777216) {
        if (sp >= srcLen) throw new Error('PPMd: the compressed data ended early');
        cd = ((cd << 8) | src[sp++]) >>> 0;
        rng = (rng << 8) >>> 0;
      }
      mc = minContext;
      ns = u16[mc >> 1];
      decode: {
        if (ns !== 1) {
          /* context with several symbols: pick by cumulative frequency */
          s = u32[(mc >> 2) + 1];
          sf = u16[(mc >> 1) + 1];
          rng = (rng / sf) >>> 0;
          count = (cd / rng) >>> 0;
          hiCnt = u8[s + 1];
          if (count < hiCnt) {
            rng = (rng * hiCnt) >>> 0;
            foundState = s;
            sym = u8[s];
            update1_0();
            break decode;
          }
          prevSuccess = 0;
          i = ns - 1;
          do {
            s += 6;
            f = u8[s + 1];
            hiCnt += f;
            if (hiCnt > count) {
              cd = (cd - (hiCnt - f) * rng) >>> 0;
              rng = (rng * f) >>> 0;
              foundState = s;
              sym = u8[s];
              update1();
              break decode;
            }
          } while (--i);
          if (count >= sf) { sym = -2; break decode; }
          hiBitsFlag = hb2Flag[u8[foundState]];
          cd = (cd - hiCnt * rng) >>> 0;
          rng = (rng * (sf - hiCnt)) >>> 0;
          mask.fill(-1);
          mask[u8[s]] = 0;
          i = ns - 1;
          do { s -= 6; mask[u8[s]] = 0; } while (--i);
        } else {
          /* binary context: one symbol, one adaptive probability */
          hiBitsFlag = hb2Flag[u8[foundState]];
          idx = (u8[mc + 3] - 1) * 64 + prevSuccess +
            ns2bsIndx[u16[u32[(mc >> 2) + 2] >> 1] - 1] + hiBitsFlag +
            2 * hb2Flag[u8[mc + 2]] + ((runLength >> 26) & 0x20);
          prob = binSumm[idx];
          bound = (rng >>> 14) * prob;
          if (cd < bound) {
            rng = bound;
            binSumm[idx] = prob + 128 - ((prob + 32) >> 7);
            foundState = mc + 2;
            sym = u8[mc + 2];
            updateBin();
            break decode;
          }
          cd = (cd - bound) >>> 0;
          rng = (rng - bound) >>> 0;
          prob = prob - ((prob + 32) >> 7);
          binSumm[idx] = prob;
          initEsc = expEscape[prob >> 10];
          mask.fill(-1);
          mask[u8[mc + 2]] = 0;
          prevSuccess = 0;
        }
        /* escape: walk down to shorter contexts, skipping already-seen symbols */
        for (;;) {
          while (rng < 16777216) {
            if (sp >= srcLen) throw new Error('PPMd: the compressed data ended early');
            cd = ((cd << 8) | src[sp++]) >>> 0;
            rng = (rng << 8) >>> 0;
          }
          numMasked = u16[minContext >> 1];
          do {
            orderFall++;
            if (u32[(minContext >> 2) + 2] === 0) { sym = -1; break decode; }
            minContext = u32[(minContext >> 2) + 2];
          } while (u16[minContext >> 1] === numMasked);
          mc = minContext;
          hiCnt = 0;
          s = u32[(mc >> 2) + 1];
          i = 0;
          num = u16[mc >> 1] - numMasked;
          do {
            k = mask[u8[s]];
            hiCnt += u8[s + 1] & k;
            psl[i] = s;
            s += 6;
            i -= k;
          } while (i !== num);
          see = makeEscFreq(numMasked);
          freqSum = escFreqOut + hiCnt;
          rng = (rng / freqSum) >>> 0;
          count = (cd / rng) >>> 0;
          if (count < hiCnt) {
            pp = 0;
            hiCnt = 0;
            while ((hiCnt += u8[psl[pp] + 1]) <= count) { pp++; }
            s = psl[pp];
            f = u8[s + 1];
            cd = (cd - (hiCnt - f) * rng) >>> 0;
            rng = (rng * f) >>> 0;
            if (seeShift[see] < 7) {
              k = (seeCount[see] - 1) & 255;
              seeCount[see] = k;
              if (k === 0) {
                seeSumm[see] <<= 1;
                seeCount[see] = (3 << seeShift[see]) & 255;
                seeShift[see]++;
              }
            }
            foundState = s;
            sym = u8[s];
            update2();
            break decode;
          }
          if (count >= freqSum) { sym = -2; break decode; }
          cd = (cd - hiCnt * rng) >>> 0;
          rng = (rng * (freqSum - hiCnt)) >>> 0;
          seeSumm[see] += freqSum;
          do { mask[u8[psl[--i]]] = 0; } while (i !== 0);
        }
      }
      if (sym < 0) throw new Error('PPMd: corrupt data');
      out[n] = sym;
    }
  }

  /* ---- start ---- */
  restartModel();
  seeShift[DUMMY_SEE] = 7;
  seeSumm[DUMMY_SEE] = 0;
  seeCount[DUMMY_SEE] = 64;
  decodeAll();
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = ppmd7Decode; else (typeof globalThis !== 'undefined' ? globalThis : this).ppmd7Decode = ppmd7Decode;
// Not pasted into packed pages (they stop above the export line): decode with the 5-byte coder properties a .7z archive stores for PPMd.
ppmd7Decode.fromProps = function (src, outSize, props, opts) {
  if (!props || props.length < 5) throw new Error('PPMd: the properties need 5 bytes (order, then memory size, little-endian)');
  return ppmd7Decode(src, outSize, props[0], (props[1] | (props[2] << 8) | (props[3] << 16)) + props[4] * 16777216, opts);
};
