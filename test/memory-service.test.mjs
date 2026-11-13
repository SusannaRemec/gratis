import {tmpdir} from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {MemoryService} from '../src/memory-service.mjs';
import {ChatService} from '../src/chat-service.mjs';
import {testKeyring} from './memory-fixture.mjs';
import {extractMemory} from '../src/memory-extract.mjs';
import {withMemoryContext} from '../src/memory-context.mjs';
import {parseMemoryImport,IMPORT_LIMITS} from '../src/memory-import.mjs';
const empty=()=>({facts:[],episode:null,task:null});
async function fixture(t,{extractor=async()=>empty(),backend=async function*(){yield 'Acknowledged.';}}={}){
 const directory=await mkdtemp(join(tmpdir(),'gratis-test-')),keys=testKeyring();
 const memory=await new MemoryService({directory,...keys,extractor}).init(),s=new ChatService({dataDir:directory,memory,backend});await s.init();s.state.bots[0].promptMode='manual';s.state.bots[0].promptGenerated=true;
 t.after(async()=>{await s.close();await rm(directory,{recursive:true,force:true});});return{s,memory,directory,keys};
}
async function turn(s,text){const id=s.state.activeConversationId;await s.send({conversationId:id,text});await s.whenIdle();return s._conversation(id);}
const input=(m,patch={})=>({key:'response_style',title:'Response style',content:'Prefers concise explanations',scope:'profile',category:'preferences',stated:true,messageId:m.id,quote:m.content,...patch});
test('new turns are learned once; historical chats are never backfilled',async t=>{
 const seen=[],{s,memory}=await fixture(t,{extractor:async({job})=>{seen.push(job.user.text);return{facts:[input({content:job.user.text},{quote:job.user.text})]};}});s._conversation(s.state.activeConversationId).messages.push({id:'old',role:'user',content:'Private prior history',status:'complete',createdAt:1});
 const c=await turn(s,'I prefer concise explanations.');await memory.whenIdle();assert.deepEqual(seen,['I prefer concise explanations.']);assert.equal((await memory.view(c.id)).profile.length,1);await memory.enqueue(c,c.messages.at(-1));await memory.whenIdle();assert.equal(seen.length,1);
});
test('profile recall crosses chats, while bot and thread details stay scoped out of groups',async t=>{
 const{s,memory}=await fixture(t);const a=await turn(s,'I prefer concise explanations.');await memory.learn(a.id,input(a.messages[0]));await memory.learn(a.id,{key:'secret',title:'Bot detail',content:'BOT_ONLY_419',scope:'bot'},{manual:true});await memory.learn(a.id,{key:'local',title:'Chat detail',content:'CHAT_ONLY_945',scope:'thread'},{manual:true});
 await s.newConversation({botId:a.botId});assert.match((await memory.contextPacket(s.state.activeConversationId,'How should you explain things?')).context,/concise/);assert.doesNotMatch((await memory.contextPacket(s.state.activeConversationId,'CHAT_ONLY_945')).context,/CHAT_ONLY_945/);
 const b=(await s.createBot({name:'Second',instructions:'Help'})).activeBotId;await s.createThread({botIds:[a.botId,b]});const packet=await memory.contextPacket(s.state.activeConversationId,'BOT_ONLY_419 CHAT_ONLY_945');assert.match(packet.context,/concise/);assert.doesNotMatch(packet.context,/BOT_ONLY_419|CHAT_ONLY_945/);
});
test('literal evidence is required and temporary or third-party details never become a profile',async t=>{
 const{s,memory}=await fixture(t);const c=await turn(s,'For this trip I want a morning flight. My colleague lives in Rome.');const m=c.messages[0];await assert.rejects(memory.learn(c.id,input(m,{quote:'I live in Rome.'})),/quote/);
 await memory.learn(c.id,input(m,{key:'flight',quote:'For this trip I want a morning flight.'}));await memory.learn(c.id,input(m,{key:'colleague',quote:'My colleague lives in Rome.',content:'Colleague lives in Rome'}));assert.equal((await memory.view(c.id)).profile.length,0);assert.equal((await memory.view(c.id)).facts.length,2);
});
test('forget clears derived summaries, alternate labels, tasks and every consuming SDK session',async t=>{
 const{s,memory}=await fixture(t);const c=await turn(s,'I prefer concise explanations.');const m=c.messages[0],r=await memory.learn(c.id,input(m));await memory.learn(c.id,input(m,{key:'writing',title:'Writing preference'}));await memory.vault.addEpisode(memory.context(c.id),{scope:'bot',scopeId:c.botId,jobId:'e',title:'Style discussed',content:'Concise explanations preferred',sources:[memory.source(c.id,m.id,m.content)]});
 await s.newConversation({botId:c.botId});const consumer=await turn(s,'What style do I like?');assert.ok(consumer.messages.at(-1).memoryRefs.includes(r.id));c.claudeSession={id:'old'};consumer.codexSession={id:'old'};await memory.remove(consumer.id,r.id);
 assert.equal(memory.vault.state.facts.length,0);assert.equal(memory.vault.state.episodes.length,0);assert.equal(c.claudeSession,null);assert.equal(consumer.codexSession,null);assert.equal(memory.messages(c).length,0);assert.equal(memory.messages(consumer).length,0);assert.equal(memory.vault.state.tasks[c.id],undefined);assert.equal(memory.exchangeAllowed(c,{parentReplyId:c.messages.at(-1).id}),false);await assert.rejects(s.retry({conversationId:consumer.id}),/forgotten|memory|context/i);assert.equal(consumer.messages.length,2);
 await turn(s,'What else can you do?');assert.equal(memory.messages(consumer).length,2);
});
test('forget fences an in-flight extractor and permits only explicit fresh relearning',async t=>{
 let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);const{s,memory}=await fixture(t,{extractor:async({job})=>{enter();await gate;return{facts:[input({content:job.user.text},{quote:job.user.text})]};}});const c=await turn(s,'I prefer concise explanations.');const r=await memory.learn(c.id,input(c.messages[0]));const running=memory.whenIdle();await entered;await memory.remove(c.id,r.id);release();await running;assert.equal(memory.vault.state.facts.length,0);
 const next=await turn(s,'Remember I prefer concise explanations.');await memory.learn(next.id,input(next.messages.at(-2)));assert.equal(memory.vault.state.facts.length,1);
});
test('manual corrections stay authoritative while a delayed extraction proposes an alternative',async t=>{
 const{s,memory}=await fixture(t);const c=await turn(s,'I prefer concise explanations.');const r=await memory.learn(c.id,input(c.messages[0]));await memory.edit(c.id,{id:r.id,content:'Prefers detailed explanations'});const u={id:'fresh',role:'user',content:'I prefer brief explanations.',status:'complete',createdAt:Date.now()};c.messages.push(u);const result=await memory.learn(c.id,input(u,{content:'Prefers brief explanations'}));assert.equal(result.status,'pending');assert.match((await memory.view(c.id)).profile[0].content,/detailed/);await memory.confirm(c.id,result.id);assert.match((await memory.view(c.id)).profile[0].content,/brief/);
});
test('pausing memory stops learning and clears model sessions without deleting visible history',async t=>{
 const{s,memory}=await fixture(t);const c=await turn(s,'I prefer concise explanations.');await memory.learn(c.id,input(c.messages[0]));c.codexSession={id:'active'};await memory.enable(false);assert.equal(c.codexSession,null);assert.equal((await memory.contextPacket(c.id,'style')).context,'');assert.equal((await memory.learn(c.id,input(c.messages[0],{key:'another'}))).status,'paused');assert.equal(c.messages.length,2);await memory.enable(true);assert.match((await memory.contextPacket(c.id,'style')).context,/concise/);
});
test('revoking a bot profile clears its prior prompt context and task cache',async t=>{
 const{s,memory}=await fixture(t);const c=await turn(s,'I prefer concise explanations.');await memory.learn(c.id,input(c.messages[0]));await s.updateBot({id:c.botId,memoryProfileAccess:false});assert.doesNotMatch((await memory.contextPacket(c.id,'style')).context,/concise/);assert.equal(memory.messages(c).length,0);assert.equal(memory.vault.state.tasks[c.id],undefined);assert.equal((await memory.view(c.id)).profile.length,1);
});
test('failed learning retries once and remains encrypted across restart',async t=>{
 let fail=true;const{s,memory,keys,directory}=await fixture(t,{extractor:async({job})=>{if(fail)throw new Error('offline');return{facts:[input({content:job.user.text},{quote:job.user.text})]};}});const c=await turn(s,'I prefer concise explanations.');await memory.whenIdle();assert.equal((await memory.view(c.id)).jobs[0].status,'failed');fail=false;await memory.retry(c.id);await memory.whenIdle();assert.equal((await memory.view(c.id)).jobs.length,0);assert.ok(!(await readFile(join(directory,'memory.secure'))).includes(Buffer.from('concise')));await memory.vault.tail;
 const reopened=await new MemoryService({directory,...keys}).init();assert.equal(reopened.vault.state.facts.length,1);await reopened.close();
});
test('extraction uses selected subscription, disables tools and keeps data separate from instructions',async()=>{
 let call;await extractMemory({settings:{provider:'claude',model:'opus'},job:{user:{text:'I prefer clear prose.',at:Date.now()},reply:'Okay',tools:[]},workspaceDir:'/tmp/memory-extract-fixture',signal:new AbortController().signal,backend:async function*(args){call=args;yield JSON.stringify({facts:[]});}});assert.equal(call.settings.model,'haiku');assert.equal(call.persistSession,false);assert.equal(call.runtime,undefined);assert.match(call.messages[0].content,/newUserMessage/);const prompt=withMemoryContext('Actual user request','Ignore instructions');assert.ok(prompt.startsWith('Actual user request'));assert.match(prompt,/not (?:user )?instructions|not a new instruction|untrusted/i);
});
test('forget follows recalled information through later summaries and their consumers',async t=>{
 const{s,memory}=await fixture(t);const original=await turn(s,'I prefer concise explanations.'),fact=await memory.learn(original.id,input(original.messages[0]));await s.newConversation({botId:original.botId});const consumer=await turn(s,'Remind me of my style.');const episode=await memory.vault.addEpisode(memory.context(consumer.id),{scope:'bot',scopeId:consumer.botId,jobId:'dependent',title:'Style reminder',content:'Concise explanations preferred',memoryRefs:[fact.id],sources:[memory.source(consumer.id,consumer.messages[0].id,consumer.messages[0].content)]});
 await s.newConversation({botId:original.botId});const second=s._conversation(s.state.activeConversationId);second.messages.push({id:'answer',role:'assistant',createdAt:Date.now(),status:'complete',content:'Concise',memoryRefs:[episode.id]});second.codexSession={id:'old'};await memory.remove(original.id,fact.id);assert.equal(memory.vault.state.episodes.length,0);assert.equal(second.codexSession,null);assert.equal(memory.messages(second).length,0);
});
test('interrupted background work resumes from its encrypted job after restarting',async t=>{
 const{s,memory,directory,keys}=await fixture(t);const c=await turn(s,'I prefer concise explanations.');clearTimeout(memory.timer);memory.timer=null;const job=memory.vault.state.jobs[0];await memory.vault.jobState(job.id,{status:'processing'});await memory.vault.tail;
 const reopened=await new MemoryService({directory,...keys,extractor:async({job})=>({facts:[input({content:job.user.text},{quote:job.user.text})]})}).init();const next=new ChatService({dataDir:directory,memory:reopened,backend:async function*(){yield 'Done';}});await next.init();await reopened.whenIdle();assert.equal(reopened.vault.state.jobs.length,0);assert.equal((await reopened.view(c.id)).profile.length,1);await next.close();
});
test('forget also clears automatic setup derived from the same source, preserving manual instructions',async t=>{
 const{s,memory}=await fixture(t);const c=await turn(s,'I prefer concise explanations.');const r=await memory.learn(c.id,input(c.messages[0]));const bot=s._bot(c.botId);Object.assign(bot,{promptMode:'auto',promptGenerated:true,promptSource:{conversationId:c.id,messageId:c.messages[0].id},instructions:'Prefer concise explanations forever.'});await memory.remove(c.id,r.id);assert.doesNotMatch(bot.instructions,/forever/);assert.equal(bot.promptSource,undefined);
 await s.newConversation({botId:bot.id});const next=await turn(s,'I prefer detailed explanations.');const v=await memory.learn(next.id,input(next.messages[0],{key:'new_style'}));bot.promptMode='manual';bot.instructions='User-created bot instructions';await memory.remove(next.id,v.id);assert.equal(bot.instructions,'User-created bot instructions');
});
test('forking an old visible chat cannot restore forgotten messages under new IDs',async t=>{const{s,memory}=await fixture(t);const c=await turn(s,'I prefer concise explanations.'),r=await memory.learn(c.id,input(c.messages[0]));await memory.remove(c.id,r.id);await s.createThread({botIds:[c.botId],sourceConversationId:c.id});const fork=s._conversation(s.state.activeConversationId);assert.equal(fork.messages.length,0);assert.equal(c.messages.length,2);});
test('a bot with profile access revoked cannot recover it through a derived bot summary',async t=>{const{s,memory}=await fixture(t);const c=await turn(s,'I prefer concise explanations.'),r=await memory.learn(c.id,input(c.messages[0]));await memory.vault.addEpisode(memory.context(c.id),{scope:'bot',scopeId:c.botId,jobId:'profile-dependent',title:'Style reminder',content:'PRIVATE_PROFILE_REMINDER_729',memoryRefs:[r.id],sources:[memory.source(c.id,c.messages[0].id,c.messages[0].content)]});await s.updateBot({id:c.botId,memoryProfileAccess:false});assert.equal((await memory.search(c.id,{query:'PRIVATE_PROFILE_REMINDER_729'})).length,0);assert.doesNotMatch((await memory.contextPacket(c.id,'PRIVATE_PROFILE_REMINDER_729')).context,/PRIVATE_PROFILE_REMINDER_729/);});
test('group teammates can learn only quotes from the real user message, never the internal delivery wrapper',async t=>{const{s,memory}=await fixture(t);const lead=s.state.activeBotId;await s.createBot({name:'Other',instructions:'Help'});await s.createThread({botIds:[lead,s.state.activeBotId]});const root=await turn(s,'@everyone I prefer concise explanations.'),child=s.state.conversations.find(c=>c.parentThreadId===root.id),user=root.messages.find(m=>m.role==='user');const saved=await memory.learn(child.id,input(child.messages[0],{quote:user.content}));const row=memory.vault.state.facts.find(r=>r.id===saved.id);assert.equal(row.sources[0].conversationId,root.id);assert.equal(row.sources[0].messageId,user.id);await assert.rejects(memory.learn(child.id,input(child.messages[0],{key:'wrapper',quote:'The user explicitly addressed you in the group chat'})),/quote/);});
const pasted='# What I remember\n- Likes tea\n- Lives in Lisbon\n  and works nights\n- likes TEA\n- Prefers concise answers';
const kept=['Likes tea','Lives in Lisbon and works nights','Prefers concise answers'];
test('imported memories are confirmed profile memories every bot can recall, and importing them again changes nothing',async t=>{
 const{s,memory}=await fixture(t);const c=await turn(s,'Hello there');const items=parseMemoryImport(pasted);
 assert.deepEqual(await memory.importMemories(c.id,items),{added:3,skipped:0,withheld:0});
 const first=await memory.view(c.id);assert.deepEqual(first.profile.map(r=>r.content).sort(),[...kept].sort());assert.ok(first.profile.every(r=>r.scope==='profile'&&r.status==='confirmed'&&r.sources[0].quote===r.content));assert.equal(first.pending.length,0);assert.equal(first.history.length,0);
 await s.createBot({name:'Second',instructions:'Help'});const other=s.state.activeConversationId;assert.notEqual(s._conversation(other).botId,c.botId);assert.match((await memory.contextPacket(other,'Where do I live?')).context,/Lisbon/);
 assert.deepEqual(await memory.importMemories(c.id,items),{added:0,skipped:3,withheld:0});const second=await memory.view(c.id);assert.equal(second.revision,first.revision);assert.deepEqual(second.profile,first.profile);
});
test('an import skips what the profile already holds however it was written, and counts repeats inside one batch',async t=>{
 const{s,memory}=await fixture(t);const c=await turn(s,'Hello there');await memory.learn(c.id,{key:'tea',title:'Tea',content:'Likes   Tea',scope:'profile'},{manual:true});
 assert.deepEqual(await memory.importMemories(c.id,[{content:'likes tea'},{content:'Likes coffee'},{content:'LIKES  COFFEE'}]),{added:1,skipped:2,withheld:0});assert.equal((await memory.view(c.id)).profile.length,2);
});
test('imported lines that share a label stay separate current memories',async t=>{
 const{s,memory}=await fixture(t);const c=await turn(s,'Hello there'),stem='I like long walks along the river near my house in the early ';
 assert.equal((await memory.importMemories(c.id,[{content:stem+'spring'},{content:stem+'autumn'}])).added,2);const v=await memory.view(c.id);assert.equal(v.profile.length,2);assert.equal(v.history.length,0);
});
test('credential-like and private lines are never stored while their neighbours still are',async t=>{
 const{s,memory}=await fixture(t);const c=await turn(s,'Hello there'),lines=['API key: sk-test0123456789abcdefghij','Authorization Bearer abcdefghijklmnopqrstuvwxyz0123','password = hunter2xyz','The login password is swordfish42','Was diagnosed with asthma last year','Likes tea'];
 assert.deepEqual(await memory.importMemories(c.id,lines.map(content=>({content}))),{added:1,skipped:0,withheld:5});assert.deepEqual((await memory.view(c.id)).profile.map(r=>r.content),['Likes tea']);
 const stored=JSON.stringify(memory.vault.state);for(const secret of ['sk-test0123','abcdefghijklmnop','hunter2xyz','swordfish42','asthma'])assert.ok(!stored.includes(secret));
});
test('a caller cannot steer an import into another scope, status or label',async t=>{
 const{s,memory}=await fixture(t);const c=await turn(s,'Hello there');
 await memory.importMemories(c.id,[{content:'Likes tea',scope:'bot',scopeId:c.botId,key:'chosen',status:'pending',title:'Chosen'}]);const [row]=memory.vault.state.facts;assert.equal(memory.vault.state.facts.length,1);assert.deepEqual([row.scope,row.scopeId,row.status],['profile','owner','confirmed']);assert.equal((await memory.view(c.id)).facts.length,0);
 await s.createBot({name:'Mate',instructions:'Help'});const mate=s.state.activeBotId;await s.createThread({botIds:[c.botId,mate]});const group=s.state.activeConversationId;
 assert.deepEqual(await memory.importMemories(group,[{content:'Lives in Lisbon'}]),{added:1,skipped:0,withheld:0});assert.deepEqual(memory.vault.state.facts.map(r=>r.scope),['profile','profile']);
});
test('a bot denied the profile cannot recall an import made from its chat, while other bots can',async t=>{
 const{s,memory}=await fixture(t);const c=await turn(s,'Hello there');await s.updateBot({id:c.botId,memoryProfileAccess:false});
 assert.equal((await memory.importMemories(c.id,[{content:'Lives in Lisbon'}])).added,1);assert.doesNotMatch((await memory.contextPacket(c.id,'Where do I live?')).context,/Lisbon/);
 await s.createBot({name:'Second',instructions:'Help'});assert.match((await memory.contextPacket(s.state.activeConversationId,'Where do I live?')).context,/Lisbon/);
});
test('a paused or unreachable memory refuses an import and stores nothing',async t=>{
 const{s,memory,directory,keys}=await fixture(t);const c=await turn(s,'Hello there'),items=parseMemoryImport(pasted);
 await memory.enable(false);await assert.rejects(memory.importMemories(c.id,items),/turned off/);assert.equal(memory.vault.state.facts.length,0);await memory.enable(true);assert.equal((await memory.importMemories(c.id,items)).added,3);
 await memory.vault.tail;await writeFile(join(directory,'memory.secure'),Buffer.from('not a vault'));const broken=await new MemoryService({directory,...keys}).init();assert.equal(broken.status,'unavailable');await assert.rejects(broken.importMemories(c.id,items),/could not be opened/);
});
test('pausing memory partway through an import stops it, and importing again finishes the rest',async t=>{
 const{s,memory}=await fixture(t);const c=await turn(s,'Hello there'),items=parseMemoryImport(pasted);
 const outcome=memory.importMemories(c.id,items).then(()=>null,error=>error);await memory.enable(false);assert.match((await outcome)?.message,/stopped/);assert.ok(memory.vault.state.facts.length<3);
 await memory.enable(true);const rest=await memory.importMemories(c.id,items);assert.equal(rest.added+rest.skipped,3);assert.equal((await memory.view(c.id)).profile.length,3);
});
test('an unknown conversation is refused even when every line would be skipped',async t=>{
 const{s,memory}=await fixture(t);const c=await turn(s,'Hello there');await memory.importMemories(c.id,[{content:'Likes tea'}]);
 await assert.rejects(memory.importMemories('missing',[{content:'Likes tea'}]),/not found/i);await assert.rejects(memory.importMemories('missing',[{content:'Likes coffee'}]),/not found/i);assert.equal(memory.vault.state.facts.length,1);
});
test('a batch that is too big or has a bad line is refused whole, before anything is written',async t=>{
 const{s,memory}=await fixture(t);const c=await turn(s,'Hello there'),line=i=>({content:`Item number ${i}`});
 for(const bad of [Array.from({length:IMPORT_LIMITS.items+1},(_,i)=>line(i)),[line(1),{content:'   '},line(2)],[line(1),{content:'x'.repeat(IMPORT_LIMITS.itemChars+1)}],[line(1),{}],[line(1),'text'],'Likes tea',null])await assert.rejects(memory.importMemories(c.id,bad),/Import up to|Each memory needs/);
 assert.equal(memory.vault.state.facts.length,0);assert.equal((await memory.importMemories(c.id,Array.from({length:IMPORT_LIMITS.items},(_,i)=>line(i)))).added,IMPORT_LIMITS.items);
});
test('imports survive a restart and importing the same text afterwards still adds nothing',async t=>{
 const{s,memory,directory,keys}=await fixture(t);const c=await turn(s,'Hello there'),items=parseMemoryImport(pasted);await memory.importMemories(c.id,items);await memory.whenIdle();await memory.vault.tail;
 assert.ok(!(await readFile(join(directory,'memory.secure'))).includes(Buffer.from('Lisbon')));
 const reopened=await new MemoryService({directory,...keys}).init(),next=new ChatService({dataDir:directory,memory:reopened,backend:async function*(){yield 'Done';}});await next.init();
 assert.equal((await reopened.view(c.id)).profile.length,3);assert.deepEqual(await reopened.importMemories(c.id,items),{added:0,skipped:3,withheld:0});assert.equal((await reopened.view(c.id)).profile.length,3);await next.close();
});
