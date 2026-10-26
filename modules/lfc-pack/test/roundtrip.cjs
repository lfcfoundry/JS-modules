// Copyright (c) 2026 LFC Foundry. MIT License.
// Node round-trip: pack rows, unpack, compare with JSON.parse (value-exact).
const JF = require('../lfc-pack.js'), assert = require('assert');
const cases = require(process.argv[2] || '/mnt/project-files/json-format/tokenizer/cases.js');
const extra = [['flat mixed', '{"a":1,"b":"x"}\n{"a":"s","b":2}\n{"a":-0,"b":null}\n{"a":true}'], ['flat neg zero', '{"a":-0}\n{"a":0}'], ['flat surrogate col', '{"a":"\\ud800"}\n{"a":"ok"}'], ['flat nul', '{"a":"x\\u0000y"}\n{"a":"z"}'], ['flat proto', '{"__proto__":1,"b":2}\n{"b":3}'], ['flat decimals', '{"p":1.25}\n{"p":2.5}\n{"p":0.1}'], ['flat big', '{"n":9007199254740993}\n{"n":1}'], ['flat uuid hex ip', '{"u":"123e4567-e89b-12d3-a456-426614174000","h":"0123456789abcdef","i":"10.0.0.1"}\n{"u":"123e4567-e89b-12d3-a456-426614174001","h":"fedcba9876543210","i":"255.255.255.0"}'], ['flat dict', Array.from({length: 200}, (_, i) => JSON.stringify({s: 'v' + (i % 3), n: i * 1.5, t: i % 2 === 0})).join('\n')], ['flat empty obj', '{}\n{"a":1}\n{}'], ['flat unicode', '{"a":"é😀"}\n{"a":"plain"}']];
const MODES = [undefined, 'nested', 'flat'];
(async () => {
  await JF.init();
  for (var MODE of MODES) {
  const list = (Array.isArray(cases) ? cases : (cases.cases || Object.values(cases))).concat(extra);
  let ok = 0, bad = 0; ok = bad = 0;
  for (const c of list) {
    const text = Array.isArray(c) ? c[1] : c; const name = Array.isArray(c) ? c[0] : '';
    if (typeof text !== 'string') continue;
    const want = text.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
    try { const got = JF.unpack(JF.pack(text, { block: MODE })); if (text.startsWith('[[[[')) { let d = 0, x = got[0]; while (Array.isArray(x) && x.length) { x = x[0]; d++; } assert.strictEqual(d, 4999); } else assert.deepStrictEqual(got, want); ok++; } catch (e) { bad++; console.log('FAIL', name, JSON.stringify(text).slice(0, 120), e.message.split('\n')[0]); }
  }
  console.log('block', MODE || 'auto', 'cases ok', ok, 'bad', bad);
  }
})();
