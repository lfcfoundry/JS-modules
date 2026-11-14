// Copyright (c) 2026 LFC Foundry. MIT License.
// B42 unpackColumns / unpackColumnsParallel { nulls: 'NaN' }: every number column comes back as one typed value per row, NaN for null and missing; text stays a list; small raw files, one block and many blocks
const L=require('../lfc-pack.js');const fs=require('fs');
(async()=>{await L.init();let bad=0;const t=(c,m)=>{if(!c){bad++;console.log('FAIL',m);}};
// mixed data: nulls, missing keys, text, small raw file, multi-block
let s=5;const r=()=>(s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296;
const mk=(n)=>{const o=[];for(let i=0;i<n;i++){const x={a:i,b:r()<0.1?null:Math.round(r()*1000)/10,t:'x'+(i%7)};if(r()<0.8)x.c=Math.floor(r()*100);if(r()<0.5)x.d=r()<0.2?null:r()*5;o.push(x);}return o;};
for(const n of [5,30,2000,300000]){const rows=mk(n);const by=L.packRows(rows);
 const chk=(cols,label)=>{for(const k of ['a','b','c','d']){const v=cols[k];t(v instanceof Float64Array||ArrayBuffer.isView(v),label+' '+k+' typed '+(v&&v.constructor.name));for(let i=0;i<n;i++){const y=rows[i][k];const want=(y===null||y===undefined)?NaN:y;if(!Object.is(v[i],want)){t(false,label+' '+k+' row '+i+' '+v[i]+' vs '+y);break;}}}t(Array.isArray(cols.t),label+' t stays list');};
 const bl=L.unpackColumns(by,{nulls:'NaN'});const joined={};for(const k of ['a','b','c','d','t']){const parts=bl.map(b=>b.cols[k]);joined[k]=parts[0] instanceof Array?[].concat(...parts):Float64Array.from(parts.flatMap(p=>Array.from(p)));}
 chk(joined,'unpackColumns n='+n);
 chk(await L.unpackColumnsParallel(by,{nulls:'NaN'}),'parallel1 n='+n);
 chk(await L.unpackColumnsParallel(by,{nulls:'NaN'}),'parallel2 n='+n);
 const plain=L.unpackColumns(by);t(JSON.stringify(plain.map(b=>b.keys))===JSON.stringify(bl.map(b=>b.keys)),'keys same');
}
try{L.unpackColumns(L.packRows([{a:1}]),{nulls:'zero'});t(false,'bad nulls accepted');}catch(e){}
console.log(bad?'nulls NaN FAILED '+bad:'nulls NaN ok');process.exit(bad?1:0);})();
