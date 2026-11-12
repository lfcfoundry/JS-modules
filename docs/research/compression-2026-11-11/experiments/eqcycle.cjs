// Copyright (c) 2026 LFC Foundry. MIT License.
// research: the eq.html cycle (6 queries, 24 runs) in Node, fresh process per mode; per-query median ms
const fs=require('fs');(async()=>{const L=require(process.argv[2]); await L.init(); const b=new Uint8Array(fs.readFileSync(process.argv[3])), Q=JSON.parse(fs.readFileSync(process.argv[4],'utf8')), m=process.argv[5]; globalThis.__B19=m; const per=Q.map(()=>[]);
for(let i=0;i<24;i++){const [k,v]=Q[i%Q.length]; const s=performance.now(); L.unpack(b,{equals:{key:k,value:v}}); per[i%Q.length].push(performance.now()-s);}
console.log(m.padEnd(6), per.map((x,j)=>Q[j][0]+' '+x.sort((a,c)=>a-c)[x.length>>1].toFixed(0)).join('  '));})();
