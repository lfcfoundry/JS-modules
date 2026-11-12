// Copyright (c) 2026 LFC Foundry. MIT License.
// research: jcell(s) equals JSON.parse(s), or both throw, on edge texts
const src=require('fs').readFileSync(process.argv[2],'latin1'); const m=src.match(/function jcell\(s\) \{[\s\S]*?return JSON.parse\(s\); \}/)[0]; const jcell=eval('('+m+')');
const T=['null','true','false','0','-0','1','-1','01','-01','-','00','123456789012345','1234567890123456','9007199254740993','-123456789012345','1.5','1e3','"x"','[1]','{}','nul','truee','0x1',' 1','1 ','-a','12a','', '1E2','-0.0'];
let bad=0; for(const s of T){let a,b,ea,eb; try{a=JSON.parse(s)}catch(e){ea=1} try{b=jcell(s)}catch(e){eb=1} if(ea!==eb||(!ea&&!Object.is(a,b))){bad++;console.log('BAD',JSON.stringify(s),a,b);}}
for(let k=0;k<200000;k++){const x=Math.floor((Math.random()*2-1)*10**Math.floor(Math.random()*16)); const s=JSON.stringify(x); if(!Object.is(jcell(s),JSON.parse(s))){bad++; if(bad<5)console.log('BAD',s);}}
console.log(T.length+200000,'texts',bad,'differ');
