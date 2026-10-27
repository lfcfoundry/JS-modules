// Copyright (c) 2026 LFC Foundry. MIT License. Opens the files python/lfc_pack_write.py wrote (pywriter.py) with lfc-pack.js: values equal JSON.parse, and the byte-exact ones return the source bytes.
const JF = require('../lfc-pack.js'), fs = require('fs'), path = require('path'), assert = require('assert');
const flatSame = (a, b) => { const st = [[a, b]]; while (st.length) { const [x, y] = st.pop(); if (x === null || typeof x !== 'object' || y === null || typeof y !== 'object') { assert.deepStrictEqual(x, y); continue; } const kx = Object.keys(x); assert.deepStrictEqual(kx, Object.keys(y)); assert.strictEqual(Array.isArray(x), Array.isArray(y)); for (const k of kx) st.push([x[k], y[k]]); } };   // very deep rows overflow deepStrictEqual: same walk without recursion
const same = (a, b) => { try { assert.deepStrictEqual(a, b); } catch (e) { if (!/call stack/.test(String(e.message))) throw e; flatSame(a, b); } };
(async () => {
  await JF.init(); const dir = process.argv[2]; let n = 0, bad = 0;
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.src')).sort()) {
    const base = path.join(dir, f.slice(0, -4)); if (!fs.existsSync(base + '.pyw.lfc')) { console.log('skipped: no python files'); return; }
    const src = fs.readFileSync(base + '.src'), lines = src.toString('utf8').split('\n').filter(l => l.trim());
    try {
      const rows = JF.unpack(new Uint8Array(fs.readFileSync(base + '.pyw.lfc')));
      assert.strictEqual(rows.length, lines.length); for (let i = 0; i < lines.length; i++) same(rows[i], JSON.parse(lines[i]));
      assert.ok(Buffer.from(JF.unpackText(new Uint8Array(fs.readFileSync(base + '.pywx.lfc')))).equals(src));
    } catch (e) { bad++; console.log('DIFF', f, String(e.message).slice(0, 120), process.env.DBG ? e.stack.split('\n').slice(0, 6).join('|') : ''); }
    n++;
  }
  console.log('python writer files opened by lfc-pack.js:', n, 'bad', bad); process.exit(bad ? 1 : 0);
})();
