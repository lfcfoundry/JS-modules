// Copyright (c) 2026 LFC Foundry. MIT License.
// FHIR bulk sample (100 generated patients, 21 NDJSON files, 190 MB). Owner-approved TRAINING set (11.22): generated patients, tuning allowed; wins are confirmed on the held-out real sets (retail, SEC, SBA).
// Makes: fhir.ndjson (8 MB text), fhir-3mb.txt/.lzma, recs-fhir.json (30,000 nested Observations),
// floats-fhir.bin (every Observation value), graphs-fhir.json (resource reference graph).
const fs=require('fs'),cp=require('child_process');const W='/tmp/real-corpus/';
const SRC=process.env.FHIR_DIR||'/tmp/fhir100/sample-bulk-fhir-datasets-100-patients/';
if(!fs.existsSync(SRC+'Patient.000.ndjson'))cp.execSync(`mkdir -p /tmp/fhir100 && unzip -qo /mnt/project-files/test-data/fhir-bulk-100/sample-bulk-fhir-datasets-100-patients.zip -d /tmp/fhir100`);
const obs=fs.readFileSync(SRC+'Observation.000.ndjson');
const cut=(b,n)=>b.subarray(0,b.lastIndexOf(10,n)+1);
fs.writeFileSync(W+'fhir.ndjson',cut(obs,8e6));
fs.writeFileSync(W+'fhir-3mb.txt',cut(obs,3e6));
cp.execSync(`python3 -c "import lzma;d=open('${W}fhir-3mb.txt','rb').read();open('${W}fhir-3mb.lzma','wb').write(lzma.compress(d,format=lzma.FORMAT_ALONE,filters=[{'id':lzma.FILTER_LZMA1,'preset':6,'dict_size':8<<20,'lc':3,'lp':0,'pb':2}]))"`);
const rows=[];for(const l of obs.toString('utf8').split('\n')){if(!l)continue;rows.push(JSON.parse(l));if(rows.length>=30000)break}
fs.writeFileSync(W+'recs-fhir.json',JSON.stringify(rows));
const vals=[];
for(const f of ['Observation.000.ndjson','Observation.001.ndjson'])for(const l of fs.readFileSync(SRC+f,'utf8').split('\n')){if(!l)continue;const q=JSON.parse(l).valueQuantity;if(q&&Number.isFinite(q.value))vals.push(q.value)}
fs.writeFileSync(W+'floats-fhir.bin',Buffer.from(Float64Array.from(vals).buffer));
// reference graph: resource -> each resource it points to
const ids=new Map(),F=[],T=[];const id=k=>{let v=ids.get(k);if(v===undefined){v=ids.size;ids.set(k,v)}return v};
const refs=(o,out)=>{if(Array.isArray(o))o.forEach(x=>refs(x,out));else if(o&&typeof o==='object')for(const k in o){if(k==='reference'&&typeof o[k]==='string')out.push(o[k]);else refs(o[k],out)}};
for(const f of fs.readdirSync(SRC).filter(x=>x.endsWith('.ndjson')&&x!=='log.ndjson'&&!x.startsWith('Observation.001')))for(const l of fs.readFileSync(SRC+f,'utf8').split('\n')){if(!l)continue;const r=JSON.parse(l);const a=id(r.resourceType+'/'+r.id);const o=[];refs(r,o);for(const x of o){if(x.startsWith('urn:'))continue;const b=id(x);if(a!==b){F.push(a);T.push(b)}}}
fs.writeFileSync(W+'graphs-fhir.json',JSON.stringify({fhir_reference_graph:{n:ids.size,f:F,t:T}}));
console.log('fhir text',fs.statSync(W+'fhir.ndjson').size,'rows',rows.length,'values',vals.length,'graph nodes',ids.size,'links',F.length);
