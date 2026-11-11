// Copyright (c) 2026 LFC Foundry. MIT License.
const JF = require(process.argv[2]), fs = require('fs');
JF.init().then(() => { const b = fs.readFileSync(process.argv[3]); JF.pack(b); });
