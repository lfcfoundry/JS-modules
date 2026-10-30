// Copyright (c) 2026 LFC Foundry. MIT License.
// Fuzz helper: reads every NAME.lfc named on the command line (or listed in a file given as @list) with the JavaScript reader and prints one line per file: NAME<TAB>OK<TAB>rowsHash<TAB>textHash  or  NAME<TAB>ERR<TAB>message.
// Printed before the read starts: NAME<TAB>START (so a caller can tell which file hung or crashed the process).
'use strict';
const fs = require('fs'), crypto = require('crypto'), JF = require('../lfc-pack.js');
const h = (b) => crypto.createHash('sha1').update(b).digest('hex').slice(0, 16);
(async () => {
  await JF.init(); let files = process.argv.slice(2); if (files[0] && files[0][0] === '@') files = fs.readFileSync(files[0].slice(1), 'utf8').split('\n').filter(Boolean);
  for (const f of files) {
    const name = f.replace(/^.*\//, '').replace(/\.lfc$/, ''); fs.writeSync(1, name + '\tSTART\n');
    try { const b = fs.readFileSync(f), rows = JF.unpack(b), t = rows.map((r) => JSON.stringify(r)).join('\n') + '\n', tx = Buffer.from(JF.unpackText(b));
      fs.writeSync(1, name + '\tOK\t' + h(t) + '\t' + h(tx) + '\n'); }
    catch (e) { fs.writeSync(1, name + '\tERR\t' + String(e && e.message).replace(/\s+/g, ' ').slice(0, 120) + '\n'); }
  }
})();
