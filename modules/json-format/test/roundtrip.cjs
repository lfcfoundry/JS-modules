// Node round-trip: pack rows, unpack, compare with JSON.parse (value-exact).
const JF = require('../json-format.js'), assert = require('assert');
const cases = require(process.argv[2] || '/mnt/project-files/json-format/tokenizer/cases.js');
(async () => {
  await JF.init();
  const list = Array.isArray(cases) ? cases : (cases.cases || Object.values(cases));
  let ok = 0, bad = 0;
  for (const c of list) {
    const text = Array.isArray(c) ? c[1] : c; const name = Array.isArray(c) ? c[0] : '';
    if (typeof text !== 'string') continue;
    const want = text.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
    try { const got = JF.unpack(JF.pack(text)); if (text.length > 5000) { let d = 0, x = got[0]; while (Array.isArray(x) && x.length) { x = x[0]; d++; } assert.strictEqual(d, 4999); } else assert.deepStrictEqual(got, want); ok++; } catch (e) { bad++; console.log('FAIL', name, JSON.stringify(text).slice(0, 120), e.message.split('\n')[0]); }
  }
  console.log('cases ok', ok, 'bad', bad);
})();
