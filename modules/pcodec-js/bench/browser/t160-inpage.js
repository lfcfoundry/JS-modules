// Copyright (c) 2026 LFC Foundry. MIT License.
// Page-side steps for the pcodec-js 1.6.0 timing round. Each function is self-contained (the driver sends it as text); helpers come in as text in a.helpers.
// A = pcodec-js 1.5.1 (before), B = pcodec-js 1.6.0 (after); the two take turns in every round.
const HELPERS = `({
  b64u8: (s) => { const r = atob(s), u = new Uint8Array(r.length); for (let i = 0; i < r.length; i++) u[i] = r.charCodeAt(i); return u; },
  med: (x) => { x = x.slice().sort((p, q) => p - q); return x[x.length >> 1]; },
  load: (text) => { const m = { exports: {} }; new Function('module', 'exports', text)(m, m.exports); return m.exports; },
  tick: () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); }; c.port2.postMessage(0); }),
  ticker: () => { const t = { run: true, last: performance.now(), max: 0, gaps: [] }; if (/Chrome\\//.test(navigator.userAgent) && !/Firefox/.test(navigator.userAgent)) { const c = new MessageChannel(); c.port1.onmessage = () => { const n = performance.now(), g = n - t.last; t.last = n; if (g > t.max) t.max = g; if (g > 4) t.gaps.push([+n.toFixed(0), +g.toFixed(1)]); if (t.run) c.port2.postMessage(0); else c.port1.close(); }; c.port2.postMessage(0); return t; } (async () => { while (t.run) { await new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); }; c.port2.postMessage(0); }); const n = performance.now(), g = n - t.last; t.last = n; if (g > t.max) t.max = g; if (g > 4) t.gaps.push([+n.toFixed(0), +g.toFixed(1)]); } })(); return t; }
})`;
module.exports = {
  HELPERS,
  // which batch size is best for the batched copy: A copy, then stream() batches of each size into a new array
  batches: async function (a) {
    const H = eval(a.helpers), A = H.load(a.libA), B = H.load(a.libB), pa = await A.load({ warm: true }), pb = await B.load({ warm: true });
    const file = H.b64u8(a.file), n = a.n, sink = { s: 0 }, sizes = a.sizes, T = { A: [] }; sizes.forEach((k) => { T[k] = []; });
    const run = { A: () => { if (a.cold) pa.release(); const r = pa.unpack(file); sink.s += r[n - 1]; } };
    sizes.forEach((k) => { run[k] = () => { if (a.cold) pb.release(); const r = new Float64Array(n); let at = 0; for (const p of pb.stream(file, { batch: k })) { r.set(p, at); at += p.length; } sink.s += r[n - 1]; }; });
    const ks = ['A'].concat(sizes); for (let i = 0; i < 2; i++) ks.forEach((k) => run[k]());
    for (let r = 0; r < a.rounds; r++) for (let j = 0; j < ks.length; j++) { const k = ks[(j + r) % ks.length]; await H.tick(); const t = performance.now(); run[k](); T[k].push(performance.now() - t); }
    const o = {}; ks.forEach((k) => { o[k] = H.med(T[k]); }); o.mem = pb.memoryBytes(); return o;
  },
  phases: async function (a) {
    const H = eval(a.helpers), A = H.load(a.libA), B = H.load(a.libB), pa = await A.load({ warm: true }), pb = await B.load({ warm: true });
    const file = H.b64u8(a.file), n = a.n, sink = { s: 0 }, T = {}, R = {};
    const keep = pa.unpack(file, { view: true }); const bigbuf = new Float64Array(n);
    const run = {
      view: () => { const v = pa.unpack(file, { view: true }); sink.s += v[n - 1]; },
      copy: () => { const r = pa.unpack(file); sink.s += r[n - 1]; },
      lean: () => { const r = pb.unpack(file); sink.s += r[n - 1]; },
      streamOnly: () => { let c = 0; for (const p of pb.stream(file, { batch: 65536 })) c += p.length; sink.s += c; },
      streamInto: () => { let at = 0; for (const p of pb.stream(file, { batch: 65536 })) { bigbuf.set(p, at); at += p.length; } sink.s += bigbuf[n - 1]; },
      alloc: () => { const r = new Float64Array(n); sink.s += r[n - 1]; },
      allocTouch: () => { const r = new Float64Array(n); r.fill(1); sink.s += r[n - 1]; },
      slice: () => { const r = keep.slice(); sink.s += r[n - 1]; },
      set: () => { bigbuf.set(keep); sink.s += bigbuf[n - 1]; }
    };
    const ks = Object.keys(run); ks.forEach((k) => { T[k] = []; run[k](); run[k](); });
    for (let r = 0; r < a.rounds; r++) for (let j = 0; j < ks.length; j++) { const k = ks[(j + r) % ks.length]; if (a.tick) await H.tick(); const t = performance.now(); run[k](); T[k].push(performance.now() - t); }
    ks.forEach((k) => { R[k] = H.med(T[k]); }); return R;
  },
  // page tasks around parking: small jobs (so garbage collection of big results does not cloud it). variant: none | A | B
  idle2: async function (a) {
    const H = eval(a.helpers), P = H.load(a.lib), pc = await P.load({ warm: true }), out = { gaps: [] };
    const files = a.files.map((f) => H.b64u8(f)), mk = () => P.pool({ size: 4, laneMs: 0, idleMs: a.idleMs });
    const tk = H.ticker(), poll = (ms) => new Promise((r) => { const t0 = performance.now(); (function s() { if (performance.now() - t0 >= ms) return r(); setTimeout(s, 8); })(); });
    const worst = (from, to) => { let m = 0; tk.gaps.forEach(([t, g]) => { if (t >= from && t <= to && g > m) m = g; }); return m; };
    let pool = null;
    if (a.pool) { pool = await mk(); await pool.unpack(files.map((f) => f.slice())); }
    await poll(300); tk.max = 0; tk.gaps = []; tk.last = performance.now();
    const t0 = performance.now(); let parkedAt = -1;
    while (performance.now() - t0 < a.window) { await poll(20); if (parkedAt < 0 && pool && pool.workers && pool.workers() === 0) parkedAt = performance.now(); }
    out.idleMax = tk.max; out.parkedAt = parkedAt < 0 ? null : +(parkedAt - t0).toFixed(0);
    out.aroundPark = parkedAt < 0 ? null : worst(parkedAt - 60, parkedAt + 60);
    out.idleGapsOver4 = tk.gaps.length; out.top = tk.gaps.slice().sort((x, y) => y[1] - x[1]).slice(0, 4).map((g) => [Math.round(g[0] - t0), g[1]]);
    // the first job after the idle time (restart if parked): page gap while it runs
    if (pool) {
      tk.max = 0; tk.gaps = []; tk.last = performance.now(); const t1 = performance.now();
      const r = await pool.unpack(files.map((f) => f.slice())); out.restartJobMs = performance.now() - t1; out.restartGap = tk.max; out.ok = r.length === files.length;
      await poll(60); tk.max = 0; tk.gaps = []; tk.last = performance.now(); const t2 = performance.now();
      await pool.unpack(files.map((f) => f.slice())); out.warmJobMs = performance.now() - t2; out.warmGap = tk.max; await poll(30);
      pool.terminate();
    }
    tk.run = false; return out;
  },
  // page tasks while workers start: the sync part of worker(), and the longest page gap during the first job of a new pool of 4 (small files) and of the one after
  starts: async function (a) {
    const H = eval(a.helpers), P = H.load(a.lib), pc = await P.load({ warm: true }), out = {};
    const files = a.files.map((f) => H.b64u8(f));
    await H.tick(); let t = performance.now(); const wp = P.worker(); out.workerSync = performance.now() - t; const w = await wp; w.terminate();
    const tk = H.ticker(); await H.tick(); await H.tick();
    const pool = await P.pool({ size: 4, laneMs: 0, idleMs: 0 });
    tk.max = 0; tk.last = performance.now(); t = performance.now(); const syncStart = performance.now();
    const jp = pool.unpack(files.map((f) => f.slice())); out.callSync = performance.now() - syncStart; await jp; out.firstJobMs = performance.now() - t; await H.tick(); out.firstJobGap = tk.max;
    tk.max = 0; tk.last = performance.now(); t = performance.now(); await pool.unpack(files.map((f) => f.slice())); out.warmJobMs = performance.now() - t; await H.tick(); out.warmJobGap = tk.max;
    tk.run = false; pool.terminate(); return out;
  },
  // competitor round: one contender per fresh page. id: nc | A | B | Bview | Binto.  Unpack of the set of columns (ms for all), correctness against pcodec-js 1.5.1, start-up, and pack of three float columns
  comp: async function (a) {
    const H = eval(a.helpers), out = { id: a.id }, files = a.files.map((f) => ({ name: f.name, n: f.n, u: H.b64u8(f.b64) }));
    const fnv = (u) => { let h = 2166136261 >>> 0; for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 16777619) >>> 0; } return h; };
    const bytesOf = (t) => new Uint8Array(t.buffer, t.byteOffset, t.byteLength);
    let unpack, pack = null, t0 = performance.now(), api;
    if (a.id === 'nc') {
      const url = URL.createObjectURL(new Blob([a.glue.replace("fetchCompile(new URL('./codec.core.wasm', import.meta.url))", "base64Compile('" + a.core + "')")], { type: 'text/javascript' })); const M = await import(url);
      const stubs = { 'wasi:cli/stderr': { getStderr() { return {}; } }, 'wasi:io/error': { Error: class {} }, 'wasi:io/streams': { OutputStream: class {} }, 'wasi:logging/logging': { log() {} }, 'wasi:random/random': { getRandomBytes(n) { const b = new Uint8Array(Number(n)); crypto.getRandomValues(b); return b; } } };
      const inst = M;
      const codec = {}; const cd = (lv) => codec[lv] || (codec[lv] = inst.codec.Codec.fromConfig(JSON.stringify({ level: lv, mode: 'auto', delta: 'auto', paging: 'equal-pages-up-to', equal_pages_up_to: 262144 })));
      out.startMs = performance.now() - t0;
      const TAG = { f64: 'f64', f32: 'f32', i32: 'i32', u32: 'u32', i64: 'i64', u64: 'u64', i16: 'i16', u16: 'u16' };
      unpack = (u) => cd(8).decode({ data: { tag: 'u8', val: u }, shape: Uint32Array.of(u.length) }).data.val;
      pack = (arr, kind) => cd(8).encode({ data: { tag: kind, val: arr }, shape: Uint32Array.of(arr.length) }).data.val;
    } else {
      const P = H.load(a.lib), pc = await P.load(); out.startMs = performance.now() - t0; out.scriptMs = 0;
      if (a.id === 'Bview') unpack = (u) => pc.unpack(u, { view: true }); else if (a.id === 'Binto') { const bufs = {}; unpack = (u) => { const t = pc.info(u); const T = { f64: Float64Array, f32: Float32Array, i32: Int32Array, u32: Uint32Array, i64: BigInt64Array, u64: BigUint64Array, i16: Int16Array, u16: Uint16Array }[t.type]; const k = t.type + t.count; const into = bufs[k] || (bufs[k] = new T(t.count)); return pc.unpack(u, { into }); }; } else unpack = (u) => pc.unpack(u);
      if (pc.pack) pack = (arr) => pc.pack(arr);
    }
    // correctness: hash of every result
    out.hashes = files.map((f) => { const r = unpack(f.u); return fnv(bytesOf(r)); });
    const sink = { s: 0 };
    const pass = () => { const t = performance.now(); for (const f of files) { const r = unpack(f.u); sink.s += r.length; } return performance.now() - t; };
    for (let i = 0; i < 3; i++) pass();
    const T = []; for (let i = 0; i < a.reps; i++) { await H.tick(); T.push(pass()); }
    out.unpackMs = H.med(T); out.numbers = files.reduce((s, f) => s + f.n, 0); out.nsPerNumber = out.unpackMs * 1e6 / out.numbers;
    if (pack && a.arrs) {
      const arrs = a.arrs.map((x) => new Float64Array(H.b64u8(x.b64).buffer)); let bytes = 0;
      const pp = () => { const t = performance.now(); bytes = 0; for (const x of arrs) bytes += pack(x, 'f64').length; return performance.now() - t; };
      for (let i = 0; i < 2; i++) pp(); const PT = []; for (let i = 0; i < Math.max(5, a.reps >> 1); i++) { await H.tick(); PT.push(pp()); }
      out.packMs = H.med(PT); out.packBytes = bytes; out.packNumbers = arrs.reduce((s, x) => s + x.length, 0);
    }
    return out;
  },
  // 4,000,000 numbers (or any size): copy unpack, A against B, steady state or with a fresh program each time
  unpack: async function (a) {
    const H = eval(a.helpers), A = H.load(a.libA), B = H.load(a.libB), pa = await A.load({ warm: true }), pb = await B.load({ warm: true });
    const file = H.b64u8(a.file), n = a.n, rounds = a.rounds, sink = { s: 0 };
    const T = { A: [], B: [] }, P = { A: pa, B: pb }, pre = a.cold ? 0 : 2;
    const go = (k) => { if (a.cold) P[k].release(); const t = performance.now(); const r = P[k].unpack(file); const e = performance.now() - t; sink.s += r[r.length - 1]; if (r.length !== n) throw new Error('wrong length'); return e; };
    for (let i = 0; i < pre; i++) { go('A'); go('B'); }
    for (let r = 0; r < rounds; r++) { const order = r % 2 ? ['B', 'A'] : ['A', 'B']; for (const k of order) { await H.tick(); T[k].push(go(k)); } }
    return { n, A: H.med(T.A), B: H.med(T.B), Aall: T.A, Ball: T.B, memA: pa.memoryBytes(), memB: pb.memoryBytes() };
  },
  // size sweep for the batch threshold: A copy, B copy, and the batched route forced (B.stream, batch 65,536, into a new array)
  sweep: async function (a) {
    const H = eval(a.helpers), A = H.load(a.libA), B = H.load(a.libB), pa = await A.load({ warm: true }), pb = await B.load({ warm: true }), out = [];
    for (const f of a.files) {
      const file = H.b64u8(f.b64), n = f.n, T = { A: [], B: [], S: [] }, sink = { s: 0 };
      const run = {
        A: () => { if (a.cold) pa.release(); const r = pa.unpack(file); sink.s += r[n - 1]; },
        B: () => { if (a.cold) pb.release(); const r = pb.unpack(file); sink.s += r[n - 1]; },
        S: () => { if (a.cold) pb.release(); const r = new Float64Array(n); let at = 0; for (const p of pb.stream(file, { batch: 65536 })) { r.set(p, at); at += p.length; } sink.s += r[n - 1]; }
      };
      const reps = Math.max(a.rounds, 1);
      for (let i = 0; i < 3; i++) { run.A(); run.B(); run.S(); }
      for (let r = 0; r < reps; r++) { const ks = ['A', 'B', 'S'], k0 = r % 3; for (let j = 0; j < 3; j++) { const k = ks[(k0 + j) % 3]; await H.tick(); let t = performance.now(), c = 0; do { run[k](); c++; } while (n * c < 200000 && c < 64); T[k].push((performance.now() - t) / c); } }
      out.push({ n, A: H.med(T.A), B: H.med(T.B), S: H.med(T.S) });
    }
    return out;
  },
  // the fixtures that are normal files: total unpack time for the set, A against B
  set: async function (a) {
    const H = eval(a.helpers), A = H.load(a.libA), B = H.load(a.libB), pa = await A.load({ warm: true }), pb = await B.load({ warm: true });
    const files = a.files.map((f) => ({ n: f.n, name: f.name, u: H.b64u8(f.b64) })), tot = files.reduce((s, f) => s + f.n, 0), sink = { s: 0 };
    const T = { A: [], B: [] }, P = { A: pa, B: pb };
    const go = (k) => { const t = performance.now(); for (const f of files) { const r = P[k].unpack(f.u); sink.s += Number(r[r.length - 1]); } return performance.now() - t; };
    for (let i = 0; i < 2; i++) { go('A'); go('B'); }
    for (let r = 0; r < a.rounds; r++) { const order = r % 2 ? ['B', 'A'] : ['A', 'B']; for (const k of order) { await H.tick(); T[k].push(go(k)); } }
    return { numbers: tot, files: files.length, A: H.med(T.A), B: H.med(T.B), Aall: T.A, Ball: T.B };
  },
  // one fresh page per call: the library text is parsed and run, load() is awaited; also the longest gap between page tasks over the whole start
  startup: async function (a) {
    const H = eval(a.helpers), tk = H.ticker();
    await H.tick(); tk.max = 0; tk.last = performance.now();
    const t0 = performance.now(); const P = H.load(a.lib); const t1 = performance.now(); const pc = await P.load(); const t2 = performance.now();
    await H.tick(); await new Promise((r) => setTimeout(r, 40)); tk.run = false;
    return { evalMs: t1 - t0, loadMs: t2 - t1, totalMs: t2 - t0, gapMax: tk.max, mem: pc.memoryBytes(), programBytes: pc.programBytes };
  },
  // one fresh page per call: first worker, warm pool of 4, first jobs
  workers: async function (a) {
    const H = eval(a.helpers), P = H.load(a.lib), pc = await P.load({ warm: false });
    const big = H.b64u8(a.file), out = {};
    let t = performance.now(); const w = await P.worker(); out.workerReady = performance.now() - t;
    t = performance.now(); const r1 = await w.unpack(big.slice()); out.workerUnpack = performance.now() - t; out.ok1 = r1.length === a.n; w.terminate();
    t = performance.now(); const pool = await P.pool({ size: 4, warm: true }); out.poolCreate = performance.now() - t;
    t = performance.now(); const r2 = await pool.unpack(H.b64u8(a.split), { into: new Float64Array(a.n) }); out.poolFirstSplit = performance.now() - t; out.ok2 = r2.length === a.n;
    t = performance.now(); await pool.unpack(H.b64u8(a.split), { into: new Float64Array(a.n) }); out.poolSecondSplit = performance.now() - t;
    pool.terminate(); await H.tick();
    return out;
  },
  // B only: park and restart. Times the first job on a fresh pool, the job after parking, the page gaps over the parking moment and the idle time
  park: async function (a) {
    const H = eval(a.helpers), P = H.load(a.lib), pc = await P.load({ warm: true }), out = {};
    const split = H.b64u8(a.split), list = [H.b64u8(a.file), H.b64u8(a.file), H.b64u8(a.file)];
    const mk = () => P.pool({ size: 4, laneMs: 0, idleMs: a.idleMs });
    const pool = await mk(); let t = performance.now(); await pool.unpack(split.slice(), { into: new Float64Array(a.n) }); out.firstJob = performance.now() - t; out.workersAfterJob = pool.workers ? pool.workers() : -1;
    const tk = H.ticker(); await H.tick(); tk.max = 0; tk.gaps = []; tk.last = performance.now();
    const t0 = performance.now(); let parkedAt = -1;
    while (performance.now() - t0 < a.idleMs + 2500) { await new Promise((r) => setTimeout(r, 25)); if (parkedAt < 0 && pool.workers && pool.workers() === 0) parkedAt = performance.now() - t0; }
    out.parkedAfterMs = parkedAt; out.gapMaxIdle = tk.max; out.gapsIdle = tk.gaps.slice(0, 12); tk.run = false;
    out.workersAfterIdle = pool.workers ? pool.workers() : -1;
    t = performance.now(); const r = await pool.unpack(split.slice(), { into: new Float64Array(a.n) }); out.jobAfterPark = performance.now() - t; out.okAfter = r.length === a.n;
    t = performance.now(); await pool.unpack(split.slice(), { into: new Float64Array(a.n) }); out.jobWarm = performance.now() - t;
    pool.terminate();
    // the same for a list of files (the 'many' path), cost of a restart with all 4 workers
    const p2 = await mk(); t = performance.now(); await p2.unpack(list.map((x) => x.slice())); out.listFirst = performance.now() - t; await new Promise((r) => setTimeout(r, a.idleMs + 400));
    t = performance.now(); await p2.unpack(list.map((x) => x.slice())); out.listAfterPark = performance.now() - t; t = performance.now(); await p2.unpack(list.map((x) => x.slice())); out.listWarm = performance.now() - t; p2.terminate();
    return out;
  },
  // A or B: page gaps while a warm pool sits idle (A never parks) and, as a control, an idle page with no pool
  idle: async function (a) {
    const H = eval(a.helpers), P = H.load(a.lib), pc = await P.load({ warm: true }), out = {};
    const tk = H.ticker(); await H.tick(); tk.max = 0; tk.gaps = []; tk.last = performance.now();
    const pool = a.pool ? await P.pool({ size: 4, warm: true }) : null; if (pool) await pool.unpack(H.b64u8(a.split), { into: new Float64Array(a.n) });
    tk.max = 0; tk.gaps = []; tk.last = performance.now(); const t0 = performance.now();
    await new Promise((r) => setTimeout(r, a.ms)); await H.tick(); tk.run = false;
    out.gapMax = tk.max; out.gaps = tk.gaps.slice(0, 12); out.workersEnd = pool && pool.workers ? pool.workers() : null; if (pool) pool.terminate();
    return out;
  },
  // pool jobs in steady state, A against B (the workers use the batched unpack for the big ones)
  pool: async function (a) {
    const H = eval(a.helpers), A = H.load(a.libA), B = H.load(a.libB), pa = await A.pool({ size: 3, warm: true }), pb = await B.pool({ size: 3, warm: true });
    const split = H.b64u8(a.split), cols = a.cols.map((c) => H.b64u8(c)), P = { A: pa, B: pb }, T = { split: { A: [], B: [] }, list: { A: [], B: [] }, one: { A: [], B: [] } }, G = { split: { A: [], B: [] }, list: { A: [], B: [] }, one: { A: [], B: [] } };
    const one = H.b64u8(a.file);
    const jobs = { split: (k) => P[k].unpack(split.slice(), { into: new Float64Array(a.n) }), list: (k) => P[k].unpack(cols.map((c) => c.slice())), one: (k) => P[k].unpack(one.slice()) };
    for (const j in jobs) { await jobs[j]('A'); await jobs[j]('B'); }
    for (let r = 0; r < a.rounds; r++) for (const j in jobs) { const order = r % 2 ? ['B', 'A'] : ['A', 'B']; for (const k of order) { await H.tick(); const tk = H.ticker(); await H.tick(); tk.max = 0; tk.last = performance.now(); const t = performance.now(); await jobs[j](k); T[j][k].push(performance.now() - t); await H.tick(); tk.run = false; G[j][k].push(tk.max); } }
    pa.terminate(); pb.terminate();
    const o = {}; for (const j in jobs) o[j] = { A: H.med(T[j].A), B: H.med(T[j].B), gapA: H.med(G[j].A), gapB: H.med(G[j].B), gapMaxA: Math.max.apply(null, G[j].A), gapMaxB: Math.max.apply(null, G[j].B) };
    return o;
  },
  // pack is not changed; a tie check for the packer file loaded both ways
  pack: async function (a) {
    const H = eval(a.helpers), A = H.load(a.libA), B = H.load(a.libB), pa = await A.load({ warm: true }), pb = await B.load({ warm: true });
    const arrs = a.arrs.map((x) => new Float64Array(H.b64u8(x.b64).buffer)), P = { A: pa, B: pb }, T = { A: [], B: [] }, sz = { A: 0, B: 0 };
    const go = (k) => { const t = performance.now(); let s = 0; for (const x of arrs) s += P[k].pack(x).length; sz[k] = s; return performance.now() - t; };
    for (let i = 0; i < 2; i++) { go('A'); go('B'); }
    for (let r = 0; r < a.rounds; r++) { const order = r % 2 ? ['B', 'A'] : ['A', 'B']; for (const k of order) { await H.tick(); T[k].push(go(k)); } }
    return { A: H.med(T.A), B: H.med(T.B), bytesA: sz.A, bytesB: sz.B, numbers: arrs.reduce((s, x) => s + x.length, 0) };
  }
};
