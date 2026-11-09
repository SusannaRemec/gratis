import {_electron as electron} from '@playwright/test';
import {realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {isAbsolute,relative,resolve} from 'node:path';

// UI fixtures must never use the person's workspace or macOS login keychain.
export async function fixtureOptions({directory,projectDir=process.cwd(),executablePath},platform=process.platform){
 if(typeof directory!=='string'||!isAbsolute(directory))throw new Error('UI tests require an explicit temporary profile.');
 const root=await realpath(tmpdir()),profile=await realpath(directory),within=relative(root,profile);
 if(!within||within.startsWith('..')||isAbsolute(within))throw new Error('UI test profile must be inside the system temporary directory.');
 return {timeout:30000,...(executablePath?{executablePath}:{}),args:[...(executablePath?[]:[resolve(projectDir)]),...(platform==='darwin'?['--use-mock-keychain']:[])],env:{...process.env,GRATIS_DATA_DIR:profile,GRATIS_TEST_HIDDEN:'1'}};
}
export async function launchTestApp(options){return electron.launch(await fixtureOptions(options));}
