// Copyright (c) 2026 LFC Foundry. MIT License.
// Date column (column type W, format minor 2): a column of "YYYY-MM-DDTHH:MM:SS.mmm" or "YYYY-MM-DDTHH:MM:SS" text is stored as epoch milliseconds and reads back as the same text; anything else is written as before.
const JF = require('../lfc-pack.js'), assert = require('assert'), { spawnSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
(async () => {
  await JF.init();
  let seed = 11; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const iso = (t, f) => new Date(t).toISOString().slice(0, f ? 19 : 23), hasW = (p) => JF.stats(p).some((b) => (b.keys || []).some((k) => k.type === 'W'));
  const mk = (n, f, step) => { const rows = []; let t = Date.UTC(2001, 0, 1, 10, 40); for (let i = 0; i < n; i++) { t += Math.floor(r() * step) + 1; rows.push({ id: i, d: iso(t, f), s: 'k' + (i % 5) }); } return rows; };
  const txt = (rows) => Buffer.from(rows.map((x) => JSON.stringify(x)).join('\n'));
  const roundTrip = (rows, name, expectW) => {
    for (const o of [{ block: 'flat' }, { block: 'flat', blockBytes: 3000 }, { block: 'flat', templates: false }, { block: 'flat', templates: true }]) {
      const p = JF.pack(txt(rows), o); assert.strictEqual(JSON.stringify(JF.unpack(p)), JSON.stringify(rows), name + ' ' + JSON.stringify(o));
      if (expectW !== undefined && !o.blockBytes) { assert.strictEqual(hasW(p), expectW, name + ' W ' + JSON.stringify(o)); if (expectW) assert.ok([2, 3].includes(JF.info(p).minor), name + ' minor'); }
    }
  };
  // milliseconds and whole seconds, small and large blocks
  for (const n of [2, 3, 50, 300, 5000]) { roundTrip(mk(n, 0, 900000), 'ms ' + n, n >= 50 ? true : undefined); roundTrip(mk(n, 1, 90000), 'sec ' + n, n >= 50 ? true : undefined); }
  // edge dates: epoch start, leap days, century rules, year ends, the last day of 9999
  const edges = ['1970-01-01T00:00:00.000', '1999-12-31T23:59:59.999', '2000-02-29T12:00:00.000', '2024-02-29T00:00:00.001', '2100-03-01T00:00:00.000', '2400-02-29T23:59:59.000', '9999-12-31T23:59:59.999', '2038-01-19T03:14:07.000', '1972-02-29T01:02:03.004'];
  roundTrip(edges.map((d, i) => ({ id: i, d })), 'edges', true);
  roundTrip(edges.map((d, i) => ({ id: i, d: d.slice(0, 19) })), 'edges sec', true);
  // every day of four years, written each second of noon
  { const rows = []; for (let t = Date.UTC(1999, 0, 1, 12); t < Date.UTC(2003, 0, 1); t += 86400000) rows.push({ d: iso(t, 0) }); roundTrip(rows, 'daily', true); }
  // dates spread over 1970 to 9999, unsorted (the wasm writer of the digits and the JavaScript one agree with Date)
  { const rows = []; for (let i = 0; i < 4000; i++) { const t = Math.floor(r() * 253402300799999); rows.push({ d: iso(t, i & 1 ? 1 : 0) }); } roundTrip(rows.map((x) => ({ d: x.d.length === 19 ? x.d + '.000' : x.d })), 'wide range', true); roundTrip(Array.from({ length: 3000 }, () => ({ d: iso(Math.floor(r() * 253402300799999), 1) })), 'wide range sec', true); }
  // not dates (or not exactly this form): the column is written as before and reads back unchanged
  const fall = {
    'feb 30': (d) => d.map((x, i) => i === 7 ? '2001-02-30T00:00:00.000' : x), 'feb 29 in 1900': (d) => d.map((x, i) => i === 7 ? '1900-02-29T00:00:00.000' : x), 'before 1970': (d) => d.map((x, i) => i === 7 ? '1969-12-31T23:59:59.999' : x),
    'lowercase t': (d) => d.map((x, i) => i === 7 ? x.replace('T', 't') : x), 'with Z': (d) => d.map((x, i) => i === 7 ? x + 'Z' : x), 'space': (d) => d.map((x, i) => i === 7 ? x.replace('T', ' ') : x),
    'hour 24': (d) => d.map((x, i) => i === 7 ? '2001-01-01T24:00:00.000' : x), 'minute 60': (d) => d.map((x, i) => i === 7 ? '2001-01-01T00:60:00.000' : x), 'short': (d) => d.map((x, i) => i === 7 ? '2001-01-01' : x),
    'mixed ms and sec': (d) => d.map((x, i) => i === 7 ? x.slice(0, 19) : x), 'null': (d) => d.map((x, i) => i === 7 ? null : x), 'number': (d) => d.map((x, i) => i === 7 ? 5 : x), 'plus sign': (d) => d.map((x, i) => i === 7 ? '2001-+1-01T00:00:00.000' : x),
    'non-ASCII digit': (d) => d.map((x, i) => i === 7 ? '2001-01-0١T00:00:00.000' : x), 'last row bad': (d) => d.map((x, i) => i === d.length - 1 ? 'nope' : x),
  };
  for (const name in fall) { const base = mk(400, 0, 900000), ds = fall[name](base.map((x) => x.d)); roundTrip(base.map((x, i) => ({ id: x.id, d: ds[i] })), name, false); }
  // a column of few distinct dates stays a dictionary; one row is not a date column
  roundTrip(Array.from({ length: 400 }, (_, i) => ({ d: ['2001-01-01T00:00:00.000', '2002-02-02T00:00:00.000'][i % 2] })), 'two dates');
  roundTrip([{ d: '2001-01-01T00:00:00.000' }], 'one row');
  // other columns and reads: projection, range on another key, a row with a missing key
  const rows = mk(3000, 0, 700000), p = JF.pack(txt(rows), { block: 'flat', blockBytes: 20000 });
  assert(hasW(p)); assert.deepStrictEqual(JF.unpack(p, { keys: ['d'] }).map((x) => x.d), rows.map((x) => x.d)); assert.deepStrictEqual(JF.unpack(p, { keys: ['id', 's'] }).map((x) => x.s), rows.map((x) => x.s));
  assert.strictEqual(JSON.stringify(JF.unpack(p, { range: { key: 'id', min: 100, max: 160 } })), JSON.stringify(rows.slice(100, 161)));
  { let at = 0; for (const b of JF.unpackColumns(p, { keys: ['d'] })) for (const v of b.cols.d) assert.strictEqual(v, rows[at++].d); assert.strictEqual(at, rows.length); }
  // smaller than the same column written without W
  { const big = mk(20000, 0, 900000), pw = JF.pack(txt(big), { block: 'flat' }); globalThis.__NODATE = 1; const pn = JF.pack(txt(big), { block: 'flat' }); globalThis.__NODATE = 0; void pn; assert(pw.length < 80000, 'size ' + pw.length); }
  // packBlock with text columns as bytes, and as strings: rows back the same
  { const ds = mk(5000, 0, 900000).map((x) => x.d), bytes = Buffer.from(ds.join('')), st = new Uint32Array(ds.length).map((_, i) => i * 23), en = st.map((x) => x + 23);
    const want = ds.map((d) => ({ d }));
    for (const cs of [{ d: { bytes, start: st, end: en } }, { d: ds }]) { const pc = await JF.packBlock(cs), sp = JF.packStream({}), parts = [...sp.pushPacked(pc), ...sp.finish()], file = Buffer.concat(parts.map((x) => Buffer.from(x)));
      assert.strictEqual(JSON.stringify(JF.unpack(file)), JSON.stringify(want)); assert(hasW(file), 'packBlock date column'); } }
  // the Python reader gives the same rows
  { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jf-date-')), f = path.join(dir, 'd.lfc'); globalThis.__NODATE = 0; fs.writeFileSync(f, JF.pack(txt(edges.map((d, i) => ({ id: i, d })).concat(mk(500, 0, 900000), mk(500, 1, 90000))), { block: 'flat' }));
    const py = spawnSync('python3', ['-I', '-c', "import sys,json;sys.path.insert(0,sys.argv[1]);import lfc_pack as L;print(json.dumps(L.read(sys.argv[2]),separators=(',',':')))", path.join(__dirname, '..', 'python'), f], { encoding: 'utf8', maxBuffer: 1 << 28 });
    if (py.status !== 0 && /No module named .(compression|zstandard)/.test(py.stderr)) console.log('python part skipped: no zstandard package and Python older than 3.14'); else { assert.strictEqual(py.status, 0, py.stderr); assert.strictEqual(py.stdout.trim(), JSON.stringify(JF.unpack(fs.readFileSync(f)))); } }
  console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
