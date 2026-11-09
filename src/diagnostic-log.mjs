import {mkdir,stat,rename,unlink,appendFile} from 'node:fs/promises';
import {join} from 'node:path';
/** Deliberately never accepts message bodies, paths, tool input or credentials. */
export class DiagnosticLog{
 constructor(directory,{maxBytes=1000000,copies=3,now=Date.now}={}){this.directory=join(directory,'diagnostics');this.maxBytes=maxBytes;this.copies=copies;this.now=now;this.tail=Promise.resolve();}
 record({event,provider,status,reason}){const row={at:this.now(),event:['run-start','run-end','storage-error'].includes(event)?event:'run-end',provider:['claude','codex','local','demo'].includes(provider)?provider:undefined,status:['complete','error','cancelled'].includes(status)?status:undefined,reason:['limit','user','provider','storage'].includes(reason)?reason:undefined};
 const line=JSON.stringify(row)+'\n';const job=this.tail.then(async()=>{await mkdir(this.directory,{recursive:true,mode:0o700});const path=join(this.directory,'activity.jsonl');const size=await stat(path).then(s=>s.size,e=>{if(e.code==='ENOENT')return 0;throw e;});if(size+Buffer.byteLength(line)>this.maxBytes){await unlink(path+'.'+this.copies).catch(e=>{if(e.code!=='ENOENT')throw e;});for(let i=this.copies-1;i>=0;i--)await rename(i?path+'.'+i:path,path+'.'+(i+1)).catch(e=>{if(e.code!=='ENOENT')throw e;});}await appendFile(path,line,{mode:0o600});});this.tail=job.catch(()=>{});return job;}
 async flush(){await this.tail;}
}
