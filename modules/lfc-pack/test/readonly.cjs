// Copyright (c) 2026 LFC Foundry. MIT License. The decoder-only build (lfc-pack-read.js) opens files, runs the helper pool and refuses to write.
const W=require('../lfc-pack.js'),R=require('../lfc-pack-read.js'),assert=require('assert');
(async()=>{await W.init();const rows=Array.from({length:2000},(_,i)=>({id:i,n:'x'+i%9,o:{a:[i,i+1]}}));
const b=W.packTables({rows,links:rows.map(r=>({s:r.id,t:1}))});await R.init();
assert.deepStrictEqual(R.unpackTables(b),{rows,links:rows.map(r=>({s:r.id,t:1}))});
let threw=false;try{R.pack('{"a":1}\n')}catch(e){threw=true}assert(threw);console.log('read-only build ok');})();
(async()=>{const W=require('../lfc-pack.js'),R=require('../lfc-pack-read.js');await W.init();await R.init();
const rows=Array.from({length:3000},(_,i)=>({id:i,n:'x'+i%9}));const b=W.packRows(rows,{blockBytes:8000});const p=await R.pool({workers:2});assert.deepStrictEqual(await p.unpack(b),rows);p.close();console.log('read pool ok');})().catch(e=>{console.log('FAIL',e.message);process.exit(1)});
