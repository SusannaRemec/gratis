import test from 'node:test';
import assert from 'node:assert/strict';
import {createSecureStorageAccess} from '../src/secure-storage.mjs';

test('Mac credentials and memory share one provider without a second availability probe',async()=>{
 const calls=[];const storage={isEncryptionAvailable:()=>{throw Error('extra probe');},encryptString:text=>{calls.push('encrypt');return Buffer.from('v10'+text);},decryptString:bytes=>{calls.push('decrypt');return bytes.toString().slice(3);},encryptStringAsync:()=>{throw Error('second provider');},decryptStringAsync:()=>{throw Error('second provider');}};
 const access=createSecureStorageAccess(storage,{platform:'darwin'});
 assert.equal(access.decrypt(access.encrypt('credentials')),'credentials');
 assert.equal(await access.keyring.unwrapKey(await access.keyring.wrapKey('memory key')),'memory key');
 assert.deepEqual(calls,['encrypt','decrypt','encrypt','decrypt']);assert.equal(access.locked,false);
});
test('one denied request blocks all subsequent vault reads and writes without another OS call',async()=>{
 let calls=0;const deny=()=>{calls++;throw Error('User denied keychain access');};
 const access=createSecureStorageAccess({encryptString:deny,decryptString:deny},{platform:'darwin'});
 assert.throws(()=>access.decrypt(Buffer.from('saved')),e=>e.code==='GRATIS_STORAGE_LOCKED');
 for(let n=0;n<10;n++){assert.throws(()=>access.encrypt('secret'),/locked/);await assert.rejects(access.keyring.unwrapKey(Buffer.from('saved')),/locked/);await assert.rejects(access.keyring.wrapKey('secret'),/locked/);}
 assert.equal(calls,1);assert.equal(access.locked,true);
});
test('a fresh explicit retry can unlock, but a locked process cannot reset itself',()=>{
 let available=false,calls=0;const storage={decryptString:()=>{calls++;if(!available)throw Error('locked');return 'saved data';}};
 const first=createSecureStorageAccess(storage,{platform:'darwin'});assert.throws(()=>first.decrypt(Buffer.from('saved')));available=true;assert.throws(()=>first.decrypt(Buffer.from('saved')));
 const retry=createSecureStorageAccess(storage,{platform:'darwin'});assert.equal(retry.decrypt(Buffer.from('saved')),'saved data');assert.equal(calls,2);
});
test('Linux plaintext fallback stays disabled without trying to write a credential',()=>{
 let writes=0;const access=createSecureStorageAccess({getSelectedStorageBackend:()=> 'basic_text',encryptString:()=>{writes++;}},{platform:'linux'});
 assert.throws(()=>access.encrypt('secret'),/locked/);assert.equal(writes,0);
});
