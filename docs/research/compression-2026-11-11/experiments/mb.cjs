// Copyright (c) 2026 LFC Foundry. MIT License.
const L=require(process.env.LP || '../../../../modules/lfc-pack/lfc-pack.js');
const [file, ks] = [process.argv[2], process.argv[3].split(',')];
L.init().then(()=>{const b=require('fs').readFileSync(file);const p=L.pack(b);
const t=(f)=>{const r=[];for(let k=0;k<9;k++){const s=performance.now();f();r.push(performance.now()-s);}r.sort((a,b)=>a-b);return r[4].toFixed(1)};
const c=L.unpackColumns(p,{keys:ks});
const colm=()=>{const all=[];for(const bl of c){const n=bl.n,out=new Array(n);for(let i=0;i<n;i++)out[i]={};for(const k of ks){const v=bl.cols[k];for(let i=0;i<n;i++)out[i][k]=v[i];}all.push(out);}return all};
const rowm=()=>{const all=[];for(const bl of c){const n=bl.n,out=new Array(n),K=ks.length,vs=ks.map(k=>bl.cols[k]);for(let i=0;i<n;i++){const o={};for(let j=0;j<K;j++)o[ks[j]]=vs[j][i];out[i]=o;}all.push(out);}return all};
const tplS='{'+ks.map(k=>JSON.stringify(k)+':null').join(',')+'}';
const rowclone=()=>{const all=[];const tpl=JSON.parse(tplS);for(const bl of c){const n=bl.n,out=new Array(n),K=ks.length,vs=ks.map(k=>bl.cols[k]);for(let i=0;i<n;i++){const o={...tpl};for(let j=0;j<K;j++)o[ks[j]]=vs[j][i];out[i]=o;}all.push(out);}return all};
const gen=new Function('vs','i','return {'+ks.map((k,j)=>JSON.stringify(k)+':vs['+j+'][i]').join(',')+'}');
const genm=()=>{const all=[];for(const bl of c){const n=bl.n,out=new Array(n),vs=ks.map(k=>bl.cols[k]);for(let i=0;i<n;i++)out[i]=gen(vs,i);all.push(out);}return all};
for(let r=0;r<2;r++)console.log(ks.length+' keys: unpack keys',t(()=>L.unpack(p,{keys:ks})),'colmajor',t(colm),'rowmajor',t(rowm),'rowclone',t(rowclone),'codegen',t(genm),'cols',t(()=>L.unpackColumns(p,{keys:ks})));
});
