// Contenders with one interface: { name, wasmBytes, extraBytes, compress(kind, arr, level) -> Uint8Array, decompress(kind, bytes, n) -> typed array, memBytes() }
import fs from 'fs';
const KIND = { f64: [0, Float64Array], i32: [2, Int32Array], f32: [1, Float32Array], u32: [3, Uint32Array] };
export async function rawWasm(name, file, opts = {}) {      // the "put buffers in, read buffers out" style used by our module and by a plain Rust build
  const bytes = fs.readFileSync(file), { instance } = await WebAssembly.instantiate(bytes, {}), ex = instance.exports;
  const mem = () => new Uint8Array(ex.memory.buffer);
  const put = (u8) => { const p = ex.mem_alloc(u8.length); mem().set(u8, p); return p; };
  return { name, wasmBytes: bytes.length, extraBytes: 0, ex,
    compress(kind, arr, level = 8) { const [k] = KIND[kind], src = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), p = put(src), n = ex.compress(k, p, arr.length, level); ex.mem_free(p, src.length); if (!n) throw new Error('compress'); return mem().slice(ex.out_ptr(), ex.out_ptr() + n); },
    decompress(kind, bytes, n) { const [k, T] = KIND[kind], p = put(bytes), m = ex.decompress(k, p, bytes.length, n); ex.mem_free(p, bytes.length); if (!m) throw new Error('decompress'); const out = mem().slice(ex.out_ptr(), ex.out_ptr() + m); return new T(out.buffer); },
    memBytes: () => ex.memory.buffer.byteLength };
}
export async function numcodecs() {   // numcodecs-wasm-pco 0.4.0 (PyPI) through jco
  const C = await import('/tmp/claude-0/pcm/jco/outn/codec.js');
  const core = fs.statSync('/tmp/claude-0/pcm/jco/outn/codec.core.wasm').size, glue = fs.statSync('/tmp/claude-0/pcm/jco/outn/codec.js').size;
  const cache = {};
  const codec = (level) => cache[level] || (cache[level] = C.codec.Codec.fromConfig(JSON.stringify({ level, mode: 'auto', delta: 'auto', paging: 'equal-pages-up-to', equal_pages_up_to: 262144 })));
  return { name: 'numcodecs-wasm-pco 0.4.0 via jco', wasmBytes: core, extraBytes: glue,
    compress(kind, arr, level = 8) { const r = codec(level).encode({ data: { tag: kind, val: arr }, shape: Uint32Array.of(arr.length) }); return r.data.val; },
    decompress(kind, bytes, n) { const r = codec(8).decode({ data: { tag: 'u8', val: bytes }, shape: Uint32Array.of(bytes.length) }); return r.data.val; },
    memBytes: () => 0 };
}
const KB = { f64: 6, i32: 3, f32: 5, u32: 1, i64: 4, u64: 2, i16: 8, u16: 7 }, TA = { f64: Float64Array, i32: Int32Array, f32: Float32Array, u32: Uint32Array, i64: BigInt64Array, u64: BigUint64Array, i16: Int16Array, u16: Uint16Array };
// The new wrapper ABI (alloc / decompress into caller memory / out_ptr). mode 'copy' returns an owned array; mode 'view' returns a view into wasm memory (no output copy).
export async function newWasm(name, file, mode = 'copy') {
  const bytes = fs.readFileSync(file), { instance } = await WebAssembly.instantiate(bytes, {}), ex = instance.exports;
  return { name, wasmBytes: bytes.length, extraBytes: 0, ex, hasEncode: !!ex.compress, _d: null,
    compress(kind, arr, level = 8) { const src = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), p = ex.alloc(src.length); new Uint8Array(ex.memory.buffer, p, src.length).set(src); const n = ex.compress(KB[kind], p, arr.length, level); ex.release(p, src.length); if (n < 0) throw new Error('compress ' + n); const o = new Uint8Array(ex.memory.buffer, ex.out_ptr(), n).slice(); ex.out_release(); return o; },
    decompress(kind, src, n) { if (this._d) { ex.release(...this._d); this._d = null; } const T = TA[kind], w = T.BYTES_PER_ELEMENT, p = ex.alloc(src.length); new Uint8Array(ex.memory.buffer, p, src.length).set(src); const d = ex.alloc(n * w); const r = ex.decompress(KB[kind], p, src.length, d, n); ex.release(p, src.length); if (r < 0) { ex.release(d, n * w); throw new Error('decompress ' + r); } const v = new T(ex.memory.buffer, d, n); if (mode === 'view') { this._d = [d, n * w]; return v; } const o = v.slice(); ex.release(d, n * w); return o; },
    free() { if (this._d) { ex.release(...this._d); this._d = null; } },
    memBytes: () => ex.memory.buffer.byteLength };
}
