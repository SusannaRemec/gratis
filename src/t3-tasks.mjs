import {validateRunLimits} from './run-limits.mjs';
import {requireVersion,assertStorageCompatible} from './storage-safety.mjs';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {t3Error} from './t3-connection.mjs';
const terminal=new Set(['completed','failed','cancelled','interrupted']);
const text=(v,label,max)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw new Error(`Enter ${label} under ${max} characters.`);return v.trim();};
export class T3Tasks {
 constructor({directory,encrypt,decrypt,connection,onChange=()=>{},onResult=async()=>{},interval=5000,limits=()=>undefined,now=Date.now}){Object.assign(this,{directory,encrypt,decrypt,connection,onChange,onResult,interval,limits,now});this.jobs=[];this.locks=new Map();this.persist=Promise.resolve();this.closed=false;}
 async init(){try{const data=JSON.parse(await this.decrypt(await readFile(join(this.directory,'t3-tasks.secure'))));requireVersion(data,'T3 tasks');if(!Array.isArray(data.jobs))throw new Error('Invalid saved records.');this.jobs=data.jobs;}catch(e){if(e.code!=='ENOENT')throw new Error('Could not unlock saved T3 tasks.');}this.opened=true;return this;}
 snapshot(conversationId){return this.jobs.filter(j=>!conversationId||j.conversationId===conversationId).map(({operation,...job})=>structuredClone(job)).sort((a,b)=>b.createdAt-a.createdAt);}
 async save(){if(!this.opened)throw new Error('Storage did not open safely. Existing files were preserved.');const body=JSON.stringify({version:1,jobs:this.jobs});const write=async()=>{await assertStorageCompatible(this.directory);await mkdir(this.directory,{recursive:true,mode:0o700});const tmp=join(this.directory,'.t3-tasks-'+randomUUID());await writeFile(tmp,await this.encrypt(body),{mode:0o600});await rename(tmp,join(this.directory,'t3-tasks.secure'));};this.persist=this.persist.then(write,write);await this.persist;this.onChange(this.snapshot());}
 start(){this.timer=setInterval(()=>void this.refresh().catch(()=>{}),this.interval);this.timer.unref?.();void this.refresh().catch(()=>{});}
 get(id,conversationId){const j=this.jobs.find(j=>j.id===id&&(!conversationId||j.conversationId===conversationId));if(!j)throw new Error('This T3 task is not part of this chat.');return j;}
 async submit({conversationId,botId,projectId,title,prompt,threadId,modelSelection,sourceMessageId}){
  if(this.closed)throw new Error('T3 is closing.');projectId=text(projectId,'a project',256);prompt=text(prompt,'a task',100000);title=text(title||prompt.slice(0,80),'a title',255);
  if(!this.connection.data.endpoint)throw new Error('Connect T3 first.');
  const existing=sourceMessageId&&this.jobs.find(j=>j.conversationId===conversationId&&j.sourceMessageId===sourceMessageId&&j.projectId===projectId&&j.prompt===prompt&&j.targetThreadId===threadId);
  if(existing)return this.snapshot(conversationId).find(j=>j.id===existing.id);
  const requestId=randomUUID(),args=threadId?{threadId,message:prompt,mode:'queue',clientRequestId:requestId}:{projectId,title,message:prompt,clientRequestId:requestId,...(modelSelection?{modelSelection}:{})};
  const job={id:randomUUID(),conversationId,botId,projectId,title,prompt,sourceMessageId,targetThreadId:threadId,endpoint:this.connection.data.endpoint,connectionId:this.connection.data.identity,requestId,operation:{name:threadId?'t3_thread_send':'t3_thread_launch',args},...(threadId?{threadId}:{}),status:'submitting',createdAt:Date.now(),updatedAt:Date.now(),attempts:0,items:[]};
  this.jobs.push(job);await this.save();void this.run(job).catch(()=>{});return this.snapshot(conversationId).find(j=>j.id===job.id);
 }
 async followup({id,conversationId,message}){const original=this.get(id,conversationId);if(!original.threadId)throw new Error('Wait for T3 to confirm the original thread.');return this.submit({conversationId:original.conversationId,botId:original.botId,projectId:original.projectId,title:original.title,prompt:message,threadId:original.threadId});}
 async run(job){
  if(this.closed||this.locks.has(job.id)||job.status==='monitoring_paused')return;
  if(!terminal.has(job.status)&&this.now()-(job.monitoringSince||job.createdAt)>=validateRunLimits(this.limits()).t3MonitorHours*3600000){job.previousStatus=job.status;job.status='monitoring_paused';job.error='Monitoring time limit reached. The remote task may still be running. Resume monitoring or stop it in T3.';await this.save();return;}
  const promise=this.step(job).catch(async error=>{if(this.closed)return;job.error=t3Error(error);job.consecutiveFailures=(job.consecutiveFailures||0)+1;job.status=error.retryable===false?'failed':job.consecutiveFailures>=validateRunLimits(this.limits()).t3Retries?'monitoring_paused':'disconnected';if(job.status==='monitoring_paused')job.error='Automatic retries paused. The remote task may still be running. Resume monitoring to check the same task.';job.rejected=error.retryable===false;job.updatedAt=Date.now();job.nextAttempt=Date.now()+Math.min(30000,1000*2**Math.min(job.attempts||0,5));await this.save();if(job.rejected){await this.onResult(structuredClone(job));job.delivered=true;await this.save();}}).finally(()=>this.locks.delete(job.id));this.locks.set(job.id,promise);return promise;
 }
 async step(job){
  if(job.endpoint!==this.connection.data.endpoint)throw new Error('This task belongs to another T3 environment. Reconnect that environment to refresh it.');
  if(terminal.has(job.status)&&(job.rejected||!job.operation)){if(!job.delivered){await this.onResult(structuredClone(job));job.delivered=true;await this.save();}return;}
  if(job.operation){
   if(job.connectionId&&this.connection.data.identity!==job.connectionId){job.status='needs_review';job.error='T3 access changed before the request was confirmed. Check this task in T3 before submitting it again.';await this.save();return;}
   job.attempts++;job.status='submitting';await this.save();
   const result=await this.connection.call(job.operation.name,job.operation.args);if(this.closed)return;
   if(!result.threadId)throw new Error('T3 did not confirm a thread. Retrying will reuse the same request ID.');
   job.threadId=result.threadId;job.runId=result.runId;job.link=result.link;delete job.operation;job.status=result.status||'running';delete job.error;job.updatedAt=Date.now();await this.save();
  }
  if(!job.threadId)return;
  const result=await this.connection.call('t3_thread_wait',{threadId:job.threadId,...(job.runId?{runId:job.runId}:{}),timeoutMs:0,untilDelegatedWorkSettled:true});
  let view=await this.connection.call('t3_thread_read',{threadId:job.threadId,view:'messages',limit:100,maxCharsPerItem:20000});
  if(view.thread.itemCount>100)view=await this.connection.call('t3_thread_read',{threadId:job.threadId,view:'messages',afterPosition:view.thread.itemCount-101,limit:100,maxCharsPerItem:20000});
  const runId=result.resultRun?.runId||job.runId||result.runId;
  if(this.closed)return;
  job.items=(view.items||[]).filter(item=>!runId||item.runId===runId).map(({itemId,type,text,status,textTruncated})=>({itemId,type,text,status,truncated:!!textTruncated}));
  job.status=result.timedOut?'running':result.resultRun?.status||result.status;
  if(view.thread.pendingRequestCount&&!terminal.has(job.status))job.status='needs_input';
  job.runId=job.runId||result.runId;job.resultRunId=result.resultRun?.runId;job.link=view.thread.link||job.link;job.updatedAt=Date.now();delete job.error;delete job.nextAttempt;job.consecutiveFailures=0;
  if(terminal.has(job.status)){
   job.completedAt=job.completedAt||Date.now();job.result=job.items.filter(item=>item.text&&/assistant|agent_message|response/i.test(item.type)).map(item=>item.text).join('\n\n');
   if(!job.result)job.result=job.items.filter(item=>item.text&&!/user|input|tool/i.test(item.type)).map(item=>item.text).join('\n\n');
  }
  await this.save();if(terminal.has(job.status)&&!job.delivered){await this.onResult(structuredClone(job));job.delivered=true;await this.save();}
 }
 async refresh({id,conversationId}={}){const jobs=id?[this.get(id,conversationId)]:this.jobs.filter(j=>!terminal.has(j.status)&&!['needs_review','monitoring_paused'].includes(j.status)&&(!j.nextAttempt||j.nextAttempt<=Date.now())||terminal.has(j.status)&&!j.delivered);await Promise.all(jobs.map(j=>this.run(j)));return this.snapshot(conversationId);}
 async retry({id,conversationId}){const job=this.get(id,conversationId);if(job.status==='needs_review'||job.rejected)throw new Error(job.error);delete job.nextAttempt;if(job.status==='monitoring_paused'){job.status=job.operation?'submitting':'running';job.consecutiveFailures=0;job.monitoringSince=this.now();}await this.run(job);return this.snapshot(conversationId);}
 async cancel({id,conversationId}){const job=this.get(id,conversationId);if(!job.threadId)throw new Error('T3 has not confirmed a thread yet. Refresh it before stopping.');const requestId=job.cancelRequestId||randomUUID();job.cancelRequestId=requestId;await this.save();await this.connection.call('t3_thread_interrupt',{threadId:job.threadId,...(job.runId?{runId:job.runId}:{}),clientRequestId:requestId});job.status='cancel_requested';await this.save();return this.snapshot(conversationId);}
 async close(){this.closed=true;clearInterval(this.timer);await this.persist;}
}
