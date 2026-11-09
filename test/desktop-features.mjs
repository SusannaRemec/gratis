import {launchTestApp} from './electron-fixture.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
import {initialState} from '../src/store.mjs';import {WorkspaceFiles} from '../src/workspace-files.mjs';
const directory=await mkdtemp(join(tmpdir(),'gratis-features-')),state=initialState(),first=state.bots[0],second={...first,id:randomUUID(),name:'Other files'};
state.bots.push(second);const files=new WorkspaceFiles(directory);
await files.write(first.id,'notes/Alpha.txt','Small note');await files.write(first.id,'notes/Zebra.md','Z'.repeat(3000));await files.write(first.id,'reports/Report.txt','Report');await files.write(second.id,'private/Other.txt','Separate bot');
await writeFile(join(directory,'workspace.json'),JSON.stringify(state));
const app=await launchTestApp({directory,executablePath:process.env.GRATIS_TEST_APP});
try{
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('#new-bot').waitFor();await page.locator('#home-bots .bot-tile').first().click();await page.locator('#show-files').click();
 await page.waitForFunction(()=>document.querySelector('#workspace-file-count').textContent==='3 of 3 files');
 await page.locator('#workspace-file-filter').fill('NOTES');assert.equal(await page.locator('.workspace-file').count(),2);
 await page.locator('#workspace-file-sort').selectOption('size',{force:true});assert.match(await page.locator('.workspace-file').first().innerText(),/Zebra/);
 await page.locator('#workspace-file-filter').fill('nothing');assert.equal(await page.locator('.workspace-file').count(),0);assert.equal(await page.locator('#workspace-files-empty').isVisible(),true);
 await page.evaluate(id=>window.orbit.selectBot({id}),second.id);await page.waitForFunction(()=>document.querySelector('#workspace-file-count').textContent==='1 of 1 files');assert.equal(await page.locator('#workspace-file-filter').inputValue(),'');assert.match(await page.locator('.workspace-file').innerText(),/Other.txt/);assert.doesNotMatch(await page.locator('#workspace-file-list').innerText(),/Alpha|Zebra/);
 await page.locator('#attach-menu').click();await page.getByRole('menuitem',{name:/Scheduled tasks/}).click();
 await page.locator('#schedule-title').fill('Monthly review');await page.locator('#schedule-prompt').fill('Review the saved notes.');await page.locator('#schedule-frequency').selectOption('cron',{force:true});await page.locator('#schedule-cron').fill('0 9 1 * *');await page.locator('#schedule-timezone').fill('America/Toronto');await page.locator('#schedule-save').click();
 await page.waitForFunction(()=>!document.querySelector('#schedules-error').hidden||document.querySelector('.schedule-card'));assert.equal(await page.locator('#schedules-error').isVisible(),false,await page.locator('#schedules-error').textContent());
 await page.getByRole('heading',{name:'Monthly review'}).waitFor();
 const schedules=await page.evaluate(async()=>{const s=await window.orbit.snapshot();return window.orbit.schedulesView({conversationId:s.activeConversationId});});assert.equal(schedules[0].timing.kind,'cron');assert.equal(schedules[0].timing.expression,'0 9 1 * *');
 await page.getByRole('button',{name:'Edit',exact:true}).click();assert.equal(await page.locator('#schedule-cron').inputValue(),'0 9 1 * *');await page.locator('#schedule-cron').fill('broken');await page.locator('#schedule-save').click();await page.locator('#schedules-error').waitFor({state:'visible'});assert.equal((await page.evaluate(async()=>{const s=await window.orbit.snapshot();return window.orbit.schedulesView({conversationId:s.activeConversationId});}))[0].timing.expression,'0 9 1 * *');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({fileSearch:true,fileSort:true,botIsolation:true,cronCreateEdit:true,invalidCronPreservesSchedule:true,rendererErrors:errors}));
}finally{await app.close();await rm(directory,{recursive:true,force:true});}
