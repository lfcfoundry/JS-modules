/* Copyright (c) 2026 LFC Foundry. MIT License.
 * lz4-kit checks: block and frame round trips at many sizes, kinds and levels (0 to 12, accelerations), both read back by an independent LZ4 decoder written
 * from the format spec in this file (block decoder, frame parser, XXH32 content checksum), the 1.11.0 LZ4_resetStreamHC case (levels 10 to 12 on a state holding
 * garbage must give the same bytes whatever the garbage is), concatenated frames, and the error paths. Run: node modules/lz4-kit/test/run.js (a few seconds) */
'use strict';
const K = require('../lz4-kit.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const eq = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.length), Buffer.from(b.buffer, b.byteOffset, b.length)) === 0;
let s = 12345; const rnd = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
function sample(n, kind) {
  const b = new Uint8Array(n);
  if (kind === 'random') for (let i = 0; i < n; i++) b[i] = rnd() * 256;
  else if (kind === 'text') { const w = ['alpha', 'beta', 'gamma', '{"id":', '12', ',"v":', '3.5}', '\n', 'error', 'ok ']; let p = 0; while (p < n) { const x = w[(rnd() * w.length) | 0]; for (let k = 0; k < x.length && p < n; k++) b[p++] = x.charCodeAt(k); } }
  else for (let i = 0; i < n; i++) b[i] = (i * 7) & 15;
  return b;
}
// ---- independent decoders, from the LZ4 block and frame format descriptions
function refBlock(src, size) {
  const out = new Uint8Array(size); let ip = 0, op = 0;
  while (ip < src.length) {
    const t = src[ip++]; let ll = t >> 4; if (ll === 15) { let x; do { x = src[ip++]; ll += x; } while (x === 255); }
    for (let k = 0; k < ll; k++) out[op++] = src[ip++];
    if (ip >= src.length) break;
    const off = src[ip] | (src[ip + 1] << 8); ip += 2; let ml = t & 15; if (ml === 15) { let x; do { x = src[ip++]; ml += x; } while (x === 255); } ml += 4;
    if (off === 0 || off > op) throw new Error('bad offset');
    for (let k = 0; k < ml; k++) { out[op] = out[op - off]; op++; }
  }
  if (op !== size) throw new Error('size ' + op + ' not ' + size);
  return out;
}
const P1 = 2654435761, P2 = 2246822519, P3 = 3266489917, P4 = 668265263, P5 = 374761393;
const rotl = (x, r) => ((x << r) | (x >>> (32 - r))) >>> 0, mul = (a, b) => Math.imul(a, b) >>> 0;
function xxh32(b) {
  let p = 0, h; const n = b.length, r32 = (i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
  if (n >= 16) { let v1 = (P1 + P2) >>> 0, v2 = P2, v3 = 0, v4 = (0 - P1) >>> 0; for (; p <= n - 16; p += 16) { v1 = mul(rotl((v1 + mul(r32(p), P2)) >>> 0, 13), P1); v2 = mul(rotl((v2 + mul(r32(p + 4), P2)) >>> 0, 13), P1); v3 = mul(rotl((v3 + mul(r32(p + 8), P2)) >>> 0, 13), P1); v4 = mul(rotl((v4 + mul(r32(p + 12), P2)) >>> 0, 13), P1); } h = (rotl(v1, 1) + rotl(v2, 7) + rotl(v3, 12) + rotl(v4, 18)) >>> 0; } else h = P5;
  h = (h + n) >>> 0; for (; p + 4 <= n; p += 4) h = mul(rotl((h + mul(r32(p), P3)) >>> 0, 17), P4);
  for (; p < n; p++) h = mul(rotl((h + mul(b[p], P5)) >>> 0, 11), P1);
  h ^= h >>> 15; h = mul(h, P2); h ^= h >>> 13; h = mul(h, P3); h ^= h >>> 16; return h >>> 0;
}
function refFrames(f) {   // one or more frames; returns the joined content
  const parts = []; let ip = 0;
  while (ip < f.length) {
    if ((f[ip] | f[ip + 1] << 8 | f[ip + 2] << 16 | f[ip + 3] << 24) >>> 0 !== 0x184D2204) throw new Error('magic'); ip += 4;
    const flg = f[ip++], bd = f[ip++]; if ((flg >> 6) !== 1) throw new Error('version'); const bi = !(flg & 32), cs = !!(flg & 8), cc = !!(flg & 4), did = !!(flg & 1);
    const bmax = [0, 0, 0, 0, 65536, 262144, 1048576, 4194304][(bd >> 4) & 7]; let csize = -1;
    if (cs) { csize = (f[ip] | f[ip + 1] << 8 | f[ip + 2] << 16 | f[ip + 3] << 24) >>> 0; ip += 8; } if (did) ip += 4; ip += 1;   // header checksum byte skipped (the library checks it)
    const frameParts = [];
    for (;;) {
      const w = (f[ip] | f[ip + 1] << 8 | f[ip + 2] << 16 | f[ip + 3] << 24) >>> 0; ip += 4; if (w === 0) break;
      const raw = !!(w & 0x80000000), n = w & 0x7FFFFFFF; if (!bi) ip += 0;
      const blk = f.subarray(ip, ip + n); ip += n; if (flg & 16) ip += 4;
      if (raw) frameParts.push(blk); else { // linked blocks refer back into earlier output: decode against the joined history
        const hist = Buffer.concat(frameParts.map(x => Buffer.from(x))); const out = decodeLinked(blk, hist, bmax); frameParts.push(out);
      }
    }
    const content = Buffer.concat(frameParts.map(x => Buffer.from(x)));
    if (cc) { const want = (f[ip] | f[ip + 1] << 8 | f[ip + 2] << 16 | f[ip + 3] << 24) >>> 0; ip += 4; if (xxh32(content) !== want) throw new Error('content checksum'); }
    if (csize >= 0 && content.length !== csize) throw new Error('content size');
    parts.push(content);
  }
  return new Uint8Array(Buffer.concat(parts));
}
function decodeLinked(src, hist, bmax) {   // a block that may reach back into the history (up to 64 KB)
  const base = hist.length, buf = new Uint8Array(base + bmax); buf.set(hist); let ip = 0, op = base;
  while (ip < src.length) {
    const t = src[ip++]; let ll = t >> 4; if (ll === 15) { let x; do { x = src[ip++]; ll += x; } while (x === 255); }
    for (let k = 0; k < ll; k++) buf[op++] = src[ip++];
    if (ip >= src.length) break;
    const off = src[ip] | (src[ip + 1] << 8); ip += 2; let ml = t & 15; if (ml === 15) { let x; do { x = src[ip++]; ml += x; } while (x === 255); } ml += 4;
    if (off === 0 || off > op) throw new Error('bad offset');
    for (let k = 0; k < ml; k++) { buf[op] = buf[op - off]; op++; }
  }
  return buf.subarray(base, op);
}
(async () => {
  let threw = false; try { K.compress(new Uint8Array(1)); } catch (e) { threw = /init\(\)/.test(e.message); } ok(threw, 'calls before init() say so');
  await K.init(); ok(K.ready(), 'ready after init'); ok(K.lz4Version === '1.11.1' && K.version === '1.1.3', 'version labels');
  const sizes = [0, 1, 7, 13, 100, 4096, 65537, 300000, 2100000];
  for (const n of sizes) for (const kind of ['random', 'text', 'pattern']) {
    const b = sample(n, kind);
    for (const lv of (n > 500000 ? [0, 9, 12] : [0, 1, 3, 9, 10, 11, 12])) {
      const blk = K.compressBlock(b, lv), fr = K.compress(b, lv);
      ok(eq(K.decompressBlock(blk, n), b), 'block round trip ' + kind + ' ' + n + ' level ' + lv);
      ok(eq(refBlock(blk, n), b), 'independent decoder reads the block ' + kind + ' ' + n + ' level ' + lv);
      ok(eq(K.decompress(fr), b), 'frame round trip ' + kind + ' ' + n + ' level ' + lv);
      ok(eq(refFrames(fr), b), 'independent parser reads the frame and its checksum ' + kind + ' ' + n + ' level ' + lv);
      ok(eq(K.decompress(fr, n), b), 'frame with the size given ' + kind + ' ' + n);
    }
  }
  // incompressible data stays within the bound, high levels are never larger than fast on text
  const rnd1 = sample(100000, 'random'); ok(K.compressBlock(rnd1, 0).length <= 100000 + 100000 / 255 + 16, 'random data within the LZ4 bound');
  const tx = sample(300000, 'text'); ok(K.compressBlock(tx, 9).length <= K.compressBlock(tx, 0).length, 'level 9 not larger than the fast mode on text');
  for (const a of [1, 2, 8, 64]) { const b = K.compressBlock(tx, 0, a); ok(eq(refBlock(b, tx.length), tx), 'acceleration ' + a + ' reads back'); }
  ok(K.compressBlock(tx, 0, 64).length >= K.compressBlock(tx, 0, 1).length, 'higher acceleration is not smaller');
  // the 1.11.0 bug: LZ4_resetStreamHC at levels 10 and up on a state holding garbage wrote out of bounds. The result must not depend on the garbage.
  const hs = sample(200000, 'text');
  for (const lv of [9, 10, 11, 12]) {
    const ref = K._streamHighBlock(hs, lv, 0);
    for (const junk of [0xA5, 0xFF, 0x5A, 0x13, 0x80]) { const o = K._streamHighBlock(hs, lv, junk); ok(eq(o, ref), 'level ' + lv + ' stream output independent of a state full of 0x' + junk.toString(16)); }
    ok(eq(refBlock(ref, hs.length), hs), 'level ' + lv + ' stream block reads back');
  }
  const memBefore = K._streamHighBlock; for (let i = 0; i < 200; i++) K._streamHighBlock(sample(5000, 'text'), 10 + (i % 3), 0xC3); ok(typeof memBefore === 'function', 'repeated dirty-state use does not throw');
  // frames written one after another join; mixed levels
  const a = sample(70000, 'text'), c = sample(30000, 'pattern'), cat = new Uint8Array(K.compress(a, 0).length + K.compress(c, 12).length); cat.set(K.compress(a, 0), 0); cat.set(K.compress(c, 12), K.compress(a, 0).length);
  const joined = new Uint8Array(a.length + c.length); joined.set(a, 0); joined.set(c, a.length); ok(eq(K.decompress(cat), joined), 'concatenated frames are joined');
  // error paths
  const small = sample(1000, 'text'), bf = K.compressBlock(small, 0), ff = K.compress(small, 0);
  const t = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
  ok(t(() => K.decompressBlock(bf, 999), /damaged|size/), 'block with a size too small throws');
  ok(t(() => K.decompressBlock(bf.subarray(0, bf.length - 3), 1000), /damaged|size/), 'truncated block throws');
  ok(t(() => K.decompressBlock(bf), /size/), 'block without a size throws');
  ok(t(() => K.decompress(ff.subarray(0, ff.length - 6)), /damaged/), 'truncated frame throws');
  const bad = ff.slice(); bad[bad.length - 1] ^= 1; ok(t(() => K.decompress(bad), /damaged/), 'frame with a wrong content checksum throws');
  ok(t(() => K.decompress(new Uint8Array([1, 2, 3, 4, 5, 6])), /damaged/), 'not a frame throws');
  ok(t(() => K.decompress(ff, 999), /damaged|larger|holds/), 'frame with a wrong size given throws');
  { // since 1.1.3 the recorded content size sets the room: frames that shrink far more than 8 times still come back whole, and a header claiming
    // far more than LZ4 can hold is not trusted with memory
    const z = new Uint8Array(3 << 20); for (let i = 0; i < z.length; i += 4096) z[i] = i & 255;
    for (const lv of [0, 9]) { const fz = K.compress(z, lv); ok(fz.length * 8 < z.length && eq(K.decompress(fz), z), 'frame that shrank ' + Math.round(z.length / fz.length) + ' times, level ' + lv); }
    const big = ff.slice(); if (big[4] & 8) { big[9] = 0x7D; ok(t(() => K.decompress(big), /damaged/), 'frame whose header claims 2 GB throws'); }
    else ok(false, 'own frames record the content size');
  }
  ok(t(() => K.compress(small, 13), /level/) && t(() => K.compress(small, -1), /level/) && t(() => K.compress(small, 1.5), /level/), 'bad levels are refused');
  ok(t(() => K.compressBlock(small, 0, 0), /acceleration/), 'bad acceleration is refused');
  ok(t(() => K.compress(5), /Uint8Array/), 'wrong input type is refused');
  ok(eq(K.decompress(K.compress('héllo wörld')), new TextEncoder().encode('héllo wörld')), 'strings are encoded as UTF-8');
  ok(eq(K.decompress(K.compress(new Float64Array([1.5, 2.5]))), new Uint8Array(new Float64Array([1.5, 2.5]).buffer)), 'other typed arrays go in as their bytes');
  // view mode (1.1.0): same bytes as the copy, a window into wasm memory, and the default stays a private copy
  {
    const vb = sample(300000, 'text'), cp = K.compressBlock(vb, 0), vw = K.compressBlock(vb, 0, 1, { view: true });
    ok(eq(vw, cp) && vw.buffer.byteLength > vw.length, 'view block bytes equal the copy and sit in wasm memory');
    ok(cp.buffer.byteLength === cp.length, 'the default is a private copy');
    const vwc = vw.slice(); ok(eq(K.decompressBlock(vwc, vb.length, { view: true }), vb), 'decompressBlock view reads back');
    const f1 = K.compress(vb, 0, { view: true }).slice(); ok(eq(f1, K.compress(vb, 0)), 'compress view equals the copy');
    ok(eq(K.decompress(f1, undefined, { view: true }), vb) && eq(K.decompress(f1, vb.length, { view: true }), vb), 'decompress view reads back');
    const keep = K.compressBlock(vb, 0), other = sample(300000, 'pattern'); K.compressBlock(other, 0, 1, { view: true }); ok(eq(keep, cp), 'a copy is not changed by later calls');
    ok(eq(K.compressBlock(vb, 0, 1, {}), cp) && eq(K.compressBlock(vb, 0, 1, null), cp) && eq(K.compressBlock(vb, 0, 1, { view: false }), cp), 'empty or false options give the copy');
    ok(t(() => K.decompressBlock(new Uint8Array([1, 2, 3]), 10, { view: true }), /damaged/), 'view calls throw on damaged input too');
  }
  // the kit's own fast block compressor (1.1.1): default speed, inputs of 64 KiB and more. Its blocks must be standard LZ4 (both decoders and the end-of-block rules),
  // depend on the input alone, stay within the bound, and hand hard data over to LZ4 in the middle of a block without a seam.
  {
    const rules = (blk, n) => {   // every sequence but the last has a match; the last is literals only, at least 5 of them; the last match starts 12 or more bytes before the end
      let ip = 0, op = 0, lastMatchStart = -1, lastLits = -1;
      while (ip < blk.length) {
        const tk = blk[ip++]; let ll = tk >> 4; if (ll === 15) { let x; do { x = blk[ip++]; ll += x; } while (x === 255); }
        ip += ll; op += ll; if (ip >= blk.length) { lastLits = ll; break; }
        const off = blk[ip] | (blk[ip + 1] << 8); ip += 2; let ml = tk & 15; if (ml === 15) { let x; do { x = blk[ip++]; ml += x; } while (x === 255); } ml += 4;
        if (off === 0 || off > op) return false; lastMatchStart = op; op += ml;
      }
      return ip === blk.length && op === n && (n < 13 ? lastMatchStart < 0 : lastLits >= 5 && (lastMatchStart < 0 || lastMatchStart <= n - 12));
    };
    const logs = (n, seed) => { let q = seed >>> 0; const r = () => (q = (Math.imul(q, 1103515245) + 12345) >>> 0) / 4294967296, out = []; let tot = 0, i = 0;
      while (tot < n) { const l = '{"ts":"2026-11-' + (10 + i % 9) + 'T' + ('0' + i % 24).slice(-2) + ':' + ('0' + i * 7 % 60).slice(-2) + 'Z","ip":"10.' + (r() * 255 | 0) + '.' + (r() * 255 | 0) + '.' + (r() * 255 | 0) + '","path":"/api/v1/items' + (r() * 1000 | 0) + '","status":' + [200, 304, 404, 500][r() * 4 | 0] + ',"ua":"Mozilla/5.0 (X11; Linux x86_64)"}\n'; out.push(l); tot += l.length; i++; }
      return new TextEncoder().encode(out.join('')).subarray(0, n); };
    const cat = (...parts) => { const o = new Uint8Array(parts.reduce((a, x) => a + x.length, 0)); let at = 0; for (const x of parts) { o.set(x, at); at += x.length; } return o; };
    const check = (b, name) => {
      const blk = K.compressBlock(b, 0), n = b.length;
      ok(eq(refBlock(blk, n), b), 'own compressor: independent decoder reads ' + name);
      ok(eq(K.decompressBlock(blk, n), b), 'own compressor: LZ4 reads ' + name);
      ok(rules(blk, n), 'own compressor: end-of-block rules hold for ' + name);
      ok(blk.length <= n + Math.floor(n / 255) + 16, 'own compressor: within the bound for ' + name);
      return blk;
    };
    for (const n of [65535, 65536, 65537, 65548, 65549, 70001, 131072, 1048579]) {
      check(logs(n, 7), 'logs ' + n); check(sample(n, 'random'), 'random ' + n); check(sample(n, 'text'), 'text ' + n); check(sample(n, 'pattern'), 'pattern ' + n); check(new Uint8Array(n), 'zeros ' + n);
    }
    const L = logs(400000, 3), R = sample(400000, 'random');
    check(cat(L, R), 'logs then random'); check(cat(R, L), 'random then logs'); check(cat(L.subarray(0, 5000), R), 'a short easy start then random');
    check(cat(L.subarray(0, 48000), R.subarray(0, 48000), L.subarray(48000, 96000), R.subarray(48000, 96000), L.subarray(96000, 300000)), 'alternating easy and hard');
    check(cat(L, R.subarray(0, 200000), L), 'easy, hard, easy again');
    check(cat(R.subarray(0, 3000), R.subarray(0, 3000), R.subarray(0, 70000), R.subarray(100, 70000), new Uint8Array(40000).fill(65), R.subarray(0, 5)), 'long literal runs and long matches');
    check(cat(L, L.subarray(0, 11)), 'a match that runs to the end'); check(cat(L, new Uint8Array(4)), 'four zero bytes at the end'); check(cat(new Uint8Array(70000).fill(9), R.subarray(0, 12)), 'a run then 12 new bytes');
    // built from random pieces: new bytes, copies of earlier bytes (near and up to 70,000 back), runs of one byte
    for (let k = 0; k < 120; k++) {
      const n = 65536 + (rnd() * (k % 10 === 0 ? 900000 : 150000) | 0), b = new Uint8Array(n); let p = 0; const easy = rnd() < 0.6;
      while (p < n) { const kind = rnd(), len = Math.min(n - p, 1 + (rnd() * (rnd() < 0.1 ? 3000 : 40) | 0));
        if (kind < (easy ? 0.15 : 0.6) || p < 8) for (let j = 0; j < len; j++) b[p++] = rnd() * 256;
        else if (kind < 0.9) { const d = 1 + (rnd() * Math.min(p, rnd() < 0.5 ? 300 : 70000) | 0); for (let j = 0; j < len; j++, p++) b[p] = b[p - d]; }
        else { const v = rnd() * 256 | 0; for (let j = 0; j < len; j++) b[p++] = v; } }
      const blk = K.compressBlock(b, 0), good = eq(refBlock(blk, n), b) && eq(K.decompressBlock(blk, n), b) && rules(blk, n) && blk.length <= n + Math.floor(n / 255) + 16;
      ok(good, 'own compressor: random pieces case ' + k + ' (' + n + ' bytes)');
    }
    // the same input gives the same bytes whatever was packed before
    const first = K.compressBlock(L, 0); K.compressBlock(R, 0); K.compressBlock(sample(90000, 'text'), 0); K.compressBlock(L.subarray(1), 0);
    ok(eq(K.compressBlock(L, 0), first), 'own compressor: output does not depend on earlier calls');
    ok(eq(K.compressBlock(L, 0, 1), first) && eq(K.compressBlock(L, 0, 1, { view: true }), first), 'own compressor: acceleration 1 and view give the same bytes');
    ok(K.compressBlock(L, 0, 2).length > first.length, 'acceleration 2 still goes to LZ4 and is larger');
    const big = logs(4 << 20, 7), bb = K.compressBlock(big, 0); ok(bb.length < big.length * 0.25, 'own compressor: 4 MiB of logs pack below 25% (' + (100 * bb.length / big.length).toFixed(1) + '%)');
    // fast frames of 64 KiB and more (1.1.2) are written by the kit: independent blocks of up to 4 MiB through the same compressor, content size and checksum as before
    {
      const frameOk = (b, name) => { const fr = K.compress(b, 0);
        ok(eq(K.decompress(fr), b) && eq(K.decompress(fr, b.length), b), 'own frame: LZ4 reads ' + name);
        ok(eq(refFrames(fr), b), 'own frame: independent parser reads ' + name + ' and its checksum');
        ok(fr.length <= b.length + 15 + 8 + 4 * (Math.floor(b.length / (4 << 20)) + 1), 'own frame: never more than the input plus the frame fields for ' + name);
        return fr; };
      for (const n of [65535, 65536, 65537, 300001, (4 << 20) - 1, 4 << 20, (4 << 20) + 1, (4 << 20) + 65536, (9 << 20) + 7]) { frameOk(logs(n, 5), 'logs ' + n); if (n < (5 << 20)) frameOk(sample(n, 'random'), 'random ' + n); }
      frameOk(cat(L, R, L), 'easy, hard, easy'); frameOk(cat(R, logs(5 << 20, 9)), 'random then 5 MiB of logs'); frameOk(new Uint8Array(6 << 20), '6 MiB of zeros');
      const f1 = K.compress(L, 0); ok(f1[4] === 0x6C && f1[5] === 0x70, 'own frame: flags say independent blocks of up to 4 MiB, size and checksum');
      K.compress(R, 0); K.compressBlock(R, 0); ok(eq(K.compress(L, 0), f1) && eq(K.compress(L, 0, { view: true }), f1), 'own frame: same bytes whatever was packed before, and with view');
      ok(K.compress(big, 0).length < K.compressBlock(big, 0).length + 40, 'own frame: 4 MiB of logs is the block plus the frame fields');
      const tA = sample(1000, 'text'), tB = R.subarray(0, 70000); ok(eq(K.decompress(cat(K.compress(L, 0), K.compress(tA, 0), K.compress(tB, 3))), cat(L, tA, tB)), 'own frames join with LZ4F frames');
      const bad2 = f1.slice(); bad2[bad2.length - 2] ^= 4; let thr = false; try { K.decompress(bad2); } catch (e) { thr = /damaged/.test(e.message); } ok(thr, 'own frame: a wrong content checksum throws');
    }
    // positions wrap after about 4 GB of input in one page: the table is cleared and the output stays the same
    const z = new Uint8Array(96 << 20); for (let k = 0; k < 46; k++) K.compressBlock(z, 0, 1, { view: true });
    ok(eq(K.compressBlock(L, 0), first), 'own compressor: same bytes after more than 4 GB of input');
    check(cat(L, R.subarray(0, 100000)), 'logs then random after the wrap');
  }
  K.release(); ok(eq(K.decompress(K.compress(small)), small), 'works again after release()');
  console.log('lz4-kit checks: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
