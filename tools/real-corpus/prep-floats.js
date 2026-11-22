// Copyright (c) 2026 LFC Foundry. MIT License.
// Real decimal columns as Float64 arrays: SEC statement values and SBA award amounts.
const fs=require('fs'),cp=require('child_process');const W='/tmp/real-corpus/';
function col(cmd,delim,name,max){const t=cp.execSync(cmd,{maxBuffer:1e9}).toString('latin1');const L=t.split(/\r?\n/);const h=L[0].split(delim);const ix=h.indexOf(name);const o=[];
 for(let i=1;i<L.length&&o.length<max;i++){const r=L[i].split(delim);const v=parseFloat(r[ix]);if(Number.isFinite(v)&&r[ix]!=='')o.push(v)}return Float64Array.from(o)}
const sec=col("unzip -p '/mnt/project-files/2026q1 SEC.zip' num.txt | head -c 60000000",'\t','value',1000000);
const sba=col("unzip -p /mnt/project-files/FY2025_073_Assistance_Full_20261106.zip | head -c 300000000",',','federal_action_obligation',1000000);
fs.writeFileSync(W+'floats-sec.bin',Buffer.from(sec.buffer));fs.writeFileSync(W+'floats-sba.bin',Buffer.from(sba.buffer));
console.log('floats sec',sec.length,'sba',sba.length);
