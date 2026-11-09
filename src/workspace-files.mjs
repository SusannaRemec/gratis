import {atomicWrite} from './storage-safety.mjs';
import {mkdir,readdir,readFile,writeFile,stat,lstat,realpath,copyFile} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute,basename} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
export class WorkspaceFiles {
  constructor(directory,{maxBytes=100000000,maxFiles=1000}={}){this.directory=directory;this.maxBytes=maxBytes;this.maxFiles=maxFiles;this.writes=new Map();}
  serialize(botId,fn){const next=(this.writes.get(botId)||Promise.resolve()).then(fn);const settled=next.catch(()=>{});this.writes.set(botId,settled);settled.finally(()=>{if(this.writes.get(botId)===settled)this.writes.delete(botId);});return next;}
  async usage(botId){const root=await this.target(botId);let bytes=0,count=0;const visit=async(dir,depth=0)=>{if(depth>32)throw new Error("Workspace nesting limit reached.");for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isSymbolicLink())throw new Error("Workspace symlinks are not supported.");if(entry.isDirectory())await visit(path,depth+1);else if(entry.isFile()){bytes+=(await lstat(path)).size;count++;}}};await visit(root);return{bytes,count};}
  async reserve(botId,addedBytes,addedFiles){const current=await this.usage(botId);if(current.bytes+addedBytes>this.maxBytes||current.count+addedFiles>this.maxFiles)throw new Error("This bot’s Files limit is reached (100 MB or 1,000 files). Existing files are preserved. Download and remove unused files before adding more.");}
  root(botId){if(typeof botId!=='string'||!/^[a-f0-9-]{36}$/i.test(botId))throw new Error('Invalid bot.');return join(this.directory,'bot-files',createHash('sha256').update(botId).digest('hex'));}
  async target(botId,path='.',writing=false){const root=this.root(botId);await mkdir(root,{recursive:true,mode:0o700});if(typeof path!=='string'||isAbsolute(path)||path.includes('\0'))throw new Error('Use a path inside the bot workspace.');const target=resolve(root,path),rel=relative(root,target);if(rel.startsWith('..')||isAbsolute(rel)||rel.split(/[\\/]/).some(s=>s.startsWith('.')))throw new Error('That path is outside the bot workspace.');let cursor=target;while(cursor!==root){try{if((await lstat(cursor)).isSymbolicLink())throw new Error('Workspace symlinks are not supported.');}catch(error){if(error.code!=='ENOENT')throw error;if(!writing&&cursor===target)throw error;}cursor=resolve(cursor,'..');}if((await lstat(root)).isSymbolicLink())throw new Error('Workspace root cannot be a symlink.');return target;}
  async list(botId){const root=await this.target(botId),files=[];const visit=async(dir,depth)=>{if(depth>5||files.length>=1000)return;for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.name.startsWith('.')||entry.isSymbolicLink())continue;const path=join(dir,entry.name);if(entry.isDirectory())await visit(path,depth+1);else if(entry.isFile()){const info=await stat(path);files.push({path:relative(root,path),name:entry.name,bytes:info.size,modified:info.mtimeMs});}}};await visit(root,0);return files.sort((a,b)=>b.modified-a.modified);}
  async read(botId,path){const target=await this.target(botId,path);if((await stat(target)).size>200000)throw new Error('This file is too large for text reading.');return readFile(target,'utf8');}
  async content(botId,path){
    const target=await this.target(botId,path),size=(await stat(target)).size;
    const mime=/\.png$/i.test(path)?'image/png':/\.jpe?g$/i.test(path)?'image/jpeg':/\.webp$/i.test(path)?'image/webp':null;
    if(mime){if(size>4500000)throw new Error('Use an image smaller than 4.5 MB.');return {content:[{type:'image',mimeType:mime,data:(await readFile(target)).toString('base64')}]};}
    if(/\.pdf$/i.test(path)){
      if(size>20000000)throw new Error('Use a PDF smaller than 20 MB.');
      let binary;for(const candidate of ['/opt/homebrew/bin/pdftotext','/usr/local/bin/pdftotext','/usr/bin/pdftotext']){try{await stat(candidate);binary=candidate;break;}catch{}}
      if(!binary)throw new Error('PDF text extraction is unavailable. Attach a text version of this document.');
      const {stdout}=await execute(binary,['-layout','-f','1','-l','100',target,'-'],{timeout:15000,maxBuffer:2000000});return {content:[{type:'text',text:stdout.slice(0,180000)||'No selectable text was found in this PDF.'}]};
    }
    return {content:[{type:'text',text:await this.read(botId,path)}]};
  }
  async write(botId,path,content){return this.serialize(botId,async()=>{if(typeof content!=='string'||Buffer.byteLength(content)>200000)throw new Error('Files must contain at most 200 KB of text.');const target=await this.target(botId,path,true),old=await lstat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(old&&!old.isFile())throw new Error('Choose a file path.');await this.reserve(botId,Buffer.byteLength(content)-(old?.size||0),old?0:1);await mkdir(resolve(target,'..'),{recursive:true,mode:0o700});await atomicWrite(target,content);return {path,bytes:Buffer.byteLength(content)};});}
  async import(botId,paths){return this.serialize(botId,async()=>{const inputs=[];for(const path of paths){const info=await stat(path);if(!info.isFile()||info.size>20000000)throw new Error('Choose files smaller than 20 MB.');inputs.push({path,bytes:info.size});}await this.reserve(botId,inputs.reduce((n,i)=>n+i.bytes,0),inputs.length);const results=[];for(const input of inputs){const bytes=await readFile(input.path);if(bytes.length!==input.bytes)throw new Error('An attachment changed while importing. Try again.');const name=basename(input.path).replace(/[^\w. -]/g,'_').replace(/^\.+/,'')||'attachment';const relativePath=`attachments/${randomUUID().slice(0,8)}-${name}`,target=await this.target(botId,relativePath,true);await mkdir(resolve(target,'..'),{recursive:true,mode:0o700});await atomicWrite(target,bytes);results.push({path:relativePath,name,bytes:bytes.length});}return results;});}
}
