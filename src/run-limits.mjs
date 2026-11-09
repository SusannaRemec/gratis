/** Limits apply to one local response. Remote T3 execution has its own lifecycle. */
export const DEFAULT_RUN_LIMITS = Object.freeze({minutes:10,toolCalls:100,toolFailures:5,outputCharacters:1000000,t3Retries:8,t3MonitorHours:24});
const ranges={minutes:[1,120],toolCalls:[1,1000],toolFailures:[1,50],outputCharacters:[1000,1000000],t3Retries:[1,50],t3MonitorHours:[1,168]};
export function validateRunLimits(value=DEFAULT_RUN_LIMITS){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(ranges,k)))throw new Error('Invalid run limits.');
 const out={...DEFAULT_RUN_LIMITS,...value};
 for(const [key,[min,max]] of Object.entries(ranges))if(!Number.isInteger(out[key])||out[key]<min||out[key]>max)throw new Error(`${key} must be a whole number from ${min} to ${max}.`);
 return out;
}
export class RunLimitError extends Error{constructor(message){super(message);this.name='RunLimitError';}}
export function abortable(promise,signal){
 if(signal.aborted){void Promise.resolve(promise).catch(()=>{});return Promise.reject(signal.reason);}
 return new Promise((resolve,reject)=>{const cancel=()=>reject(signal.reason);signal.addEventListener('abort',cancel,{once:true});Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',cancel));});
}
export function createRunBudget(controller,limits,{durationMs=limits.minutes*60000}={}){
 let calls=0,failures=0;const started=new Set(),finished=new Set();
 const stop=reason=>{if(!controller.signal.aborted)controller.abort(new RunLimitError(reason+' Partial work is saved. Review it before choosing Retry.'));};
 const timer=setTimeout(()=>stop(`Paused after ${limits.minutes} minutes.`),durationMs);timer.unref?.();
 return {activity(a){
  if(a.status==='running'&&!started.has(a.id)){started.add(a.id);if(++calls>limits.toolCalls)stop('Paused at the tool-call limit.');}
  if(a.status==='error'&&!finished.has(a.id)){finished.add(a.id);if(++failures>=limits.toolFailures)stop('Paused after repeated tool failures.');}
  else if(a.status==='complete')finished.add(a.id);
 },stop,close(){clearTimeout(timer);},get calls(){return calls;}};
}
