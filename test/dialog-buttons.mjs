import {launchTestApp} from './electron-fixture.mjs';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const directory=await mkdtemp(join(tmpdir(),'gratis-dialog-buttons-'));
const app=await launchTestApp({directory,executablePath:process.env.GRATIS_TEST_APP});
try{
 const page=await app.firstWindow();await page.locator('#new-bot').waitFor();await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.webContents.setBackgroundThrottling(false);win.showInactive();});
 const original=(await page.evaluate(()=>window.orbit.snapshot())).settings.displayName;
 await page.locator('#workspace-profile').click();await page.locator('#profile-name').fill('Unsaved test name');
 await page.locator('#settings-dialog .dialog-footer .close-dialog').click();
 await page.locator('#settings-dialog').waitFor({state:'hidden'});
 assert.equal((await page.evaluate(()=>window.orbit.snapshot())).settings.displayName,original);
 const ids=await page.locator('dialog').evaluateAll(dialogs=>dialogs.filter(d=>d.querySelector('.dialog-footer .close-dialog')).map(d=>d.id));
 assert.ok(ids.includes('settings-dialog'));
 for(const size of [[1496,938],[1024,700]]){
  await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(...size),size);
  for(const id of ids){
   await page.locator('#'+id).evaluate(d=>d.showModal());
   const bounds=await page.locator('#'+id+' .dialog-footer .close-dialog').evaluateAll(buttons=>buttons.map(button=>{
    const r=button.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(button);const label=range.getBoundingClientRect();
    const next=button.nextElementSibling?.getBoundingClientRect();return{text:button.textContent.trim(),width:r.width,height:r.height,labelWidth:label.width,nextGap:next?next.left-r.right:null};
   }));
   for(const b of bounds){assert.ok(b.width>=b.labelWidth+20,JSON.stringify({id,size,...b}));assert.ok(b.height>=30,JSON.stringify({id,size,...b}));if(b.nextGap!==null)assert.ok(b.nextGap>=0,JSON.stringify({id,size,...b}));}
   const close=page.locator('#'+id+' .dialog-heading .close-dialog');
   if(await close.count()){const box=await close.first().boundingBox();assert.ok(box.width<=36&&box.height<=36,JSON.stringify({id,box}));}
   await page.locator('#'+id).evaluate(d=>d.close());
  }
 }
 await page.locator('#workspace-profile').click();
 await mkdir('.cache/dialog-buttons',{recursive:true});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const capture=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
 await writeFile('.cache/dialog-buttons/settings.png',Buffer.from(capture,'base64'));
 await page.locator('#settings-dialog .dialog-heading .close-dialog').click();await page.locator('#settings-dialog').waitFor({state:'hidden'});
 console.log(JSON.stringify({passed:true,dialogs:ids,windowSizes:2,cancelDiscardsChanges:true,headerCloseWorks:true}));
}finally{await app.close();await rm(directory,{recursive:true,force:true});}
