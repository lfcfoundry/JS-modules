// Copyright (c) 2026 LFC Foundry. MIT License.
// byte identity of two builds on the same inputs. usage: node ident.cjs A.js B.js file...
const fs=require('fs'),A=require(process.argv[2]),B=require(process.argv[3]);
Promise.all([A.init(),B.init()]).then(()=>{for(const f of process.argv.slice(4)){const t=fs.readFileSync(f),j=f.endsWith('.json');const a=j?A.packTables(JSON.parse(t)):A.pack(t),b=j?B.packTables(JSON.parse(t)):B.pack(t);console.log(f.split('/').pop(),a.length,b.length,Buffer.compare(Buffer.from(a),Buffer.from(b))===0?'same':'DIFF');}});
