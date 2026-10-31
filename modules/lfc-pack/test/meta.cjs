// Copyright (c) 2026 LFC Foundry. MIT License.
// Optional metadata (footer section 6): pack({ meta }), metadata(bytes), packStream, packParallel, size limit, rows unchanged, Python reads the same object.
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process'), JF = require('../lfc-pack.js');
const src = Buffer.from('{"a":1,"b":"x"}\n{"a":2,"b":"y"}\n'), meta = { title: 'T', producer: 'test 1', tables: [{ name: 'rows', rows: 2, columns: [{ key: 'a', type: 'number', unit: 's' }] }], ['é😀']: [1, null] };
(async () => {
  await JF.init();
  const want = JF.unpack(JF.pack(src));
  for (const o of [{}, { exact: true }, { block: 'nested' }]) {
    const f = JF.pack(src, Object.assign({ meta }, o)), g = JF.metadata(f);
    assert.deepStrictEqual(g, Object.assign({ v: 1 }, meta)); assert.deepStrictEqual(JF.unpack(f), want);
    assert.strictEqual(JF.metadata(JF.pack(src, o)), null);
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-')), p = path.join(d, 'm.lfc'); fs.writeFileSync(p, f);
    const r = spawnSync('python3', ['-c', "import sys,json;sys.path.insert(0,'" + path.join(__dirname, '..', 'python') + "');import lfc_pack;print(json.dumps(lfc_pack.metadata(sys.argv[1]),ensure_ascii=False));print(lfc_pack.read(sys.argv[1])==[{'a':1,'b':'x'},{'a':2,'b':'y'}])", p], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr); const [m, ok] = r.stdout.trim().split('\n'); assert.deepStrictEqual(JSON.parse(m), Object.assign({ v: 1 }, meta)); assert.strictEqual(ok, 'True');
  }
  const s = JF.packStream({ meta }), parts = [].concat(s.push(src), s.finish()), f2 = Buffer.concat(parts.map((x) => Buffer.from(x)));
  assert.deepStrictEqual(JF.metadata(f2), Object.assign({ v: 1 }, meta)); assert.deepStrictEqual(JF.unpack(f2), want);
  assert.throws(() => JF.pack(src, { meta: { big: 'x'.repeat(70000) } }), /64 KB/); assert.throws(() => JF.pack(src, { meta: [1] }), /plain object/);
  assert.strictEqual(JF.metadata(JF.pack(src, { meta: { v: 9 } })).v, 1);
  console.log('ok   metadata');
})().catch((e) => { console.log('FAIL', e.stack || e); process.exit(1); });
