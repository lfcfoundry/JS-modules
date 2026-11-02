/* Copyright (c) 2026 LFC Foundry. MIT License. Focused tests for the isolated reuse prototype. */
'use strict';

const assert = require('assert');
const Exact = require('./exact-numeric-prototype.js');
const P = require('./exact-aggregation-reuse-prototype.js');
let checks = 0;
function ok(v, m) { assert.ok(v, m); checks++; }
function eq(a, b, m) { assert.deepStrictEqual(a, b, m); checks++; }
function throws(f, re, m) { assert.throws(f, re, m); checks++; }
function acc(C, values) { const a=new C(); values.forEach(v=>a.add(v)); return a; }
function ref(values) { return Exact.accumulate(values).result(); }
function sameResult(a,b,m) { eq(a,b,m); }
function rng(seed) { let x=seed>>>0;return ()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;}; }
function randomValues(n,seed) {
  const r=rng(seed),a=[];
  for(let i=0;i<n;i++){const e=Math.floor(r()*2098)-1074,m=.5+r()*.5;let v=m*Math.pow(2,e);if(v===0)v=Number.MIN_VALUE;a.push((r()<.5?-1:1)*v);}
  return a;
}
function permute(a,seed) { const r=rng(seed),b=a.slice();for(let i=b.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b; }
function ratioExpected(n,d) { return n.ratioTo(d); }

ok(P.available(),'BigInt path is available in the test runtime');

/* BigInt-backed accumulator: empty, strict finite inputs, count, merge, and order independence. */
let empty=new P.ExactAccumulator();
eq(empty.toNumber(),{status:'finite',value:0},'empty sum is exact zero');
eq(empty.mean(),{status:'empty',value:null},'empty mean has explicit status');
eq(empty.ratioTo(empty),{status:'division-by-zero',value:null},'zero denominator is explicit');
eq(empty.compare(new P.ExactAccumulator()),0,'empty accumulators compare equal');
throws(()=>empty.add(NaN),/finite/,'NaN is rejected');
throws(()=>empty.add(Infinity),/finite/,'positive infinity is rejected');
throws(()=>empty.add(-Infinity),/finite/,'negative infinity is rejected');
throws(()=>empty.add('1'),/finite/,'numeric strings are not coerced');
eq(empty.count,0,'rejected values do not mutate count');

const adversarial=[1e308,1,-1e308],reverse=[1e308,-1e308,1];
sameResult(acc(P.ExactAccumulator,adversarial).toNumber(),{status:'finite',value:1},'exact cancellation');
sameResult(acc(P.ExactAccumulator,reverse).toNumber(),{status:'finite',value:1},'permuted exact cancellation');
sameResult(acc(P.ExactAccumulator,[Number.MAX_VALUE,Number.MAX_VALUE]).toNumber(),{status:'out-of-range',value:null},'finite terms with out-of-range sum');
sameResult(acc(P.ExactAccumulator,[Number.MAX_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE]).toNumber(),{status:'finite',value:Number.MAX_VALUE},'overflowing intermediate order is retained exactly');
sameResult(acc(P.ExactAccumulator,[-Number.MAX_VALUE,-Number.MAX_VALUE]).toNumber(),{status:'out-of-range',value:null},'negative out-of-range sum');
sameResult(acc(P.ExactAccumulator,[4,-4,4,-4]).toNumber(),{status:'finite',value:0},'exact zero after cancellation');
sameResult(acc(P.ExactAccumulator,[3,3,3]).mean(),{status:'finite',value:3},'duplicate values and count');
sameResult(acc(P.ExactAccumulator,[1,2]).mean(),{status:'finite',value:1.5},'mean conversion');

/* Exact conversion and exact rational rounding, checked against the original prototype. */
for (const values of [[0.1,0.2],[Number.MIN_VALUE],[1,Math.pow(2,-53)],[1,3*Math.pow(2,-53)],[-1,-Math.pow(2,-53)],[Number.MAX_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE]]) {
  const expected=ref(values),big=acc(P.ExactAccumulator,values),limb=acc(P.LimbAccumulator,values);
  sameResult(big.toNumber(),expected,'BigInt reference conversion '+values.join(','));
  sameResult(limb.toNumber(),expected,'limb conversion '+values.join(','));
}
const halfTie=acc(P.ExactAccumulator,[1,Math.pow(2,-53)]);
eq(halfTie.toNumber().value,1,'binary64 tie rounds to even lower significand');
const upperTie=acc(P.ExactAccumulator,[1,3*Math.pow(2,-53)]);
eq(upperTie.toNumber().value,1+Math.pow(2,-51),'binary64 tie rounds to even upper significand');
const halfTieLimb=acc(P.LimbAccumulator,[1,Math.pow(2,-53)]);
eq(halfTieLimb.toNumber().value,1,'limb tie rounds to even');
sameResult(acc(P.ExactAccumulator,[Number.MAX_VALUE,Number.MAX_VALUE]).mean(),{status:'finite',value:Number.MAX_VALUE},'mean avoids overflowing exact sum conversion');
sameResult(acc(P.LimbAccumulator,[Number.MAX_VALUE,Number.MAX_VALUE]).mean(),{status:'finite',value:Number.MAX_VALUE},'limb mean avoids overflowing exact sum conversion');
const emptyLimb=new P.LimbAccumulator();eq(emptyLimb.toNumber(),{status:'finite',value:0},'empty limb sum is zero');eq(emptyLimb.mean(),{status:'empty',value:null},'empty limb mean is explicit');eq(emptyLimb.compare(new P.LimbAccumulator()),0,'empty limb compare');throws(()=>emptyLimb.add(NaN),/finite/,'limb path rejects NaN');throws(()=>emptyLimb.add(Infinity),/finite/,'limb path rejects infinity');

/* Merge is equivalent to direct exact accumulation and does not change source values. */
for (let seed=1;seed<=8;seed++) {
  const values=randomValues(257,seed),direct=acc(P.ExactAccumulator,values),limbDirect=acc(P.LimbAccumulator,values);
  const merged=new P.ExactAccumulator(),limbMerged=new P.LimbAccumulator();
  for(let i=0;i<values.length;i+=17){merged.merge(acc(P.ExactAccumulator,values.slice(i,i+17)));limbMerged.merge(acc(P.LimbAccumulator,values.slice(i,i+17)));}
  sameResult(merged.toNumber(),direct.toNumber(),'BigInt chunk merge seed '+seed);
  sameResult(limbMerged.toNumber(),limbDirect.toNumber(),'limb chunk merge seed '+seed);
  eq(merged.compare(direct),0,'BigInt compare seed '+seed);
  eq(limbMerged.compare(limbDirect),0,'limb compare seed '+seed);
  sameResult(acc(P.ExactAccumulator,permute(values,seed+100)).toNumber(),direct.toNumber(),'permutation result seed '+seed);
  sameResult(acc(P.LimbAccumulator,permute(values,seed+100)).toNumber(),direct.toNumber(),'limb permutation result seed '+seed);
}
for (let seed=20;seed<40;seed++) {
  const av=randomValues(41,seed),bv=randomValues(37,seed+1000),ae=acc(P.ExactAccumulator,av),be=acc(P.ExactAccumulator,bv),al=acc(P.LimbAccumulator,av),bl=acc(P.LimbAccumulator,bv);
  sameResult(al.mean(),ae.mean(),'limb mean/reference seed '+seed);
  sameResult(al.ratioTo(bl),ae.ratioTo(be),'limb arbitrary ratio/reference seed '+seed);
}
const carryValues=[];for(let i=0;i<12000;i++)carryValues.push(i%6===0?1e308:i%6===1?1:i%6===2?-1e308:i%6===3?Number.MAX_VALUE:i%6===4?-Number.MAX_VALUE:0.125);
sameResult(acc(P.LimbAccumulator,carryValues).toNumber(),ref(carryValues),'limb carries across repeated blocks and cancellation');
const carryMerged=new P.LimbAccumulator();for(let i=0;i<carryValues.length;i+=997)carryMerged.merge(acc(P.LimbAccumulator,carryValues.slice(i,i+997)));
sameResult(carryMerged.toNumber(),ref(carryValues),'limb carry and merge equivalence');

/* Exact ratios work even when both sums cannot be represented as Number. */
const one=acc(P.ExactAccumulator,[1e308]),two=acc(P.ExactAccumulator,[1e308,1e308]),three=acc(P.ExactAccumulator,[1e308,1e308,1e308]);
eq(one.toNumber().status,'finite','single huge sum is in range');
eq(two.toNumber().status,'out-of-range','two huge values are out of range');
eq(three.toNumber().status,'out-of-range','three huge values are out of range');
sameResult(one.ratioTo(two),{status:'finite',value:0.5},'bounded ratio with out-of-range denominator');
sameResult(two.ratioTo(three),{status:'finite',value:2/3},'ratio of two out-of-range sums');
sameResult(acc(P.LimbAccumulator,[1e308]).ratioTo(acc(P.LimbAccumulator,[1e308,1e308])),{status:'finite',value:0.5},'limb ratio with extended denominator');
sameResult(acc(P.LimbAccumulator,[1e308,1e308]).ratioTo(acc(P.LimbAccumulator,[1e308,1e308,1e308])),{status:'finite',value:2/3},'limb ratio of extended sums');
sameResult(acc(P.ExactAccumulator,[Number.MAX_VALUE,Number.MAX_VALUE]).ratioTo(acc(P.ExactAccumulator,[1])),{status:'out-of-range',value:null},'ratio overflow is explicit');
sameResult(acc(P.LimbAccumulator,[Number.MAX_VALUE,Number.MAX_VALUE]).ratioTo(acc(P.LimbAccumulator,[1])),{status:'out-of-range',value:null},'limb ratio overflow is explicit');
const denTie=acc(P.ExactAccumulator,[Math.pow(2,53)]);
eq(acc(P.ExactAccumulator,[Math.pow(2,53),1]).ratioTo(denTie).value,1,'ratio tie rounds to even');
eq(acc(P.ExactAccumulator,[Math.pow(2,53),3]).ratioTo(denTie).value,1+Math.pow(2,-51),'ratio tie rounds upward to even');
eq(acc(P.LimbAccumulator,[Math.pow(2,53),1]).ratioTo(acc(P.LimbAccumulator,[Math.pow(2,53)])).value,1,'limb ratio tie rounds to even');
eq(acc(P.LimbAccumulator,[Number.MIN_VALUE]).ratioTo(acc(P.LimbAccumulator,[2])).value,0,'ratio underflow tie rounds to zero');
eq(acc(P.LimbAccumulator,[Number.MIN_VALUE,Number.MIN_VALUE,Number.MIN_VALUE]).ratioTo(acc(P.LimbAccumulator,[2])).value,2*Number.MIN_VALUE,'subnormal ratio tie rounds to even');
sameResult(acc(P.ExactAccumulator,[-1]).ratioTo(acc(P.ExactAccumulator,[2])),{status:'finite',value:-0.5},'negative ratio');

/* Certified fast path: only zero-residual finite additions are accepted. */
for(const values of [[1,0.125,0.25,-0.5],[0.1,0.2],[1e16,1,-1e16],[1e308,1e308,-1e308],randomValues(64,99)]) {
  const got=P.certifiedSum(values),expected=ref(values);
  sameResult(got.result,expected,'certified path/fallback result '+values.length);
  eq(got.fallback,values.some((v,i)=>{
    if(i===0)return false;const a=values.slice(0,i).reduce((s,x)=>s+x,0),t=a+v;if(!Number.isFinite(t))return true;const bb=t-a;return (a-(t-bb))+(v-bb)!==0;
  }),'conservative fallback indicator');
}
eq(P.certifiedSum([1,0.125,0.25,-0.5]).fallback,false,'binary fractions stay on certified path');
eq(P.certifiedSum([0.1,0.2]).fallback,true,'ordinary decimal triggers exact fallback');
eq(P.certifiedSum([1e16,1,-1e16]).fallback,true,'cancellation triggers exact fallback');
eq(P.certifiedSum([1e308,1e308]).result.status,'out-of-range','certified overflow fallback reports status');

/* Group reuse: one input-row decode into raw cells, then merge for dimension totals and caps. */
const donutRows=[{x:'Other',value:100}];for(let i=0;i<12;i++)donutRows.push({x:'c'+i,value:1});
const donutTable=P.groupRows(donutRows,{xCap:12}),donut=P.donut(donutTable);
eq(donut.total,{status:'finite',value:112},'capped donut total preserved');
eq(donut.parts.length,12,'donut cap yields twelve visible groups');
const realOther=donut.parts.find(p=>p.category==='Other'),synthetic=donut.parts.find(p=>p.category===P.OTHER);
ok(realOther&&synthetic,'real Other and private overflow bucket remain distinct');
eq(realOther.rows,[0],'real Other row membership');
eq(synthetic.rows,[11,12],'overflow rows merge without duplication');
eq(synthetic.value,{status:'finite',value:2},'overflow bucket exact value');
ok(donut.parts.every(p=>p.ratio.status==='finite'),'all donut ratios stay finite');
ok(Math.abs(donut.parts.reduce((s,p)=>s+p.ratio.value,0)-1)<1e-14,'donut ratios sum to one within rounding tolerance');
const covered=donut.parts.flatMap(p=>p.rows).sort((a,b)=>a-b);eq(covered,donutRows.map((_,i)=>i),'donut row memberships are disjoint and complete');

const mixedRows=[
  {x:'A',color:'red',value:1e308},{x:'A',color:'red',value:1e308},{x:'A',color:'blue',value:1e308},
  {x:'B',color:'green',value:1e308},{x:'B',color:'green',value:NaN},{x:'C',color:'blue',value:-3}
];
const mixed=P.groupRows(mixedRows,{color:true}),mixedDonut=P.donut(mixed),m=mixedDonut.parts;
eq(mixedDonut.total.status,'out-of-range','donut total keeps explicit extended status');
eq(m.length,2,'negative aggregate excluded from donut parts');
eq(m.find(p=>p.category==='A').ratio.value,0.75,'extended donut proportion for A');
eq(m.find(p=>p.category==='B').ratio.value,0.25,'extended donut proportion for B');
eq(m.find(p=>p.category==='B').rows,[3,4],'NaN row remains in row membership but not numeric sum');
const mk=P.marimekko(mixed),aColumn=mk.columns.find(c=>c.category==='A');
eq(mk.total.status,'out-of-range','Marimekko denominator retains overflow status');
eq(aColumn.width.value,0.75,'Marimekko width from extended totals');
eq(aColumn.cells.find(c=>c.category==='red').ratio.value,2/3,'Marimekko segment ratio from merged cell totals');
eq(aColumn.cells.find(c=>c.category==='blue').ratio.value,1/3,'Marimekko second segment ratio');
eq(mk.columns.find(c=>c.category==='B').cells[0].rows,[3,4],'Marimekko rows retained through merge');

const cappedRows=[{x:'Other',color:'Other',value:50},{x:'x1',color:'c1',value:4},{x:'x2',color:'c2',value:3},{x:'x3',color:'c3',value:2},{x:'x4',color:'c4',value:1}];
const cappedTable=P.groupRows(cappedRows,{color:true,xCap:3,colorCap:3});
ok(cappedTable.xCategories.includes('Other')&&cappedTable.xCategories.includes(P.OTHER),'category cap preserves genuine and synthetic Other identities');
ok(cappedTable.colorCategories.includes('Other')&&cappedTable.colorCategories.includes(P.OTHER),'color cap preserves genuine and synthetic Other identities');
const capRows=Array.from(cappedTable.cells.values()).flatMap(sub=>Array.from(sub.values()).flatMap(g=>g.rows)).sort((a,b)=>a-b);
eq(capRows,cappedRows.map((_,i)=>i),'two-dimensional cap merging preserves every row exactly once');

const missing=P.groupRows([{x:'A',value:2},{x:'A',value:NaN}],{});
eq(missing.xTotals.get('A').toNumber(),{status:'finite',value:2},'missing numeric value skipped');
eq(P.donut(missing).parts[0].rows,[0,1],'missing numeric row remains associated with its category');
throws(()=>P.groupRows([{x:'A',value:Infinity}],{}),/non-finite/,'grouping rejects infinity');
const mutableRows=[{x:'A',value:2}];eq(P.donut(P.groupRows(mutableRows,{})).total.value,2,'first build reads current input');mutableRows[0].value=9;eq(P.donut(P.groupRows(mutableRows,{})).total.value,9,'next build observes mutable input without stale cache');

/* BigInt-free limb path is exercised in a fresh runtime, including ratios and out-of-range status. */
const child = `global.BigInt=undefined; const P=require(${JSON.stringify(require.resolve('./exact-aggregation-reuse-prototype.js'))}); const assert=require('assert'); const a=new P.LimbAccumulator();a.add(1e308).add(1e308);assert.deepStrictEqual(a.toNumber(),{status:'out-of-range',value:null});const n=new P.LimbAccumulator();n.add(1e308);assert.strictEqual(n.ratioTo(a).value,0.5);const c=new P.LimbAccumulator();c.add(1).add(Math.pow(2,-53));assert.strictEqual(c.toNumber().value,1);console.log('limb-only-ok');`;
const childOut=require('child_process').execFileSync(process.execPath,['-e',child],{encoding:'utf8'}).trim();
eq(childOut,'limb-only-ok','fixed-limb path runs without BigInt');

console.log('exact aggregation reuse prototype: '+checks+' assertions passed');

if(process.argv.includes('--bench')) {
  function ms(fn,rounds) { const samples=[];let sink=0;for(let w=0;w<2;w++)sink+=fn();for(let r=0;r<5;r++){const t=process.hrtime.bigint();for(let i=0;i<rounds;i++)sink+=fn();samples.push(Number(process.hrtime.bigint()-t)/1e6/rounds);}samples.sort((a,b)=>a-b);return +samples[2].toFixed(4); }
  function benchValues(n,kind,seed) {if(kind==='binary')return Array.from({length:n},(_,i)=>((i%31)-15)/8);if(kind==='cancel')return Array.from({length:n},(_,i)=>i%3===0?1e16:i%3===1?1:-1e16);return randomValues(n,seed);}
  function sumWith(C,values){const a=new C();for(let i=0;i<values.length;i++)a.add(values[i]);return a.toNumber();}
  function same(a,b){return a.status===b.status&&a.value===b.value;}
  for(const n of [32,4096,50000])for(const kind of ['binary','cancel','extreme']){const values=benchValues(n,kind,0x51a7+n),refResult=sumWith(P.ExactAccumulator,values),rounds=n===32?1000:n===4096?20:1;console.log(JSON.stringify({accumulatorComparison:{values:n,kind,exactMatches:same(refResult,sumWith(P.LimbAccumulator,values)),bigintMs:ms(()=>{const z=sumWith(P.ExactAccumulator,values);return z.value||0;},rounds),activeLimbMs:ms(()=>{const z=sumWith(P.LimbAccumulator,values);return z.value||0;},rounds)}}));}
  for(const shape of ['many-small','few-large']) {
    const count=shape==='many-small'?1000:4,each=50000/count;
    const groups=Array.from({length:count},(_,g)=>Array.from({length:each},(_,i)=>((i+g)%3===0?1e8:(i+g)%3===1?1:-1e8)));
    function all(C){let valid=true;for(const values of groups)valid=valid&&sumWith(C,values).status==='finite';return valid?1:0;}
    const bigintMs=ms(()=>all(P.ExactAccumulator),1),activeLimbMs=ms(()=>all(P.LimbAccumulator),1);
    console.log(JSON.stringify({groupAccumulatorComparison:{shape:shape,groups:count,valuesPerGroup:each,bigintMs:bigintMs,activeLimbMs:activeLimbMs}}));
  }
  function makeRows(n,kind) { return Array.from({length:n},(_,i)=>({x:kind==='few'?String(i%4):String(i%1000),color:String(i%8),value:(i%3===0?1e8:(i%3===1?1:-1e8))})); }
  function naive(rows) {
    const cat=new Map(),ct=new Map(),raw=new Map(),xo=[],co=[];
    function get(sub,k){let v=sub.get(k);if(!v){v={sum:new P.ExactAccumulator(),rows:[]};sub.set(k,v);}return v;}
    rows.forEach((r,i)=>{if(!cat.has(r.x)){cat.set(r.x,new P.ExactAccumulator());xo.push(r.x);}if(!ct.has(r.color)){ct.set(r.color,new P.ExactAccumulator());co.push(r.color);}cat.get(r.x).add(r.value);ct.get(r.color).add(r.value);let sub=raw.get(r.x);if(!sub){sub=new Map();raw.set(r.x,sub);}let g=get(sub,r.color);g.sum.add(r.value);g.rows.push(i);});
    function cap(order,totals,n){const sorted=order.slice();sorted.sort((a,b)=>totals.get(b).compare(totals.get(a))||order.indexOf(a)-order.indexOf(b));if(sorted.length<=n)return{list:sorted,other:null};return{list:sorted.slice(0,n-1).concat([P.OTHER]),other:new Set(sorted.slice(n-1))};}
    const xc=cap(xo,cat,12),cc=cap(co,ct,8),cells=new Map();
    raw.forEach((sub,x)=>sub.forEach((g,c)=>{const xx=xc.other&&xc.other.has(x)?P.OTHER:x,yy=cc.other&&cc.other.has(c)?P.OTHER:c;let out=cells.get(xx);if(!out){out=new Map();cells.set(xx,out);}let dest=out.get(yy);if(!dest){dest={sum:new P.ExactAccumulator(),rows:[]};out.set(yy,dest);}dest.sum.merge(g.sum);dest.rows=dest.rows.concat(g.rows).sort((a,b)=>a-b);}));
    const xTotals=new Map();xc.list.forEach(x=>xTotals.set(x,new P.ExactAccumulator()));cells.forEach((sub,x)=>sub.forEach(g=>xTotals.get(x).merge(g.sum)));
    const total=new P.ExactAccumulator();xTotals.forEach(a=>{if(a.compare(new P.ExactAccumulator())>0)total.merge(a);});
    return {xCategories:xc.list,cells,xTotals,total:total.toNumber()};
  }
  function reused(rows) { const t=P.groupRows(rows,{color:true,xCap:12,colorCap:8}),d=P.donut(t);return {xCategories:t.xCategories,cells:t.cells,xTotals:t.xTotals,total:d.total}; }
  console.log('reuse benchmark Node='+process.version+' arch='+process.arch+'; median of 5; 2 warmups; timings include retained row indices');
  function signature(x){return {cats:x.xCategories.map(k=>k===P.OTHER?'$OTHER':k),cellCount:Array.from(x.cells.values()).reduce((n,s)=>n+s.size,0),total:x.total};}
  for(const n of [4096,50000])for(const kind of ['many','few']){const rows=makeRows(n,kind),expected=signature(naive(rows)),actual=signature(reused(rows));console.log(JSON.stringify({rows:n,shape:kind==='many'?'1000 x groups, 8 colors':'4 x groups, 8 colors',sameSummary:JSON.stringify(expected)===JSON.stringify(actual),rawGroups:kind==='many'?1000:4,naiveMs:ms(()=>naive(rows),n===4096?2:1),reusedMs:ms(()=>reused(rows),n===4096?2:1)}));}
  function groupFallback(values) {let s=0;for(const x of values){const t=s+x;if(!Number.isFinite(t))return true;const b=t-s,e=(s-(t-b))+(x-b);if(e!==0)return true;s=t;}return false;}
  function fixtures(kind) {return Array.from({length:256},(_,g)=>Array.from({length:32},(_,i)=>{if(kind==='binary')return ((i%17)-8)/8;if(kind==='decimal')return ((i+g)%19)/10;if(kind==='cancel')return i%3===0?1e16:i%3===1?1:-1e16;if(kind==='extreme')return randomValues(1,0xdeadbeef+g*37+i)[0];return i%4===0?1e10:i%4===1?1e-6:i%4===2?-1e10:-1e-6;}));}
  for(const k of ['binary','decimal','cancel','extreme','mixed']){const gs=fixtures(k),falls=gs.filter(groupFallback).length;function fold(useCertified){let total=0;for(const values of gs){const z=useCertified?P.certifiedSum(values).result:sumWith(P.ExactAccumulator,values);if(z.status==='finite')total+=z.value;}return total;}console.log(JSON.stringify({fastPathFixture:k,groups:gs.length,fallbackGroups:falls,fallbackRate:falls/gs.length,bigintMs:ms(()=>fold(false),1),certifiedHybridMs:ms(()=>fold(true),1)}));}
}
