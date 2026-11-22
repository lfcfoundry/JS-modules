// Copyright (c) 2026 LFC Foundry. MIT License.
const fs=require('fs'),cp=require('child_process');
const cut=(buf,n)=>{let e=buf.lastIndexOf(10,n);return buf.subarray(0,e+1)};
const W='/tmp/real-corpus/';
const retail=fs.readFileSync('/mnt/project-files/lfc-workbench/holdout-datasets-2026.11.15/ecommerce/data.csv');
fs.writeFileSync(W+'retail.csv',cut(retail,8e6));
const sec=cp.execSync("unzip -p '/mnt/project-files/2026q1 SEC.zip' num.txt | head -c 9000000",{maxBuffer:1e9});
fs.writeFileSync(W+'sec.tsv',cut(sec,8e6));
const sba=cp.execSync("unzip -p /mnt/project-files/FY2025_073_Assistance_Full_20261106.zip | head -c 9000000",{maxBuffer:1e9});
fs.writeFileSync(W+'sba.csv',cut(sba,8e6));
// graphs: bipartite edges from real columns
function edges(text,delim,a,b,max){const L=text.split(/\r?\n/);const h=L[0].split(delim);const ia=h.indexOf(a),ib=h.indexOf(b);const ma=new Map(),mb=new Map();const f=[],t=[];
 for(let i=1;i<L.length&&f.length<max;i++){const r=L[i].split(delim);if(r.length<=Math.max(ia,ib))continue;const x=r[ia],y=r[ib];if(!x||!y)continue;
  if(!ma.has(x))ma.set(x,ma.size);if(!mb.has(y))mb.set(y,mb.size);f.push(ma.get(x));t.push(mb.get(y))}
 const na=ma.size;for(let i=0;i<t.length;i++)t[i]+=na;return {n:na+mb.size,f,t}}
const out=[];
const g1=edges(retail.toString('latin1'),',','CustomerID','StockCode',1e9);
const g2=edges(sec.toString('latin1'),'\t','adsh','tag',1e9);
const g3=edges(sba.toString('latin1').replace(/\r/g,''),',','recipient_county_name','recipient_zip_code',1e9);
fs.writeFileSync(W+'graphs.json',JSON.stringify({retail_customer_to_product:g1,sec_filing_to_tag:g2,sba_county_to_zip:g3}));
for(const [k,g] of Object.entries({g1,g2,g3}))console.log(k,'nodes',g.n,'links',g.f.length);
// records for memory-compression
const recs=(text,delim,n)=>{const L=text.split(/\r?\n/);const h=L[0].split(delim);const o=[];for(let i=1;i<L.length&&o.length<n;i++){const r=L[i].split(delim);if(r.length!==h.length)continue;const x={};for(let j=0;j<h.length;j++){const v=r[j];const num=v!==''&&/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(v)?+v:v;x[h[j]]=num}o.push(x)}return o};
fs.writeFileSync(W+'recs.json',JSON.stringify({retail:recs(retail.toString('latin1'),',',60000),sec:recs(sec.toString('latin1'),'\t',60000)}));
console.log('ok');
