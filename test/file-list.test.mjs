import test from 'node:test';import assert from 'node:assert/strict';import {visibleFiles} from '../src/file-list.mjs';
const files=[{path:'notes/Zebra.md',bytes:10,modified:3},{path:'reports/alpha.txt',bytes:80,modified:1},{path:'notes/Alpha.txt',bytes:30,modified:2}];
test('file search matches folder and filename terms without changing the source list',()=>{
 assert.deepEqual(visibleFiles(files,{query:'NOTES .txt'}).map(f=>f.path),['notes/Alpha.txt']);
 assert.deepEqual(visibleFiles(files,{query:'missing'}),[]);assert.equal(files[0].path,'notes/Zebra.md');
});
test('file sorting is deterministic for names, recent changes and size',()=>{
 assert.equal(visibleFiles(files,{sort:'size'})[0].path,'reports/alpha.txt');
 assert.equal(visibleFiles(files,{sort:'name'})[0].path,'notes/Alpha.txt');
 assert.equal(visibleFiles(files)[0].path,'notes/Zebra.md');
});
