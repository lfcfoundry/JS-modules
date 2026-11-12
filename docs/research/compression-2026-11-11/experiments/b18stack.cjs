// Copyright (c) 2026 LFC Foundry. MIT License.
// research: B18b alone and stacked with the null plane (N) and 4 MB blocks: packRows median time and file size against 0.8.3, rows checked
const fs=require('fs'),W=process.argv[2];(async()=>{const L={};for(const n of ['v-r83','v-18b','v-nul','v-nul18b']){L[n]=require(W+'/'+n+'.js');await L[n].init();}
const MB4={blockBytes:4194304};const V=[['0.8.3','v-r83'],['B18b','v-18b'],['N','v-nul'],['4MB','v-r83',MB4],['B18b+N','v-nul18b'],['B18b+4MB','v-18b',MB4],['N+4MB','v-nul',MB4],['B18b+N+4MB','v-nul18b',MB4]];
for(const f of process.argv[3].split(',')){const rows=fs.readFileSync(W+'/'+f,'utf8').trim().split('\n').map(l=>JSON.parse(l)),want=JSON.stringify(rows);const t={},sz={};V.forEach(v=>t[v[0]]=[]);
for(let k=0;k<5;k++)for(const v of (k%2?V.slice().reverse():V)){const a=performance.now(),b=L[v[1]].packRows(rows,v[2]);t[v[0]].push(performance.now()-a);if(k===0){sz[v[0]]=b.length;if(JSON.stringify(L[v[1]].unpack(b))!==want)console.log('ROWS DIFFER',f,v[0]);}}
const med=a=>a.sort((x,y)=>x-y)[2],b0=med(t['0.8.3']);console.log(f,'0.8.3 ms',b0.toFixed(0),'bytes',sz['0.8.3']);
for(const v of V.slice(1))console.log('  ',v[0].padEnd(12),'time',(med(t[v[0]])/b0).toFixed(2),'size',(sz[v[0]]/sz['0.8.3']).toFixed(3));}})()
