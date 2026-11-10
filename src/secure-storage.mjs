// One lazily initialized Electron encryptor serves every vault. Serializing
// access prevents separate startup features from requesting a second unlock.
export function createSecureStorageAccess(storage,{platform=process.platform}={}){
 let locked=false,initialized=false,tail=Promise.resolve();
 const error=()=>Object.assign(new Error('Secure storage is locked. Unlock your operating-system keychain and choose Try again.'),{code:'GRATIS_STORAGE_LOCKED'});
 const basic=()=>platform==='linux'&&storage.getSelectedStorageBackend?.()==='basic_text';
 const access=operation=>{
  const task=tail.then(async()=>{
   if(locked)throw error();
   try{
    if(basic())throw error();
    if(!initialized){if(!await storage.isAsyncEncryptionAvailable()||basic())throw error();initialized=true;}
    return await operation();
   }catch{locked=true;throw error();}
  });
  tail=task.catch(()=>{});return task;
 };
 const encrypt=text=>access(()=>storage.encryptStringAsync(text));
 const unpack=value=>typeof value==='string'?value:value.result;
 const decrypt=bytes=>access(async()=>unpack(await storage.decryptStringAsync(bytes)));
 const unwrapKey=bytes=>access(async()=>{const result=await storage.decryptStringAsync(bytes);return typeof result==='string'?result:{value:result.result,rewrap:!!result.shouldReEncrypt};});
 return{encrypt,decrypt,get locked(){return locked;},keyring:{wrapKey:encrypt,unwrapKey}};
}
