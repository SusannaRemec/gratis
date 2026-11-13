import {_electron as electron} from '@playwright/test';
import {fixtureOptions} from '../../../../test/electron-fixture.mjs';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {repoRoot,profilePrefix,evidenceRoot,ownerFlag} from './paths.mjs';
export {repoRoot,profilePrefix,evidenceRoot};

export async function withApp(name,{seed,secure}={},journey){
 const profile=await mkdtemp(profilePrefix);
 const evidence=path.join(evidenceRoot,`${name}-${new Date().toISOString().replace(/[:.]/g,'-')}`);
 await mkdir(evidence,{recursive:true});
 if(seed)await writeFile(path.join(profile,'workspace.json'),JSON.stringify(seed));
 const log=[],rendererErrors=[];let shot=0,app,result;
 const step=(message,data)=>{const entry={at:new Date().toISOString(),message,...(data===undefined?{}:{data})};log.push(entry);console.log(JSON.stringify(entry));};
 try{
  const options=await fixtureOptions({directory:profile,projectDir:repoRoot,executablePath:process.env.GRATIS_TEST_APP});
  if(process.env.VERIFY_HIDDEN!=='1')delete options.env.GRATIS_TEST_HIDDEN;
  options.args.push(ownerFlag(profile));
  if(secure)await seedSecure(options,profile,secure);
  app=await electron.launch(options);
  const page=await app.firstWindow();
  page.on('pageerror',e=>rendererErrors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')rendererErrors.push(m.text());});
  await page.locator('#home-bots button:visible, #create-first-bot:visible, #prompt:visible').first().waitFor();
  const provider=await page.evaluate(async()=>(await window.orbit.snapshot()).settings.provider);
  if(provider!=='demo')throw new Error(`Refusing to drive: provider is "${provider}", only "demo" is allowed.`);
  step('ready',{profile,provider});
  const capture=async label=>{
   await page.waitForTimeout(150);
   const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
   const file=path.join(evidence,`${String(++shot).padStart(2,'0')}-${label}.png`);
   await writeFile(file,Buffer.from(png,'base64'));step('screenshot',file);return file;
  };
  const workspace=async()=>JSON.parse(await readFile(path.join(profile,'workspace.json'),'utf8'));
  result=await journey({app,page,capture,step,workspace,profile,evidence});
  if(rendererErrors.length)throw new Error('Renderer errors: '+rendererErrors.join(' | '));
  step('passed',result);
  return {passed:true,evidence,result};
 }catch(error){
  step('failed',String(error?.stack||error));
  throw Object.assign(error,{evidence});
 }finally{
  await copyFile(path.join(profile,'workspace.json'),path.join(evidence,'workspace.json')).catch(()=>{});
  await writeFile(path.join(evidence,'log.json'),JSON.stringify({journey:name,rendererErrors,log},null,1)).catch(e=>console.error(`could not write log.json: ${e.message}`));
  await app?.close().catch(()=>{});
  await rm(profile,{recursive:true,force:true});
 }
}

// Encrypted files can only be written by the app's own keychain-backed encryptor, so launch once,
// encrypt with it (mock keychain, temp profile), and let the real run read the file back at startup.
async function seedSecure(options,profile,files){
 const boot=await electron.launch(options);
 try{
  await (await boot.firstWindow()).locator('#home-bots button:visible, #create-first-bot:visible, #prompt:visible').first().waitFor();
  for(const [file,value] of Object.entries(files)){
   const bytes=await boot.evaluate(async({safeStorage},text)=>{await safeStorage.isAsyncEncryptionAvailable();return Buffer.from(await safeStorage.encryptStringAsync(text)).toString('base64');},JSON.stringify(value));
   await writeFile(path.join(profile,file),Buffer.from(bytes,'base64'));
  }
 }finally{await boot.close().catch(()=>{});}
}
