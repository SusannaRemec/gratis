import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fixtureOptions} from './electron-fixture.mjs';
test('UI fixtures require an isolated temporary directory and use a mock Mac keychain',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'gratis-fixture-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const options=await fixtureOptions({directory,executablePath:'/test/Gratis'},'darwin');assert.ok(options.args.includes('--use-mock-keychain'));assert.equal(options.env.GRATIS_TEST_HIDDEN,'1');
 await assert.rejects(fixtureOptions({directory:process.cwd()},'darwin'),/temporary/);await assert.rejects(fixtureOptions({directory:tmpdir()},'darwin'),/temporary/);await assert.rejects(fixtureOptions({},'darwin'),/temporary/);
 assert.equal((await fixtureOptions({directory},'linux')).args.includes('--use-mock-keychain'),false);
});
test('all GUI tests use the isolated launcher instead of starting Electron directly',async()=>{
 for(const file of await readdir(new URL('./',import.meta.url))){if(!file.endsWith('.mjs')||file==='electron-fixture.mjs')continue;const text=await readFile(new URL(file,import.meta.url),'utf8');assert.doesNotMatch(text,/\belectron\.launch\(/,file);}
});
