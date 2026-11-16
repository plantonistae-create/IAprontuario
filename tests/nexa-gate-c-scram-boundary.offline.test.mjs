import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewScramStaticProfile, SCRAM_ACTORS, REQUIRED_INDEPENDENT_EVIDENCE}
  from '../labs/nexa-audit-attestation/gate-c-scram-boundary.P0-REVIEW-ONLY.mjs';
import fs from 'node:fs';

const db='nexa_gate_c_lab_synthetic_scram';
const socket='/tmp/nexa-gc-scram-new/socket';
const sample=()=>({
  database:db,socketPath:socket,
  postgresqlConf:[
    "listen_addresses = ''",
    "unix_socket_directories = '"+socket+"'",
    'unix_socket_permissions = 0700',
    "password_encryption = 'scram-sha-256'"
  ].join('\n'),
  pgHbaConf:[
    ...[...SCRAM_ACTORS,'nexa_gc_observer_lab'].map(role =>
      'local '+db+' '+role+' scram-sha-256'),
    'local all all reject',
    'host all all 0.0.0.0/0 reject',
    'host all all ::/0 reject'
  ].join('\n'),
  pgIdentConf:'# no mappings in new synthetic lab\n'
});
const reject=(mutate,code)=>{
  const x=sample();mutate(x);
  const y=reviewScramStaticProfile(x);
  assert.equal(y.verdict,'STOP_'+code);
  assert.equal(y.gateC,'NO_GO_0_OF_19');
  assert.equal(y.independentDbAuth,'NOT_PROVEN');
};
test('a matching synthetic SCRAM profile is still NOT a physical PASS',()=>{
  const r=reviewScramStaticProfile(sample());
  assert.equal(r.verdict,'STATIC_SCRAM_PROFILE_MATCH_ONLY');
  assert.equal(r.independentDbAuth,'NOT_PROVEN');
  assert.equal(r.independentUnixActors,'NOT_PROVEN');
  assert.equal(r.actorPositiveAndCrossNegative,'NOT_RUN');
  assert.equal(r.privilegedRoleChecks,'NOT_RUN');
  assert.equal(r.casesApproved,false);
  assert.equal(r.caseResults,'C01_C10_NOT_RUN;N01_N09_NOT_RUN');
  assert.equal(r.gateC,'NO_GO_0_OF_19');
});
test('three fixed actors and a comprehensive pending-evidence matrix',()=>{
  assert.deepEqual(SCRAM_ACTORS,[
    'nexa_gc_physician_a_lab','nexa_gc_physician_b_lab','nexa_gc_reviewer_lab'
  ]);
  for(const name of ['CROSS_ACTOR_CREDENTIALS_REJECTED_FOR_EACH_PAIR',
    'SESSION_USER_EQUALS_EXPECTED_AUTHENTICATED_LOGIN',
    'ROLE_GRAPH_NO_MEMBERSHIP_OR_SET_ROLE_ESCALATION',
    'EXTERNAL_ISOLATION_INDEPENDENTLY_PROVEN',
    'SQL_CASES_C01_C10_AND_C07_C08_BARRIERS_SEPARATELY_APPROVED'])
    assert.ok(REQUIRED_INDEPENDENT_EVIDENCE.includes(name));
});
test('fail closed: invalid input',()=>reject(x=>{x.postgresqlConf=null},'CONFIG_TEXT_INVALID'));
test('fail closed: non-synthetic database',()=>reject(x=>{x.database='postgres'},'SYNTHETIC_DATABASE_SCOPE'));
test('fail closed: existing peer-lab path rejected',()=>reject(x=>{x.socketPath='/Users/test/.nexa-v321-pg16.wsWTxmon/socket'},'NEW_SOCKET_DIRECTORY_SCOPE'));
test('fail closed: path traversal rejected',()=>reject(x=>{x.socketPath='/tmp/../nexa-scram/socket'},'NEW_SOCKET_DIRECTORY_SCOPE'));
test('fail closed: TCP listener',()=>reject(x=>{x.postgresqlConf=x.postgresqlConf.replace("listen_addresses = ''","listen_addresses = 'localhost'")},'POSTGRESQL_CONFIG_UNREVIEWED'));
test('fail closed: config override',()=>reject(x=>{x.postgresqlConf+="\nlisten_addresses = '*'"},'POSTGRESQL_CONFIG_UNREVIEWED'));
test('fail closed: included config',()=>reject(x=>{x.postgresqlConf+="\ninclude_dir = 'other'"},'POSTGRESQL_CONFIG_UNREVIEWED'));
test('fail closed: wrong socket permissions',()=>reject(x=>{x.postgresqlConf=x.postgresqlConf.replace('0700','0777')},'POSTGRESQL_CONFIG_UNREVIEWED'));
test('fail closed: peer authentication substituted for actor SCRAM',()=>reject(x=>{x.pgHbaConf=x.pgHbaConf.replace('scram-sha-256','peer')},'HBA_RULES_OR_ORDER_UNREVIEWED'));
test('fail closed: trust authentication substituted for actor SCRAM',()=>reject(x=>{x.pgHbaConf=x.pgHbaConf.replace('scram-sha-256','trust')},'HBA_RULES_OR_ORDER_UNREVIEWED'));
test('fail closed: md5 authentication substituted for actor SCRAM',()=>reject(x=>{x.pgHbaConf=x.pgHbaConf.replace('scram-sha-256','md5')},'HBA_RULES_OR_ORDER_UNREVIEWED'));
test('fail closed: HBA reordering changes first-match semantics',()=>reject(x=>{x.pgHbaConf='local all all reject\n'+x.pgHbaConf.replace('\nlocal all all reject','')},'HBA_RULES_OR_ORDER_UNREVIEWED'));
test('fail closed: extra local all rule',()=>reject(x=>{x.pgHbaConf='local all all scram-sha-256\n'+x.pgHbaConf},'HBA_RULES_OR_ORDER_UNREVIEWED'));
test('fail closed: host allow rule',()=>reject(x=>{x.pgHbaConf=x.pgHbaConf.replace('host all all 0.0.0.0/0 reject','host all all 0.0.0.0/0 scram-sha-256')},'HBA_RULES_OR_ORDER_UNREVIEWED'));
test('fail closed: missing IPv6 host reject',()=>reject(x=>{x.pgHbaConf=x.pgHbaConf.replace('\nhost all all ::/0 reject','')},'HBA_RULES_OR_ORDER_UNREVIEWED'));
test('fail closed: pg_ident mappings',()=>reject(x=>{x.pgIdentConf='lab map user\n'},'IDENT_MAPPING_UNREVIEWED'));
test('fail closed: HBA include directive',()=>reject(x=>{x.pgHbaConf='include_dir elsewhere\n'+x.pgHbaConf},'HBA_RULES_OR_ORDER_UNREVIEWED'));
test('fail closed: inline comment ambiguity',()=>reject(x=>{x.pgHbaConf=x.pgHbaConf+'\nlocal all all peer # unsafe'},'CONFIG_TEXT_INVALID'));
test('original peer executor untouched and still stops before cases',()=>{
  const peer=fs.readFileSync(new URL(
    '../labs/nexa-audit-attestation/gate-c-offline-executor.P0-NOT-RUN.mjs',
    import.meta.url),'utf8');
  assert.match(peer,/if \(mode === '--cases'\) \{\s*\/\/ Every child psql inherits/);
  assert.match(peer,/stop\('PEER_PG_IDENT_INDEPENDENT_ACTORS_NOT_PROVEN'\)/);
  assert.doesNotMatch(peer,/gate-c-scram-boundary/);
});
