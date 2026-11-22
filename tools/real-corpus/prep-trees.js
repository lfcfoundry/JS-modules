// Copyright (c) 2026 LFC Foundry. MIT License.
// Real trees for netflow-hierarchy: SEC (filing > tag > row) and retail (country > item > line), cut to 1,000 / 10,000 / 100,000 rows.
const fs=require('fs'),cp=require('child_process');const W='/tmp/real-corpus/';
function tree(lines,delim,keys,valKey,lab){const h=lines[0].split(delim);const ki=keys.map(k=>h.indexOf(k)),vi=h.indexOf(valKey);const rows=[{id:'root',parent:null,value:0}];const seen=new Map();let n=0;
 for(let i=1;i<lines.length;i++){const r=lines[i].split(delim);if(r.length<h.length)continue;let par='root';
  for(let d=0;d<ki.length;d++){const id=par+'/'+r[ki[d]];if(!seen.has(id)){seen.set(id,1);rows.push({id,parent:par,value:0})}par=id}
  const v=Math.abs(parseFloat(r[vi]));rows.push({id:'row'+(n++),parent:par,value:Number.isFinite(v)&&v>0?v:1})}
 return rows}
const cut=(rows,N)=>{const keep=rows.slice(0,N);const ids=new Set(keep.map(r=>r.id));return keep.filter(r=>r.parent===null||ids.has(r.parent))};
const sec=cp.execSync("unzip -p '/mnt/project-files/2026q1 SEC.zip' num.txt | head -c 60000000",{maxBuffer:1e9}).toString('latin1').split('\n');
const retail=fs.readFileSync('/mnt/project-files/lfc-workbench/holdout-datasets-2026.11.15/ecommerce/data.csv').toString('latin1').split(/\r?\n/).map(l=>l.replace(/"[^"]*"/g,m=>m.replace(/,/g,';')));
const out={};
const S=tree(sec,'\t',['adsh','tag'],'value'),R=tree(retail,',',['Country','StockCode'],'Quantity');
// interleave: take rows in file order so parents precede children; cut by row count
for(const [n,rows] of [['sec',S],['retail',R]]){out[n]={};for(const N of [1000,10000,100000])out[n]['n'+N]=cut(rows,N)}
for(const n in out)for(const k in out[n])console.log(n,k,out[n][k].length);
fs.writeFileSync(W+'trees.json',JSON.stringify(out));
