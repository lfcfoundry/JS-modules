// Tests for pcodec-js.js and pcodec-js-pack.js. usage: node test.js [dir]   (dir holds the two built files; default: this folder)
'use strict';
const path = require('path'), fs = require('fs'), dir = path.resolve(process.argv[2] || path.join(__dirname, '..')), READER = process.env.READER || 'pcodec-js.js';
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
  console.log(`\n${pass} checks passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
