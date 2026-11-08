#!/usr/bin/env node
// elias-fano against roaring-wasm and FastIntegerCompression (gaps then varint) in one real browser: size, nextGEQ, contains, decode all, intersect; 1,000,000 sorted values, sparse and dense. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: LIBS=<folder with node_modules holding roaring-wasm and fastintcompression> node tests/compare/elias-fano-compare-browser.js <chromium|firefox|webkit> [out.json]
// The libraries are only measured here, never copied into this repository. Intersections are checked equal; roaring select is left out (wrong answers in roaring-wasm 1.1.0).
'use strict';
const fs=require('fs'),path=require('path'),T=require('../../tools/test-runner/runner.js');
if(!process.env.LIBS){console.log('skipped: needs LIBS');process.exit(2)}
const M=(fs.existsSync(path.join(process.env.LIBS,'node_modules'))?path.join(process.env.LIBS,'node_modules'):process.env.LIBS)+'/';
const EF=fs.readFileSync(path.resolve(__dirname,'../../modules/elias-fano/elias-fano.js'),'utf8'),RO=fs.readFileSync(M+'roaring-wasm/browser/index.mjs','utf8'),FIC=fs.readFileSync(M+'fastintcompression/FastIntegerCompression.js','utf8').replace(/module\.exports\s*=\s*FastIntegerCompression;?/,'window.FastIntegerCompression=FastIntegerCompression;');
const PAGE=`<!doctype html><meta charset=utf-8><script src="/ef.js"></script><script src="/fic.js"></script><script type=module>
import * as R from '/ro.mjs';
(async()=>{try{await EliasFano.ready();if(R.roaringLibraryInitialize)await R.roaringLibraryInitialize();const RB=R.RoaringBitmap32,FIC=window.FastIntegerCompression;
let seed=5;const rnd=()=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
const mk=(n,gap)=>{const a=new Uint32Array(n);let v=0;for(let i=0;i<n;i++){v+=1+Math.floor(rnd()*gap);a[i]=v}return a};
const time=(f,reps=11,inner=3)=>{f();const t=[];for(let r=0;r<reps;r++){const z=performance.now();for(let q=0;q<inner;q++)f();t.push((performance.now()-z)/inner)}t.sort((x,y)=>x-y);return +t[reps>>1].toFixed(3)};
const delta=a=>{const d=new Uint32Array(a.length);let p=0;for(let i=0;i<a.length;i++){d[i]=a[i]-p;p=a[i]}return d};
const res={};
for(const [name,gap] of [['sparse',499],['dense',2]]){
  const a=mk(1e6,gap),b=mk(2e5,gap*5),ef=EliasFano.open(EliasFano.build(a)),efb=EliasFano.open(EliasFano.build(b));
  const ra=new RB(a),rb=new RB(b);ra.runOptimize();rb.runOptimize();const fic=FIC.compress(delta(a));
  const qs=new Uint32Array(20000);for(let i=0;i<20000;i++)qs[i]=Math.floor(rnd()*a[a.length-1]);
  const I1=EliasFano.intersect([ef,efb]),x=RB.and(ra,rb),I2=x.toUint32Array();x.dispose&&x.dispose();
  let same=I1.length===I2.length;for(let i=0;same&&i<I1.length;i++)if(I1[i]!==I2[i])same=false;
  const o={same,bytes:{ef:ef.bytes.length,roaring:ra.getSerializationSizeInBytes('portable'),fic:fic.byteLength},
   decodeAll:{ef:time(()=>ef.toArray()),roaring:time(()=>ra.toUint32Array()),fic:time(()=>FIC.uncompress(fic))},
   contains:{ef:time(()=>{let s=0;for(let i=0;i<qs.length;i++)s+=ef.contains(qs[i]);return s}),roaring:time(()=>{let s=0;for(let i=0;i<qs.length;i++)s+=ra.has(qs[i]);return s})},
   nextGEQ:{ef_many:time(()=>ef.nextGEQMany(qs)),roaring_rank:time(()=>{let s=0;for(let i=0;i<qs.length;i++)s+=ra.rank(qs[i]-1);return s},5,1)},
   intersect:{ef:time(()=>EliasFano.intersect([ef,efb])),roaring_and:time(()=>{const x=RB.and(ra,rb);const y=x.toUint32Array();x.dispose&&x.dispose();return y})}};
  res[name]=o}
window.__res=res}catch(e){window.__res={error:String(e&&e.stack||e)}}})();
</script>`;
T.main(async(b,which,out)=>{const srv=await T.serve({'/p.html':PAGE,'/ef.js':EF,'/fic.js':FIC,'/ro.mjs':{body:RO,type:'text/javascript'}});
const r=await T.pageResult(b,srv.base+'/p.html','__res',180);srv.close();console.log(JSON.stringify(r,null,0));if(r.sparse&&!(r.sparse.same&&r.dense.same))console.log('DIFFERENT INTERSECTIONS');if(out)fs.writeFileSync(out,JSON.stringify(r));return !r.error});
