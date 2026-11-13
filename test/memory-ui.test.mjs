import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
const {document}=parseHTML('<main></main>');globalThis.document=document;
const {setupMemoryUI}=await import('../src/memory-ui.mjs');
const settle=()=>new Promise(resolve=>setTimeout(resolve,5));
const view=patch=>({enabled:true,status:'ready',learning:false,semantic:'ready',jobs:[],pending:[],profile:[],facts:[],history:[],episodes:[],task:null,context:{botId:'b',group:false,profileAccess:true},...patch});
async function mount({enabled=true,save}={}){
 const state={activeConversationId:'c1',conversations:[]},calls={saved:[],views:[]},container=document.createElement('div');
 const api={memoryView:async({conversationId})=>{calls.views.push(conversationId);return view({enabled});},memoryImport:async value=>{calls.saved.push(value);return save?save(value):{added:value.items.length,skipped:0,withheld:0};}};
 const ui=setupMemoryUI({container,api,getState:()=>state});await ui.refresh();
 const $=selector=>container.querySelector(selector),rows=()=>[...container.querySelectorAll('#memory-import-rows textarea')];
 return{state,calls,ui,$,rows,open:async()=>{await $('#memory-import').onclick();},paste:text=>{$('#memory-import-text').value=text;$('#memory-import-review').onclick();},save:()=>$('#memory-import-save').onclick(),notice:()=>container.querySelector('.memory-notice'),alert:()=>$('#memory-import-panel .memory-error'),panelOpen:()=>!$('#memory-import-panel').hidden};
}
test('Import explains itself instead of opening while memory is off',async()=>{
 const m=await mount({enabled:false});await m.open();
 assert.equal(m.panelOpen(),false);assert.equal(m.$('.memory-error').hidden,false);assert.match(m.$('.memory-error').textContent,/Memory is turned off/);
});
test('review shows pasted markup as plain text and saves only the ticked lines with their edits',async()=>{
 const m=await mount();await m.open();assert.equal(m.panelOpen(),true);
 m.paste('- <img src=x onerror=alert(1)>\n- Likes tea\n- Lives in Lisbon');
 assert.deepEqual(m.rows().map(r=>r.value),['<img src=x onerror=alert(1)>','Likes tea','Lives in Lisbon']);assert.equal(m.$('#memory-import-panel').querySelector('img'),null);assert.equal(m.$('#memory-import-save').textContent,'Save 3');
 const [,tea,lisbon]=m.rows();tea.parentNode.firstChild.checked=false;tea.parentNode.firstChild.onchange();lisbon.value='Lives in Porto';lisbon.oninput();assert.equal(m.$('#memory-import-save').textContent,'Save 2');
 await m.save();await settle();
 assert.deepEqual(m.calls.saved,[{conversationId:'c1',items:[{content:'<img src=x onerror=alert(1)>'},{content:'Lives in Porto'}]}]);assert.equal(m.notice().textContent,'Added 2 memories. Skipped 0 duplicates.');assert.equal(m.panelOpen(),false);assert.ok(m.calls.views.length>=2);
});
test('the result says how many lines were duplicates or left out as credentials',async()=>{
 const m=await mount({save:()=>({added:1,skipped:1,withheld:2})});await m.open();m.paste('- Likes tea\n- Lives in Lisbon\n- Works nights\n- Has two cats');await m.save();await settle();
 assert.equal(m.notice().textContent,'Added 1 memory. Skipped 1 duplicate. Left out 2 lines that looked like a password or key.');
});
test('a refused save keeps the review open with the reason so it can be retried',async()=>{
 let refuse=true;const m=await mount({save:value=>{if(refuse)throw new Error('Memory is turned off. Turn it on to import.');return{added:value.items.length,skipped:0,withheld:0};}});await m.open();m.paste('- Likes tea\n- Lives in Lisbon');
 await m.save();await settle();assert.equal(m.panelOpen(),true);assert.match(m.alert().textContent,/turned off/);assert.equal(m.alert().hidden,false);assert.equal(m.$('#memory-import-save').textContent,'Save 2');assert.equal(m.$('#memory-import-save').disabled,false);
 refuse=false;await m.save();await settle();assert.equal(m.panelOpen(),false);assert.match(m.notice().textContent,/Added 2 memories/);
});
test('oversized or empty pastes stay on the paste step with a message',async()=>{
 const m=await mount();await m.open();
 m.paste('a'.repeat(60001));assert.match(m.alert().textContent,/too long/);assert.equal(m.rows().length,0);assert.equal(m.$('#memory-import-text').parentNode.hidden,false);
 m.paste('# Only a heading');assert.match(m.alert().textContent,/Nothing to import/);assert.deepEqual(m.calls.saved,[]);
});
test('a save that finishes after switching chats neither reopens nor closes a newer import',async()=>{
 let finish;const m=await mount({save:()=>new Promise(resolve=>finish=resolve)});await m.open();m.paste('- Likes tea');const saving=m.save();await settle();
 assert.equal(m.$('#memory-import-save').disabled,true);
 m.state.activeConversationId='c2';await m.ui.refresh();assert.equal(m.panelOpen(),false);
 await m.open();m.paste('- Lives in Lisbon\n- Works nights');assert.equal(m.panelOpen(),true);
 finish({added:1,skipped:0,withheld:0});await saving;await settle();
 assert.equal(m.panelOpen(),true);assert.deepEqual(m.rows().map(r=>r.value),['Lives in Lisbon','Works nights']);assert.equal(m.$('#memory-import-save').textContent,'Save 2');assert.equal(m.calls.views.at(-1),'c2');assert.match(m.notice().textContent,/Added 1 memory/);
});
