import {execFileSync,spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Integrity is different from publisher trust: ad-hoc builds are not notarized.
export function verifyMacApp(appPath,expected={}){
 if(process.platform!=='darwin')throw new Error('macOS signature verification requires macOS.');
 const app=resolve(appPath),plist=join(app,'Contents/Info.plist');
 const field=name=>execFileSync('/usr/libexec/PlistBuddy',['-c',`Print :${name}`,plist],{encoding:'utf8'}).trim();
 const bundleId=field('CFBundleIdentifier'),version=field('CFBundleShortVersionString');
 if(expected.bundleId&&bundleId!==expected.bundleId)throw new Error(`Unexpected bundle ID: ${bundleId}`);
 if(expected.version&&version!==expected.version)throw new Error(`Unexpected app version: ${version}`);
 execFileSync('/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',app],{stdio:'pipe'});
 // codesign writes its description to stderr, even on success.
 const details=spawnSync('/usr/bin/codesign',['--display','--verbose=4',app],{encoding:'utf8'});
 if(details.error)throw details.error;
 if(details.status!==0)throw new Error(details.stderr||'Could not inspect signature.');
 if(!details.stderr.split('\n').includes(`Identifier=${bundleId}`))throw new Error('Code signature does not bind the app identity.');
 if(!/Sealed Resources version=2\b/.test(details.stderr)||/Info\.plist=not bound/.test(details.stderr))throw new Error('Incomplete app resource seal.');
 return {app,bundleId,version,integrity:'valid',signature:details.stderr.includes('Signature=adhoc')?'ad-hoc':'certificate'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const app=process.argv[2];if(!app)throw new Error('Usage: node scripts/verify-mac.mjs <app> [bundle-id] [version]');
 console.log(JSON.stringify(verifyMacApp(app,{bundleId:process.argv[3],version:process.argv[4]})));
}
