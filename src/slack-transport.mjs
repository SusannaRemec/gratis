import {SocketModeClient} from '@slack/socket-mode';

export const SLACK_MANIFEST={display_information:{name:'Gratis',description:'Your existing Gratis agents in Slack',background_color:'#171717'},features:{bot_user:{display_name:'Gratis',always_online:false},app_home:{home_tab_enabled:false,messages_tab_enabled:true,messages_tab_read_only_enabled:false}},oauth_config:{scopes:{bot:['app_mentions:read','chat:write','channels:read','channels:history','groups:read','groups:history','im:read','im:history','users:read']}},settings:{socket_mode_enabled:true,event_subscriptions:{bot_events:['app_mention','message.im','message.channels','message.groups']},interactivity:{is_enabled:true}}};
export class SlackError extends Error{constructor(message,{retryAfter=0,uncertain=false,fatal=false}={}){super(message);Object.assign(this,{retryAfter,uncertain,fatal});}}
export class SlackTransport{
 constructor({botToken,appToken,fetcher=fetch,clientFactory=options=>new SocketModeClient(options)}){Object.assign(this,{botToken,appToken,fetcher,clientFactory});this.requests=new Set();}
 async call(method,body={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);this.requests.add(controller);
  try{
   let response;try{response=await this.fetcher('https://slack.com/api/'+method,{method:'POST',headers:{Authorization:'Bearer '+this.botToken,'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal,redirect:'error'});}catch{throw new SlackError('Slack delivery could not be confirmed.',{uncertain:true});}
   if(response.status===429)throw new SlackError('Slack rate limit. Retrying later.',{retryAfter:Math.max(1000,Math.min(3600000,Number(response.headers.get('retry-after')||30)*1000))});
   if(!response.ok)throw new SlackError('Slack is unavailable.',{uncertain:true});
   let raw='';try{if(response.body){const reader=response.body.getReader();try{let bytes=0;const decoder=new TextDecoder();while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>2_000_000)throw Error('limit');raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}}else raw=await response.text();}catch{throw new SlackError('Slack response could not be confirmed.',{uncertain:true});}
   let value;try{value=JSON.parse(raw);}catch{throw new SlackError('Slack returned an unreadable response.',{uncertain:true});}
   if(!value.ok){const error=String(value.error||'unknown_error').replace(/[^a-z0-9_]/gi,'').slice(0,80);throw new SlackError('Slack: '+error,{retryAfter:error==='ratelimited'?30000:0,fatal:['invalid_auth','token_revoked','account_inactive','not_authed'].includes(error)});}return value;
  }finally{clearTimeout(timer);this.requests.delete(controller);}
 }
 async identity(){const value=await this.call('auth.test');if(!/^[A-Z0-9]+$/.test(value.team_id||'')||!value.bot_id||!value.user_id)throw new Error('Use a Slack bot token for this app.');return{workspaceId:value.team_id,workspaceName:String(value.team||'Slack'),botUserId:value.user_id};}
 async channels(){const items=[];let cursor;for(let page=0;page<5;page++){const result=await this.call('conversations.list',{types:'public_channel,private_channel',exclude_archived:true,limit:200,...(cursor?{cursor}:{})});items.push(...(result.channels||[]).filter(c=>c.is_member).map(c=>({id:c.id,name:c.name})));cursor=result.response_metadata?.next_cursor;if(!cursor)break;}return items;}
 async start(receive,onState=()=>{}){const silent={debug(){},info(){},warn(){},error(){},setLevel(){},getLevel(){return'error';},setName(){}};this.client=this.clientFactory({appToken:this.appToken,logger:silent});for(const type of ['events_api','interactive'])this.client.on(type,async({body,ack})=>{try{await receive(body,type);await ack();}catch{onState('Could not safely save a Slack event. Slack may retry.');}});this.client.on('connected',()=>onState('Connected'));this.client.on('disconnected',()=>onState('Reconnecting'));this.client.on('error',()=>onState('Slack connection needs attention'));await this.client.start();}
 async close(){for(const controller of this.requests)controller.abort();await this.client?.disconnect();this.client=null;}
}
export function slackText(text){return String(text).replace(/\b(?:sk-ant-|sk-|xox[baprs]-|xapp-)[A-Za-z0-9_-]{10,}\b/g,'[credential redacted]').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replace(/\*\*(.*?)\*\*/g,'*$1*');}
export function slackParts(text,limit=3500){
 const parts=[];let current='',fence='';const budget=limit-100;
 const emit=()=>{if(current)parts.push(current+(fence?'\n```':''));current=fence?fence+'\n':'';};
 for(const line of slackText(text).split('\n')){let points=Array.from(line);if(current&&Array.from(current).length+points.length+1>budget)emit();while(points.length>budget){const room=budget-Array.from(current).length;current+=points.splice(0,Math.max(1,room)).join('');emit();}current+=(current&&!current.endsWith('\n')?'\n':'')+points.join('');if(line.trimStart().startsWith('```'))fence=fence?'':line.trim().slice(0,80);}
 if(current)parts.push(current);return parts.length?parts:['The response finished without text.'];
}
export function slackEvent(body,botUserId){const e=body?.event;if(!e||!['app_mention','message'].includes(e.type)||e.bot_id||e.user===botUserId||(e.subtype&&e.subtype!=='file_share')||!e.user||!e.channel||!/^\d+\.\d+$/.test(e.ts||''))return null;const direct=e.channel_type==='im';if(!direct&&e.type==='message'&&(!e.thread_ts||String(e.text||'').includes('<@'+botUserId+'>')))return null;return{key:[body.team_id,e.channel,e.ts].join(':'),workspaceId:body.team_id,userId:e.user,channelId:e.channel,threadTs:e.thread_ts||e.ts,messageTs:e.ts,direct,mention:e.type==='app_mention',text:String(e.text||'').replaceAll('<@'+botUserId+'>','').trim().slice(0,16000),hasFiles:!!e.files?.length};}
