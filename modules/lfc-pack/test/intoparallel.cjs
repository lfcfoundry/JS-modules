// Copyright (c) 2026 LFC Foundry. MIT License. since 0.15.0: reads into arrays the caller keeps: unpackColumnsParallel { into } (numbers and dates), unpackColumns { text: 'bytes', into: { key: { bytes, start, end } } }.
'use strict';
const J = require('../lfc-pack.js'), assert = require('assert');
(async () => {
  await J.init();
  await (async () => {const N=120000;const id=new Int32Array(N),fare=new Float64Array(N),nn=new Float64Array(N),ts=new Array(N),cat=new Array(N);
for(let i=0;i<N;i++){id[i]=i;fare[i]=i*0.25;nn[i]=i%9?i:NaN;ts[i]=new Date(1.7e12+i*3000).toISOString().slice(0,19).replace('T',' ');cat[i]='c'+i%5;}
const f=await J.packColumnsParallel({id,fare,nn,ts,cat},{blockBytes:150000});console.log('blocks',J.stats(f).length);
for(const o of [{},{nulls:'NaN'}]){const base=await J.unpackColumnsParallel(f,o);const into={id:new Float64Array(N),fare:new Float64Array(N),nn:new Float64Array(N+10)};
 for(let rep=0;rep<3;rep++){const got=await J.unpackColumnsParallel(f,Object.assign({into},o));
  for(const k of ['id','fare','nn']){if(!base[k])continue;const x=got[k],y=base[k];assert.strictEqual(x.length,y.length,k);for(let i=0;i<x.length;i++)assert.ok(Object.is(x[i],y[i])||x[i]===y[i],k+i);if(ArrayBuffer.isView(x))assert.strictEqual(x.buffer,into[k].buffer,k+' written into');else if(!(k==='nn'&&!o.nulls))assert.fail(k+' not typed');}
  assert.deepStrictEqual(got.cat.slice(0,6),base.cat.slice(0,6));}}
assert.rejects(()=>J.unpackColumnsParallel(f,{into:{id:new Int32Array(N)}}),/Float64Array/);assert.rejects(()=>J.unpackColumnsParallel(f,{into:{id:new Float64Array(5)}}),/holds 5/);
console.log('parallel into ok');})();
  await (async () => {const N=90000,id=new Int32Array(N),title=new Array(N),cat=new Array(N);for(let i=0;i<N;i++){id[i]=i;title[i]=i%11===0?'':'tié '+(i*7919%100003);cat[i]='c'+i%7;}
const f=await J.packColumnsParallel({id,title,cat},{blockBytes:200000});console.log('blocks',J.stats(f).length);
const base=J.unpackColumns(f,{text:'bytes'});const td=new TextDecoder();
const strs=(blocks,k)=>{const o=[];for(const b of blocks){const c=b.cols[k];for(let i=0;i<c.start.length;i++)o.push(td.decode(c.bytes.subarray(c.start[i],c.end[i])));}return o;};
const want=strs(base,'title');assert.deepStrictEqual(want,title);
let total=0;for(const b of base){const c=b.cols.title;let lo=1e18,hi=0;for(let i=0;i<c.start.length;i++){if(c.end[i]>c.start[i]){lo=Math.min(lo,c.start[i]);hi=Math.max(hi,c.end[i]);}}total+=hi-lo;}
const into={title:{bytes:new Uint8Array(total+100),start:new Int32Array(N),end:new Int32Array(N)},id:new Float64Array(N)};
for(let rep=0;rep<2;rep++){const got=J.unpackColumns(f,{text:'bytes',into});assert.deepStrictEqual(strs(got,'title'),title);assert.strictEqual(got[0].cols.title.bytes,into.title.bytes);assert.strictEqual(got[1].cols.title.start.buffer,into.title.start.buffer);assert.strictEqual(got[1].cols.id.buffer,into.id.buffer);}
assert.throws(()=>J.unpackColumns(f,{text:'bytes',into:{title:{bytes:new Uint8Array(10),start:new Int32Array(N),end:new Int32Array(N)}}}),/bytes but the file needs/);
assert.throws(()=>J.unpackColumns(f,{text:'bytes',into:{title:{bytes:new Uint8Array(total),start:new Int32Array(5),end:new Int32Array(5)}}}),/holds 5 values/);
console.log('bytes into ok');})();
  console.log('into (parallel and bytes) ok');
})().catch(e => { console.error(String(e && e.message).slice(0, 300)); process.exit(1); });
