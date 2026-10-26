// Copyright (c) 2026 LFC Foundry. MIT License.
// Byte-exact switch: pack({exact:true}) then unpackText gives back the input bytes, for every edge case and for tricky layouts of the same lines.
const JF = require('../lfc-pack.js'), fs = require('fs'), cases = require('./cases.js');
(async () => {
  await JF.init(); let ok = 0, bad = 0;
  const variants = (t) => [t, t + '\n', t.replace(/\n/g, '\r\n'), '\n' + t, t.replace(/\n/g, '\n\n'), t + '\n\n', '  ' + t.replace(/\n/g, ' \n ')];
  const check = (name, buf, o) => { try { const out = Buffer.from(JF.unpackText(JF.pack(buf, o))); if (out.equals(buf)) ok++; else { bad++; console.log('DIFF', name, JSON.stringify(buf.toString('latin1').slice(0, 80))); } } catch (e) { bad++; console.log('ERR', name, e.message); } };
  for (const [name, t] of cases) for (const v of variants(t)) for (const block of [undefined, 'flat', 'nested']) check(name, Buffer.from(v), { exact: true, block });
  check('invalid utf8', Buffer.from([123, 34, 97, 34, 58, 34, 0xff, 34, 125, 10]), { exact: true });
  for (const f of process.argv.slice(2)) { const b = fs.readFileSync(f); check(f, b, { exact: true }); const n = JF.pack(b, { exact: true }); console.log(f, 'exact size', n.length, 'value-exact size', JF.pack(b).length); }
  console.log('exact ok', ok, 'bad', bad); process.exit(bad ? 1 : 0);
})();
