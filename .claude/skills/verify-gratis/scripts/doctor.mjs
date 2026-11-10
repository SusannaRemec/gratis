#!/usr/bin/env node
import {readdir,readFile,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {repoRoot,profilePrefix} from './lib.mjs';

const require=createRequire(path.join(repoRoot,'package.json'));
const checks=[];
const check=(name,ok,detail)=>checks.push({name,ok,detail});
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};

check('node >= 20',Number(process.versions.node.split('.')[0])>=20,process.versions.node);
try{check('electron installed',true,require('electron/package.json').version);}catch{check('electron installed',false,'run npm ci');}
try{check('@playwright/test installed',true,require('@playwright/test/package.json').version);}catch{check('@playwright/test installed',false,'run npm ci');}
try{await access(path.join(repoRoot,'test/electron-fixture.mjs'));check('fixture present',true,'test/electron-fixture.mjs');}catch{check('fixture present',false,'test/electron-fixture.mjs missing');}
try{check('build',true,execFileSync('git',['-C',repoRoot,'describe','--always','--dirty'],{encoding:'utf8'}).trim());}catch{check('build',false,'not a git checkout');}

const stale=[];
for(const entry of await readdir(tmpdir()).catch(()=>[])){
 const dir=path.join(tmpdir(),entry);
 if(!dir.startsWith(profilePrefix))continue;
 const lock=JSON.parse(await readFile(path.join(dir,'recovery.lock'),'utf8').catch(()=>'{}'));
 stale.push({dir,pid:lock.pid??null,running:!!lock.pid&&alive(lock.pid)});
}
check('no leftover verify profiles',stale.length===0,stale.length?stale:'none');

for(const c of checks)console.log(`${c.ok?'ok  ':'FAIL'} ${c.name}: ${typeof c.detail==='string'?c.detail:JSON.stringify(c.detail)}`);
process.exit(checks.every(c=>c.ok)?0:1);
