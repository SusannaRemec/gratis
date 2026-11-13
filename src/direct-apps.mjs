import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {createServer} from 'node:http';
import {auth} from '@modelcontextprotocol/sdk/client/auth.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Direct connections sign in to each app's own MCP server with OAuth, without a broker.
// Tokens stay in an encrypted file in the data folder and never reach the renderer.

const G='https://www.googleapis.com/auth/';
// Google's servers advertise every scope they accept, including full mailbox access.
// Request a narrow set instead of letting the SDK ask for all of them.
export const PRESETS={
  granola:{name:'Granola',url:'https://mcp.granola.ai/mcp',note:'Sign in with your Granola account. Free plans see notes from the last 30 days.'},
  gmail:{name:'Gmail',url:'https://gmailmcp.googleapis.com/mcp/v1',google:true,scope:[G+'gmail.readonly',G+'gmail.compose'].join(' '),note:'Read mail and create drafts. Needs your Google OAuth client.'},
  google_calendar:{name:'Google Calendar',url:'https://calendarmcp.googleapis.com/mcp/v1',google:true,scope:[G+'calendar.calendarlist.readonly',G+'calendar.events.readonly',G+'calendar.events.freebusy',G+'calendar.events'].join(' '),note:'Read and manage events. Needs your Google OAuth client.'},
};
// Google "Web application" clients need an exact redirect URI, so Google sign-in uses a fixed port.
export const GOOGLE_PORT=47823,GOOGLE_REDIRECT=`http://127.0.0.1:${GOOGLE_PORT}/oauth/callback`;
const TOOL_CACHE_MS=600000,REFRESH_MARGIN_MS=120000,SIGNIN_TIMEOUT_MS=300000;
const redact=error=>String(error?.message||error).replace(/(?:Bearer\s+|(?:access_token|refresh_token|code_verifier|client_secret|code)[=:]\s*)[^\s,&"}]+/gi,'[credential redacted]').slice(0,300);
export function appUrl(value){
  const url=new URL(String(value||'').trim());
  if(url.protocol!=='https:'||url.username||url.password||url.hash)throw new Error('Enter the app’s HTTPS MCP address, without credentials.');
  return url.href;
}

export class DirectApps {
  constructor({directory,encrypt,decrypt,openExternal,onChange=()=>{},fetchFn,listTools,googlePort=GOOGLE_PORT}){
    Object.assign(this,{directory,encrypt,decrypt,openExternal,onChange,fetchFn,googlePort});
    if(listTools)this.listToolsFor=listTools;
    this.data={apps:{}};this.persist=Promise.resolve();this.job=null;this.refreshing=new Map();this.toolCache=new Map();this.errors={};
  }
  async init(){
    try{this.data=JSON.parse(await this.decrypt(await readFile(join(this.directory,'direct-apps.secure'))));}catch(e){if(e.code!=='ENOENT')throw new Error('Could not unlock saved app connections.');}
    this.data.apps??={};
    for(const [id,preset] of Object.entries(PRESETS))this.data.apps[id]={...this.data.apps[id],id,...preset};
    return this;
  }
  save(){const value=JSON.stringify(this.data);const write=async()=>{await mkdir(this.directory,{recursive:true,mode:0o700});const tmp=join(this.directory,'.direct-apps-'+randomUUID());await writeFile(tmp,await this.encrypt(value),{mode:0o600});await rename(tmp,join(this.directory,'direct-apps.secure'));};this.persist=this.persist.then(write,write);return this.persist;}
  app(id){const app=typeof id==='string'&&Object.hasOwn(this.data.apps,id)?this.data.apps[id]:null;if(!app)throw new Error('Choose an app from the list.');return app;}
  status(){
    return {googleClient:!!this.data.google?.clientId,googleRedirect:GOOGLE_REDIRECT.replace(GOOGLE_PORT,this.googlePort),apps:Object.values(this.data.apps).map(a=>({id:a.id,name:a.name,url:a.url,note:a.note||'',custom:!PRESETS[a.id],google:!!a.google,signedIn:!!a.tokens?.access_token,
      state:this.job?.id===a.id?'authorizing':this.errors[a.id]?'error':a.tokens?.access_token?'connected':'disconnected',error:this.errors[a.id]||''}))};
  }
  changed(){try{this.onChange(this.status());}catch{}}
  async configureGoogle({clientId,clientSecret}={}){
    clientId=String(clientId||'').trim();clientSecret=String(clientSecret||'').trim();
    if(!/^[\w.-]{8,200}\.apps\.googleusercontent\.com$/.test(clientId))throw new Error('Paste the client ID from Google Cloud. It ends in .apps.googleusercontent.com.');
    if(!clientSecret||clientSecret.length>200)throw new Error('Paste the client secret from Google Cloud.');
    this.data.google={clientId,clientSecret};
    // Tokens were issued to the previous client, so Google apps sign in again.
    for(const app of Object.values(this.data.apps))if(app.google)this.forget(app);
    await this.save();this.changed();return this.status();
  }
  async add({name,url}={}){
    name=String(name||'').trim().slice(0,60);if(!name)throw new Error('Give the app a name.');url=appUrl(url);
    const id='custom_'+(name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,30)||'app');
    if(this.data.apps[id])throw new Error('An app with this name already exists.');
    this.data.apps[id]={id,name,url};await this.save();this.changed();return this.status();
  }
  forget(app){delete app.tokens;delete app.expiresAt;delete app.verifier;delete app.discovery;if(!app.google)delete app.clientInformation;this.toolCache.delete(app.id);delete this.errors[app.id];}
  async disconnect(id){const app=this.app(id);if(this.job?.id===id)this.cancel();this.forget(app);if(!PRESETS[id])delete this.data.apps[id];await this.save();this.changed();return this.status();}
  cancel(){const job=this.job;if(!job)return this.status();this.job=null;job.reject(new Error('Sign-in cancelled.'));job.server.close();this.changed();return this.status();}

  provider(app,flow){const owner=this;return{
    get redirectUrl(){return flow?.redirect||app.redirectUrl;},
    get clientMetadata(){return{client_name:'Gratis',redirect_uris:[flow?.redirect||app.redirectUrl||'http://127.0.0.1/oauth/callback'],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none',...(app.scope?{scope:app.scope}:{})};},
    state:()=>flow?.state||randomUUID(),
    clientInformation:()=>app.google?(owner.data.google?{client_id:owner.data.google.clientId,client_secret:owner.data.google.clientSecret}:undefined):app.clientInformation,
    saveClientInformation:async value=>{if(app.google)return;app.clientInformation=value;await owner.save();},
    tokens:()=>app.tokens,
    saveTokens:async value=>{app.tokens=value;app.expiresAt=value.expires_in?Date.now()+value.expires_in*1000:undefined;await owner.save();},
    saveCodeVerifier:async value=>{app.verifier=value;await owner.save();},
    codeVerifier:()=>app.verifier,
    discoveryState:()=>app.discovery,
    saveDiscoveryState:async value=>{app.discovery=value;await owner.save();},
    redirectToAuthorization:async url=>{
      if(!flow)throw new Error(`${app.name} needs you to sign in again. Reconnect it in Connections.`);
      if(url.protocol!=='https:')throw new Error(`${app.name} returned an insecure sign-in page.`);
      // Google returns a refresh token only for offline access with a fresh consent.
      if(app.google){url.searchParams.set('access_type','offline');url.searchParams.set('prompt','consent');}
      await owner.openExternal(url.href);
    },
    invalidateCredentials:async scope=>{if((scope==='all'||scope==='client')&&!app.google)delete app.clientInformation;if(scope==='all'||scope==='tokens'){delete app.tokens;delete app.expiresAt;}if(scope==='all'||scope==='verifier')delete app.verifier;if(scope==='all'||scope==='discovery')delete app.discovery;await owner.save();},
  };}

  // Opens the browser sign-in and finishes in the background; status updates arrive through onChange.
  async connect(id){
    const app=this.app(id);
    if(app.google&&!this.data.google?.clientId)throw new Error('Add your Google OAuth client first. See “Google setup” below.');
    if(this.job)this.cancel();
    const flow={state:randomUUID()};let reject;
    const code=new Promise((resolve,fail)=>{flow.resolve=resolve;reject=fail;});code.catch(()=>{});
    const server=createServer((req,res)=>{
      const url=new URL(req.url,'http://127.0.0.1'),incoming=Buffer.from(url.searchParams.get('state')||''),expected=Buffer.from(flow.state);
      if(req.method!=='GET'||url.pathname!=='/oauth/callback'||incoming.length!==expected.length||!timingSafeEqual(incoming,expected)){res.writeHead(400);res.end('This sign-in does not belong to Gratis.');return;}
      res.setHeader('content-type','text/html; charset=utf-8');res.setHeader('cache-control','no-store');
      if(url.searchParams.get('error')){reject(new Error(`${app.name} sign-in was declined.`));res.end('<!doctype html><title>Gratis</title><p>Sign-in cancelled. Return to Gratis.</p>');return;}
      const value=url.searchParams.get('code');if(!value){res.writeHead(400);res.end('Missing authorization code.');return;}
      flow.resolve(value);res.end('<!doctype html><title>Gratis</title><p>Signed in. You can return to Gratis.</p>');
    });
    await new Promise((resolve,fail)=>{server.once('error',error=>fail(error.code==='EADDRINUSE'?new Error(`Port ${this.googlePort} is busy, so Google sign-in cannot finish. Close the program using it and try again.`):error));server.listen(app.google?this.googlePort:0,'127.0.0.1',resolve);});
    flow.redirect=`http://127.0.0.1:${server.address().port}/oauth/callback`;
    this.forget(app);
    // A registered client is bound to its redirect URI; each new loopback port registers again.
    if(!app.google&&app.redirectUrl!==flow.redirect)delete app.clientInformation;
    app.redirectUrl=flow.redirect;
    const job={id,server,reject};this.job=job;this.changed();
    const timer=setTimeout(()=>reject(new Error(`${app.name} sign-in expired. Try again.`)),SIGNIN_TIMEOUT_MS);timer.unref?.();
    const provider=this.provider(app,flow),options={serverUrl:app.url,...(app.scope?{scope:app.scope}:{}),...(this.fetchFn?{fetchFn:this.fetchFn}:{})};
    const finished=(async()=>{
      if(await auth(provider,options)!=='AUTHORIZED')await auth(provider,{...options,authorizationCode:await code});
      if(this.job!==job)return;
      await this.tools(app,true);
    })().then(()=>{if(this.job===job)delete this.errors[id];},error=>{if(this.job===job){this.forget(app);this.errors[id]=redact(error);}})
      .finally(async()=>{clearTimeout(timer);server.close();if(this.job===job){this.job=null;await this.save().catch(()=>{});this.changed();}});
    this.pending=finished;
    return this.status();
  }

  // Returns a valid access token, refreshing it without opening a browser.
  async token(app){
    if(!app.tokens?.access_token)throw new Error(`${app.name} is not connected.`);
    if(!app.expiresAt||app.expiresAt-Date.now()>REFRESH_MARGIN_MS)return app.tokens.access_token;
    if(!app.tokens.refresh_token)throw new Error(`${app.name} sign-in expired. Reconnect it in Connections.`);
    if(!this.refreshing.has(app.id)){
      const run=auth(this.provider(app,null),{serverUrl:app.url,...(app.scope?{scope:app.scope}:{}),...(this.fetchFn?{fetchFn:this.fetchFn}:{})})
        .then(result=>{if(result!=='AUTHORIZED')throw new Error(`${app.name} needs you to sign in again.`);delete this.errors[app.id];return app.tokens.access_token;})
        .catch(error=>{this.errors[app.id]=redact(error);this.changed();throw error;})
        .finally(()=>this.refreshing.delete(app.id));
      this.refreshing.set(app.id,run);
    }
    return this.refreshing.get(app.id);
  }
  async listToolsFor(app,token){
    const client=new Client({name:'Gratis',version:'1.0.0'});
    await client.connect(new StreamableHTTPClientTransport(new URL(app.url),{requestInit:{headers:{Authorization:'Bearer '+token}},reconnectionOptions:{maxRetries:0}}),{timeout:20000});
    try{const tools=[];let cursor;do{const page=await client.listTools(cursor?{cursor}:{},{timeout:20000});tools.push(...page.tools);cursor=page.nextCursor;}while(cursor&&tools.length<1000);return tools;}finally{await client.close().catch(()=>{});}
  }
  async tools(app,force=false){
    const cached=this.toolCache.get(app.id);
    if(!force&&cached&&Date.now()-cached.at<TOOL_CACHE_MS)return cached.tools;
    const tools=await this.listToolsFor(app,await this.token(app));
    this.toolCache.set(app.id,{at:Date.now(),tools:new Map(tools.map(t=>[t.name,t.annotations||{}]))});
    return this.toolCache.get(app.id).tools;
  }

  // MCP server configs for a bot run. An app that cannot refresh is skipped, not fatal.
  async servers(){
    const servers={};
    for(const app of Object.values(this.data.apps)){
      if(!app.tokens?.access_token)continue;
      try{servers['app_'+app.id]={type:'http',url:app.url,headers:{Authorization:'Bearer '+await this.token(app)}};}catch{}
    }
    return servers;
  }
  // Skips the approval prompt only when the app's own server marks the tool read-only and not destructive.
  async isReadOnlyAction(name){
    const match=/^mcp__app_([a-z0-9_]+)__(.+)$/.exec(String(name));if(!match||!Object.hasOwn(this.data.apps,match[1]))return false;
    try{const annotations=(await this.tools(this.data.apps[match[1]])).get(match[2]);return annotations?.readOnlyHint===true&&annotations.destructiveHint!==true;}catch{return false;}
  }
}
