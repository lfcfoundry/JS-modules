/* Copyright (c) 2026 LFC Foundry. MIT License. Runs every check in run.js again with the WebAssembly kernels forced on (Node, pass/fail only); fails if WebAssembly is not available here. */
'use strict';
const G = require('../graph-walk.js');
G.ready().then((ok) => {
  if (!ok) { console.log('FAIL WebAssembly did not start'); process.exit(1); }
  G.setBackend('wasm');
  if (!G.accelerated()) { console.log('FAIL wasm backend not active'); process.exit(1); }
  require('./run.js');
  console.log('graph-walk (WebAssembly kernels): same checks passed');
});
