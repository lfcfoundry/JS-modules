// Writes the 39 benchmark number columns (25 study + 14 real) as cols.bin + cols.json. i32 when every value is a 32-bit whole number, else f64.
'use strict'; const fs=require('fs'), csv=require('./csv.js');
const cols=require('./cols.js')().map(c=>({name:c.name,arr:c.arr,real:false}));
const addCsv=(file,label,names)=>{const d=csv(file);for(const h of names)cols.push({name:label+' '+h,arr:d.cols[d.head.indexOf(h)].map(Number).filter(x=>x===x),real:true});};
addCsv('housing.csv','housing',['longitude','latitude','housing_median_age','total_rooms','population','households','median_income','median_house_value']);
addCsv('quakes.csv','quakes',['Latitude','Longitude','Magnitude']);addCsv('temps.csv','temps',['Temp']);addCsv('titanic.csv','titanic',['PassengerId','Fare']);
const man=[],parts=[];let off=0;
for(const c of cols){const a=c.arr,isInt=a.every(v=>Number.isInteger(v)&&Math.abs(v)<2147483648);const t=isInt?Int32Array.from(a):Float64Array.from(a);const b=Buffer.from(t.buffer);
 parts.push(b);man.push({name:c.name,kind:isInt?'i32':'f64',n:a.length,off,bytes:b.length,real:c.real});off+=b.length;}
fs.writeFileSync('../cols.bin',Buffer.concat(parts));fs.writeFileSync('../cols.json',JSON.stringify(man));
console.log(man.length,'columns',off,'bytes',man.filter(m=>m.kind==='i32').length,'i32',man.filter(m=>m.real).length,'real');
