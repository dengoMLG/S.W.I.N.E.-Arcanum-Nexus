// usage: node pak2.js <pak> list|extract <regex> <outdir>
const fs=require('fs'),path=require('path');const [,,f,mode,re,out]=process.argv;
const fd=fs.openSync(f,'r');const h=Buffer.alloc(16);fs.readSync(fd,h,0,16,0);
if(h.toString('latin1',8,12)!=='PACK')throw 'not PACK';const isz=h.readUInt32LE(12);
const ib=Buffer.alloc(isz);fs.readSync(fd,ib,0,isz,16);const base=16+isz;
let p=0,prev='';const ents=[];const par={};
while(p<isz){const pre=ib[p],nl=ib[p+1];const src=(p in par)?par[p]:prev;const name=src.slice(0,pre)+ib.toString('latin1',p+2,p+2+nl);let q=p+2+nl;
 const C=ib.readUInt32LE(q+9);if(C)par[C]=name;ents.push({name,off:ib.readUInt32LE(q),size:ib.readUInt32LE(q+4),fl:ib[q+8],c:ib.readUInt32LE(q+9)});prev=name;p=q+13;}
if(p!==isz)console.error('WARN index misparse',p,isz);
const rx=new RegExp(re||'.','i');const sel=ents.filter(e=>rx.test(e.name)&&!e.name.endsWith('/'));
if(mode==='list'){for(const e of sel)console.log(e.size.toString().padStart(10),e.fl,e.name);console.error(sel.length+'/'+ents.length+' entries');}
if(mode==='stats'){const ext={};for(const e of ents){const x=path.extname(e.name).toLowerCase()||'(none)';ext[x]=ext[x]||[0,0];ext[x][0]++;ext[x][1]+=e.size;}
 for(const [k,v] of Object.entries(ext).sort((a,b)=>b[1][1]-a[1][1]))console.log(k.padEnd(10),String(v[0]).padStart(6),(v[1]/1048576).toFixed(1)+' MB');
 const dirs={};for(const e of ents){const d=e.name.split('/')[0];dirs[d]=(dirs[d]||0)+1;}console.log(dirs);}
if(mode==='extract'){for(const e of sel){const b=Buffer.alloc(e.size);fs.readSync(fd,b,0,e.size,base+e.off);
 const o=path.join(out,...e.name.split('/'));fs.mkdirSync(path.dirname(o),{recursive:true});fs.writeFileSync(o,b);}console.error('extracted',sel.length);}
