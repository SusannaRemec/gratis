import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {signMacApp} from '../scripts/sign-mac.mjs';
import {verifyMacApp} from '../scripts/verify-mac.mjs';

test('mac packaging repairs inherited signatures and rejects modified resources',{skip:process.platform!=='darwin'},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'gratis-signing-')),app=join(dir,'Fixture.app');
 try{
  await mkdir(join(app,'Contents/MacOS'),{recursive:true});await mkdir(join(app,'Contents/Resources'));
  await copyFile('/usr/bin/true',join(app,'Contents/MacOS/Fixture'));
  await writeFile(join(app,'Contents/Info.plist'),'<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>test.gratis.signing</string><key>CFBundleExecutable</key><string>Fixture</string><key>CFBundleName</key><string>Fixture</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>1.0.0</string></dict></plist>');
  const resource=join(app,'Contents/Resources/payload.txt');await writeFile(resource,'original');
  assert.throws(()=>verifyMacApp(app),'an inherited binary signature must not pass as an app seal');
  await signMacApp(app);
  const result=verifyMacApp(app,{bundleId:'test.gratis.signing',version:'1.0.0'});assert.equal(result.signature,'ad-hoc');
  assert.throws(()=>verifyMacApp(app,{bundleId:'wrong.identity'}),/Unexpected bundle ID/);
  assert.throws(()=>verifyMacApp(app,{version:'9.9.9'}),/Unexpected app version/);
  await writeFile(resource,'tampered');assert.throws(()=>verifyMacApp(app),'modified resources must fail verification');
 }finally{await rm(dir,{recursive:true,force:true});}
});
