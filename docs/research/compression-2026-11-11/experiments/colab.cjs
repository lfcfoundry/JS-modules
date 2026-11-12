// Copyright (c) 2026 LFC Foundry. MIT License.
// research: alternate two builds on one file, many warm unpackColumns calls each, median per build
const fs=require("fs");(async()=>{const A=require(process.argv[2]); await A.init(); const B=require(process.argv[3]); await B.init(); const b=new Uint8Array(fs.readFileSync(process.argv[4])), N=+process.argv[5]||60;
const ta=[],tb=[]; for(let r=0;r<N;r++){ for(const [L,t] of (r%2?[[A,ta],[B,tb]]:[[B,tb],[A,ta]])){const s=performance.now(); L.unpackColumns(b); t.push(performance.now()-s);} }
const md=x=>x.sort((p,q)=>p-q)[x.length>>1]; console.log(process.argv[4].split('/').pop(), 'A', md(ta).toFixed(2), 'B', md(tb).toFixed(2), 'B/A', (md(tb)/md(ta)).toFixed(2));})();
