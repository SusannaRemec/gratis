#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {withApp} from './lib.mjs';
import {DEFAULT_SETTINGS} from '../../../../src/store.mjs';

const seeds={
 'create-first-bot':()=>({version:1,bots:[],conversations:[],activeBotId:null,activeConversationId:null,settings:{...DEFAULT_SETTINGS}}),
};

// Seeded app connections carry a fake token and a .invalid address. The demo provider never builds an app runtime, so nothing contacts them.
const fakeApp=(id,name)=>({id,name,url:`https://${id}.invalid/mcp`,tokens:{access_token:'verify-fake-token'}});
const secures={
 'bot-apps':()=>({'direct-apps.secure':{apps:{custom_verify_notes:fakeApp('custom_verify_notes','Verify Notes'),custom_verify_mail:fakeApp('custom_verify_mail','Verify Mail')}}}),
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
 async 'bot-apps'({page,capture,step,workspace}){
  await openChat(page);
  const bot=async()=>(await page.evaluate(()=>window.orbit.snapshot())).bots[0];
  const open=async()=>{await page.locator('#edit-bot').click();await page.locator('#bot-dialog').waitFor({state:'visible'});await page.locator('#bot-apps input').first().waitFor();};
  const row=name=>page.locator('#bot-apps label',{hasText:name}).locator('input');
  const save=async()=>{await page.locator('#save-bot').click();await page.locator('#bot-dialog').waitFor({state:'hidden'});};
  await open();
  assert.deepEqual(await page.locator('#bot-apps label').allInnerTexts(),['Verify Notes','Verify Mail'],'each connected app listed by name');
  assert.ok(await row('Verify Notes').isChecked()&&await row('Verify Mail').isChecked(),'every app starts checked when the bot has no selection');
  assert.ok(!('apps' in await bot()),'bot starts without an apps field');
  await page.locator('#bot-connections').scrollIntoViewIfNeeded();
  await capture('all-apps-checked');
  await row('Verify Mail').uncheck();
  await page.locator('#bot-connections').scrollIntoViewIfNeeded();
  await capture('mail-unchecked');
  await save();step('saved one app');
  assert.deepEqual((await bot()).apps,['custom_verify_notes'],'snapshot holds only the chosen app');
  assert.deepEqual((await workspace()).bots[0].apps,['custom_verify_notes'],'selection persisted to workspace.json');
  await open();
  assert.ok(await row('Verify Notes').isChecked()&&!await row('Verify Mail').isChecked(),'choice survives reopening the dialog');
  await page.locator('#bot-connections').scrollIntoViewIfNeeded();
  await capture('choice-persisted');
  await page.locator('#bot-connections').uncheck();
  assert.ok(await page.locator('#bot-apps').isHidden(),'list hidden when Connected apps is off');
  await page.locator('#bot-connections').scrollIntoViewIfNeeded();
  await capture('connections-off');
  await page.locator('#bot-connections').check();
  assert.ok(await page.locator('#bot-apps').isVisible()&&!await row('Verify Mail').isChecked(),'list returns with the choice intact');
  await row('Verify Mail').check();
  await save();step('saved every app');
  assert.ok(!('apps' in await bot()),'choosing every connected app stores no field');
  assert.ok(!('apps' in (await workspace()).bots[0]),'workspace.json holds no apps field');
  assert.equal((await bot()).capabilities?.connections,true,'master switch untouched');
  return {saved:['custom_verify_notes','all']};
 },
 async 'bot-apps-empty'({page,capture,step,workspace}){
  await openChat(page);
  await page.locator('#edit-bot').click();await page.locator('#bot-dialog').waitFor({state:'visible'});
  const note=page.locator('#bot-apps .field-note');await note.waitFor();
  assert.match(await note.innerText(),/No apps connected.*Settings, Connections/,'empty state points to Settings, Connections');
  assert.equal(await page.locator('#bot-apps input').count(),0,'no checkboxes without a connected app');
  await page.locator('#bot-connections').scrollIntoViewIfNeeded();
  await capture('no-apps-connected');
  await page.locator('#save-bot').click();await page.locator('#bot-dialog').waitFor({state:'hidden'});
  assert.ok(!('apps' in (await workspace()).bots[0]),'saving with nothing connected stores no selection');
  return {empty:true};
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
 const {evidence}=await withApp(name,{seed:seeds[name]?.(),secure:secures[name]?.()},journeys[name]);
 console.log(`PASS ${name}\nevidence: ${evidence}`);
}catch(error){
 console.error(`FAIL ${name}: ${error.message}\nevidence: ${error.evidence??'(none)'}`);
 process.exit(1);
}
