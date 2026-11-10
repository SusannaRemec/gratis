#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {withApp} from './lib.mjs';
import {DEFAULT_SETTINGS} from '../../../../src/store.mjs';

const seeds={
 'create-first-bot':()=>({version:1,bots:[],conversations:[],activeBotId:null,activeConversationId:null,settings:{...DEFAULT_SETTINGS}}),
};

const journeys={
 async chat({page,capture,step,workspace}){
  const text=`verify ping ${Date.now()}`;
  await openChat(page);
  await capture('before-send');
  await page.locator('#prompt').fill(text);
  await page.locator('#send').click();
  step('sent',text);
  const reply=page.locator('#messages article.message.assistant').last();
  await reply.getByRole('button',{name:'Copy message'}).waitFor({timeout:30000});
  await capture('reply-complete');
  const shown=await reply.innerText();
  assert.match(shown,/Local demo response/,'demo reply rendered');
  assert.ok(shown.includes(text),'reply echoes the sent text');
  assert.equal(await page.locator('#prompt').inputValue(),'','composer cleared');
  const saved=(await workspace()).conversations.flatMap(c=>c.messages);
  const user=saved.find(m=>m.role==='user'&&m.content===text);
  const assistant=saved.at(-1);
  assert.ok(user,'user message persisted');
  assert.equal(assistant.role,'assistant');assert.equal(assistant.status,'complete','assistant persisted as complete');
  assert.ok(assistant.content.includes(text),'persisted reply echoes the sent text');
  return {sent:text,replyChars:assistant.content.length,provider:assistant.provider};
 },
 async schedules({page,capture,step,profile}){
  const title=`Verify schedule ${Date.now()%100000}`;
  await openChat(page);
  await page.locator('#attach-menu').click();
  await page.getByRole('menuitem',{name:/Scheduled tasks/}).click();
  await page.locator('#schedule-title').fill(title);
  await page.locator('#schedule-prompt').fill('Summarize the next three open questions in this project.');
  await capture('schedule-form');
  await page.locator('#schedule-save').click();
  await page.getByRole('heading',{name:title}).waitFor();
  step('saved',title);
  await capture('schedule-listed');
  const view=await page.evaluate(async()=>{const s=await window.orbit.snapshot();return window.orbit.schedulesView({conversationId:s.activeConversationId});});
  assert.ok(JSON.stringify(view).includes(title),'schedule returned by schedulesView IPC');
  const stored=await readFile(path.join(profile,'schedules.secure'));
  assert.ok(stored.length>0,'schedules.secure written');
  assert.ok(!stored.includes(title),'schedule stored encrypted, title not in plaintext');
  return {title,storedBytes:stored.length};
 },
 async 'create-bot'({page,capture,step,workspace}){
  const name=`Verify Bot ${Date.now()%100000}`;
  await page.locator('#new-bot').click();
  await page.locator('#new-bot-name').fill(name);
  await capture('create-dialog');
  await page.locator('#create-bot-submit').click();
  await page.locator('#create-bot-dialog').waitFor({state:'hidden'});
  step('created',name);
  await capture('after-create');
  const bots=(await workspace()).bots;
  assert.ok(bots.some(b=>b.name===name),'bot persisted');
  assert.ok(await page.getByText(name,{exact:true}).first().isVisible(),'bot visible');
  return {name,botCount:bots.length};
 },
 async 'create-first-bot'({page,capture,step,workspace}){
  const name=`First Bot ${Date.now()%100000}`;
  assert.equal((await workspace()).bots.length,0,'seeded profile starts with no bots');
  await capture('empty-home');
  await page.locator('#create-first-bot').click();
  await page.locator('#create-bot-dialog').waitFor({state:'visible'});
  assert.ok(await page.locator('#create-bot-submit').isDisabled(),'Create disabled while name is blank');
  await page.locator('#new-bot-name').fill(name);
  await page.locator('#create-bot-submit').click();
  await page.locator('#create-bot-dialog').waitFor({state:'hidden'});
  step('created',name);
  await capture('after-create');
  const bots=(await workspace()).bots;
  assert.deepEqual(bots.map(b=>b.name),[name],'only the new bot persisted');
  assert.ok(await page.locator('#create-first-bot').isHidden(),'empty-state button gone');
  return {name,botCount:bots.length};
 },
};

async function openChat(page){
 if(await page.locator('#prompt').isVisible())return;
 await page.locator('#home-bots button').first().click();
 await page.locator('#prompt').waitFor({state:'visible',timeout:10000});
}

const name=process.argv[2];
if(!journeys[name]){console.error(`Usage: run.mjs <${Object.keys(journeys).join('|')}>`);process.exit(2);}
try{
 const {evidence}=await withApp(name,{seed:seeds[name]?.()},journeys[name]);
 console.log(`PASS ${name}\nevidence: ${evidence}`);
}catch(error){
 console.error(`FAIL ${name}: ${error.message}\nevidence: ${error.evidence??'(none)'}`);
 process.exit(1);
}
