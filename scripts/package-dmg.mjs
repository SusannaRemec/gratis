import {mkdtemp,mkdir,rm,symlink,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {verifyMacApp} from './verify-mac.mjs';
if(process.platform!=='darwin')throw new Error('DMG creation requires macOS.');
const edition=JSON.parse(await readFile('edition.json')),pkg=JSON.parse(await readFile('package.json'));
const app=resolve('release',`${edition.name}-darwin-${process.arch}`,`${edition.name}.app`);
verifyMacApp(app,{bundleId:edition.bundleId,version:pkg.version});
const stage=await mkdtemp(join(tmpdir(),'gratis-core-dmg-'));
const output=resolve('dist',`Gratis-Core-${pkg.version}-mac-${process.arch}.dmg`);
try{
 await mkdir('dist',{recursive:true});
 execFileSync('/usr/bin/ditto',[app,join(stage,`${edition.name}.app`)]);
 await symlink('/Applications',join(stage,'Applications'));
 execFileSync('/usr/bin/hdiutil',['create','-ov','-format','UDZO','-fs','HFS+','-volname',edition.name,'-srcfolder',stage,output],{stdio:'inherit'});
 console.log(output);
}finally{await rm(stage,{recursive:true,force:true});}
