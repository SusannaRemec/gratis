import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {allowedApps,chosenApps,connectedApps,COMPOSIO_APP} from '../src/bot-apps.mjs';
import {agentRuntime} from '../src/agent-tools.mjs';
import {ChatService} from '../src/chat-service.mjs';
import {DirectApps,PRESETS} from '../src/direct-apps.mjs';
import {initialState,validState} from '../src/store.mjs';

const everyone=[COMPOSIO_APP,'granola','custom_notes'];

test('a bot without a selection may use every connected app, including ones connected later',()=>{
  assert.deepEqual(allowedApps({},['granola','gmail']),['granola','gmail']);
  assert.deepEqual(allowedApps({apps:undefined},[]),[]);
});
test('a selection narrows to connected apps; stale and unknown ids are ignored; an empty list allows none',()=>{
  assert.deepEqual(allowedApps({apps:['gmail','granola']},['granola']),['granola']);
  assert.deepEqual(allowedApps({apps:['gone']},['granola']),[]);
  assert.deepEqual(allowedApps({apps:[]},['granola','gmail']),[]);
  assert.deepEqual(allowedApps({apps:['granola']},['granola','gmail','late']),['granola'],'an app connected after the choice stays off');
});
test('saving a selection that covers every connected app stores nothing; stale ids are dropped',()=>{
  assert.equal(chosenApps(['granola','gmail'],['granola','gmail']),null);
  assert.equal(chosenApps([],[]),null,'nothing connected means nothing to narrow');
  assert.equal(chosenApps(['granola','gone'],['granola','gmail']).join(),'granola');
  assert.deepEqual(chosenApps([],['granola']),[]);
  assert.equal(chosenApps(['granola','gmail','gone'],['granola','gmail']),null,'stale ids do not make a partial selection');
});
test('the bot dialog lists Composio when signed in and only fully connected direct apps, by name',()=>{
  const direct=[{id:'granola',name:'Granola',state:'connected',signedIn:true,url:'u'},{id:'gmail',name:'Gmail',state:'disconnected',signedIn:false},{id:'custom_x',name:'X',state:'error',signedIn:true},{id:'custom_y',name:'Y',state:'error',signedIn:false},{id:'google_calendar',name:'Google Calendar',state:'authorizing',signedIn:true}];
  const listed=[{id:'granola',name:'Granola'},{id:'custom_x',name:'X'},{id:'google_calendar',name:'Google Calendar'}];
  assert.deepEqual(connectedApps(true,direct),[{id:COMPOSIO_APP,name:'Composio'},...listed],'an app that still holds a sign-in stays listed while it errors or re-authorizes, so saving cannot silently re-allow it');
  assert.deepEqual(connectedApps(false,direct),listed);
  assert.deepEqual(connectedApps(false,[]),[]);
});
test('the reserved Composio id cannot be produced for a direct app',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'gratis-apps-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const apps=await new DirectApps({directory,encrypt:async s=>Buffer.from(s),decrypt:async b=>String(b)}).init();
  for(const name of ['@composio','Composio session'])await apps.add({name,url:'https://example.invalid/mcp'});
  const ids=apps.status().apps.map(a=>a.id);
  assert.ok(!ids.includes(COMPOSIO_APP)&&!Object.keys(PRESETS).includes(COMPOSIO_APP));
  assert.ok(ids.every(id=>/^[a-z0-9_]+$/.test(id)),'every direct id is lowercase letters, digits and underscores');
  assert.ok(!/^[a-z0-9_]+$/.test(COMPOSIO_APP));
});

const server=name=>({type:'http',url:`https://example.invalid/${name}`});
function runtimeFor(bot,{composio=true}={}){
  const asked=[],built={composio:0};
  const connections={status:()=>({composio,cloud:false}),mcp:async()=>{built.composio++;return server('composio');},isReadOnlyAction:async()=>true};
  const directApps={servers:async()=>({app_granola:server('granola'),app_custom_notes:server('notes')}),isReadOnlyAction:async()=>true};
  return agentRuntime({bot:{id:'2b0c8a51-55b4-4d0e-a83a-5f0a0f0d2c11',...bot,capabilities:{web:false,files:false,computer:false,connections:true,...bot.capabilities}},conversationId:'t',files:{root:()=>'/private-test'},cloud:{},connections,directApps,signal:new AbortController().signal,onActivity:()=>{},approve:async name=>{asked.push(name);return false;}}).then(runtime=>({runtime,asked,built}));
}
const keys=runtime=>Object.keys(runtime.mcpServers).sort();

test('a bot without a selection still gets Composio and every connected direct app',async()=>{
  const {runtime}=await runtimeFor({});
  assert.deepEqual(keys(runtime),['app_custom_notes','app_granola','composio']);
});
test('a bot with a selection gets only those apps and never builds the others',async()=>{
  const direct=await runtimeFor({apps:['custom_notes']});
  assert.deepEqual(keys(direct.runtime),['app_custom_notes']);assert.equal(direct.built.composio,0,'an unchosen Composio session is not opened');
  assert.deepEqual(keys((await runtimeFor({apps:[COMPOSIO_APP]})).runtime),['composio']);
  assert.deepEqual(keys((await runtimeFor({apps:[]})).runtime),[]);
  assert.deepEqual(keys((await runtimeFor({apps:['removed_app','granola']})).runtime),['app_granola']);
});
test('the connections switch still turns every app off whatever the selection',async()=>{
  assert.deepEqual(keys((await runtimeFor({apps:everyone,capabilities:{connections:false}})).runtime),[]);
});
test('read-only approval skipping applies only to apps the bot may use',async()=>{
  const {runtime,asked}=await runtimeFor({apps:['granola']});
  assert.equal(await runtime.approve('mcp__app_granola__list_meetings',{}),true);assert.deepEqual(asked,[]);
  assert.equal(await runtime.approve('mcp__app_custom_notes__list_notes',{}),false);
  assert.equal(await runtime.approve('mcp__composio__COMPOSIO_MULTI_EXECUTE_TOOL',{}),false);
  assert.deepEqual(asked,['mcp__app_custom_notes__list_notes','mcp__composio__COMPOSIO_MULTI_EXECUTE_TOOL']);
  const all=await runtimeFor({});
  assert.equal(await all.runtime.approve('mcp__app_custom_notes__list_notes',{}),true);assert.equal(await all.runtime.approve('mcp__composio__COMPOSIO_MULTI_EXECUTE_TOOL',{}),true);assert.deepEqual(all.asked,[]);
});
test('changing the selection changes the runtime signature so sessions rebuild',async()=>{
  const sign=async bot=>(await runtimeFor(bot)).runtime.signature;
  const base=await sign({});
  assert.notEqual(await sign({apps:['granola']}),base);
  assert.notEqual(await sign({apps:['granola']}),await sign({apps:['custom_notes']}));
  assert.notEqual(await sign({apps:[COMPOSIO_APP]}),await sign({apps:[]}));
  assert.equal(await sign({apps:['granola']}),await sign({apps:['granola','removed_app']}),'a stale id changes nothing the bot can reach');
});

async function service(t,options={}){
  const dataDir=await mkdtemp(join(tmpdir(),'gratis-apps-'));
  const make=()=>new ChatService({dataDir,...options});const s=make();await s.init();
  t.after(async()=>{await s.close();await rm(dataDir,{recursive:true,force:true});});
  return {s,dataDir,make};
}
const bot=s=>s.snapshot().bots.find(b=>b.id===s.snapshot().activeBotId);

test('a bot saves its app selection, keeps it across restart, and clears it with null',async t=>{
  const {s,dataDir,make}=await service(t);const id=bot(s).id;
  assert.ok(!('apps' in bot(s)));
  await s.updateBot({id,apps:['granola',COMPOSIO_APP]});
  assert.deepEqual(bot(s).apps,['granola',COMPOSIO_APP]);
  await s.updateBot({id,name:'Renamed'});assert.deepEqual(bot(s).apps,['granola',COMPOSIO_APP],'an unrelated edit leaves the selection');
  await s.close();const again=make();await again.init();t.after(()=>again.close());
  assert.deepEqual(bot(again).apps,['granola',COMPOSIO_APP]);
  await again.updateBot({id,apps:[]});assert.deepEqual(bot(again).apps,[],'an empty list means none, not all');
  await again.updateBot({id,apps:null});assert.ok(!('apps' in bot(again)),'null returns the bot to every connected app');
});
test('a bot refuses a malformed app selection and keeps what it had',async t=>{
  const {s}=await service(t);const id=bot(s).id;await s.updateBot({id,apps:['granola']});
  for(const bad of ['granola',{0:'granola'},[1],[null],[''],['a','a'],['x'.repeat(65)],Array.from({length:101},(_,n)=>'app'+n)])
    await assert.rejects(s.updateBot({id,name:'Changed',apps:bad}),/apps/i,JSON.stringify(bad).slice(0,40));
  assert.deepEqual(bot(s).apps,['granola']);assert.notEqual(bot(s).name,'Changed','a rejected edit changes nothing');
});
test('a saved workspace with a malformed app selection is rejected',()=>{
  const make=apps=>{const state=initialState();if(apps!==undefined)state.bots[0].apps=apps;return validState(state);};
  assert.equal(make(undefined),true);assert.equal(make([]),true);assert.equal(make(['granola',COMPOSIO_APP]),true);
  for(const bad of ['granola',null,[1],['a','a'],[''],Array.from({length:101},(_,n)=>'app'+n)])assert.equal(make(bad),false,JSON.stringify(bad).slice(0,40));
});
test('a duplicated bot copies the app selection, or its absence',async t=>{
  const {s}=await service(t);const id=bot(s).id;
  await s.duplicateBot({id});assert.ok(!('apps' in bot(s)),'the copy of an unrestricted bot stays unrestricted');
  await s.updateBot({id,apps:['granola']});await s.duplicateBot({id});
  assert.deepEqual(bot(s).apps,['granola']);assert.notEqual(bot(s).id,id);
  await s.updateBot({id,apps:[]});assert.deepEqual(s.snapshot().bots.find(b=>b.id===bot(s).id).apps,['granola'],'the copy is independent of its source');
});
test('an external Slack conversation without tool access leaves no app usable, a direct one keeps the selection',async t=>{
  const seen=[];const {s}=await service(t,{backend:async function*({bot}){seen.push(bot);yield 'ok';}});
  const id=bot(s).id,chat=s.snapshot().activeConversationId;await s.updateBot({id,apps:['granola']});
  s._conversation(chat).messaging={connectionId:'c',direct:false,personalMemory:false,allowTools:false};
  await s.send({conversationId:chat,text:'from slack'});await s.whenIdle();
  assert.deepEqual(seen[0].apps,[]);assert.equal(seen[0].capabilities.connections,false);
  s._conversation(chat).messaging={connectionId:'c',direct:true,personalMemory:true,allowTools:true};
  await s.send({conversationId:chat,text:'from my own slack dm'});await s.whenIdle();
  assert.deepEqual(seen[1].apps,['granola']);assert.deepEqual(bot(s).apps,['granola'],'the stored bot is untouched');
});
