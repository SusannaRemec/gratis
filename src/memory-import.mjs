export const IMPORT_LIMITS={chars:60000,items:200,itemChars:1000};
const CONTROL=/[^\P{Cc}\t\n\r]|[\u202a-\u202e\u2066-\u2069]/gu,MARKER=/^(?:[•‣◦▪·]\s*|(?:[-*+]|\d{1,3}[.)])\s+)/,PAIRS=[['"','"'],["'","'"],['“','”'],['‘','’'],['«','»'],['„','“'],['「','」']];
export const importText=text=>String(text).replace(CONTROL,'').replace(/\s+/g,' ').trim();
export const importKey=text=>importText(text).normalize('NFKC').toLowerCase();
export const memoryLabel=content=>{const head=content.replace(/[.!?。！？:;,]+$/u,''),chars=[...head];if(chars.length<=50)return head;const cut=chars.slice(0,50).join(''),space=cut.lastIndexOf(' ');return(space>20?cut.slice(0,space):cut)+'…';};
function unwrap(text){
 for(;;){
  const pair=PAIRS.find(([open,close])=>text.length>2&&text.startsWith(open)&&text.endsWith(close)&&!text.slice(1,-1).includes(open)&&!text.slice(1,-1).includes(close));
  const bold=/^\*\*([^*]+)\*\*$/.exec(text);
  if(pair)text=text.slice(1,-1).trim();else if(bold)text=bold[1].trim();else return text;
 }
}
export function parseMemoryImport(text){
 if(typeof text!=='string')throw new Error('Paste the text to import.');
 if(text.length>IMPORT_LIMITS.chars)throw new Error(`That text is too long to import (over ${IMPORT_LIMITS.chars.toLocaleString('en-US')} characters). Import it in smaller parts.`);
 const items=[];let open=false;
 for(const line of text.replace(CONTROL,'').split(/\r\n|[\n\r\u2028\u2029]/)){
  const trimmed=line.trim();
  if(!trimmed){open=false;continue;}
  const marked=MARKER.test(trimmed);
  if(open&&!marked&&/^\s/.test(line)){items[items.length-1]+=' '+trimmed;continue;}
  open=false;
  if(!marked&&(/^#{1,6}(?:\s|$)/.test(trimmed)||/^\*\*[^*]+\*\*$/.test(trimmed)))continue;
  const content=importText(unwrap(importText(marked?trimmed.replace(MARKER,''):trimmed)));
  if(/[:：]$/.test(content)||!/[\p{L}\p{N}]/u.test(content)||[...content].length<3)continue;
  items.push(content);open=marked;
 }
 const seen=new Set(),out=[];
 for(const content of items){
  if(content.length>IMPORT_LIMITS.itemChars)throw new Error(`“${content.slice(0,40)}…” is longer than ${IMPORT_LIMITS.itemChars.toLocaleString('en-US')} characters. Split it into shorter lines.`);
  const key=importKey(content);if(seen.has(key))continue;seen.add(key);
  if(out.length===IMPORT_LIMITS.items)throw new Error(`That has more than ${IMPORT_LIMITS.items} items. Import them in smaller parts.`);
  out.push({title:memoryLabel(content),content});
 }
 return out;
}
