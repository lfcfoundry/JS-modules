// Copyright (c) 2026 LFC Foundry. MIT License.
const fs=require('fs');const L=fs.readFileSync('/mnt/project-files/lfc-workbench/holdout-datasets-2026.11.15/ecommerce/data.csv').toString('latin1').split(/\r?\n/);
const parse=l=>{const o=[];let i=0,n=l.length;while(i<=n){if(l[i]==='"'){let s='';i++;while(i<n){if(l[i]==='"'){if(l[i+1]==='"'){s+='"';i+=2}else{i++;break}}else s+=l[i++]}o.push(s);i++}else{let j=l.indexOf(',',i);if(j<0)j=n;o.push(l.slice(i,j));i=j+1}}return o};
const H=parse(L[0]);console.log(H);const ix=n=>H.indexOf(n);
const m1=new Map(),m2=new Map();
for(let i=1;i<L.length;i++){if(!L[i])continue;const r=parse(L[i]);const v=+r[ix('Quantity')]*+r[ix('UnitPrice')];if(!(v>0))continue;
 const d=r[ix('InvoiceDate')].split(' ')[0].split('/');const mon='M:'+d[2]+'-'+d[0].padStart(2,'0');const c='C:'+r[ix('Country')],p='P:'+r[ix('StockCode')];
 const add=(m,k,v)=>m.set(k,(m.get(k)||0)+v);add(m1,c+'\u0001'+mon,v);add(m2,mon+'\u0001'+p,v)}
const mk=m=>[...m].map(([k,v])=>{const [f,t]=k.split('\u0001');return {from:f,to:t,value:Math.round(v)}});
const links=[...mk(m1),...mk(m2)].sort((a,b)=>b.value-a.value);console.log('links',links.length);
const out={};for(const n of [72,200,500,1500])out['links'+n]=links.slice(0,n);
fs.writeFileSync('/tmp/real-corpus/sankey.json',JSON.stringify(out));
