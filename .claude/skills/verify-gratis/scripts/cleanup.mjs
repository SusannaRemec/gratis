#!/usr/bin/env node
import {readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {profilePrefix,evidenceRoot} from './lib.mjs';

const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};
let removed=0;
for(const entry of await readdir(tmpdir())){
 const dir=path.join(tmpdir(),entry);
 if(!dir.startsWith(profilePrefix))continue;
 const {pid}=JSON.parse(await readFile(path.join(dir,'recovery.lock'),'utf8').catch(()=>'{}'));
 if(pid&&alive(pid)){
  const args=await import('node:child_process').then(m=>m.execFileSync('ps',['-o','args=','-p',String(pid)],{encoding:'utf8'})).catch(()=>'');
  if(args.includes('Electron')||args.includes('electron')){
   process.kill(pid,'SIGTERM');
   for(let i=0;i<40&&alive(pid);i++)await new Promise(r=>setTimeout(r,250));
   if(alive(pid))process.kill(pid,'SIGKILL');
   console.log(`stopped pid ${pid} (owned ${dir})`);
  }
  else{console.log(`skip ${dir}: pid ${pid} is not Electron, leaving it alone`);continue;}
 }
 await rm(dir,{recursive:true,force:true});removed++;console.log(`removed ${dir}`);
}
console.log(`profiles removed: ${removed}\nevidence kept: ${evidenceRoot}`);
