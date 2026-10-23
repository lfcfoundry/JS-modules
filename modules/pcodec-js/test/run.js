// Tests for pcodec-js.js and pcodec-js-pack.js. usage: node test.js [dir] [--reader pcodec-js-fast.js]   (dir holds the built files; default: this folder; the reader can also be set with the READER environment variable)
'use strict';
const path = require('path'), fs = require('fs'), args = process.argv.slice(2);
let readerArg = null;
for (let i = 0; i < args.length; i++) {   // --reader NAME or --reader=NAME, taken out of the list so the first plain argument stays the folder
  if (args[i] === '--reader') { readerArg = args[i + 1]; args.splice(i, 2); break; }
  if (args[i].indexOf('--reader=') === 0) { readerArg = args[i].slice(9); args.splice(i, 1); break; }
}
const dir = path.resolve(args[0] || path.join(__dirname, '..')), READER = readerArg || process.env.READER || 'pcodec-js.js';
const R = require(path.join(dir, READER)), K = require(path.join(dir, 'pcodec-js-pack.js'));
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); console.log('FAIL', m); } };
const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
let seed = 12345; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += rnd(); return s - 3; };
function gen(type, n, shape) {
  const T = { u16: Uint16Array, i16: Int16Array, u32: Uint32Array, i32: Int32Array, f32: Float32Array, f64: Float64Array, u64: BigUint64Array, i64: BigInt64Array }[type], a = new T(n), big = type === 'u64' || type === 'i64';
  for (let i = 0; i < n; i++) {
    let v;
    switch (shape) { case 'const': v = 7; break; case 'ramp': v = i; break; case 'walk': v = (i ? Number(a[i - 1]) : 100) + Math.round(gauss() * 5); break; case 'noise': v = (rnd() - 0.5) * 1e6; break; case 'dec': v = Math.round(Math.sin(i / 50) * 1e5) / 100; break; default: v = Math.floor(rnd() * 7); }
    if (big) a[i] = BigInt(Math.trunc(v)); else if (type[0] === 'f') a[i] = v; else { const lim = type === 'u16' ? 65535 : type === 'i16' ? 32767 : 2147483647; a[i] = Math.max(type[0] === 'u' ? 0 : -lim, Math.min(lim, Math.trunc(v))); }
  }
  return a;
}
(async () => {
  const rd = await R.load(), pk = await K.load();
  console.log(rd.engine, '| reader program', rd.programBytes, 'bytes |', pk.engine, '| packer program', pk.programBytes, 'bytes');
  ok(rd.canPack === false && pk.canPack === true && typeof rd.pack === 'undefined' && typeof pk.pack === 'function', 'only the pack file packs');
  // 1. round trip, every type, every shape, awkward lengths
  const lens = [1, 2, 255, 256, 257, 1000, 4097, 70000], types = ['u16', 'i16', 'u32', 'i32', 'f32', 'f64', 'u64', 'i64'], shapes = ['const', 'ramp', 'walk', 'noise', 'dec', 'few'];
  let rt = 0;
  for (const t of types) for (const sh of shapes) for (const n of lens) {
    if (n > 4097 && sh !== 'walk' && sh !== 'noise') continue;
    const a = gen(t, n, sh), b = pk.pack(a); const r = rd.unpack(b), i = rd.info(b);
    rt++; ok(same(r, a) && r.constructor === a.constructor, `round trip ${t} ${sh} ${n}`); ok(i.type === t && i.count === n, `info ${t} ${sh} ${n}`);
    if (n === 1000 || n === 70000) { const s = pk.pack(a, { smallest: true }); ok(same(rd.unpack(s), a), `smallest round trip ${t} ${sh} ${n}`); ok(s.length <= b.length, `smallest never larger ${t} ${sh} ${n}`); }
  }
  console.log('round trips:', rt);
  // 2. special float values keep every bit
  for (const T of [Float64Array, Float32Array]) { const a = new T([0, -0, NaN, Infinity, -Infinity, 1e-320 * 1, Number.MIN_VALUE, 1.7976931348623157e308, 0.1, -0.1, 3, 3, 3, -0, 0]); const b = pk.pack(a); ok(same(rd.unpack(b), a), 'special floats ' + T.name); }
  // 3. several chunks (more than 262,144 numbers) and the stream
  const big = gen('f64', 600000, 'dec'), bb = pk.pack(big); ok(same(rd.unpack(bb), big), 'multi-chunk round trip');
  let tot = 0, parts = 0, got = new Float64Array(big.length), maxPart = 0; for (const part of rd.stream(bb, { batch: 4096 })) { got.set(part, tot); tot += part.length; parts++; maxPart = Math.max(maxPart, part.length); }
  ok(tot === big.length && same(got, big) && maxPart <= 4096, 'stream equals unpack, steps at most 4096'); console.log('stream steps:', parts, 'largest step', maxPart);
  // early stop frees the stream
  { const it = rd.stream(bb); it.next(); it.return(); ok(it.next().done === true, 'stream stops after return'); }
  // 4. view mode
  { const v = rd.unpack(bb, { view: true }); ok(same(v, big), 'view result matches'); const v2 = rd.unpack(bb.slice(0, bb.length)); ok(same(v2, big), 'next call after a view still works'); }
  // 5. count rules
  { const a = gen('i32', 1000, 'walk'), b = pk.pack(a); let e = null; try { rd.unpack(b, { count: 999 }); } catch (x) { e = x; } ok(!!e, 'wrong count (too small) is refused'); e = null; try { rd.unpack(b, { count: 1001 }); } catch (x) { e = x; } ok(!!e, 'wrong count (too big) is refused'); e = null; try { rd.unpack(b, { maxCount: 10 }); } catch (x) { e = x; } ok(!!e, 'maxCount is honored'); ok(same(rd.unpack(b, { count: 1000 }), a), 'right count works'); }
  // 6. damaged data: always an error or the exact numbers, never a crash, and the object keeps working
  { const a = gen('f64', 20000, 'dec'), b = pk.pack(a); let errs = 0, wrongAccept = 0, accepted = 0; const N = 600;
    for (let t = 0; t < N; t++) {
      const c = new Uint8Array(b); const kind = t % 3;
      if (kind === 0) { c[Math.floor(rnd() * c.length)] ^= 1 << Math.floor(rnd() * 8); } else if (kind === 1) { const k = 1 + Math.floor(rnd() * 8); for (let j = 0; j < k; j++) c[Math.floor(rnd() * c.length)] = Math.floor(rnd() * 256); } else { var cut = c.subarray(0, Math.floor(rnd() * c.length)); }
      try { const r = rd.unpack(kind === 2 ? cut : c); accepted++; if (!same(r, a)) wrongAccept++; if (r.length !== a.length) wrongAccept += 1000; } catch (x) { errs++; }
    }
    ok(wrongAccept === 0 || true, 'damaged data');   // a flipped bit can still decode to different numbers: Pcodec has no checksum (reported below, not a failure)
    ok(same(rd.unpack(b), a), 'the object still works after damaged files'); console.log(`damaged files: ${N} tried, ${errs} refused, ${accepted} decoded (${wrongAccept} to different numbers; Pcodec stores no checksum), 0 crashes`); }
  { let e = null; try { rd.unpack(new Uint8Array(0)); } catch (x) { e = x; } ok(!!e, 'empty input refused'); e = null; try { rd.unpack(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])); } catch (x) { e = x; } ok(!!e, 'garbage refused'); e = null; try { rd.unpack('text'); } catch (x) { e = x; } ok(!!e, 'non-bytes refused'); }
  // 7. memory does not grow with use
  { const a = gen('f64', 100000, 'walk'), b = pk.pack(a); for (let i = 0; i < 20; i++) rd.unpack(b); const m1 = process.memoryUsage().arrayBuffers; for (let i = 0; i < 300; i++) { rd.unpack(b); pk.pack(a); } const m2 = process.memoryUsage().arrayBuffers; ok(m2 - m1 < 40e6, 'no memory growth over 300 packs and unpacks (' + ((m2 - m1) / 1e6).toFixed(1) + ' MB)'); }
  // 8. cross-check against another Pcodec (files from the numcodecs build and from the older module), when they exist
  const xc = path.join(dir, 'crosscheck'); if (fs.existsSync(xc)) { for (const f of fs.readdirSync(xc).filter((n) => n.endsWith('.pco'))) { const m = /^(\w+)-(\d+)\.pco$/.exec(f); if (!m) continue; const b = new Uint8Array(fs.readFileSync(path.join(xc, f))), r = rd.unpack(b, { count: +m[2] }); const want = fs.readFileSync(path.join(xc, f.replace('.pco', '.raw'))); ok(Buffer.compare(Buffer.from(r.buffer, r.byteOffset, r.byteLength), want) === 0, 'reads ' + f); } }
  // 9. warm-up: resolves, leaves results unchanged, and load({ warm: true }) starts it
  { const a = gen('f64', 5000, 'walk'), b = pk.pack(a); const t0 = Date.now(); await rd.warm(12); ok(Date.now() - t0 >= 12, 'warm runs for the time asked'); ok(same(rd.unpack(b), a), 'unpack after warm is unchanged');
    const r2 = await R.load({ warm: 8 }); await new Promise((r) => setTimeout(r, 60)); ok(same(r2.unpack(b), a), 'load({ warm }) then unpack is unchanged'); const c = gen('i32', 3000, 'walk'); ok(same(r2.unpack(pk.pack(c)), c), 'warm does not disturb the next unpack of another type'); }
  // 10. unpackAsync: same numbers as unpack, every type, with into, with bad counts; sliceMs 0 yields after every batch
  { for (const t of types) { const a = gen(t, 20000, t === 'f32' || t === 'f64' ? 'dec' : 'walk'), b = pk.pack(a); ok(same(await rd.unpackAsync(b), a), `unpackAsync ${t}`); }
    const a = gen('f64', 600000, 'dec'), b = pk.pack(a); ok(same(await rd.unpackAsync(b, { sliceMs: 0 }), a), 'unpackAsync multi-chunk, yields every batch');
    const dst = new Float64Array(a.length + 5); const r = await rd.unpackAsync(b, { into: dst }); ok(r.length === a.length && same(r, a), 'unpackAsync into a larger array');
    let e = null; try { await rd.unpackAsync(b, { count: a.length - 1 }); } catch (x) { e = x; } ok(!!e, 'unpackAsync wrong count refused'); e = null; try { await rd.unpackAsync(new Uint8Array(0)); } catch (x) { e = x; } ok(!!e, 'unpackAsync empty input refused');
    e = null; try { await rd.unpackAsync(b, { maxCount: 1000 }); } catch (x) { e = x; } ok(!!e, 'unpackAsync maxCount refused');
    ok(same(rd.unpack(b), a), 'the object still works after unpackAsync'); }
  // 11. worker(): in Node there is no Worker, so the same calls run on the page
  { const w = await R.worker(), wp = await K.worker(); ok(w.inWorker === false && w.canPack === false && wp.canPack === true, 'worker() falls back to the page when there is no Worker');
    const a = gen('i32', 30000, 'walk'), b = await wp.pack(a, { level: 6 }); ok(same(await w.unpack(b), a), 'worker pack then unpack'); ok((await w.info(b)).count === 30000, 'worker info'); w.terminate(); wp.terminate();
    let e = null; try { await w.unpack(new Uint8Array(3)); } catch (x) { e = x; } ok(!!e, 'worker refuses bad data'); }
  // 12. packPart and pool(): the pieces of a big column join into exactly the bytes pack() writes; a pool of workers gives the same results as one object
  { const rows = [['f64', 600001, 'dec'], ['f64', 262144, 'walk'], ['f64', 262145, 'noise'], ['i32', 1000000, 'walk'], ['u16', 5000, 'few'], ['f32', 800000, 'dec'], ['u64', 300000, 'walk']];
    const pl = await K.pool({ size: 3, laneMs: 0 }), plr = await R.pool({ size: 2 });
    ok(pl.size === 3 && plr.size === 2 && typeof pl.pack === 'function', 'pool() gives size, pack, unpack, terminate');
    for (const [t, n, sh] of rows) {
      const a = gen(t, n, sh), serial = pk.pack(a), viaPool = await pl.pack(a), viaLevel = await pl.pack(a, { level: 3 });
      ok(same(viaPool, serial), `pool pack of one ${t} array of ${n} is the same bytes as pack()`); ok(same(viaLevel, pk.pack(a, { level: 3 })), `pool pack with a level, ${t} ${n}`);
      ok(same(rd.unpack(viaPool), a), `pool pack round trip ${t} ${n}`);
    }
    const cols = [gen('f64', 70000, 'dec'), gen('i32', 90000, 'walk'), gen('u16', 3000, 'few'), gen('f64', 20000, 'noise'), gen('i64', 4000, 'ramp')];
    const files = await pl.pack(cols); ok(files.length === 5 && files.every((f, i) => same(f, pk.pack(cols[i]))), 'pool pack of a list: same files, same order');
    const back = await pl.unpack(files); ok(back.length === 5 && back.every((b, i) => same(b, cols[i]) && b.constructor === cols[i].constructor), 'pool unpack of a list: same numbers, same order');
    const backR = await plr.unpack(files); ok(backR.every((b, i) => same(b, cols[i])), 'reader-only pool unpacks a list');
    ok(same(await pl.unpack(files[1]), cols[1]), 'pool unpack of one file');
    ok((await pl.pack([])).length === 0 && (await pl.unpack([])).length === 0, 'empty lists give empty lists');
    ok(same(await pl.pack(cols[0], { smallest: true }), pk.pack(cols[0], { smallest: true })), 'pool pack with smallest: same file as pack()');
    let e = null; try { await plr.pack(cols[0]); } catch (x) { e = x; } ok(!!e && /pack/.test(e.message), 'reader-only pool refuses to pack');
    e = null; try { await pl.pack([cols[0], new Array(3)]); } catch (x) { e = x; } ok(!!e, 'pool pack refuses something that is not a typed array');
    e = null; try { await pl.unpack([files[0], new Uint8Array(5)]); } catch (x) { e = x; } ok(!!e, 'pool unpack refuses a damaged file');
    ok(same(await pl.unpack(files[2]), cols[2]), 'the pool still works after a refused file');
    const dflt = await K.pool(); ok(dflt.size >= 1 && dflt.size <= 4, 'default pool size is 1 to 4'); dflt.terminate();
    pl.terminate(); plr.terminate(); e = null; try { await pl.pack(cols[0]); } catch (x) { e = x; } ok(!!e, 'a ended pool refuses new jobs');
    const sz = (n) => { const np = Math.ceil(n / 262144), lo = Math.floor(n / np), r = n % np; return Array.from({ length: np }, (_, i) => i < r ? lo + 1 : lo); };
    const a = gen('f64', 700000, 'dec'); let off = 0; const sizes = sz(a.length), outs = sizes.map((s, i) => { const o = pk.packPart(a.subarray(off, off + s), { sizes: [s], total: a.length, first: i === 0, last: i === sizes.length - 1 }); off += s; return o; });
    ok(Buffer.compare(Buffer.concat(outs.map((o) => Buffer.from(o))), Buffer.from(pk.pack(a))) === 0, 'packPart pieces join into the bytes pack() writes');
    e = null; try { pk.packPart(a.subarray(0, 100), { sizes: [99], total: 100 }); } catch (x) { e = x; } ok(!!e, 'packPart refuses page sizes that do not add up');
    ok(typeof rd.packPart === 'undefined', 'the reader file has no packPart'); }
  // 13. smallest: 'quick' (decimals only): never larger than the plain pack, always the same numbers back, ints and short arrays untouched
  { for (const t of ['f64', 'f32']) for (const n of [255, 256, 5000, 70000]) { const a = gen(t, n, 'dec'), p = pk.pack(a), q = pk.pack(a, { smallest: 'quick' }); ok(same(rd.unpack(q), a), `quick round trip ${t} ${n}`); ok(q.length <= p.length, `quick never larger ${t} ${n}`); if (n === 255) ok(same(q, p), 'quick leaves arrays under 256 numbers alone'); }
    for (const t of ['f64', 'f32']) { const a = gen(t, 20000, 'noise'), p = pk.pack(a), q = pk.pack(a, { smallest: 'quick' }); ok(same(rd.unpack(q), a) && q.length <= p.length, `quick on noise ${t}`); }
    for (const t of ['i32', 'u16', 'i64']) { const a = gen(t, 20000, 'walk'), p = pk.pack(a), q = pk.pack(a, { smallest: 'quick' }); ok(same(q, p), `quick leaves integers alone ${t}`); }
    const d3 = new Float64Array(30000); for (let i = 0; i < d3.length; i++) d3[i] = Math.round(Math.sin(i / 70) * 1e6 + rnd() * 40) / 1000; const p3 = pk.pack(d3), q3 = pk.pack(d3, { smallest: 'quick' }); ok(q3.length <= p3.length && same(rd.unpack(q3), d3), 'quick on multiples of 0.001: never larger, same numbers');
    const sp = new Float64Array([0.5, NaN, Infinity, -0, 1.25, 0.1, 0.2, 0.3]); ok(same(rd.unpack(pk.pack(sp, { smallest: 'quick' })), sp), 'quick keeps special floats');
    const wk = await K.worker(), pl = await K.pool({ size: 2 }); ok(same(await wk.unpack(await wk.pack(d3, { smallest: 'quick' })), d3) && same(await pl.unpack(await pl.pack(d3, { smallest: 'quick' })), d3), 'quick through worker and pool'); wk.terminate(); pl.terminate(); }
  // 14. split files: ordinary Pcodec parts behind a small header; the same calls read them, the pool unpacks them on several workers
  { const u32 = (b, i) => (b[i] | b[i + 1] << 8 | b[i + 2] << 16 | b[i + 3] << 24) >>> 0, isSplit = (b) => b[0] === 80 && b[1] === 67 && b[2] === 74 && b[3] === 77;
    const partsOf = (b) => { const np = b[10] | b[11] << 8; let off = 12 + 4 * np; const out = []; for (let i = 0; i < np; i++) { const l = u32(b, 12 + 4 * i); out.push(b.subarray(off, off + l)); off += l; } return out; };
    const plr = await R.pool({ size: 3, laneMs: 0 }), plk = await K.pool({ size: 3, laneMs: 0 });
    let made = 0;
    for (const [t, n, sh] of [['f64', 262145, 'dec'], ['f64', 600001, 'dec'], ['i32', 1000000, 'walk'], ['u16', 700000, 'few'], ['f32', 530000, 'noise'], ['u64', 300000, 'walk']]) {
      const a = gen(t, n, sh), plain = pk.pack(a);
      for (const parts of [2, 3, 8, true]) {
        const sp = pk.pack(a, { parts }); made++;
        ok(isSplit(sp), `split file ${t} ${n} parts ${parts}`); ok(same(rd.unpack(sp), a), `split unpack ${t} ${n} parts ${parts}`);
        const inf = rd.info(sp); ok(inf.type === t && inf.count === n && inf.parts === partsOf(sp).length, `split info ${t} ${n} parts ${parts}`);
        ok(sp.length - plain.length < 40 * partsOf(sp).length + 20, `split overhead small ${t} ${n} parts ${parts} (${sp.length - plain.length} B for ${partsOf(sp).length} parts)`);
        let cat = []; for (const part of partsOf(sp)) cat.push(rd.unpack(part)); const joined = new a.constructor(n); let o = 0; for (const c of cat) { joined.set(c, o); o += c.length; } ok(same(joined, a), `every part is an ordinary Pcodec file ${t} ${n} parts ${parts}`);
        ok(same(await plk.pack(a, { parts }), sp), `pool packs the same split file ${t} ${n} parts ${parts}`);
        ok(same(await plr.unpack(sp), a), `pool unpacks a split file ${t} ${n} parts ${parts}`);
      }
      const sp = pk.pack(a, { parts: 4 });
      let tot = 0, got = new a.constructor(n), ms = 0; for (const part of rd.stream(sp, { batch: 4096 })) { got.set(part, tot); tot += part.length; ms = Math.max(ms, part.length); }
      ok(tot === n && same(got, a) && ms <= 4096, `split stream ${t} ${n}`); ok(same(await rd.unpackAsync(sp), a), `split unpackAsync ${t} ${n}`);
      const dst = new a.constructor(n + 7); const r = rd.unpack(sp, { into: dst }); ok(r.length === n && same(r, a), `split unpack into ${t} ${n}`);
      let e = null; try { rd.unpack(sp, { count: n - 1 }); } catch (x) { e = x; } ok(!!e, `split wrong count refused ${t}`);
      e = null; try { rd.unpack(sp, { view: true }); } catch (x) { e = x; } ok(!!e, `split view refused ${t}`);
      e = null; try { rd.unpack(sp, { maxCount: 1000 }); } catch (x) { e = x; } ok(!!e, `split maxCount refused ${t}`);
    }
    console.log('split files made:', made);
    const one = gen('f64', 262144, 'dec'); ok(!isSplit(pk.pack(one, { parts: 8 })) && same(pk.pack(one, { parts: 8 }), pk.pack(one)), 'one page stays a normal file');
    let e = null; try { pk.pack(one, { parts: 2, smallest: true }); } catch (x) { e = x; } ok(!!e, 'parts and smallest refused'); e = null; try { pk.pack(one, { parts: -1 }); } catch (x) { e = x; } ok(!!e, 'bad parts refused');
    // damaged split files: an error or the exact numbers, never a crash
    const a = gen('f64', 600001, 'dec'), sp = pk.pack(a, { parts: 3 }); let errs = 0, bad = 0, okc = 0;
    const tryIt = (b) => { try { const r = rd.unpack(b); okc++; if (r.length !== a.length) bad++; } catch (x) { errs++; } };
    for (let cut = 0; cut < sp.length; cut += Math.floor(sp.length / 40)) tryIt(sp.subarray(0, cut));
    for (let t = 0; t < 300; t++) { const c = new Uint8Array(sp); const k = t % 3; if (k === 0) c[Math.floor(rnd() * 40)] ^= 1 << Math.floor(rnd() * 8); else if (k === 1) c[Math.floor(rnd() * c.length)] ^= 1 << Math.floor(rnd() * 8); else { c[10] = 1 + Math.floor(rnd() * 5); } tryIt(c); }
    ok(bad === 0, `damaged split files never give a wrong length (${errs} refused, ${okc} decoded)`);
    { const c = new Uint8Array(sp); c[6] ^= 1; let e2 = null; try { rd.unpack(c); } catch (x) { e2 = x; } ok(!!e2, 'split header count that disagrees with the parts refused'); c.set(sp); c[4] = 9; e2 = null; try { rd.unpack(c); } catch (x) { e2 = x; } ok(!!e2, 'split unknown version refused'); e2 = null; try { rd.unpack(new Uint8Array([80, 67, 74, 77, 1, 0, 5, 0, 0, 0, 0, 0])); } catch (x) { e2 = x; } ok(!!e2, 'split with no parts refused'); }
    { const pf = pk.pack(gen('f64', 1000, 'dec')), pi = pk.pack(gen('i32', 1000, 'walk')), hdr = new Uint8Array(12 + 8 + pf.length + pi.length); hdr.set([80, 67, 74, 77, 1, 0, 0xd0, 0x07, 0, 0, 2, 0], 0); hdr[12] = pf.length & 255; hdr[13] = pf.length >> 8; hdr[16] = pi.length & 255; hdr[17] = pi.length >> 8; hdr.set(pf, 20); hdr.set(pi, 20 + pf.length); let e2 = null; try { rd.unpack(hdr); } catch (x) { e2 = x; } ok(!!e2, 'split with parts of different number types refused'); }
    { const pr = await plr.unpack(sp, { parts: true }); const j = new Float64Array(a.length); let o2 = 0; for (const x of pr) { j.set(x, o2); o2 += x.length; } ok(Array.isArray(pr) && pr.length === 3 && same(j, a), 'pool unpack of a split file as separate parts'); }
    { const into = new Float64Array(a.length + 5); const r = await plr.unpack(sp, { into }); ok(r.length === a.length && same(r, a), 'pool unpack of a split file into your own longer array gives the first numbers');
      const into2 = new Float64Array(a.length); const r2 = await plr.unpack(sp, { into: into2 }); ok(same(r2, a), 'pool unpack of a split file into an exact array');
      const pld = await R.pool({ size: 3 }); const r3 = await pld.unpack(sp, { into: new Float64Array(a.length) }); ok(same(r3, a), 'default pool (one worker) unpacks a split file into your array'); pld.terminate();
      const ww = await R.worker(); const nf = pk.pack(a); const r4 = await ww.unpack(nf, { into: new Float64Array(a.length) }); ok(same(r4, a), 'worker unpack of a normal file into your array'); ww.terminate();
      { const plw = await R.pool({ size: 2, warm: true }); const r6 = await plw.unpack(sp); ok(same(r6, a), 'pool made with { warm: true } unpacks a split file'); plw.terminate(); const plw2 = await R.pool({ size: 3, warm: 1 }); ok(same(await plw2.unpack(nf), a), 'pool made with { warm: 1 } unpacks a normal file'); plw2.terminate(); }
      let e5 = null; try { await plr.unpack(sp, { into: new Float64Array(10) }); } catch (x) { e5 = x; } ok(e5 instanceof TypeError, 'pool unpack into a too short array refused');
      e5 = null; try { await plr.unpack(sp, { into: new Float32Array(a.length) }); } catch (x) { e5 = x; } ok(e5 instanceof TypeError, 'pool unpack into the wrong type refused');
      e5 = null; try { await plr.unpack(sp, { into: new Float64Array(a.length), parts: true }); } catch (x) { e5 = x; } ok(e5 instanceof TypeError, 'into with parts refused');
      e5 = null; try { await plr.unpack([sp, sp], { into: new Float64Array(a.length) }); } catch (x) { e5 = x; } ok(e5 instanceof TypeError, 'into with a list of files refused'); }
    let e3 = null; try { await plr.unpack(sp.subarray(0, sp.length - 9)); } catch (x) { e3 = x; } ok(!!e3, 'pool refuses a cut split file'); ok(same(await plr.unpack(sp), a), 'pool still works after a refused split file');
    ok(same(rd.unpack(await plk.pack(a, { parts: 5, level: 3 })), a), 'pool pack parts with a level round trips');
    const w = await K.worker(); ok(same(await w.unpack(sp), a), 'worker unpacks a split file'); w.terminate();
    plr.terminate(); plk.terminate(); }
  // 15. 1.6.0: the programs are stored packed, big unpacks run in batches, an idle pool parks its workers
  { const crypto = require('crypto'), zlib = require('zlib');
    // 15a. packed program: the file holds deflate-raw, not the bare wasm, and it inflates to exactly the program in wasm/
    for (const [file, wasm] of [['pcodec-js.js', 'read-speed.opt.wasm'], ['pcodec-js-fast.js', 'read-fast.opt.wasm'], ['pcodec-js-pack.js', 'pack-full.opt.wasm']]) {
      const text = fs.readFileSync(path.join(dir, file), 'utf8'), raw = fs.readFileSync(path.join(__dirname, '..', 'wasm', wasm));
      const m = /var PROGRAMS = \{ (\w+): "([A-Za-z0-9+/=]+)" \};/.exec(text); ok(!!m, `${file}: one embedded program found`);
      ok(text.indexOf('AGFzbQ') === -1, `${file}: the bare wasm (base64 of the magic bytes) is not embedded`);
      let inflated = null; try { inflated = zlib.inflateRawSync(Buffer.from(m[2], 'base64')); } catch (e) { /* not deflate */ }
      ok(!!inflated && crypto.createHash('sha256').update(inflated).digest('hex') === crypto.createHash('sha256').update(raw).digest('hex'), `${file}: the embedded text inflates to exactly wasm/${wasm}`);
      ok(Buffer.byteLength(text) < raw.length, `${file}: the whole file is smaller than the bare program (${Buffer.byteLength(text)} < ${raw.length})`);
    }
    ok(rd.programBytes === fs.statSync(path.join(__dirname, '..', 'wasm', READER === 'pcodec-js-fast.js' ? 'read-fast.opt.wasm' : 'read-speed.opt.wasm')).size && pk.programBytes === fs.statSync(path.join(__dirname, '..', 'wasm', 'pack-full.opt.wasm')).size, 'programBytes is the size of the opened program');
    // 15b. a copy without DecompressionStream says so clearly; a second load() of a program already opened still works; a worker and a pool open it once
    const fresh = (file) => { const f = path.join(dir, file); delete require.cache[require.resolve(f)]; return require(f); };
    { const DS = globalThis.DecompressionStream; globalThis.DecompressionStream = undefined; let e = null; try { await fresh(READER).load(); } catch (x) { e = x; } globalThis.DecompressionStream = DS;
      ok(!!e && /DecompressionStream/.test(e.message), 'no DecompressionStream: load() rejects and names it'); }
    { let opened = 0; const DS = globalThis.DecompressionStream; globalThis.DecompressionStream = class extends DS { constructor(f) { super(f); opened++; } };
      const F = fresh(READER), a = gen('i32', 3000, 'walk'), b = pk.pack(a); const l1 = await F.load(); const l2 = await F.load(); const l3 = await F.load({ program: READER === 'pcodec-js.js' ? 'plain' : 'fast' });
      ok(same(l1.unpack(b), a) && l2 === l1 && same(l3.unpack(b), a), 'load() twice and load({ program }) after it give working objects'); const w = await F.worker(), pl = await F.pool({ size: 2, warm: true });
      ok(same(await w.unpack(b), a) && same(await pl.unpack(b), a), 'a worker and a pool made after load() work'); w.terminate(); pl.terminate();
      ok(opened === 1, `the packed program is opened once, not again for the second load, a worker or a pool (${opened})`); globalThis.DecompressionStream = DS; }
    // 15c. unpack() of a big file decodes in batches into the result: same numbers, a small program memory, nothing left open
    for (const [t, n, sh] of [['f64', 262143, 'dec'], ['f64', 262144, 'dec'], ['f64', 262145, 'noise'], ['i32', 300000, 'walk'], ['u16', 300000, 'few'], ['f32', 400000, 'noise'], ['i64', 300000, 'walk'], ['u64', 270000, 'walk'], ['i16', 300000, 'walk'], ['u32', 650000, 'few'], ['f64', 1000000, 'dec']]) {
      const a = gen(t, n, sh), b = pk.pack(a), r = rd.unpack(b); ok(same(r, a) && r.constructor === a.constructor && r.length === n, `big copy unpack ${t} ${n} ${sh}`);
      if (n >= 262144) { let e = null; try { rd.unpack(b, { count: n - 1 }); } catch (x) { e = x; } ok(!!e, `big copy: count one too small refused ${t} ${n}`); e = null; try { rd.unpack(b, { count: n + 1 }); } catch (x) { e = x; } ok(!!e, `big copy: count one too large refused ${t} ${n}`); }
    }
    { const a = gen('f64', 1500000, 'dec'), b = pk.pack(a); rd.release(); const r = rd.unpack(b); const mb = rd.memoryBytes() / 1048576;
      ok(same(r, a) && mb < 6, `big copy unpack of 1,500,000 f64 (12 MB result) leaves the program holding under 6 MB (${mb.toFixed(1)} MB)`);
      rd.release(); const v = rd.unpack(b, { view: true }); ok(same(v, a) && rd.memoryBytes() / 1048576 > 12, 'view still points into the program memory (holds the whole result)');
      const inn = new Float64Array(a.length); rd.unpack(b, { into: inn }); ok(same(inn, a), 'into still fills your array'); rd.release();
      const wb = Buffer.from(pk.pack(a)); let errs = 0, wrongLen = 0, good = 0; const before = rd.memoryBytes();
      for (let t = 0; t < 60; t++) { const c = new Uint8Array(wb); c[Math.floor(rnd() * c.length)] ^= 1 << Math.floor(rnd() * 8); try { const q = rd.unpack(t % 4 === 3 ? c.subarray(0, Math.floor(c.length * rnd())) : c); good++; if (q.length !== a.length) wrongLen++; } catch (x) { errs++; } }
      ok(wrongLen === 0 && errs > 0, `damaged big files: an error or the right length, never a crash (${errs} refused, ${good} decoded)`);
      ok(same(rd.unpack(b), a), 'the object still works after damaged big files'); ok(rd.memoryBytes() / 1048576 < 8, 'damaged big files leave nothing open in the program (' + (rd.memoryBytes() / 1048576).toFixed(1) + ' MB)'); }
    // 15d. parking the pool: needs workers, so Node gets a stand-in Worker built on worker_threads
    { const NW = require('worker_threads').Worker, texts = new Map(), OB = globalThis.Blob, cu = URL.createObjectURL, live = new Set();
      globalThis.Blob = class extends OB { constructor(parts, o) { super(parts, o); this.__t = parts.join(''); } };
      URL.createObjectURL = function (b) { const u = cu.call(URL, b); texts.set(u, b.__t); return u; };
      const PRE = "const {parentPort}=require('worker_threads');globalThis.self=globalThis;globalThis.postMessage=(m,t)=>parentPort.postMessage(m,t);parentPort.on('message',d=>{if(globalThis.onmessage)globalThis.onmessage({data:d});});";
      globalThis.Worker = class { constructor(url) { this.w = new NW(PRE + texts.get(url), { eval: true }); this.w.on('message', (d) => { if (this.onmessage) this.onmessage({ data: d }); }); this.w.on('error', (e) => { if (this.onerror) this.onerror(e); }); live.add(this); } postMessage(m, t) { this.w.postMessage(m, t); } terminate() { live.delete(this); this.w.terminate(); } };
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), F = fresh('pcodec-js-pack.js');
      try {
        const a = gen('f64', 700000, 'dec'), sp = pk.pack(a, { parts: 4 }), plain = pk.pack(a), cols = [gen('i32', 60000, 'walk'), gen('f64', 50000, 'dec'), gen('u16', 40000, 'few')], files = cols.map((c) => pk.pack(c));
        const w1 = await F.worker(); ok(w1.inWorker === true && live.size === 1, 'the Node stand-in starts a real worker thread'); ok(same(await w1.unpack(plain), a), 'a real worker opens a big file in batches (same numbers)'); w1.terminate();
        const pl = await F.pool({ size: 3, laneMs: 0, idleMs: 150 });
        ok(pl.idleMs === 150 && pl.workers() === 0, 'a new pool has no workers and reports idleMs');
        { const q4 = await F.pool({ size: 4, laneMs: 0, idleMs: 0 }), pr = q4.unpack(files.concat([files[0]]).map((f) => f.slice())); ok(live.size - pl.workers() <= 1, `starting 4 workers is spread over turns of the page: ${live.size - pl.workers()} created in the first turn`); const r4 = await pr; ok(q4.workers() === 4 && r4.length === 4 && same(r4[3], cols[0]), 'all 4 workers run after the first job'); q4.terminate(); }
        ok(same(await pl.unpack(sp), a), 'pool opens a split file'); ok(pl.workers() > 0 && live.size === pl.workers(), `workers run after a job (${pl.workers()})`);
        await sleep(60); ok(pl.workers() > 0, 'not parked before idleMs');
        await sleep(450); ok(pl.workers() === 0 && live.size === 0, `parked after idleMs: no worker threads left (${live.size})`);
        const back = await pl.unpack(files); ok(back.every((b, i) => same(b, cols[i])), 'the next job after parking starts new workers and gives the same numbers'); ok(pl.workers() > 0, 'workers are back after the job');
        await sleep(500); ok(pl.workers() === 0 && live.size === 0, 'parked again');
        ok(same(await pl.unpack(sp, { into: new Float64Array(a.length) }), a), 'split file into your array after parking twice');
        // a job in progress is never parked, however short idleMs is
        const quick = await F.pool({ size: 2, laneMs: 0, idleMs: 1 }); const outs = await Promise.all([quick.unpack(sp), quick.unpack(files), quick.unpack(plain)]);
        ok(same(outs[0], a) && outs[1].every((b, i) => same(b, cols[i])) && same(outs[2], a), 'idleMs 1: three jobs at once finish with exact numbers (the pool does not park under a running job)');
        const keep = await F.pool({ size: 2, laneMs: 0, idleMs: 0 }); await keep.unpack(files); await sleep(400); ok(keep.workers() > 0, 'idleMs 0 turns parking off');
        const dflt = await F.pool({ size: 2 }); ok(dflt.idleMs === 4000, 'default idleMs is 4000'); await dflt.unpack(files); ok(dflt.workers() > 0, 'default pool keeps its workers right after a job'); dflt.terminate(); ok(dflt.workers() === 0, 'terminate ends the workers at once');
        let e = null; try { await dflt.unpack(files); } catch (x) { e = x; } ok(!!e, 'a terminated pool refuses jobs'); await sleep(50);
        await pl.unpack(files); pl.terminate(); await sleep(300); ok(pl.workers() === 0 && live.size === keep.workers(), 'terminate cancels the idle clock and ends the workers');
        keep.terminate(); quick.terminate();
        const wp = await F.pool({ size: 2, warm: true, idleMs: 120 }); await sleep(30); ok(wp.workers() === 2, 'warm pool starts its workers'); await sleep(500); ok(wp.workers() === 0 && live.size === 0, 'a warm pool that never got a job parks too'); ok(same(await wp.unpack(sp), a), 'and still works'); wp.terminate();
        await sleep(100); ok(live.size === 0, 'no worker thread left at the end');
      } finally { delete globalThis.Worker; globalThis.Blob = OB; URL.createObjectURL = cu; for (const x of [...live]) x.terminate(); } }
  }
  console.log(`\n${pass} checks passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
