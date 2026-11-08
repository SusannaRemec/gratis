import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {reconcileChildren} from '../src/ui-dom.mjs';
import {sidebarItems,sidebarPreview} from '../src/sidebar-items.mjs';
import {isBlankComputerFrame,computerNotice} from '../src/computer-preview.mjs';

test('stream updates preserve existing DOM nodes and only insert/remove changed siblings',()=>{
 const {document}=parseHTML('<div id="messages"><p id="history">Previous answer</p><p id="live">First token</p></div>');
 const container=document.getElementById('messages'),history=container.firstChild,live=container.lastChild;
 const changed=document.createElement('p');changed.textContent='Second token';
 reconcileChildren(container,[history,changed]);
 assert.equal(container.firstChild,history);assert.equal(history.isConnected,true);assert.equal(live.isConnected,false);
 reconcileChildren(container,[history,changed]);assert.equal(container.lastChild,changed);
});
test('stream timestamps do not reorder another chat above the latest actual message',()=>{
 const state={bots:[{id:'a',name:'Alpha',createdAt:1},{id:'b',name:'Beta',createdAt:2}],conversations:[{id:'ca',botId:'a',createdAt:1,updatedAt:9000,messages:[{content:'Old streaming answer',createdAt:10,status:'streaming'}]},{id:'cb',botId:'b',createdAt:2,updatedAt:20,messages:[{content:'New user request',createdAt:20}]}]};
 assert.deepEqual(sidebarItems(state).map(x=>x.key),['b','a']);
 state.conversations[0].updatedAt=99999;assert.deepEqual(sidebarItems(state).map(x=>x.key),['b','a']);
 state.conversations[0].messages.push({content:'New request',createdAt:30});assert.equal(sidebarItems(state)[0].key,'a');
 assert.equal(sidebarPreview('## **A title**\nSee [the source](https://example.com).'),'A title See the source.');
});
test('startup blank frames are placeholders while actual website warnings remain visible',()=>{
 const warning='The page is blank or still loading. Wait briefly and inspect again before acting.';
 assert.equal(isBlankComputerFrame({url:'about:blank'}),true);
 assert.equal(isBlankComputerFrame({url:'https://example.com'}),false);
 assert.equal(computerNotice(warning,null),'');
 assert.equal(computerNotice(warning,{url:'https://computer.example/start'}),'');
 assert.equal(computerNotice(warning,{url:'https://example.com'}),warning);
 assert.equal(computerNotice('Connection interrupted',null),'Connection interrupted');
});
