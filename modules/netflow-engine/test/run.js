/* Copyright (c) 2026 LFC Foundry. MIT License. netflow-engine placeholder checks: the file loads, says it is a placeholder, and its version matches the label. Run: node modules/netflow-engine/test/run.js */
'use strict';
const fs = require('fs'), path = require('path');
const NE = require('../netflow-engine.js');
let bad = 0;
const ok = (c, m) => { if (!c) throw new Error(m); };
const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message); } };
t('status() says it is a placeholder, with a version and an API number', () => {
  const s = NE.status();
  ok(s.placeholder === true, 'placeholder flag'); ok(/^\d+\.\d+\.\d+$/.test(s.version), 'version ' + s.version); ok(s.api === +s.version.split('.')[0], 'API equals the major'); ok(/placeholder/.test(s.message), 'message');
});
t('the file header, status() and modules.json agree on the version', () => {
  const root = path.join(__dirname, '..', '..', '..');
  const head = fs.readFileSync(path.join(__dirname, '..', 'netflow-engine.js'), 'utf8').match(/Version (\d+\.\d+\.\d+) \(API (\d+)\)/);
  const reg = JSON.parse(fs.readFileSync(path.join(root, 'modules.json'), 'utf8')).modules.find((m) => m.id === 'netflow-engine');
  ok(head && head[1] === NE.status().version, 'header ' + (head && head[1])); ok(reg && reg.version === head[1] && reg.api === +head[2], 'modules.json');
});
t('it exposes nothing but status() until the engine code lands', () => ok(Object.keys(NE).join() === 'status', Object.keys(NE).join()));
console.log(bad ? bad + ' FAILED' : '3 checks passed'); process.exit(bad ? 1 : 0);
