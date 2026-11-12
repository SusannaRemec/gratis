import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Connections} from '../src/connections.mjs';
const encrypt=text=>Buffer.from(text).map(b=>b^42),decrypt=buffer=>Buffer.from(buffer).map(b=>b^42).toString();
async function fixture(t,createClient){const directory=await mkdtemp(join(tmpdir(),'gratis-connections-'));t.after(()=>rm(directory,{recursive:true,force:true}));return new Connections({directory,encrypt,decrypt,createClient}).init();}
test('Composio credential is validated before replacing a working connection',async t=>{
 const connections=await fixture(t,key=>({create:async()=>{if(key==='ak_invalid')throw new Error('Unauthorized');return{sessionId:'session_'+key};}}));
 await connections.connectComposio('ak_working');await assert.rejects(connections.connectComposio('ak_invalid'),/Unauthorized/);
 assert.equal(connections.value.composioKey,'ak_working');assert.equal((await connections.session()).sessionId,'session_ak_working');
 const saved=await readFile(join(connections.directory,'connections.secure'));assert.equal(saved.toString().includes('ak_working'),false);
});
test('cancelling during Composio validation does not save the credential',async t=>{
 const controller=new AbortController();const connections=await fixture(t,()=>({create:async()=>{controller.abort();return{sessionId:'ignored'};}}));
 await assert.rejects(connections.connectComposio('ak_cancelled',{signal:controller.signal}),{name:'AbortError'});assert.equal(connections.status().composio,false);
 await assert.rejects(readFile(join(connections.directory,'connections.secure')),{code:'ENOENT'});
});

test('scoped account credentials persist and are reused without leaking into public status',async t=>{
 let config;const createClient=value=>{config=value;return{create:async()=>({sessionId:'scoped-session'}),use:async()=>({sessionId:'scoped-session'})};};
 const c=await fixture(t,createClient),credential={apiKey:null,userApiKey:'uak_scoped_private',orgId:'org_fixture',projectId:'proj_fixture'};
 await c.connectComposio(credential);assert.deepEqual(config,credential);assert.equal(c.status().composio,true);assert.equal(JSON.stringify(c.status()).includes('private'),false);
 const reopened=await new Connections({directory:c.directory,encrypt,decrypt,createClient}).init();await reopened.session();assert.deepEqual(config,credential);
});
test('catalog uses the supported page size and preserves search and pagination',async t=>{
 let request;const c=await fixture(t,()=>({create:async()=>({sessionId:'catalog-session',toolkits:async args=>{request=args;return{items:[{slug:'gmail',name:'Gmail',connection:{isActive:true}}],cursor:'next-page'};}})}));
 await c.connectComposio('ak_catalog');const result=await c.catalog({search:'gmail',cursor:'previous-page'});assert.deepEqual(request,{limit:50,search:'gmail',cursor:'previous-page'});assert.equal(result.cursor,'next-page');assert.equal(result.items[0].connected,true);
});

test('only Composio calls whose every action is tagged read-only skip approval',async t=>{
 const tags={GMAIL_FETCH_EMAILS:['readOnlyHint'],GOOGLECALENDAR_EVENTS_LIST:['readOnlyHint','idempotentHint'],GMAIL_SEND_EMAIL:['createHint','openWorldHint'],ODD_TOOL:['readOnlyHint','destructiveHint'],UNTAGGED:[]};let lookups=0;
 const c=await fixture(t,()=>({create:async()=>({sessionId:'s'}),tools:{getRawComposioToolBySlug:async slug=>{lookups++;if(slug==='BROKEN')throw new Error('network');return{slug,tags:tags[slug]};}}}));
 const run=(...slugs)=>({tools:slugs.map(tool_slug=>({tool_slug,arguments:{}}))});
 assert.equal(await c.isReadOnlyAction('mcp__composio__COMPOSIO_MULTI_EXECUTE_TOOL',run('GMAIL_FETCH_EMAILS')),false,'no credential means ask');
 await c.connectComposio('ak_tags');
 assert.equal(await c.isReadOnlyAction('mcp__composio__COMPOSIO_MULTI_EXECUTE_TOOL',run('GMAIL_FETCH_EMAILS','GOOGLECALENDAR_EVENTS_LIST')),true);
 assert.equal(await c.isReadOnlyAction('COMPOSIO_MULTI_EXECUTE_TOOL',run('gmail_fetch_emails')),true,'Codex bridge names and lowercase slugs');
 for(const input of [run('GMAIL_SEND_EMAIL'),run('GMAIL_FETCH_EMAILS','GMAIL_SEND_EMAIL'),run('ODD_TOOL'),run('UNTAGGED'),run('BROKEN'),run('NOT_A_TOOL'),run('../x'),{tools:[]},{tools:'GMAIL_FETCH_EMAILS'},{},null])
  assert.equal(await c.isReadOnlyAction('mcp__composio__COMPOSIO_MULTI_EXECUTE_TOOL',input),false,JSON.stringify(input));
 for(const name of ['mcp__composio__COMPOSIO_REMOTE_WORKBENCH','mcp__composio__COMPOSIO_MANAGE_CONNECTIONS','External action on cloud computer'])
  assert.equal(await c.isReadOnlyAction(name,run('GMAIL_FETCH_EMAILS')),false,name);
 const before=lookups;await c.isReadOnlyAction('COMPOSIO_MULTI_EXECUTE_TOOL',run('GMAIL_FETCH_EMAILS'));assert.equal(lookups,before,'tags are cached');
 await c.isReadOnlyAction('COMPOSIO_MULTI_EXECUTE_TOOL',run('BROKEN'));await c.isReadOnlyAction('COMPOSIO_MULTI_EXECUTE_TOOL',run('BROKEN'));assert.ok(lookups>before+1,'failed lookups are retried, not cached');
});
