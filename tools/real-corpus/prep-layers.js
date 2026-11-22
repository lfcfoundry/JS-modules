// Copyright (c) 2026 LFC Foundry. MIT License.
// Real product-path graphs from the retail file (consecutive items in one invoice), for netflow-layers.
const fs=require('fs'),cp=require('child_process');const W='/tmp/real-corpus/';
const retail=fs.readFileSync('/mnt/project-files/lfc-workbench/holdout-datasets-2026.11.15/ecommerce/data.csv').toString('latin1').split(/\r?\n/);
// product sequence graph: consecutive stock codes inside an invoice (real co-purchase path), top-N by degree
const h=retail[0].split(',');const ii=h.indexOf('InvoiceNo'),si=h.indexOf('StockCode');
const cnt=new Map(),seq=[];let prev=null,pinv=null;
for(let i=1;i<retail.length;i++){const r=retail[i].split(',');if(r.length<8)continue;const inv=r[ii],sc=r[si];if(inv===pinv&&prev&&prev!==sc){const k=prev+'>'+sc;cnt.set(k,(cnt.get(k)||0)+1)}pinv=inv;prev=sc}
const deg=new Map();for(const [k,c] of cnt){const [a,b]=k.split('>');deg.set(a,(deg.get(a)||0)+c);deg.set(b,(deg.get(b)||0)+c)}
const top=n=>{const keep=new Set([...deg.entries()].sort((x,y)=>y[1]-x[1]).slice(0,n).map(x=>x[0]));const e=[];for(const [k,c] of cnt){const [a,b]=k.split('>');if(keep.has(a)&&keep.has(b))e.push({from:a,to:b,count:c})}return {nodes:[...keep],edges:e}};
const L={n300:top(300),n1000:top(1000),n3000:top(3000)};
for(const k in L)console.log('layers',k,L[k].nodes.length,L[k].edges.length);
fs.writeFileSync(W+'layers.json',JSON.stringify(L));
