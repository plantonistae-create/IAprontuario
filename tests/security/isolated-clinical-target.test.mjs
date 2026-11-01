import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isolatedTarget,forbiddenRefs} from '../../scripts/isolated-clinical-target.mjs';

test('both real NEXA projects are rejected even with matching acknowledgement',()=>{
 for(const ref of forbiddenRefs)assert.throws(()=>isolatedTarget({ref,ack:ref,
  url:`https://${ref}.supabase.co`,dbURL:`postgresql://postgres:secret@db.${ref}.supabase.co/postgres`}));
});
test('Auth and database must identify one explicitly acknowledged separate project',()=>{
 const ref='abcdefghijklmnopqrst';
 const good={ref,ack:ref,url:`https://${ref}.supabase.co/`,
  dbURL:`postgresql://postgres:secret@db.${ref}.supabase.co/postgres`};
 assert.equal(isolatedTarget(good).ref,ref);
 assert.throws(()=>isolatedTarget({...good,ack:'other'}));
 assert.throws(()=>isolatedTarget({...good,url:'https://phaitiijsjwrggdnoxiz.supabase.co/'}));
 assert.throws(()=>isolatedTarget({...good,dbURL:'postgresql://postgres:secret@db.fmkrcieubrlltiggyauc.supabase.co/postgres'}));
 assert.throws(()=>isolatedTarget({...good,dbURL:'postgresql://postgres.fmkrcieubrlltiggyauc:secret@aws-0-sa-east-1.pooler.supabase.com/postgres'}));
});
test('local mode accepts only one explicit loopback gateway and loopback PostgreSQL',()=>{
 const good={ref:'local-nexa-pr92',ack:'local-nexa-pr92',localOnly:true,
  url:'http://127.0.0.1:24028',authURL:'http://127.0.0.1:24028/auth/v1',
  restURL:'http://127.0.0.1:24028/rest/v1',functionsURL:'http://127.0.0.1:24028/functions/v1',
  dbURL:'postgresql://postgres:postgres@127.0.0.1:22454/postgres'};
 assert.equal(isolatedTarget(good).local,true);
 for(const change of [
  {ack:''},{localOnly:false},{url:'http://localhost:24028'},
  {url:'http://127.1:24028'},{url:'http://2130706433:24028'},
  {url:'http://0177.0.0.1:24028'},{url:'http://[::1]:24028'},
  {url:'http://127.0.0.1.evil.test:24028'},
  {url:'https://phaitiijsjwrggdnoxiz.supabase.co'},
  {url:'http://127.0.0.1:24028@evil.test'},
  {dbURL:'postgresql://postgres:postgres@db.fmkrcieubrlltiggyauc.supabase.co/postgres'},
  {dbURL:'postgresql://postgres:postgres@localhost:22454/postgres'},
  {dbURL:'postgresql://postgres:postgres@127.1:22454/postgres'},
  {authURL:'https://phaitiijsjwrggdnoxiz.supabase.co/auth/v1'},
  {restURL:'http://127.0.0.1:9999/rest/v1'},
  {functionsURL:'https://example.com/functions/v1'}
 ])assert.throws(()=>isolatedTarget({...good,...change}),JSON.stringify(change));
});
