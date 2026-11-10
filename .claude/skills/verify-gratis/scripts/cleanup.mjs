#!/usr/bin/env node
import {readdir,readFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {profilePrefix,evidenceRoot,ownerFlag} from './paths.mjs';

const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};
const owns=(args,dir)=>{const flag=ownerFlag(dir),at=args.indexOf(flag),end=at+flag.length;return at>=0&&(at===0||/\s/.test(args[at-1]))&&(end===args.length||/\s/.test(args[end]));};
const commandLine=pid=>{try{return execFileSync('ps',['-o','args=','-p',String(pid)],{encoding:'utf8'});}catch{return null;}};
let removed=0;
for(const entry of await readdir(tmpdir())){
 const dir=path.join(tmpdir(),entry);
 if(!dir.startsWith(profilePrefix))continue;
 const {pid}=JSON.parse(await readFile(path.join(dir,'recovery.lock'),'utf8').catch(()=>'{}'));
 if(pid&&alive(pid)){
  const args=commandLine(pid);
  if(args===null){console.log(`skip ${dir}: could not inspect pid ${pid}, leaving both alone`);continue;}
  if(owns(args.trimEnd(),dir)){
   process.kill(pid,'SIGTERM');
   for(let i=0;i<40&&alive(pid);i++)await new Promise(r=>setTimeout(r,250));
   if(alive(pid))process.kill(pid,'SIGKILL');
   console.log(`stopped pid ${pid} (owned ${dir})`);
  }
  else console.log(`pid ${pid} was reused by a process this profile does not own; not signalling it`);
 }
 await rm(dir,{recursive:true,force:true});removed++;console.log(`removed ${dir}`);
}
console.log(`profiles removed: ${removed}\nevidence kept: ${evidenceRoot}`);
