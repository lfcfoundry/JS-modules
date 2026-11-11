// Copyright (c) 2026 LFC Foundry. MIT License.
const assert = require('node:assert/strict');
const { Worker } = require('node:worker_threads');
const path = require('node:path');
const which = process.argv[2] || 'candidate';
const libPath = which === 'baseline'
  ? path.join(__dirname, 'lfc-pack-baseline.js')
  : path.resolve(__dirname, '../../../../modules/lfc-pack/lfc-pack.js');
const L = require(libPath);
const original = Worker.prototype.postMessage;
let callerBacking, calls = [], activeCase;
Worker.prototype.postMessage = function (message, transfer) {
  if (message && message.buf) {
    calls.push({ input: activeCase, kind: message.kind, length: message.buf.byteLength,
      backingLength: message.buf.buffer.byteLength, offset: message.buf.byteOffset,
      sameBackingAsCaller: message.buf.buffer === callerBacking,
      transferredExactlyJobBacking: transfer?.length === 1 && transfer[0] === message.buf.buffer });
  }
  return original.call(this, message, transfer);
};
(async () => {
  await L.init();
  const text = Array.from({length: 1000}, (_,i) => JSON.stringify({id:i,body:'x'.repeat(70+i%7)})).join('\n')+'\n';
  const archive = L.pack(Buffer.from(text), {blockBytes: 8192});
  const expected = L.unpack(archive);
  const pool = await L.pool({workers:2});
  const padded=Buffer.concat([Buffer.from([9,8]),Buffer.from(archive),Buffer.from([7,6])]);
  const sab=new SharedArrayBuffer(archive.length+4);
  const sabView=Buffer.from(sab,2,archive.length); sabView.set(archive);
  const inputs=[
    ['pooled',Buffer.from(archive)],
    ['offset-slice',padded.subarray(2,2+archive.length).slice()],
    ['shared',sabView],
    ['uint8-view',new Uint8Array(padded.buffer,padded.byteOffset+2,archive.length)],
  ];
  for(const [name,input] of inputs){
    activeCase=name; callerBacking=input.buffer;
    const before=Buffer.from(input);
    const t=performance.now(); let correct=false, error=null;
    try { const result=await pool.unpack(input); correct=JSON.stringify(result)===JSON.stringify(expected); }
    catch(e){error=e.message}
    const intact=input.byteLength===before.byteLength && Buffer.compare(Buffer.from(input),before)===0;
    console.log(JSON.stringify({name,which,correct,intact,error,elapsedMs:performance.now()-t,
      bytes:archive.byteLength,jobs:calls.filter(c=>c.input===name)}));
  }
  pool.close();
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{Worker.prototype.postMessage=original});
