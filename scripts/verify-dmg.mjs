import {execFileSync} from 'node:child_process';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {verifyMacApp} from './verify-mac.mjs';
if(process.platform!=='darwin')throw new Error('DMG verification requires macOS.');
const dmg=process.argv[2];if(!dmg)throw new Error('Usage: node scripts/verify-dmg.mjs <dmg> [--smoke]');
const mount=await mkdtemp(join(tmpdir(),'gratis-core-dmg-check-'));let attached=false;
try{
 execFileSync('/usr/bin/hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,resolve(dmg)],{stdio:'pipe'});attached=true;
 const apps=(await readdir(mount)).filter(name=>name.endsWith('.app'));if(apps.length!==1)throw new Error('Expected exactly one app in the DMG.');
 const app=join(mount,apps[0]),edition=JSON.parse(await readFile('edition.json')),pkg=JSON.parse(await readFile('package.json'));
 console.log(JSON.stringify(verifyMacApp(app,{bundleId:edition.bundleId,version:pkg.version})));
 if(process.argv.includes('--smoke')){
  const executable=execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleExecutable',join(app,'Contents/Info.plist')],{encoding:'utf8'}).trim();
  for(const test of ['package-edition','ui-polish','desktop-features','recovery-desktop','slack-desktop','dialog-buttons','secure-storage-desktop'])execFileSync(process.execPath,[`test/${test}.mjs`],{env:{...process.env,GRATIS_TEST_APP:join(app,'Contents/MacOS',executable)},stdio:'inherit',timeout:90000});
 }
}finally{
 if(attached)execFileSync('/usr/bin/hdiutil',['detach',mount],{stdio:'pipe'});
 await rm(mount,{recursive:true,force:true});
}
