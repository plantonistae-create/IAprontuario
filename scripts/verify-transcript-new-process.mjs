/** Read-only recovery in a fresh process with no shared client or session memory. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

const file=process.argv[2];
if(!/^\/tmp\/nexa-pr93-transcript-[a-f0-9]+-[^/]+\/session.json$/.test(file||''))
 throw new Error('Disposable session manifest required');
const m=JSON.parse(readFileSync(file,'utf8'));
if(new URL(m.api).hostname!=='127.0.0.1'&&new URL(m.api).hostname!=='localhost')
 throw new Error('Loopback Auth required');
const client=createClient(m.api,m.anon,{auth:{persistSession:false,autoRefreshToken:false}});
const {error:authError}=await client.auth.signInWithPassword({email:m.email,password:m.password});
assert.equal(authError,null);
const {data,error}=await client.from('encounter_transcript_versions')
 .select('consultation_id,encounter_id,organization_id,owner_user_id,transcript_kind,revision,transcript_text,transcript_sha256')
 .eq('consultation_id',m.consultation);
assert.equal(error,null,error?.message);
assert.equal(data?.length,3);
assert.ok(data.every(row=>row.consultation_id===m.consultation&&row.encounter_id===m.encounter&&
 row.organization_id===m.organization&&row.owner_user_id===m.owner&&
 row.transcript_sha256===createHash('sha256').update(row.transcript_text).digest('hex')));
assert.equal(data.find(row=>row.transcript_kind==='final_original')?.transcript_text,m.original);
assert.equal(data.find(row=>row.transcript_kind==='corrected')?.transcript_text,m.corrected);
await client.auth.signOut();
console.log('FRESH_PROCESS_TRANSCRIPT_RECOVERY_PASS');
