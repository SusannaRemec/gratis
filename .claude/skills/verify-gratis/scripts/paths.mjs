import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
export const profilePrefix=path.join(tmpdir(),'gratis-verify-profile-');
export const evidenceRoot=path.join(tmpdir(),'gratis-verify-evidence');
// Chromium ignores unknown switches; this one lets cleanup prove a process belongs to a given profile.
export const ownerFlag=profile=>`--gratis-verify-profile=${profile}`;
