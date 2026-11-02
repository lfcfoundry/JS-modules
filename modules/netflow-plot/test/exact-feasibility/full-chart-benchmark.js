'use strict';
global.NetflowScene = require('../../../netflow-scene/netflow-scene.js');
const perf = require('perf_hooks').performance;
const Production = require('./netflow-plot-production-probe.js');
const Candidate = require('./netflow-plot-full-exact.js');
const variants = ['ordinary','cancellation','extreme','nonfinite'];
const sizes = [[32,4],[4096,1000],[4096,4],[50000,1000],[50000,4]];
const architectures = ['production','bigint','limb','hybrid'];
const warmups = 3, sampleCount = 9;
function value(i,kind) {
  if (kind==='ordinary') return 0.25+(i%17)*0.25;
  if (kind==='cancellation') return [1e16,1,-1e16,0.5][i%4];
  if (kind==='extreme') { const e=(i%2?1:-1)*(i%900); return (i%3?1:-1)*Math.pow(2,e); }
  if (i%211===0) return Infinity;
  if (i%223===0) return -Infinity;
  if (i%17===0) return NaN;
  return 1+(i%13)*0.125;
}
function data(n,g,kind) {
  const rows=new Array(n);
  for(let i=0;i<n;i++) rows[i]={attrs:{x:'x'+(i%g),c:'c'+(i%Math.min(7,g)),v:value(i,kind)}};
  return rows;
}
function median(a) { const b=a.slice().sort((x,y)=>x-y),n=b.length;return n%2?b[(n-1)/2]:(b[n/2-1]+b[n/2])/2; }
function invoke(arch,backend,rows,spec) {
  if(arch==='production')return Production.make(rows,spec,{width:900,height:560},global.NetflowScene);
  return Candidate.makeStage5(rows,spec,{width:900,height:560},global.NetflowScene,backend);
}
const out=[];
for(const [n,g] of sizes) for(const variant of variants) {
  const rows=data(n,g,variant);
  for(const type of ['donut','marimekko']) {
    const spec=type==='donut'?{type,x:'x',y:'v'}:{type,x:'x',color:'c',y:'v'};
    const samples=Object.fromEntries(architectures.map(a=>[a,{full:[],aggregation:[]} ]));
    for(const arch of architectures)for(let j=0;j<warmups;j++)invoke(arch,arch==='production'?null:arch,rows,spec);
    for(let k=0;k<sampleCount;k++) {
      /* Rotate order across rounds to reduce thermal/JIT/order bias. */
      const start=k%architectures.length;
      for(let j=0;j<architectures.length;j++) {
        const arch=architectures[(start+j)%architectures.length], backend=arch==='production'?null:arch;
        const t=perf.now(),scene=invoke(arch,backend,rows,spec),elapsed=perf.now()-t;
        const aggregation=arch==='production'?Production.stage5Metrics().aggregationMs:scene.stage5AggregationMs;
        samples[arch].full.push(elapsed);samples[arch].aggregation.push(aggregation);
      }
    }
    const summary={};for(const arch of architectures){const q=samples[arch],m=median(q.full);summary[arch]={fullMedianMs:+m.toFixed(4),fullMadMs:+median(q.full.map(x=>Math.abs(x-m))).toFixed(4),aggregationMedianMs:+median(q.aggregation).toFixed(4),chartLayoutSceneMedianMs:+median(q.full.map((x,i)=>Math.max(0,x-q.aggregation[i]))).toFixed(4),samples:q.full.map(x=>+x.toFixed(4))};}
    out.push({rows:n,xGroups:g,variant,type,warmups,sampleCount,summary});
  }
}

/* Retained heap and process RSS high-water sample; scenes remain reachable through GC. */
if(global.gc) for(const arch of architectures) for(const type of ['donut','marimekko']) {
  const rows=data(50000,1000,'ordinary'),spec=type==='donut'?{type,x:'x',y:'v'}:{type,x:'x',color:'c',y:'v'};
  global.gc();const before=process.memoryUsage(),scene=invoke(arch,arch==='production'?null:arch,rows,spec);global.gc();const after=process.memoryUsage();
  out.push({memory:true,arch,type,rows:rows.length,heapBefore:before.heapUsed,heapAfter:after.heapUsed,retainedHeapDelta:after.heapUsed-before.heapUsed,rssBefore:before.rss,rssAfter:after.rss,rssHighWater:process.resourceUsage().maxRSS,retainedSceneCounts:{marks:scene.marks.length,rects:scene.rects.length,polys:scene.polys.length}});
}
for(const row of out) console.log(JSON.stringify(row));
