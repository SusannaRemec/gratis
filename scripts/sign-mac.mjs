import {sign} from '@electron/osx-sign';
import {resolve} from 'node:path';
import {verifyMacApp} from './verify-mac.mjs';

// Seal every nested binary before its containing bundle. Never use --deep to sign.
// This deliberately does not claim Developer ID trust or notarization.
export async function signMacApp(appPath){
 const app=resolve(appPath);
 await sign({app,platform:'darwin',identity:'-',identityValidation:false,
  preAutoEntitlements:false,preEmbedProvisioningProfile:false,gatekeeperAssess:false,
  optionsForFile:()=>({hardenedRuntime:false,timestamp:'none'})});
 return verifyMacApp(app);
}
