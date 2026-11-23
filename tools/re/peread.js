// node peread.js <exe> <va-hex> <len> [strings]  — читає байти за віртуальною адресою
const fs=require('fs');const b=fs.readFileSync(process.argv[2]);const pe=b.readUInt32LE(0x3c),n=b.readUInt16LE(pe+6),os=b.readUInt16LE(pe+20);
const base=b.readUInt32LE(pe+24+28);const va=parseInt(process.argv[3],16),len=+process.argv[4];
for(let i=0;i<n;i++){const s=pe+24+os+i*40;const sva=b.readUInt32LE(s+12)+base,vs=b.readUInt32LE(s+8),raw=b.readUInt32LE(s+20);
 if(va>=sva&&va<sva+vs){const off=raw+(va-sva);const d=b.slice(off,off+len);
  if(process.argv[5]==='strings'){for(let k=0;k<len;k+=64){const e=d.indexOf(0,k);console.log(((va+k).toString(16))+': '+JSON.stringify(d.toString('latin1',k,Math.min(e<0?k+64:e,k+64))));}}
  else console.log(d.toString('hex').match(/.{1,64}/g).join('\n'));process.exit(0);}}
console.log('not mapped');
