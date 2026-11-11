// Copyright (c) 2026 LFC Foundry. MIT License.
globalThis.__H = { c() {}, d() {} };
const JF = require('./inst.js'), fs = require('fs');
JF.init().then(() => { const b = fs.readFileSync(process.argv[2]); for (let i = 0; i < 3; i++) JF.pack(b); });
