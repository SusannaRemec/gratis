import {launchTestApp} from './electron-fixture.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const directory=await mkdtemp(join(tmpdir(),'gratis-secure-storage-'));
const instance=await launchTestApp({directory,executablePath:process.env.GRATIS_TEST_APP});
try{
 await (await instance.firstWindow()).locator('#new-bot').waitFor();
 const result=await instance.evaluate(async({app,safeStorage})=>{
  const require=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json');
  const {createSecureStorageAccess}=require(app.getAppPath()+'/src/secure-storage.mjs');
  const access=createSecureStorageAccess(safeStorage);
  const before=safeStorage.encryptString('legacy connection fixture');
  const oldMemoryKey=await safeStorage.encryptStringAsync('legacy memory key fixture');
  return{connection:access.decrypt(before)==='legacy connection fixture',memory:await access.keyring.unwrapKey(oldMemoryKey)==='legacy memory key fixture',roundTrip:access.decrypt(access.encrypt('new fixture'))==='new fixture'};
 });
 assert.deepEqual(result,{connection:true,memory:true,roundTrip:true});console.log(JSON.stringify({passed:true,...result}));
}finally{await instance.close();await rm(directory,{recursive:true,force:true});}
