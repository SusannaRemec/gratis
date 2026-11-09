import {mkdir,readFile,writeFile,rename,unlink,readdir,lstat,rm,open} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export const STORAGE_VERSION=1;
// Credentials remain encrypted; a checkpoint is local recovery, not a portable export.
export const CHECKPOINT_FILES=Object.freeze(['workspace.json','memory.secure','memory-key.secure','connections.secure','schedules.secure','t3-tasks.secure','t3-connection.secure','storage-format.json']);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function requireVersion(value,label='Saved data'){
 if(!value||value.version!==1)throw new Error(`${label} has an unsupported version. Use a compatible Gratis release; existing files were preserved.`);
}
async function regular(path){const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink())throw new Error('Recovery files must be regular files.');if(s.size>256000000)throw new Error('Recovery file exceeds the supported size.');return s;}
export async function atomicWrite(path,bytes){const temp=path+'.'+randomUUID()+'.tmp';let handle;try{handle=await open(temp,'wx',0o600);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;await rename(temp,path);}finally{await handle?.close();await unlink(temp).catch(()=>{});}}
export async function assertStorageCompatible(directory){
 for(const name of ['storage-format.json','workspace.json']){try{await regular(join(directory,name));const data=JSON.parse(await readFile(join(directory,name),'utf8'));requireVersion(data,name);if(name==='storage-format.json'&&(!Number.isInteger(data.minimumReader)||data.minimumReader>STORAGE_VERSION))throw new Error('This data requires a newer Gratis release. Existing files were preserved.');}catch(e){if(e.code!=='ENOENT')throw new Error(e instanceof SyntaxError?'Saved workspace is unreadable. Existing files were preserved.':e.message);}}
}
export async function createCheckpoint(directory){
 await assertStorageCompatible(directory);const entries={};let size=0;
 for(const name of CHECKPOINT_FILES){try{await regular(join(directory,name));const bytes=await readFile(join(directory,name));size+=bytes.length;if(size>512000000)throw new Error('Recovery checkpoint is too large.');entries[name]=bytes;}catch(e){if(e.code!=='ENOENT')throw e;}}
 if(!entries['workspace.json'])return null;
 const {validState}=await import('./store.mjs');if(!validState(JSON.parse(entries['workspace.json'].toString())))throw new Error('Saved workspace is invalid. Existing files were preserved.');
 const files=Object.fromEntries(Object.entries(entries).map(([name,bytes])=>[name,{bytes:bytes.length,sha256:digest(bytes)}]));
 const fingerprint=digest(Buffer.from(JSON.stringify(files))).slice(0,24),root=join(directory,'checkpoints'),target=join(root,'checkpoint-'+fingerprint);
 await mkdir(root,{recursive:true,mode:0o700});const rootInfo=await lstat(root);if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink())throw new Error('Checkpoint folder cannot be a symlink.');
 try{await readCheckpoint(target);return target;}catch(e){if(e.code!=='ENOENT')throw e;}
 const staging=join(root,'.checkpoint-'+randomUUID());await mkdir(staging,{mode:0o700});
 try{for(const [name,bytes] of Object.entries(entries))await atomicWrite(join(staging,name),bytes);await atomicWrite(join(staging,'manifest.json'),JSON.stringify({version:1,createdAt:Date.now(),files}));await rename(staging,target);}finally{await rm(staging,{recursive:true,force:true});}
 const checkpoints=[];for(const name of await readdir(root)){if(!/^checkpoint-[a-f0-9]{24}$/.test(name)||name===basename(target))continue;const info=await lstat(join(root,name));if(info.isDirectory()&&!info.isSymbolicLink())checkpoints.push({name,at:info.mtimeMs});}checkpoints.sort((a,b)=>b.at-a.at);for(const old of checkpoints.slice(4))await rm(join(root,old.name),{recursive:true});
 return target;
}
export async function readCheckpoint(path){
 const dir=await lstat(path);if(!dir.isDirectory()||dir.isSymbolicLink())throw new Error('Choose a local checkpoint directory.');
 await regular(join(path,'manifest.json'));const manifest=JSON.parse(await readFile(join(path,'manifest.json'),'utf8'));requireVersion(manifest,'Checkpoint');
 if(!manifest.files||!manifest.files['workspace.json']||Object.keys(manifest.files).some(n=>!CHECKPOINT_FILES.includes(n)))throw new Error('Invalid checkpoint file list.');
 const entries={};let total=0;
 for(const [name,expected] of Object.entries(manifest.files)){await regular(join(path,name));const bytes=await readFile(join(path,name));total+=bytes.length;if(total>512000000||expected.bytes!==bytes.length||expected.sha256!==digest(bytes))throw new Error('Checkpoint verification failed; no data was restored.');entries[name]=bytes;}
 const workspace=JSON.parse(entries['workspace.json'].toString());requireVersion(workspace,'Checkpoint workspace');const {validState}=await import('./store.mjs');if(!validState(workspace))throw new Error('Checkpoint workspace is invalid; existing files were preserved.');
 if(entries['storage-format.json']){const format=JSON.parse(entries['storage-format.json']);requireVersion(format);if(format.minimumReader>STORAGE_VERSION)throw new Error('Checkpoint requires a newer Gratis release.');}
 if(Boolean(entries['memory.secure'])!==Boolean(entries['memory-key.secure']))throw new Error('Checkpoint is missing part of the encrypted memory.');
 return {manifest,entries};
}
export async function finishRestore(directory){
 const journal=join(directory,'restore-pending.json');let pending;
 try{pending=JSON.parse(await readFile(journal,'utf8'));}catch(e){if(e.code==='ENOENT')return;throw e;}
 requireVersion(pending,'Restore journal');if(typeof pending.checkpoint!=='string'||!/^checkpoint-[a-f0-9]{24}$/.test(pending.checkpoint))throw new Error('Invalid recovery journal.');
 const {entries}=await readCheckpoint(join(directory,'checkpoints',pending.checkpoint));
 // Replaying these exact bytes is idempotent after a power loss. Never expose a half-restored app.
 for(const name of CHECKPOINT_FILES){if(entries[name])await atomicWrite(join(directory,name),entries[name]);else await unlink(join(directory,name)).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 await unlink(journal);
}
export async function restoreCheckpoint(directory,checkpoint){
 const selected=await readCheckpoint(checkpoint);
 // An explicit restore can repair damaged current data, but may not downgrade a future schema.
 for(const name of ['storage-format.json','workspace.json']){try{const raw=await readFile(join(directory,name),'utf8');let current;try{current=JSON.parse(raw);}catch(e){if(name==='storage-format.json')throw e;}if(current){requireVersion(current,name);if(name==='storage-format.json'&&current.minimumReader>STORAGE_VERSION)throw new Error('A newer reader is required.');}}catch(e){if(e.code!=='ENOENT')throw e;}}
 try{await createCheckpoint(directory);}catch(error){
  if(!(error instanceof SyntaxError)&&!/workspace is (?:unreadable|invalid)/i.test(error.message))throw error;
  const archive=join(directory,'checkpoints','recovery-before-'+randomUUID());await mkdir(archive,{recursive:true,mode:0o700});
  for(const name of CHECKPOINT_FILES){try{await regular(join(directory,name));await atomicWrite(join(archive,name),await readFile(join(directory,name)));}catch(e){if(e.code!=='ENOENT')throw e;}}
 }

 // Stage and verify a local copy before writing either live data or the journal.
 const root=join(directory,'checkpoints');await mkdir(root,{recursive:true,mode:0o700});
 const files=selected.manifest.files,id='checkpoint-'+digest(Buffer.from(JSON.stringify(files))).slice(0,24),target=join(root,id);
 try{await readCheckpoint(target);}catch(e){if(e.code!=='ENOENT')throw e;await mkdir(target,{mode:0o700});for(const [name,bytes] of Object.entries(selected.entries))await atomicWrite(join(target,name),bytes);await atomicWrite(join(target,'manifest.json'),JSON.stringify(selected.manifest));}
 await readCheckpoint(target);await atomicWrite(join(directory,'restore-pending.json'),JSON.stringify({version:1,checkpoint:id}));await finishRestore(directory);
}
export async function prepareStorage(directory){
 await mkdir(directory,{recursive:true,mode:0o700});await finishRestore(directory);await assertStorageCompatible(directory);
 const checkpoint=await createCheckpoint(directory);await atomicWrite(join(directory,'storage-format.json'),JSON.stringify({version:STORAGE_VERSION,minimumReader:STORAGE_VERSION}));return checkpoint;
}
export async function acquireDataLock(directory){
 await mkdir(directory,{recursive:true,mode:0o700});const path=join(directory,'recovery.lock'),token=randomUUID();
 for(let attempt=0;attempt<2;attempt++){try{await writeFile(path,JSON.stringify({pid:process.pid,token}),{flag:'wx',mode:0o600});return async()=>{const current=JSON.parse(await readFile(path,'utf8').catch(()=> '{}'));if(current.token===token)await unlink(path);};}catch(e){if(e.code!=='EEXIST')throw e;let prior;try{prior=JSON.parse(await readFile(path,'utf8'));}catch{throw new Error('Workspace lock needs inspection. No files were changed.');}if(!Number.isInteger(prior.pid)||prior.pid<=0)throw new Error('Invalid workspace lock.');try{process.kill(prior.pid,0);throw new Error('Quit Gratis before recovering this workspace.');}catch(err){if(err.code!=='ESRCH')throw err;}await unlink(path);}}
 throw new Error('Could not lock workspace for recovery.');
}
