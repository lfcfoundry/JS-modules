// Copyright (c) 2026 LFC Foundry. MIT License.
// 3 MB real text slices packed with Python's lzma (lc 3, lp 0, pb 2, 8 MB dictionary, preset 6) as .lzma files.
const fs=require('fs'),cp=require('child_process');const W='/tmp/real-corpus/';
for(const [n,f] of [['retail','retail.csv'],['sec','sec.tsv'],['sba','sba.csv']]){
 const b=fs.readFileSync(W+f).subarray(0,3000000);fs.writeFileSync(W+n+'-3mb.txt',b);
 cp.execSync(`python3 -c "import lzma,sys;d=open('${W}${n}-3mb.txt','rb').read();open('${W}${n}-3mb.lzma','wb').write(lzma.compress(d,format=lzma.FORMAT_ALONE,filters=[{'id':lzma.FILTER_LZMA1,'preset':6,'dict_size':8<<20,'lc':3,'lp':0,'pb':2}]))"`);
 console.log(n,fs.statSync(W+n+'-3mb.lzma').size)}
