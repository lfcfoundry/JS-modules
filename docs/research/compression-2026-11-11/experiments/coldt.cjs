// Copyright (c) 2026 LFC Foundry. MIT License.
// research: decodeColumn time per column kind (build made with a timing wrapper). usage: node coldt.cjs build.js file.lfc
const fs=require("fs");(async()=>{const L=require(process.argv[2]); await L.init(); const b=new Uint8Array(fs.readFileSync(process.argv[3]));
for(let i=0;i<4;i++) L.unpackColumns(b); globalThis.__DT={}; let T=0; for(let i=0;i<8;i++){const t=performance.now(); L.unpackColumns(b); T+=performance.now()-t;}
console.log('total per read', (T/8).toFixed(1),'ms'); for(const [k,v] of Object.entries(__DT).sort((a,b)=>b[1]-a[1])) console.log(' ',k,(v/8).toFixed(1));})();
