import {resolve} from 'node:path';
import {acquireDataLock,assertStorageCompatible,createCheckpoint,restoreCheckpoint,finishRestore} from '../src/storage-safety.mjs';
const [action,directory,checkpoint]=process.argv.slice(2);
if(!['backup','restore'].includes(action)||!directory||(action==='restore'&&!checkpoint))throw new Error('Usage: node scripts/workspace-recovery.mjs backup DATA_DIRECTORY | restore DATA_DIRECTORY CHECKPOINT_DIRECTORY. Quit Gratis first.');
const data=resolve(directory),release=await acquireDataLock(data);
try{await finishRestore(data);if(action==='backup')console.log(await createCheckpoint(data)||'No saved workspace.');else{await restoreCheckpoint(data,resolve(checkpoint));console.log('Workspace restored. Open Gratis to verify it. Provider sessions and Files were not modified.');}}finally{await release();}
