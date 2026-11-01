import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const scripts=['scripts/prepare-staging-tenant-fixtures.mjs','scripts/cleanup-staging-tenant-fixtures.mjs'];
for(const path of scripts){
 test(path+' uses remote libpq parameters without leaking URL to PGDATABASE',()=>{
  const src=readFileSync(path,'utf8');
  assert.match(src,/PGHOST:hostname/);
  assert.match(src,/PGPORT:port/);
  assert.match(src,/PGUSER:username/);
  assert.match(src,/PGPASSWORD:decodeURIComponent\(target.password\)/);
  assert.match(src,/PGDATABASE:database/);
  assert.match(src,/PGSSLMODE:'require'/);
  assert.match(src,/env:stagingPgEnv\(dbTarget\)/);
  assert.doesNotMatch(src,/PGDATABASE:db(?:[,}])/);
  assert.match(src,/phaitiijsjwrggdnoxiz/);
  assert.match(src,/pooler username must be postgres/);
 });
}

test('fixture provisioning verifies remote PostgreSQL before creating users',()=>{
 const src=readFileSync(scripts[0],'utf8');
 assert.ok(src.indexOf("'--command',\"SELECT 1\"")<src.indexOf('const admin=createClient('));
 assert.match(src,/no synthetic accounts created/);
});
