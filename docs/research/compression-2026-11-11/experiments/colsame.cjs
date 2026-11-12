// Copyright (c) 2026 LFC Foundry. MIT License.
// usage: node colsame.cjs buildA.js buildB.js file.lfc,...
// research: unpackColumns of build A and build B give the same columns (Object.is per value, same array kind)
const fs=require("fs");(async()=>{const A=require(process.argv[2]); await A.init(); const B=require(process.argv[3]); await B.init(); let bad=0, cells=0;
for(const f of process.argv[4].split(',')){const b=new Uint8Array(fs.readFileSync(f)); const x=A.unpackColumns(b), y=B.unpackColumns(b);
 for(let i=0;i<x.length;i++) for(const k of Object.keys(x[i].cols)){const u=x[i].cols[k], v=y[i].cols[k]; if(!v||u.constructor!==v.constructor||u.length!==v.length){bad++;console.log('KIND',f,i,k);continue;} for(let j=0;j<u.length;j++){cells++; if(!Object.is(u[j],v[j]) && JSON.stringify(u[j])!==JSON.stringify(v[j])){bad++; if(bad<5) console.log('DIFF',f,i,k,j,u[j],v[j]);}}}
 if (JSON.stringify(A.unpack(b))!==JSON.stringify(B.unpack(b))) {bad++; console.log('ROWS DIFFER', f);} }
console.log(cells,'cells',bad,'differ');})();
