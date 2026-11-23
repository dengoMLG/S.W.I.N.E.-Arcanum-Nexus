// Разбор .4d (S.W.I.N.E. HD, Gepard): node tools/swine-4d.js <file.4d> [--verts]
const fs=require('fs');const b=fs.readFileSync(process.argv[2]);const showV=process.argv.includes('--verts');
const tag=o=>b.toString('latin1',o,o+4);
const f=o=>b.readFloatLE(o).toFixed(3);
function chunks(start,end,depth){let p=start;while(p+8<=end){const t=tag(p),sz=b.readUInt32LE(p+4),body=p+8,e=body+sz;
  const pad='  '.repeat(depth);let info='';
  if(t==='MESH'||t==='BONE'||t==='NODE'){const nl=b.readUInt16LE(body);const name=b.toString('latin1',body+2,body+2+nl);const q=body+2+nl;
    const parent=b.readInt32LE(q);const m=[];for(let i=0;i<12;i++)m.push(f(q+4+i*4));
    info=`name="${name}" parent=${parent} m=[${m.join(' ')}]`;console.log(pad+t,sz,info);chunks(q+4+48,e,depth+1);}
  else if(t==='VERT'){const n=b.readUInt32LE(body),x=b.readUInt32LE(body+4);const stride=n?(sz-8)/n:0;console.log(pad+t,sz,`n=${n} flags=${x} stride=${stride}`);
    if(showV)for(let i=0;i<Math.min(n,6);i++){const o=body+8+i*stride;const v=[];for(let k=0;k<stride/4;k++)v.push(f(o+k*4));console.log(pad+'   ',v.join(' '));}}
  else if(t==='FACE'){const n=b.readUInt32LE(body);console.log(pad+t,sz,`n=${n} (${(sz-4)/n} B/face)`);}
  else if(['MTLS','MATE','ANIM','SKIN','KEYS','TRCK','BONS'].includes(t)){const hdr=b.readUInt32LE(body);console.log(pad+t,sz,'u32='+hdr);chunks(body+4,e,depth+1);}
  else if(t==='DIFF'||t==='TEXT'||t==='SPEC'||t==='BUMP'){const nl=b.readUInt16LE(body+0);console.log(pad+t,sz,JSON.stringify(b.toString('latin1',body+2,e)));}
  else console.log(pad+t,sz,b.slice(body,Math.min(e,body+24)).toString('hex'));
  if(sz>end-body){console.log(pad+'!! size overflow');return;}p=e;}}
console.log(tag(8),b.readUInt32LE(12),tag(16));chunks(20,b.length,0);
