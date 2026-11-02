/* Stage 5 isolated full-chart correctness checks; no production files loaded by mutation. */
'use strict';
const assert = require('assert');
global.NetflowScene = require('../../../netflow-scene/netflow-scene.js');
const Production = require('../../netflow-plot.js');
const Candidate = require('./netflow-plot-full-exact.js');
const Reuse = require('../exact-aggregation-reuse-prototype.js');
const Arithmetic = require('../exact-numeric-prototype.js');
const GroupCore = require('./grouped-chart-core.js');
let checks = 0;
function ok(v, m) { assert.ok(v, m); checks++; }
function equal(a, b, m) { assert.deepStrictEqual(a, b, m); checks++; }
function rows(xs, vs, cs) { return xs.map((x,i)=>({attrs:{x:x,c:cs?cs[i]:undefined,v:vs[i]}})); }
function build(P, backend, rs, type) {
  const spec = type === 'donut' ? {type:'donut',x:'x',y:'v'} : {type:'marimekko',x:'x',color:'c',y:'v'};
  return backend ? P.makeStage5(rs,spec,{width:700,height:460},global.NetflowScene,backend) : P.make(rs,spec,{width:700,height:460},global.NetflowScene);
}
function digest(s) {
  return {
    legend:s.legend.map(x=>({t:x.t,key:x.key})),
    marks:s.marks.map(m=>({t:m.t,rows:m.rows,wedge:m.wedge,box:[m.x0,m.y0,m.x1,m.y1]})),
    rects:s.rects.map(r=>[r.x,r.y,r.w,r.h,r.fill]),
    polys:s.polys.map(p=>({pts:p.pts,c:p.c,fill:p.fill})),
    labels:s.labels.map(l=>[l.x,l.y,l.t,l.size,l.align]),
    finite:s.rects.every(r=>[r.x,r.y,r.w,r.h].every(Number.isFinite)) && s.polys.every(p=>p.pts.every(Number.isFinite)) && s.labels.every(l=>Number.isFinite(l.x+l.y))
  };
}
function membership(s) { const all=s.marks.flatMap(m=>m.rows||[]);return all.slice().sort((a,b)=>a-b); }

ok(Reuse.available(), 'BigInt reference backend available for cross-checks');
/* Group-cell results are checked against the independent exact reference, including permutation invariance. */
{
  const pool=[1e308,-1e308,1,-1,Number.MIN_VALUE,Math.pow(2,-1022),1e-100,0];
  const vals=Array.from({length:512},(_,i)=>pool[(i*37+Math.floor(i/7)*11)%pool.length]);
  function groupedCheck(input,backend){
    const x=input.map((_,i)=>'x'+(i%9)),c=input.map((_,i)=>'c'+(i%5)),table=GroupCore.grouped({rows:{length:input.length},x,color:c,values:input,xCap:0,colorCap:0,OTHER:{overflow:true},backend});
    for(const [xk,sub] of table.cells)for(const [ck,cell] of sub){
      const members=[];for(let i=0;i<input.length;i++)if(x[i]===xk&&c[i]===ck)members.push(input[i]);
      equal(cell.materialize().toNumber(),Arithmetic.accumulate(members).result(),backend+' grouped cell exactly matches independent accumulator');
      equal(cell.rows.length,members.length,backend+' grouped cell retains all row membership');
    }
  }
  for(const backend of ['bigint','limb','hybrid']){
    groupedCheck(vals,backend);groupedCheck(vals.slice().reverse(),backend);
  }
}
for (const backend of ['bigint','limb','hybrid']) {
  const ordinary=[]; for(let i=0;i<160;i++)ordinary.push({attrs:{x:'x'+(i%8),c:'c'+(i%5),v:0.25+(i%11)*0.125}});
  for (const type of ['donut','marimekko']) {
    const baseline=build(Production,null,ordinary,type), actual=build(Candidate,backend,ordinary,type);
    equal(digest(actual),digest(baseline),backend+' '+type+' ordinary chart structure, labels, aggregation, and layout');
    equal(membership(actual),Array.from({length:ordinary.length},(_,i)=>i),backend+' '+type+' retains each source row once and in order');
  }
  for(const type of ['donut','marimekko']){
    const spec=type==='donut'?{type:'donut',x:'x'}:{type:'marimekko',x:'x',color:'c'};
    equal(digest(Candidate.makeStage5(ordinary,spec,{width:700,height:460},global.NetflowScene,backend)),digest(Production.make(ordinary,spec,{width:700,height:460},global.NetflowScene)),backend+' '+type+' row-count aggregation matches production');
  }
}

/* Extended positive totals remain exact internally and normalize to finite geometry. */
for (const backend of ['bigint','limb','hybrid']) {
  const rs=rows(['a','b'],[1e308,1e308]);
  const s=build(Candidate,backend,rs,'donut');
  ok(s.labels.some(l=>l.t==='Out of range'),backend+' donut explicitly labels an unrepresentable center total');
  ok(s.marks.length===2 && s.marks.every(m=>m.wedge[5]>m.wedge[4]),backend+' two extended category totals create positive wedges');
  ok(digest(s).finite,backend+' extended donut geometry remains finite');
  const mm=build(Candidate,backend,rows(['a','a','b','b'],[1e308,1e308,1e308,1e308],['x','y','x','y']),'marimekko');
  ok(mm.marks.length===4 && digest(mm).finite,backend+' Marimekko ratios normalize extended totals into finite scene geometry');
}

/* Exact cancellation and merge paths are independent of input row order. */
for (const backend of ['bigint','limb','hybrid']) {
  for (const vals of [[1e308,1,-1e308],[1e308,-1e308,1]]) {
    const s=build(Candidate,backend,rows(['a','a','a'],vals),'donut');
    ok(s.marks.length===1 && s.marks[0].t==='a: 1 (100.0%)',backend+' cancellation order yields exact category total 1');
  }
  const out=build(Candidate,backend,rows(['a','a','b'],[1e308,1e308,1]),'donut');
  ok(out.marks.length===2 && out.marks.some(m=>m.t.indexOf('a: Out of range')===0),backend+' category overflow remains explicit without collapsing group identity');
}

/* Category caps preserve the private synthetic bucket, stable ordering, and row membership. */
{
  const xs=['Other'];for(let i=0;i<16;i++)xs.push('c'+i);
  const rs=rows(xs,xs.map((_,i)=>i===0?100:1));
  for(const backend of ['bigint','limb','hybrid']){
    const s=build(Candidate,backend,rs,'donut'), other=s.legend.filter(l=>l.t==='Other');
    ok(s.legend.length===12 && other.length===2 && new Set(other.map(l=>l.key)).size===2,backend+' real Other stays distinct from synthetic overflow in capped legend');
    equal(membership(s),Array.from({length:rs.length},(_,i)=>i),backend+' capped donut assigns each row exactly once');
  }
}
/* Marimekko folds both dimensions with exact totals, then assigns source rows directly. */
{
  const rs=[]; for(let xi=0;xi<24;xi++)for(let ci=0;ci<12;ci++)rs.push({attrs:{x:xi===0?'Other':'x'+xi,c:'color'+ci,v:1+(xi+ci)%5}});
  for(const backend of ['bigint','limb','hybrid']){
    const s=build(Candidate,backend,rs,'marimekko'),seen=membership(s);
    ok(s.legend.length===10,backend+' Marimekko applies its ten-color category cap');
    equal(seen,Array.from({length:rs.length},(_,i)=>i),backend+' capped Marimekko preserves every row exactly once');
    ok(digest(s).finite,backend+' capped Marimekko has finite layout geometry');
  }
}

/* Legacy NaN/Infinity behavior is retained; these are compared to production output. */
for(const vals of [[NaN,NaN],[Infinity,1],[-Infinity,1],[Infinity,-Infinity]]){
  const rs=rows(vals.map((_,i)=>'x'+i),vals);
  for(const type of ['donut','marimekko']){
    const a=digest(build(Production,null,rs,type)),b=digest(build(Candidate,'bigint',rs,type));
    equal(b,a,'non-finite legacy input '+String(vals)+' preserves production '+type+' structure and Number behavior');
  }
}
for(const vals of [[undefined,null,'',NaN],[0,0,0],[-5,-3],[10,-4,2]]){
  const rs=rows(vals.map((_,i)=>'x'+i),vals);
  for(const type of ['donut','marimekko']){
    const a=digest(build(Production,null,rs,type)),b=digest(build(Candidate,'bigint',rs,type));
    equal(b,a,'missing/zero/negative/mixed values '+String(vals)+' preserve production '+type+' behavior');
  }
}

/* A new build reads mutations; no exact table survives between calls. */
{
  const rs=rows(['a','b'],[2,3]);let a=build(Candidate,'bigint',rs,'donut');rs[0].attrs.v=20;let b=build(Candidate,'bigint',rs,'donut');
  ok(a.marks[0].t!==b.marks[0].t && b.marks.some(m=>m.t==='a: 20 (87.0%)'),'mutable row values are reread on each chart build');
}

console.log('Stage 5 full-chart exact prototype: '+checks+' checks passed');
