// Step 3 of min/build.js: decodes the corpus (unpack, view, unpackAsync, stream rows, into, the stream readers) under V8 precise coverage, started before the file loads, so load-time code counts as used. Arg: wasm | nowasm. Copyright (c) 2026 LFC Foundry. MIT License.
'use strict';

const inspector = require('inspector'), fs = require('fs'), v8 = require('v8');
const WASM = process.argv[2] !== 'nowasm';
(async () => {
const s = new inspector.Session(); s.connect(); const post = (m, p) => new Promise((r, j) => s.post(m, p || {}, (e, x) => e ? j(e) : r(x)));
await post('Profiler.enable'); await post('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
const MC = require(process.env.MC_MIN_TMP + '/lib.js'); const { corp, tcorp, streams } = v8.deserialize(fs.readFileSync(process.env.MC_MIN_TMP + '/corp.bin'));
const o = WASM ? {} : { wasm: false };
for (const [name, pk] of corp) { try { MC.unpack(pk, o); try { const V = MC.view(pk); const n = V.length; for (let i = 0; i < n; i += n > 5000 ? 37 : 1) V.get(i); if (V.slice) try { V.slice(0, Math.min(n, 50)); } catch (e) {} } catch (e) {} try { await MC.unpackAsync(pk, o); } catch (e) {} if (name === 'events' || name === 'api-users') { try { await MC.unpackAsync(pk, { stream: true, onRows() {}, page: 4096 }); } catch (e) {} } try { MC.unpack(pk, Object.assign({ into: undefined }, o)); } catch (e) {} } catch (e) { console.error('workload error', name, e.message); } }
for (const pk of tcorp) { MC.unpack(pk, o); try { await MC.unpackAsync(pk, o); } catch (e) {} }
const cks = []; for (const [f, len, st] of streams) { try { const r = f === 'deflate' ? MC.inflate(st) : f === 'zlib' ? MC.unzlib(st) : f === 'gzip' ? MC.gunzip(st) : MC.lz4Decompress(st, len); if (r.length !== len && f !== 'lz4Compress') console.error('stream len mismatch', f); MC.crc32(r); MC.adler32(r); } catch (e) { console.error('stream err', f, e.message); } }
{ const a = new Uint8Array(1000).map((x, i) => i); const sh = MC.shuffle ? MC.shuffle(a, 4) : null; try { MC.unshuffle(sh, 4); } catch (e) {} }
for (const [name, pk] of corp) { if (name === 'events' || name === 'api-users' || name === 'nfm-links') { try { const V = MC.view(pk); const ks = Object.keys(V.get(0)); for (const k of ks.slice(0, 12)) { try { V.column(k); } catch (e) {} try { V.field(3, k); } catch (e) {} } try { V.release(); } catch (e) {} } catch (e) {} } }
try { MC.unpack(corp[3][1], { as: 'bytes' }); } catch (e) {}
const cov = await post('Profiler.takePreciseCoverage');
fs.writeFileSync(process.env.MC_MIN_TMP + '/cov-' + (WASM ? 'wasm' : 'nowasm') + '.json', JSON.stringify(cov.result.filter((x) => x.url.endsWith(process.env.MC_MIN_TMP + '/lib.js'))));
process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
