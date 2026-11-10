// Use the same OS-backed key provider for all Mac vaults. Mixing Electron's
// synchronous provider with its asynchronous provider can prompt twice on update.
// A denied access attempt is terminal for this process, including later timers.
export function createSecureStorageAccess(storage,{platform=process.platform}={}){
 let locked=false;
 const error=()=>Object.assign(new Error('Secure storage is locked. Unlock your operating-system keychain and choose Try again.'),{code:'GRATIS_STORAGE_LOCKED'});
 const access=operation=>{
  if(locked)throw error();
  try{
   if(platform==='linux'&&storage.getSelectedStorageBackend?.()==='basic_text')throw error();
   // The native encrypt/decrypt call already checks availability. Checking it
   // separately can itself ask for access, then ask again in the operation.
   return operation();
  }catch{locked=true;throw error();}
 };
 const encrypt=text=>access(()=>storage.encryptString(text));
 const decrypt=bytes=>access(()=>storage.decryptString(bytes));
 return{encrypt,decrypt,get locked(){return locked;},keyring:{wrapKey:async text=>encrypt(text),unwrapKey:async bytes=>decrypt(bytes)}};
}
