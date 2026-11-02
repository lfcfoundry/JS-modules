/* Isolated Stage 5 grouped-data core. Exact finite sums; legacy Number path only
 * for groups containing explicit infinities. No cross-build cache. */
'use strict';
const reuse = require('../exact-aggregation-reuse-prototype.js');

function backendType(name) {
  if (name === 'limb') return reuse.LimbAccumulator;
  if (name === 'hybrid') return reuse.available() ? reuse.ExactAccumulator : reuse.LimbAccumulator;
  if (name === 'bigint') {
    if (!reuse.available()) throw new Error('BigInt backend unavailable');
    return reuse.ExactAccumulator;
  }
  throw new Error('Unknown exact backend: ' + name);
}
function State(Accumulator, hybrid) {
  this.Accumulator = Accumulator; this.hybrid = hybrid;
  this.acc = null; this.one = 0; this.finiteCount = 0; this.validCount = 0;
  this.rows = null; this.legacy = 0; this.nonFinite = false; this.hasRows = false;
}
State.prototype.add = function (i, v, keepRows) {
  this.hasRows = true;
  if (keepRows) (this.rows || (this.rows = [])).push(i);
  if (v !== v) return;
  this.validCount++; this.legacy += v;
  if (!Number.isFinite(v)) { this.nonFinite = true; return; }
  if (this.hybrid && this.finiteCount === 0) this.one = v;
  else if (this.hybrid && this.finiteCount === 1) {
    this.acc = new this.Accumulator(); this.acc.add(this.one); this.acc.add(v);
  } else {
    if (!this.acc) this.acc = new this.Accumulator();
    this.acc.add(v);
  }
  this.finiteCount++;
};
State.prototype.materialize = function () {
  if (!this.acc) { this.acc = new this.Accumulator(); if (this.finiteCount) this.acc.add(this.one); }
  return this.acc;
};
State.prototype.merge = function (other) {
  this.hasRows = this.hasRows || other.hasRows;
  this.validCount += other.validCount;
  this.legacy += other.legacy; this.nonFinite = this.nonFinite || other.nonFinite;
  if (other.finiteCount) {
    var before = this.finiteCount;
    if (this.hybrid && before === 0 && other.finiteCount === 1) this.one = other.one;
    else if (this.hybrid && before === 0 && other.finiteCount > 1) { this.acc = new this.Accumulator(); this.acc.merge(other.materialize()); }
    else if (!this.hybrid && before === 0) { this.acc = new this.Accumulator(); this.acc.merge(other.materialize()); }
    else if (before > 0) this.materialize().merge(other.materialize());
    this.finiteCount = before + other.finiteCount;
  }
  if (other.rows) (this.rows || (this.rows = [])).push.apply(this.rows, other.rows);
  return this;
};
State.prototype.setLegacy = function (v) { this.nonFinite = true; this.legacy = v; };
State.prototype.compare = function (other) {
  if (this.nonFinite || other.nonFinite) { var d = this.numberValue() - other.numberValue(); return d < 0 ? -1 : d > 0 ? 1 : 0; }
  return this.materialize().compare(other.materialize());
};
State.prototype.numberResult = function (cell) {
  if (this.nonFinite) return { status: 'legacy-nonfinite', value: this.legacy };
  if (cell && !this.validCount) return { status: 'nan', value: NaN };
  return this.materialize().toNumber();
};
State.prototype.numberValue = function () { var r = this.numberResult(false); return r.value; };
State.prototype.ratioTo = function (other) {
  if (this.nonFinite || other.nonFinite) return { status: 'legacy-number', value: this.numberValue() / other.numberValue() };
  return this.materialize().ratioTo(other.materialize());
};
function makeState(A,hybrid) { return new State(A,hybrid); }
function nestedGet(m,a,b) { var x=m.get(a); return x&&x.get(b); }
function nestedSet(m,a,b,v) { var x=m.get(a); if(!x){x=new Map();m.set(a,x);}x.set(b,v); }
function totalsBy(raw, dimension, order, A, hybrid) {
  const totals=new Map(); order.forEach(k=>totals.set(k,makeState(A,hybrid)));
  raw.forEach((sub,a)=>sub.forEach((g,b)=>{const k=dimension==='x'?a:b; if(!totals.has(k))totals.set(k,makeState(A,hybrid)); totals.get(k).merge(g);}));
  return totals;
}
function cap(order, totals, limit, highlight, OTHER) {
  const first=new Map();order.forEach((k,i)=>first.set(k,i));
  const list=order.slice().sort((a,b)=>totals.get(a).compare(totals.get(b))*-1 || first.get(a)-first.get(b));
  if(!limit||list.length<=limit)return {list,other:null};
  const hi=highlight===undefined?-1:list.indexOf(highlight),keep=hi>=limit-1;
  const folded=list.slice(keep?limit-2:limit-1); if(keep)folded.splice(folded.indexOf(highlight),1);
  return {list:list.slice(0,keep?limit-2:limit-1).concat(keep?[highlight]:[]).concat([OTHER]),other:new Set(folded)};
}
function mapped(c,k,OTHER) { return c.other&&c.other.has(k)?OTHER:k; }
function grouped(args) {
  const rows=args.rows,x=args.x,c=args.color||null,values=args.values||null,hasColor=!!c;
  const A=backendType(args.backend||'bigint'),hybrid=args.backend==='hybrid',OTHER=args.OTHER;
  const xOrder=[],cOrder=[],xSeen=new Set(),cSeen=new Set(),raw=new Map(),xLegacy=new Map(),cLegacy=new Map(),xHasInf=new Set(),cHasInf=new Set();
  function ensureOrder(order,seen,k){if(!seen.has(k)){seen.add(k);order.push(k);}}
  for(let i=0;i<rows.length;i++){
    const a=x[i],b=hasColor?c[i]:'',v=values?values[i]:1;
    ensureOrder(xOrder,xSeen,a);ensureOrder(cOrder,cSeen,b);
    if(!xLegacy.has(a))xLegacy.set(a,0);if(hasColor&&!cLegacy.has(b))cLegacy.set(b,0);
    if(v===v){xLegacy.set(a,xLegacy.get(a)+v);if(hasColor)cLegacy.set(b,cLegacy.get(b)+v);if(!Number.isFinite(v)){xHasInf.add(a);if(hasColor)cHasInf.add(b);}}
    let g=nestedGet(raw,a,b);if(!g){g=makeState(A,hybrid);nestedSet(raw,a,b,g);}g.add(i,v,false);
  }
  let xTotals;
  if(!hasColor){xTotals=new Map();xOrder.forEach(k=>xTotals.set(k,nestedGet(raw,k,'')));}
  else xTotals=totalsBy(raw,'x',xOrder,A,hybrid);
  const cTotals=hasColor?totalsBy(raw,'c',cOrder,A,hybrid):new Map();
  xHasInf.forEach(k=>xTotals.get(k).setLegacy(xLegacy.get(k)));cHasInf.forEach(k=>{if(cTotals.has(k))cTotals.get(k).setLegacy(cLegacy.get(k));});
  const xc=cap(xOrder,xTotals,args.xCap||0,args.xHighlight,OTHER),cc=hasColor?cap(cOrder,cTotals,args.colorCap||0,args.colorHighlight,OTHER):{list:[''],other:null};
  const needsMerge=!!(xc.other||cc.other),cells=needsMerge?new Map():raw;
  if(needsMerge)raw.forEach((sub,a)=>sub.forEach((g,b)=>{
    const aa=mapped(xc,a,OTHER),bb=hasColor?mapped(cc,b,OTHER):'';let out=nestedGet(cells,aa,bb);
    if(!out){out=makeState(A,hybrid);nestedSet(cells,aa,bb,out);}out.merge(g);
  }));
  /* Row indices and legacy sums are assigned once, after cap mapping, in source order. */
  const xFinalLegacy=new Map(),cFinalLegacy=new Map(),xFinalInf=new Set(),cFinalInf=new Set(),cellLegacy=new Map(),cellHasInf=new Set();
  for(const a of xc.list)xFinalLegacy.set(a,0);for(const b of cc.list)cFinalLegacy.set(b,0);
  for(let i=0;i<rows.length;i++){
    const a=mapped(xc,x[i],OTHER),b=hasColor?mapped(cc,c[i],OTHER):'',g=nestedGet(cells,a,b),v=values?values[i]:1;
    (g.rows||(g.rows=[])).push(i);
    if(v===v){xFinalLegacy.set(a,(xFinalLegacy.get(a)||0)+v);cFinalLegacy.set(b,(cFinalLegacy.get(b)||0)+v);cellLegacy.set(g,(cellLegacy.get(g)||0)+v);if(!Number.isFinite(v)){xFinalInf.add(a);cFinalInf.add(b);cellHasInf.add(g);}}
  }
  cellHasInf.forEach(g=>{g.nonFinite=true;g.legacy=cellLegacy.get(g);});
  const fx=totalsBy(cells,'x',xc.list,A,hybrid),fc=totalsBy(cells,'c',cc.list,A,hybrid);
  xFinalInf.forEach(k=>fx.get(k).setLegacy(xFinalLegacy.get(k)));cFinalInf.forEach(k=>fc.get(k).setLegacy(cFinalLegacy.get(k)));
  return {xCategories:xc.list,colorCategories:cc.list,cells,xTotals:fx,colorTotals:fc,xOverflow:xc.other,colorOverflow:cc.other,State:State,Accumulator:A,hybrid};
}
function getCell(table,x,c){return nestedGet(table.cells,x,c);}
module.exports={grouped,getCell,makeState,backendType};
