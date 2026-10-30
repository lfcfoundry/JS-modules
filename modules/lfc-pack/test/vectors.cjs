// Copyright (c) 2026 LFC Foundry. MIT License.
// Conformance vectors: vectors/<name>.ndjson is the source, <name>.json.lfc the value-exact file, <name>.x.json.lfc the byte-exact file.
// `node test/vectors.cjs` checks every file with this reader; `node test/vectors.cjs --update` rewrites the files (do this only when the format changes on purpose).
// Other readers (python/lfc_pack.py, other apps): decode each .json.lfc and compare with json.loads of the .ndjson lines (value-exact); the .x files must give the .ndjson bytes back.
const fs = require('fs'), path = require('path'), assert = require('assert'), JF = require('../lfc-pack.js');
const dir = path.join(__dirname, '..', 'vectors');
const CASES = {
  'flat-mixed': '{"id":1,"name":"a","ok":true,"score":1.5}\n{"id":2,"name":"b","ok":false,"score":-2}\n{"id":3,"name":"caf\\u00e9 ü","ok":null,"score":1e21}\n',
  'sparse-keys': '{"t":1,"a":1}\n{"t":2,"b":"x"}\n{"t":3,"a":2,"b":"y","c":[1,2]}\n{"t":4}\n',
  'nested': '{"p":{"q":[1,{"r":"s"}],"u":null},"v":"w"}\n{"p":{"q":[],"u":{}},"v":"w2"}\n',
  'unicode-escapes': '{"s":"\\ud83d\\ude00 \\u0000 \\n \\"quoted\\" \\\\"}\n{"s":"é中文"}\n',
  'numbers': '{"n":0}\n{"n":-0}\n{"n":9007199254740993}\n{"n":1.7976931348623157e308}\n{"n":5e-324}\n',
  'spelling-and-spacing': '{"a": 1.0,  "b":"x"}\n{"a":1E5,"b":"y"}\n',
  'blank-and-crlf': '{"a":1}\r\n\n{"a":2}\r\n',
  'no-final-newline': '{"a":1}\n{"a":2}'
};
(async () => {
  await JF.init();
  const upd = process.argv.includes('--update'); if (upd) fs.mkdirSync(dir, { recursive: true });
  let bad = 0;
  for (const name of Object.keys(CASES)) {
    const src = Buffer.from(CASES[name], 'utf8'), f1 = path.join(dir, name + '.json.lfc'), f2 = path.join(dir, name + '.x.json.lfc'), f0 = path.join(dir, name + '.ndjson');
    if (upd) { fs.writeFileSync(f0, src); fs.writeFileSync(f1, JF.pack(src)); fs.writeFileSync(f2, JF.pack(src, { exact: true })); }
    try {
      const want = src.toString('utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
      assert.deepStrictEqual(fs.readFileSync(f0), src, 'source changed');
      assert.deepStrictEqual(JF.unpack(fs.readFileSync(f1)), want, 'value-exact');
      assert.deepStrictEqual(JF.unpack(fs.readFileSync(f2)), want, 'value-exact (x)');
      assert.ok(Buffer.from(JF.unpackText(fs.readFileSync(f2))).equals(src), 'byte-exact');
      console.log('ok  ', name);
    } catch (e) { bad++; console.log('FAIL', name, e.message); }
  }
  process.exit(bad ? 1 : 0);
})();
