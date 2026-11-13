import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMemoryImport,IMPORT_LIMITS} from '../src/memory-import.mjs';
const contents=text=>parseMemoryImport(text).map(c=>c.content);

test('every list style loses its marker and every plain line becomes one candidate',()=>{
 assert.deepEqual(contents('- Likes tea\n* Lives in Lisbon\n• Works nights\n1. Has two cats\n2) Plays chess\n+ Runs on Sundays\nAvoids dairy'),['Likes tea','Lives in Lisbon','Works nights','Has two cats','Plays chess','Runs on Sundays','Avoids dairy']);
});
test('surrounding quotes and whitespace are trimmed, inner quotes stay',()=>{
 assert.deepEqual(contents('  "Likes tea"  \n- “Lives in Lisbon”\n\'Works nights\'\n"Says \\"hi\\"" and "bye"\nPrefers   wide\tspacing'),['Likes tea','Lives in Lisbon','Works nights','"Says \\"hi\\"" and "bye"','Prefers wide spacing']);
});
test('numbers and dashes that are part of the text are not list markers',()=>{
 assert.deepEqual(contents('1.5 litres of water a day\n-5C is the limit for runs\n*emphasis* is how they write\n2024 was a big year'),['1.5 litres of water a day','-5C is the limit for runs','*emphasis* is how they write','2024 was a big year']);
});
test('headings, labels, rules, punctuation and tiny lines are not memories',()=>{
 assert.deepEqual(contents('# What I remember\n## Work\n**Preferences**\nHere is what I know about you:\n- Languages:\n---\n***\n- - -\n...\n👍\nok\n- Uses Vim\n#1 priority is sleep'),['Uses Vim','#1 priority is sleep']);
});
test('a bold item inside a list stays, with its emphasis removed',()=>{
 assert.deepEqual(contents('- **Uses Vim**\n- **Name:** Dana'),['Uses Vim','**Name:** Dana']);
});
test('an indented line under a list item continues it, an unindented one starts a new item',()=>{
 assert.deepEqual(contents('- Prefers answers that\n    start with the result\n  and then explain\n- Likes tea\nLives in Lisbon\n  and works there'),['Prefers answers that start with the result and then explain','Likes tea','Lives in Lisbon','and works there']);
 assert.deepEqual(contents('- Likes tea\n\n  Lives in Lisbon'),['Likes tea','Lives in Lisbon']);
 assert.deepEqual(contents('- Languages:\n  Python\n  Rust'),['Python','Rust']);
});
test('duplicates are dropped case-insensitively and keep the first spelling',()=>{
 assert.deepEqual(contents('- Likes tea\n- likes TEA\n2. Likes   tea\n- Любит чай\n- любит ЧАЙ\n- Likes coffee'),['Likes tea','Любит чай','Likes coffee']);
});
test('Windows, old Mac and Unicode line breaks all split lines',()=>{
 assert.deepEqual(contents('- Likes tea\r\n- Lives in Lisbon\r\n\r\n- Works nights\r- Has two cats\u2028- Plays chess'),['Likes tea','Lives in Lisbon','Works nights','Has two cats','Plays chess']);
});
test('non-Latin text survives intact',()=>{
 const lines=['Предпочитает краткие ответы','ベジタリアンで、猫が好きです','يفضل الردود القصيرة','मुझे चाय पसंद है','Vive em São Paulo e adora pão de queijo','素食主義者です'];
 assert.deepEqual(contents(lines.map((l,i)=>`${i+1}. ${l}`).join('\n')),lines);
});
test('control characters are removed and nothing but text is returned',()=>{
 assert.deepEqual(contents('- Likes\u0000 tea\u001b\n- Lives in \u202eLisbon'),['Likes tea','Lives in Lisbon']);
});
test('each candidate carries a short label made from its text',()=>{
 const [short,long,cjk]=parseMemoryImport('- Prefers concise answers.\n- Prefers concise answers and dislikes filler language in every reply\n- '+'猫'.repeat(120));
 assert.equal(short.title,'Prefers concise answers');
 assert.equal(long.title,'Prefers concise answers and dislikes filler…');
 assert.ok(cjk.title.length<=60&&cjk.title.endsWith('…'));
 assert.equal(long.content,'Prefers concise answers and dislikes filler language in every reply');
});
test('empty or blank input has nothing to import and non-text input is refused',()=>{
 assert.deepEqual(parseMemoryImport(''),[]);
 assert.deepEqual(parseMemoryImport(' \n\t\n'),[]);
 assert.throws(()=>parseMemoryImport(null),/Paste/);
});
test('oversized input is refused with a message that says what to do',()=>{
 assert.throws(()=>parseMemoryImport('a'.repeat(IMPORT_LIMITS.chars+1)),/too long.*smaller parts/is);
 assert.deepEqual(parseMemoryImport(' '.repeat(IMPORT_LIMITS.chars)),[]);
});
test('too many items and an over-long item are refused, never trimmed to fit',()=>{
 const many=Array.from({length:IMPORT_LIMITS.items+1},(_,i)=>`- Item number ${i}`).join('\n');
 assert.throws(()=>parseMemoryImport(many),new RegExp(`more than ${IMPORT_LIMITS.items}`));
 assert.equal(parseMemoryImport(many.split('\n').slice(0,IMPORT_LIMITS.items).join('\n')).length,IMPORT_LIMITS.items);
 const long='Loves '+'very '.repeat(IMPORT_LIMITS.itemChars/5)+'long lists';
 assert.throws(()=>parseMemoryImport(`- Short one\n- ${long}`),/Loves very.*shorter lines/s);
 assert.throws(()=>parseMemoryImport('- '+'x'.repeat(IMPORT_LIMITS.itemChars/2)+'\n  '+'y'.repeat(IMPORT_LIMITS.itemChars/2+1)),/shorter lines/);
 assert.equal(parseMemoryImport('- '+'x'.repeat(IMPORT_LIMITS.itemChars))[0].content.length,IMPORT_LIMITS.itemChars);
});
