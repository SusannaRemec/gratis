import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DirectApps,PRESETS} from '../src/direct-apps.mjs';

const encrypt=text=>Buffer.from(text).map(b=>b^42),decrypt=buffer=>Buffer.from(buffer).map(b=>b^42).toString();
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});

// A fake MCP resource server plus OAuth authorization server, reached only through fetchFn.
function oauthServer({refreshFails=false}={}){
  const calls=[];
  const fetchFn=async(input,init={})=>{
    const url=new URL(String(input)),body=init.body?new URLSearchParams(String(init.body)):null;calls.push({url:url.href,method:init.method||'GET',body});
    if(url.pathname.startsWith('/.well-known/oauth-protected-resource')){
      const resource=url.origin+url.pathname.replace('/.well-known/oauth-protected-resource','');
      return json({resource,authorization_servers:[url.hostname.includes('google')?'https://accounts.fake/':'https://auth.fake'],scopes_supported:url.hostname.includes('google')?['https://mail.google.com/','narrow.a','narrow.b']:['mcp']});
    }
    if(url.pathname==='/.well-known/oauth-authorization-server'){const issuer=url.origin+(url.hostname==='accounts.fake'?'/':'');return json({issuer,authorization_endpoint:url.origin+'/authorize',token_endpoint:url.origin+'/token',registration_endpoint:url.hostname==='accounts.fake'?undefined:url.origin+'/register',response_types_supported:['code'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none','client_secret_post']});}
    if(url.pathname==='/register')return json({client_id:'dynamic-client',redirect_uris:JSON.parse(init.body).redirect_uris},201);
    if(url.pathname==='/token'){
      if(body.get('grant_type')==='authorization_code')return json({access_token:'access-one',refresh_token:'refresh-one',expires_in:3600,token_type:'Bearer'});
      if(refreshFails)return json({error:'invalid_grant'},400);
      return json({access_token:'access-two',expires_in:3600,token_type:'Bearer'});
    }
    return new Response('not found',{status:404});
  };
  return {fetchFn,calls};
}
async function fixture(t,{refreshFails=false,tools=[{name:'list_events',annotations:{readOnlyHint:true}}]}={}){
  const directory=await mkdtemp(join(tmpdir(),'gratis-direct-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const server=oauthServer({refreshFails}),opened=[],listed=[];
  const apps=await new DirectApps({directory,encrypt,decrypt,fetchFn:server.fetchFn,googlePort:0,openExternal:async url=>{opened.push(new URL(url));},listTools:async(app,token)=>{listed.push({id:app.id,token});if(tools instanceof Error)throw tools;return tools;}}).init();
  t.after(()=>apps.cancel());
  return {apps,server,opened,listed,directory};
}
// Plays the browser: follow the opened sign-in page back to Gratis's loopback callback.
async function approveInBrowser(opened,{state}={}){
  const page=opened.at(-1),callback=new URL(page.searchParams.get('redirect_uri'));
  callback.searchParams.set('code','browser-code');callback.searchParams.set('state',state??page.searchParams.get('state'));
  return fetch(callback);
}

test('Granola-style apps register themselves, sign in through the browser, and keep tokens out of status',async t=>{
  const {apps,opened,listed,directory}=await fixture(t);
  const started=await apps.connect('granola');assert.equal(started.apps.find(a=>a.id==='granola').state,'authorizing');
  while(!opened.length)await new Promise(r=>setTimeout(r,5));
  assert.equal(opened[0].searchParams.get('client_id'),'dynamic-client');assert.equal(opened[0].searchParams.get('scope'),'mcp');
  assert.equal((await approveInBrowser(opened,{state:'forged'})).status,400,'a callback with the wrong state is rejected');
  assert.equal((await approveInBrowser(opened)).status,200);await apps.pending;
  const status=apps.status(),granola=status.apps.find(a=>a.id==='granola');
  assert.equal(granola.state,'connected');assert.deepEqual(listed,[{id:'granola',token:'access-one'}]);
  assert.equal(JSON.stringify(status).includes('access-one')||JSON.stringify(status).includes('refresh-one'),false);
  const saved=await readFile(join(directory,'direct-apps.secure'));assert.equal(saved.toString().includes('access-one'),false,'tokens are encrypted at rest');
  const reopened=await new DirectApps({directory,encrypt,decrypt}).init();assert.equal(reopened.status().apps.find(a=>a.id==='granola').state,'connected');
  assert.deepEqual(await apps.servers(),{app_granola:{type:'http',url:PRESETS.granola.url,headers:{Authorization:'Bearer access-one'}}});
});

test('Google apps need the user’s own client, request only the narrow scopes, and ask for offline access',async t=>{
  const {apps,opened,server}=await fixture(t);
  await assert.rejects(apps.connect('gmail'),/Google OAuth client/);
  await assert.rejects(apps.configureGoogle({clientId:'not-a-client',clientSecret:'x'}),/apps\.googleusercontent\.com/);
  await apps.configureGoogle({clientId:'123456789012-abcdefgh.apps.googleusercontent.com',clientSecret:'google-secret'});
  assert.equal(JSON.stringify(apps.status()).includes('google-secret'),false);
  await apps.connect('gmail');while(!opened.length)await new Promise(r=>setTimeout(r,5));
  const page=opened[0];
  assert.equal(page.searchParams.get('client_id'),'123456789012-abcdefgh.apps.googleusercontent.com');
  assert.equal(page.searchParams.get('scope'),PRESETS.gmail.scope,'never the full mailbox scope the server advertises');
  assert.equal(page.searchParams.get('access_type'),'offline');assert.equal(page.searchParams.get('prompt'),'consent');
  assert.equal(server.calls.some(c=>c.url.endsWith('/register')),false,'Google clients are never registered dynamically');
  await approveInBrowser(opened);await apps.pending;
  const exchange=server.calls.find(c=>c.body?.get('grant_type')==='authorization_code');
  assert.equal(exchange.body.get('client_secret'),'google-secret');assert.equal(apps.status().apps.find(a=>a.id==='gmail').state,'connected');
  await apps.configureGoogle({clientId:'456789012345-ijklmnop.apps.googleusercontent.com',clientSecret:'other'});
  assert.equal(apps.status().apps.find(a=>a.id==='gmail').state,'disconnected','changing the Google client signs Google apps out');
});

test('expired tokens refresh silently and keep the refresh token',async t=>{
  const {apps,opened}=await fixture(t);
  await apps.connect('granola');while(!opened.length)await new Promise(r=>setTimeout(r,5));await approveInBrowser(opened);await apps.pending;
  apps.data.apps.granola.expiresAt=Date.now()-1000;
  assert.equal((await apps.servers()).app_granola.headers.Authorization,'Bearer access-two');
  assert.equal(apps.data.apps.granola.tokens.refresh_token,'refresh-one');assert.equal(opened.length,1,'no browser for a refresh');
});

test('a refresh that needs a new sign-in skips the app and never opens a browser by itself',async t=>{
  const {apps,opened}=await fixture(t,{refreshFails:true});
  await apps.connect('granola');while(!opened.length)await new Promise(r=>setTimeout(r,5));await approveInBrowser(opened);await apps.pending;
  apps.data.apps.granola.expiresAt=Date.now()-1000;
  assert.deepEqual(await apps.servers(),{});assert.equal(opened.length,1);
  const granola=apps.status().apps.find(a=>a.id==='granola');assert.match(granola.error,/sign in again|Reconnect/);
});

test('only tools the app marks read-only and not destructive skip approval',async t=>{
  const {apps,opened}=await fixture(t,{tools:[{name:'list_events',annotations:{readOnlyHint:true}},{name:'delete_event',annotations:{readOnlyHint:true,destructiveHint:true}},{name:'create_event',annotations:{}},{name:'no_hints'}]});
  assert.equal(await apps.isReadOnlyAction('mcp__app_granola__list_events'),false,'not connected');
  await apps.connect('granola');while(!opened.length)await new Promise(r=>setTimeout(r,5));await approveInBrowser(opened);await apps.pending;
  assert.equal(await apps.isReadOnlyAction('mcp__app_granola__list_events'),true);
  for(const name of ['mcp__app_granola__delete_event','mcp__app_granola__create_event','mcp__app_granola__no_hints','mcp__app_granola__missing','mcp__app_unknown__list_events','mcp__composio__COMPOSIO_MULTI_EXECUTE_TOOL','list_events'])
    assert.equal(await apps.isReadOnlyAction(name),false,name);
});

test('tool listing failures keep the approval prompt',async t=>{
  const {apps}=await fixture(t,{tools:new Error('offline')});
  apps.data.apps.granola.tokens={access_token:'a',token_type:'Bearer'};
  assert.equal(await apps.isReadOnlyAction('mcp__app_granola__list_events'),false);
});

test('custom apps need an HTTPS address and are removed on disconnect',async t=>{
  const {apps}=await fixture(t);
  await assert.rejects(apps.add({name:'Plain',url:'http://mcp.example.com/mcp'}),/HTTPS/);
  await assert.rejects(apps.add({name:'Creds',url:'https://user:pw@mcp.example.com/mcp'}),/HTTPS/);
  const added=await apps.add({name:'My Notion',url:'https://mcp.notion.com/mcp'});
  assert.ok(added.apps.some(a=>a.id==='custom_my_notion'&&a.custom));
  await assert.rejects(apps.add({name:'My Notion',url:'https://mcp.notion.com/mcp'}),/already exists/);
  await apps.disconnect('custom_my_notion');assert.equal(apps.status().apps.some(a=>a.id==='custom_my_notion'),false);
  await assert.rejects(apps.connect('__proto__'),/Choose an app/);
});
