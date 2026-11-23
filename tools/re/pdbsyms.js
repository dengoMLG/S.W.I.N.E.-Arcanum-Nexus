// Мінімальний парсер MSF/PDB 7.0: публічні символи (S_PUB32) → RVA.  node pdbsyms.js <pdb> <exe> [regex]
const fs=require('fs');const pdb=fs.readFileSync(process.argv[2]);const exe=fs.readFileSync(process.argv[3]);
const bs=pdb.readUInt32LE(32),nBlocks=pdb.readUInt32LE(40),dirSize=pdb.readUInt32LE(44),dirMapBlock=pdb.readUInt32LE(52);
const nDirBlocks=Math.ceil(dirSize/bs);const dirBlocks=[];for(let i=0;i<nDirBlocks;i++)dirBlocks.push(pdb.readUInt32LE(dirMapBlock*bs+i*4));
const dir=Buffer.concat(dirBlocks.map(b=>pdb.slice(b*bs,(b+1)*bs))).slice(0,dirSize);
const nStreams=dir.readUInt32LE(0);const sizes=[];for(let i=0;i<nStreams;i++)sizes.push(dir.readUInt32LE(4+i*4));
let o=4+nStreams*4;const streams=[];for(let i=0;i<nStreams;i++){const sz=sizes[i]===0xFFFFFFFF?0:sizes[i];const nb=Math.ceil(sz/bs);const bl=[];for(let k=0;k<nb;k++){bl.push(dir.readUInt32LE(o));o+=4;}streams.push({sz,bl});}
const stream=i=>Buffer.concat(streams[i].bl.map(b=>pdb.slice(b*bs,(b+1)*bs))).slice(0,streams[i].sz);
const dbi=stream(3);const symRec=dbi.readUInt16LE(20);const syms=stream(symRec);
// PE sections
const pe=exe.readUInt32LE(0x3c),nsec=exe.readUInt16LE(pe+6),optSz=exe.readUInt16LE(pe+20);const secs=[];
for(let i=0;i<nsec;i++){const s=pe+24+optSz+i*40;secs.push({name:exe.toString('latin1',s,s+8).replace(/\0/g,''),va:exe.readUInt32LE(s+12)});}
const out=[];let p=0;while(p+4<=syms.length){const len=syms.readUInt16LE(p),kind=syms.readUInt16LE(p+2);
 if(kind===0x110E){const flags=syms.readUInt32LE(p+4),off=syms.readUInt32LE(p+8),seg=syms.readUInt16LE(p+12);let e=p+14;while(syms[e])e++;const name=syms.toString('latin1',p+14,e);
  if(seg>=1&&seg<=secs.length)out.push({rva:secs[seg-1].va+off,name,code:!!(flags&2)});}
 p+=2+len;}
const rx=process.argv[4]?new RegExp(process.argv[4]):null;
for(const s of out.sort((a,b)=>a.rva-b.rva))if(!rx||rx.test(s.name))console.log('0x'+(0x400000+s.rva).toString(16),s.code?'F':'D',s.name);
console.error(out.length+' public symbols');
