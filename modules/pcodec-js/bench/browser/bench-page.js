// Runs inside a browser page. arg = { wasm: {id: base64}, glue: text of the numcodecs/jco module, nc: base64 core wasm files, ref: [{name, kind, n, hash, packed(base64)}], reps }
// For each contender: sizes, compile/instantiate time, unpack time (copy and view), pack time, memory, and a check that every column comes back bit for bit.
module.exports = async function inPage(arg) {
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const warm = (f, ms) => { const e = performance.now() + ms; let n = 0; do { f(); n++; } while (performance.now() < e || n < 3); };
  const med = (f, k) => { warm(f, arg.warmMs || 250); const t = []; for (let i = 0; i < k; i++) { const s = performance.now(); f(); t.push(performance.now() - s); } t.sort((a, b) => a - b); return t[k >> 1]; };
  const TA = { f64: Float64Array, i32: Int32Array }, KB = { f64: 6, i32: 3 }, KOLD = { f64: 0, i32: 2 };
  const fnv = (u8) => { let h = 2166136261 >>> 0; for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 16777619) >>> 0; } return h; };
  const cols = arg.ref.map((r) => ({ ...r, packed: b64(r.packed) }));
  const out = { ua: navigator.userAgent, results: [] };
  async function loadWasm(id) {
    const bytes = b64(arg.wasm[id]); let t = performance.now(); const mod = await WebAssembly.compile(bytes); const compileMs = performance.now() - t;
    t = performance.now(); const inst = await WebAssembly.instantiate(mod, {}); const instMs = performance.now() - t; return { bytes, compileMs, instMs, ex: inst.exports };
  }
  function oldApi(ex) {
    const mem = () => new Uint8Array(ex.memory.buffer), put = (u8) => { const p = ex.mem_alloc(u8.length); mem().set(u8, p); return p; };
    return { hasEncode: true,
      compress(kind, a, level) { const src = new Uint8Array(a.buffer, a.byteOffset, a.byteLength), p = put(src), n = ex.compress(KOLD[kind], p, a.length, level); ex.mem_free(p, src.length); return mem().slice(ex.out_ptr(), ex.out_ptr() + n); },
      decompress(kind, b, n) { const p = put(b), m = ex.decompress(KOLD[kind], p, b.length, n); ex.mem_free(p, b.length); const out = mem().slice(ex.out_ptr(), ex.out_ptr() + m); return new TA[kind](out.buffer); },
      mem: () => ex.memory.buffer.byteLength, free() {} };
  }
  function newApi(ex, view) {
    let last = null;
    return { hasEncode: !!ex.compress,
      compress(kind, a, level) { const src = new Uint8Array(a.buffer, a.byteOffset, a.byteLength), p = ex.alloc(src.length); new Uint8Array(ex.memory.buffer, p, src.length).set(src); const n = ex.compress(KB[kind], p, a.length, level); ex.release(p, src.length); const o = new Uint8Array(ex.memory.buffer, ex.out_ptr(), n).slice(); ex.out_release(); return o; },
      decompress(kind, b, n) { if (last) { ex.release(...last); last = null; } const T = TA[kind], w = T.BYTES_PER_ELEMENT, p = ex.alloc(b.length); new Uint8Array(ex.memory.buffer, p, b.length).set(b); const d = ex.alloc(n * w); const r = ex.decompress(KB[kind], p, b.length, d, n); ex.release(p, b.length); const v = new T(ex.memory.buffer, d, n); if (view) { last = [d, n * w]; return v; } const o = v.slice(); ex.release(d, n * w); return o; },
      mem: () => ex.memory.buffer.byteLength, free() { if (last) { ex.release(...last); last = null; } } };
  }
  async function loadNC() {
    const url = URL.createObjectURL(new Blob([arg.glue], { type: 'text/javascript' })); const M = await import(url);
    const stubs = { 'wasi:cli/stderr': { getStderr() { return {}; } }, 'wasi:io/error': { Error: class {} }, 'wasi:io/streams': { OutputStream: class {} }, 'wasi:logging/logging': { log() {} }, 'wasi:random/random': { getRandomBytes(n) { const b = new Uint8Array(Number(n)); crypto.getRandomValues(b); return b; } } };
    const files = {}; for (const k in arg.nc) files[k] = b64(arg.nc[k]);
    let t = performance.now(); const inst = await M.instantiate(async (p) => WebAssembly.compile(files[p]), stubs); const ms = performance.now() - t;
    const cfg = {}; const codec = (lv) => cfg[lv] || (cfg[lv] = inst.codec.Codec.fromConfig(JSON.stringify({ level: lv, mode: 'auto', delta: 'auto', paging: 'equal-pages-up-to', equal_pages_up_to: 262144 })));
    return { ms, bytes: files['codec.core.wasm'].length, api: { hasEncode: true, compress(kind, a, level) { return codec(level).encode({ data: { tag: kind, val: a }, shape: Uint32Array.of(a.length) }).data.val; }, decompress(kind, b, n) { return codec(8).decode({ data: { tag: 'u8', val: b }, shape: Uint32Array.of(b.length) }).data.val; }, mem: () => 0, free() {} } };
  }
  // reference raw arrays come from decoding the reference bytes with the 'ours today' decoder
  const scr = {};
  async function loadLib(spec) {
    const code = arg.libs[spec.lib]; let t = performance.now(); const m = { exports: {} }; new Function('module', 'exports', code)(m, m.exports);
    const pc = await m.exports.load(spec.program ? { program: spec.program } : undefined); const ms = performance.now() - t;
    return { ms, bytes: code.length, pc, api: { hasEncode: pc.canPack,
      compress(kind, a, level) { return pc.pack(a, { level, smallest: !!spec.smallest }); },
      decompress(kind, b, n) { if (spec.into) { const k = kind + n; const T = TA[kind]; return pc.unpack(b, { count: n, into: (scr[k] || (scr[k] = new T(n))) }); } return pc.unpack(b, { count: n, view: !!spec.view }); },
      mem: () => 0, free() {} } };
  }
  const refWasm = await loadWasm('ours'); const refApi = oldApi(refWasm.ex);
  const raw = cols.map((c) => refApi.decompress(c.kind, c.packed, c.n));
  raw.forEach((a, i) => { if (fnv(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)) !== cols[i].hash) throw new Error('reference decode mismatch ' + cols[i].name); });
  const total = cols.reduce((s, c) => s + c.n, 0), reps = arg.reps || 7;
  const specs = arg.contenders;
  const prepared = [];
  for (const s of specs) {
    const r = { id: s.id, label: s.label };
    let api, wasmBytes, compileMs, instMs, glue = 0;
    if (s.type === 'lib') { const x = await loadLib(s); api = x.api; wasmBytes = x.pc.programBytes; compileMs = 0; instMs = x.ms; glue = x.bytes - 0; }
    else if (s.type === 'nc') { const x = await loadNC(); api = x.api; wasmBytes = x.bytes; compileMs = 0; instMs = x.ms; glue = arg.glue.length; }
    else { const x = await loadWasm(s.wasm); wasmBytes = x.bytes.length; compileMs = x.compileMs; instMs = x.instMs; api = s.type === 'old' ? oldApi(x.ex) : newApi(x.ex, s.view); }
    r.wasmBytes = wasmBytes; r.glueBytes = glue; r.compileMs = +compileMs.toFixed(1); r.instantiateMs = +instMs.toFixed(1);
    let packed = cols.map((c) => c.packed);
    if (s.type === 'nc') packed = raw.map((a, i) => api.compress(cols[i].kind, a, 8));
    let bad = 0; for (let i = 0; i < cols.length; i++) { const d = api.decompress(cols[i].kind, packed[i], cols[i].n); if (fnv(new Uint8Array(d.buffer, d.byteOffset, d.byteLength)) !== cols[i].hash) bad++; api.free(); }
    r.wrongColumns = bad;
    if (api.hasEncode && s.encode !== false) { let size = 0; raw.forEach((a, i) => { size += api.compress(cols[i].kind, a, 8).length; }); r.packedTotal = size; }
    prepared.push({ s, r, api, packed });
  }
  const rounds = arg.rounds || 2;
  for (let round = 0; round < rounds; round++) {
    const order = round % 2 ? prepared.slice().reverse() : prepared;
    for (const { s, r, api, packed } of order) {
      const u = med(() => { for (let k = 0; k < 3; k++) for (let i = 0; i < cols.length; i++) { api.decompress(cols[i].kind, packed[i], cols[i].n); api.free(); } }, reps) / 3;
      r.unpackMs = r.unpackMs === undefined ? u : Math.min(r.unpackMs, u);
      if (api.hasEncode && s.encode !== false) { const p = med(() => { for (let i = 0; i < cols.length; i++) api.compress(cols[i].kind, raw[i], 8); }, Math.max(3, reps >> 1)); r.packMs = r.packMs === undefined ? p : Math.min(r.packMs, p); }
    }
  }
  for (const { r, api } of prepared) { r.unpackMs = +r.unpackMs.toFixed(2); r.unpackNsPerValue = +(r.unpackMs * 1e6 / total).toFixed(2); if (r.packMs !== undefined) r.packMs = +r.packMs.toFixed(1); r.wasmMemoryMB = +(api.mem() / 1048576).toFixed(0); out.results.push(r); }
  if (performance.memory) out.jsHeapMB = +(performance.memory.usedJSHeapSize / 1048576).toFixed(0);
  out.values = total;
  return out;
};
