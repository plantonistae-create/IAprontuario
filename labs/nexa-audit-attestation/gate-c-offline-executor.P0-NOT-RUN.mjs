#!/usr/bin/env node
/*
 * NEXA Gate C — local PostgreSQL harness, candidate-only / NOT RUN.
 * Zero external services. No server startup, provisioning, schema loading,
 * privilege change, fixture seeding or release decision.
 *
 * --inventory: local source/cluster provenance only (no SQL)
 * --catalog:  read-only local socket query of effective direct grants
 * --cases:    hard STOP before DB access: independent peer/pg_ident
 *             actor authentication has not been proven.
 *
 * This program CANNOT independently prove physical network isolation,
 * medical consent, server ACK, or production Auth.getUser() identity.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();
const LAB_ID = '.nexa-v321-pg16.wsWTxmon';
const LAB = path.join(HOME, LAB_ID);
const DATA = path.join(LAB, 'data');
const SOCKET = path.join(LAB, 'socket');
const REQUIRED_BLOBS = Object.freeze({
  'GATE_C_C01_C10_SINGLE_SESSION_NOT_RUN.md': '6a833676d829bc97b05d4420d528e6ef2cf7517a',
  'gate-c-checkpoint-atomic.P0-CANDIDATE-NOT-APPLIED.sql': '6f9d76e5883cdc8e0dd6a215ac4e7efb14054f06',
  'gate-c-evidence-materializer.P0-NOT-APPLIED.sql': '8b0b05ffa71307905c81e5225aaa5a93836e2b1f',
  'gate-c-event-producer.P0-CANDIDATE.mjs': '61380cb4d05726c1f8378e57473e514b19f09be8',
  'P0_GATE_C_MINIMUM_PRIVILEGE_MEDIATION_REVIEW_ONLY.md': 'bd747cdfc4460b64852d4f8bb61584d6341f23b3'
});
const C_IDS = Array.from({ length: 10 }, (_, i) => 'C' + String(i + 1).padStart(2, '0'));
const C_ROLES = Object.freeze({
  C01: ['A'], C02: ['B'], C03: ['A'], C04: ['A'], C05: ['A'],
  C06: ['A'], C07: ['A', 'B'], C08: ['A', 'R'], C09: ['A'], C10: ['A']
});
const ROLE_NAMES = Object.freeze({
  A: 'nexa_gc_physician_a_lab',
  B: 'nexa_gc_physician_b_lab',
  R: 'nexa_gc_reviewer_lab'
});

function stop(code) {
  console.log('RESULT=STOP_' + code);
  console.log('GATE_C=NO_GO_0_OF_19');
  process.exit(2);
}
function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
function gitBlobSha(buf) {
  const header = Buffer.from('blob ' + buf.length + '\0');
  return crypto.createHash('sha1').update(header).update(buf).digest('hex');
}
function checkFile(file, privateRequired = false) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) stop('NON_ABSOLUTE_FILE');
  let s;
  try { s = fs.lstatSync(file); } catch { stop('REQUIRED_FILE_MISSING'); }
  if (!s.isFile() || s.isSymbolicLink() || s.uid !== process.getuid()) stop('FILE_PROVENANCE');
  if (privateRequired && (s.mode & 0o077) !== 0) stop('FILE_PERMISSIONS');
  return fs.readFileSync(file);
}
function checkHash(buf, hash, kind) {
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash) ||
      sha256(buf) !== hash) stop(kind + '_HASH_MISMATCH');
}
function checkCluster() {
  if (process.getuid() === 0) stop('ROOT_USER');
  for (const dir of [LAB, DATA, SOCKET]) {
    let s;
    try { s = fs.lstatSync(dir); } catch { stop('CLUSTER_DIRECTORY_MISSING'); }
    if (!s.isDirectory() || s.isSymbolicLink() ||
        s.uid !== process.getuid() || (s.mode & 0o077) !== 0) {
      stop('CLUSTER_DIRECTORY_UNSAFE');
    }
  }
  if (fs.readFileSync(path.join(DATA, 'PG_VERSION'), 'utf8').trim() !== '16') {
    stop('CLUSTER_MAJOR_VERSION');
  }
  const cfg = fs.readFileSync(path.join(DATA, 'postgresql.conf'), 'utf8');
  const lines = cfg.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  if (!lines.includes("listen_addresses = ''") ||
      !lines.includes("unix_socket_directories = '" + SOCKET + "'") ||
      !lines.includes('unix_socket_permissions = 0700') ||
      lines.some(s => /^(include|include_dir|include_if_exists)\s*=/.test(s))) {
    stop('CLUSTER_CONFIG_UNVERIFIED');
  }
  const auto = fs.readFileSync(path.join(DATA, 'postgresql.auto.conf'), 'utf8');
  if (auto.split(/\r?\n/).some(s => s.trim() && !s.trim().startsWith('#'))) {
    stop('CLUSTER_CONFIG_OVERRIDE');
  }
}
function checkEnv() {
  if (Object.keys(process.env).some(k =>
    /^(PG[A-Z_]*|SUPABASE[A-Z_]*|DATABASE_URL|OPENAI[A-Z_]*|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|AWS_[A-Z_]+)$/i.test(k))) {
    stop('SERVICE_ENVIRONMENT_PRESENT');
  }
}
function checkManifest(file) {
  const raw = checkFile(file, true);
  let m;
  try { m = JSON.parse(raw.toString('utf8')); } catch { stop('MANIFEST_JSON_INVALID'); }
  if (!m || m.clusterId !== LAB_ID || !/^nexa_gate_c_lab_[a-z0-9_]+$/.test(m.database || '') ||
      !Number.isInteger(m.port) || m.port < 1024 || m.port > 65535) stop('MANIFEST_SCOPE');
  checkHash(checkFile(m.schemaOnly.path, true), m.schemaOnly.sha256, 'SCHEMA_ONLY');
  const migration = checkFile(m.candidate176.path, false);
  if (gitBlobSha(migration) !== 'fcc697066d35894075efe74f5dc454970803e123') {
    stop('CANDIDATE_176_BLOB');
  }
  for (const [name, hash] of Object.entries(REQUIRED_BLOBS)) {
    const data = checkFile(path.join(ROOT, name), false);
    if (gitBlobSha(data) !== hash) stop('SOURCE_BLOB_' + name.replace(/[^A-Za-z0-9]/g, '_'));
  }
  return m;
}
function independentBoundary(m, argv) {
  // An independently reviewed evidence artifact is a prerequisite, NOT
  // something this process can independently verify by reading its content.
  if (!argv.includes('--external-isolation-reviewed') ||
      !m.isolationEvidence || m.isolationEvidence.reviewed !== true) {
    stop('EXTERNAL_ISOLATION_PROOF_MISSING');
  }
  checkHash(checkFile(m.isolationEvidence.path, true),
    m.isolationEvidence.sha256, 'EXTERNAL_ISOLATION');
  console.log('ISOLATION=EXTERNAL_OPERATOR_REVIEW_REQUIRED_NOT_TOOL_PROVEN');
}
function checkServer(m) {
  const pidfile = path.join(DATA, 'postmaster.pid');
  let lines;
  try { lines = checkFile(pidfile).toString('utf8').trimEnd().split(/\r?\n/); }
  catch { stop('POSTMASTER_NOT_IDENTIFIED'); }
  if (lines.length < 5 ||
      path.resolve(lines[1] || '') !== fs.realpathSync(DATA) ||
      Number(lines[3]) !== m.port ||
      (lines[4] || '') !== SOCKET) stop('POSTMASTER_IDENTITY');
}
function psqlArgs(m, role, sqlOrFile, isFile) {
  return ['-X','-w','-q','-A','-t',
    '-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate',
    '-h',SOCKET,'-p',String(m.port),'-U',role,'-d',m.database,
    isFile ? '-f' : '-c', sqlOrFile];
}
function cleanEnv() {
  return { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME,
    LC_ALL: 'C', PGSSLMODE: 'disable', PGSERVICEFILE: '/dev/null' };
}
function validPsql(m) {
  const psql = m.psqlPath;
  if (typeof psql !== 'string' || !path.isAbsolute(psql) ||
      path.basename(psql) !== 'psql') stop('PSQL_PATH');
  let st;
  try { st = fs.statSync(psql); } catch { stop('PSQL_NOT_FOUND'); }
  if (!st.isFile()) stop('PSQL_BINARY_INVALID');
  const r = spawnSync(psql, ['--version'], { env: cleanEnv(), encoding:'utf8', timeout:5000 });
  if (r.status !== 0 || !/psql \(PostgreSQL\) 16\.15(?:\s|$)/.test(r.stdout || '')) {
    stop('PSQL_VERSION_MISMATCH');
  }
  return psql;
}
const CATALOG_SQL = [
  'BEGIN READ ONLY;',
  "SELECT 'LOC|'||current_database()||'|'||coalesce(inet_server_addr()::text,'SOCKET')||'|'||current_setting('data_directory');",
  "WITH r AS (SELECT oid,rolname,rolsuper,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated','service_role')),",
  " t AS (SELECT pg_catalog.to_regclass(name) AS oid FROM unnest(ARRAY[",
  " 'private.nexa_gate_c_consent_evidence_lab','private.nexa_gate_c_review_evidence_lab',",
  " 'private.nexa_gate_c_checkpoint_lab','private.nexa_gate_c_audit_binding_lab',",
  " 'private.nexa_gate_c_verified_source_events_lab']) AS items(name)),",
  " f AS (SELECT pg_catalog.to_regprocedure(name) AS oid FROM unnest(ARRAY[",
  " 'public.nexa_gate_c_checkpoint_candidate(uuid,uuid,bigint)',",
  " 'public.nexa_gate_c_commit_candidate(uuid,uuid,text,jsonb,jsonb)',",
  " 'public.nexa_gate_c_materialize_verified_evidence_lab(uuid,uuid)']) AS items(name))",
  " SELECT 'DENIAL|'||CASE WHEN (SELECT count(*) FROM r)=3 AND",
  " (SELECT count(oid) FROM t)=5 AND (SELECT count(oid) FROM f)=3 AND NOT EXISTS(",
  " SELECT 1 FROM r CROSS JOIN t LEFT JOIN pg_catalog.pg_class c ON c.oid=t.oid",
  " WHERE r.rolsuper OR r.rolbypassrls OR c.relowner=r.oid OR",
  " pg_catalog.pg_has_role(r.oid,c.relowner,'MEMBER') OR",
  " pg_catalog.has_table_privilege(r.oid,t.oid,",
  " 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')",
  " ) AND NOT EXISTS (SELECT 1 FROM r CROSS JOIN f WHERE",
  " pg_catalog.has_function_privilege(r.oid,f.oid,'EXECUTE'))",
  " THEN 'PASS_DIRECT_DENIAL_ONLY' ELSE 'STOP_EFFECTIVE_ACCESS' END;",
  'ROLLBACK;'
].join('\n');

function catalog(m, psql) {
  const r = spawnSync(psql, psqlArgs(m, os.userInfo().username, CATALOG_SQL, false),
    { env: cleanEnv(), encoding:'utf8', maxBuffer:65536, timeout:20000 });
  if (r.error || r.status !== 0) stop('CATALOG_CONNECTION_OR_SQL');
  const lines = (r.stdout || '').split(/\r?\n/).filter(Boolean);
  const loc = lines.find(s => s.startsWith('LOC|'));
  if (loc !== 'LOC|' + m.database + '|SOCKET|' + fs.realpathSync(DATA)) {
    stop('CATALOG_SERVER_IDENTITY');
  }
  if (!lines.includes('DENIAL|PASS_DIRECT_DENIAL_ONLY')) {
    stop('CATALOG_PRIVILEGES_UNSAFE');
  }
  console.log('CATALOG=PASS_DIRECT_DENIAL_ONLY');
  console.log('MEDIATION=NOT_PROVEN');
  console.log('GATE_C=NO_GO_0_OF_19');
}

const ACTOR_SQL = [
  'BEGIN READ ONLY;',
  "WITH r AS (SELECT oid,rolname,rolsuper,rolbypassrls,rolcanlogin,",
  " rolcreaterole,rolcreatedb FROM pg_catalog.pg_roles",
  " WHERE rolname IN ('nexa_gc_physician_a_lab',",
  " 'nexa_gc_physician_b_lab','nexa_gc_reviewer_lab')),",
  " protected AS (SELECT oid,relowner FROM pg_catalog.pg_class WHERE oid IN (",
  " pg_catalog.to_regclass('public.audit_cases'),",
  " pg_catalog.to_regclass('private.nexa_gate_c_verified_source_events_lab'),",
  " pg_catalog.to_regclass('private.nexa_gate_c_checkpoint_lab')))",
  " SELECT 'ACTORS|'||CASE WHEN (SELECT count(*) FROM r)=3 AND (SELECT count(*) FROM protected)=3",
  " AND NOT EXISTS (SELECT 1 FROM r WHERE rolsuper OR rolbypassrls",
  " OR NOT rolcanlogin OR rolcreaterole OR rolcreatedb)",
  " AND NOT EXISTS (SELECT 1 FROM r CROSS JOIN protected p",
  " WHERE r.oid=p.relowner OR pg_catalog.pg_has_role(r.oid,p.relowner,'MEMBER'))",
  " THEN 'PASS_SYNTHETIC_ROLE_RESTRICTIONS' ELSE 'STOP_UNSAFE_OR_MISSING_ACTORS' END;",
  'ROLLBACK;'
].join('\n');

function actorCatalog(m, psql) {
  const r = spawnSync(psql,
    psqlArgs(m, os.userInfo().username, ACTOR_SQL, false),
    { env:cleanEnv(), encoding:'utf8', maxBuffer:65536, timeout:20000 });
  if (r.error || r.status !== 0 ||
      !(r.stdout || '').split(/\r?\n/).includes('ACTORS|PASS_SYNTHETIC_ROLE_RESTRICTIONS')) {
    stop('INDEPENDENT_RESTRICTED_SYNTHETIC_ACTORS_NOT_PROVEN');
  }
  console.log('ACTORS=PASS_SYNTHETIC_DB_ROLE_RESTRICTIONS_ONLY');
  console.log('PRODUCTION_AUTH_BINDING=NOT_PROVEN');
}

function caseFiles(m) {
  if (!m.cases || typeof m.cases !== 'object') stop('CASE_SUITE_MISSING');
  const result = new Map();
  for (const c of C_IDS) {
    const members = m.cases[c];
    if (!members || Object.keys(members).filter(k => k !== 'barrierProtocol').sort().join(',') !== C_ROLES[c].slice().sort().join(',')) {
      stop('CASE_ROLE_MANIFEST_' + c);
    }
    for (const role of C_ROLES[c]) {
      const entry = members[role];
      if (!entry) stop('CASE_FILE_MISSING_' + c);
      const source = checkFile(entry.path, true);
      checkHash(source, entry.sha256, 'CASE_' + c + '_' + role);
      const txt = source.toString('utf8');
      if (/^\s*\\/m.test(txt) || /\b(?:COPY\s+.+\s+PROGRAM|dblink|postgres_fdw|ALTER\s+SYSTEM)\b/i.test(txt)) {
        stop('CASE_UNREVIEWED_PSQL_OR_EXTERNAL_OPERATION_' + c);
      }
      if (![0,3].includes(entry.expectedExitCode)) {
        stop('CASE_EXPECTED_EXIT_NOT_REVIEWED_' + c);
      }
      if (entry.expectedExitCode === 3 &&
          !/^[A-Z0-9]{5}$/.test(entry.expectedSqlstate || '')) {
        stop('CASE_EXPECTED_SQLSTATE_REQUIRED_' + c);
      }
      result.set(c + ':' + role, entry);
    }
  }
  return result;
}
function runOne(m, psql, file, role) {
  return new Promise(resolve => {
    let diagnostic = '';
    const child = spawn(psql, psqlArgs(m, ROLE_NAMES[role], file, true),
      { env:cleanEnv(), stdio:['ignore','pipe','pipe'] });
    child.stdout.on('data', () => {}); // never print SQL output / contents
    child.stderr.on('data', b => {
      diagnostic = (diagnostic + b.toString('utf8')).slice(-4000);
    });
    child.once('error', () => resolve({code:-1,sqlstate:'UNKNOWN'}));
    child.once('close', code => {
      const match = diagnostic.match(/\b[A-Z0-9]{5}\b/);
      resolve({code,sqlstate:match ? match[0] : 'NOT_CAPTURED'});
    });
  });
}
async function runCases(m, psql) {
  if (m.caseSuiteApproval !== 'SEPARATELY_REVIEWED_SYNTHETIC_SQL' ||
      m.actorIsolationApproval !== 'SEPARATE_SYNTHETIC_DB_SESSIONS_REVIEWED') {
    stop('CASE_SUITE_OR_ACTOR_BOUNDARY_NOT_APPROVED');
  }
  const files = caseFiles(m);
  actorCatalog(m, psql);
  if (m.cases.C07.barrierProtocol !== 'REVIEWED_DATABASE_BARRIER' ||
      m.cases.C08.barrierProtocol !== 'REVIEWED_DATABASE_BARRIER') {
    stop('CONCURRENCY_BARRIER_NOT_REVIEWED');
  }
  for (const c of C_IDS) {
    // Two genuinely different psql processes for C07 A/B and C08 A/reviewer.
    // Local identity provider / peer mapping must be independently reviewed.
    const entries = C_ROLES[c].map(r => files.get(c + ':' + r));
    const results = await Promise.all(C_ROLES[c].map((r,i) =>
      runOne(m, psql, entries[i].path, r)));
    const status = results.map((r,i) => C_ROLES[c][i] + ':' +
      String(r.code) + ':' + r.sqlstate).join(',');
    console.log(c + '=EXECUTED_UNADJUDICATED[' + status + ']');
    const mismatch = results.some((x,i) =>
      x.code !== entries[i].expectedExitCode ||
      (x.code === 3 && x.sqlstate !== entries[i].expectedSqlstate));
    if (mismatch) {
      console.log('STOP_CASE_EXECUTION_' + c);
      console.log('GATE_C=NO_GO_0_OF_19');
      process.exit(2);
    }
  }
  console.log('N01_N09=NOT_RUN_NO_APPROVED_SCENARIOS');
  stop('INDEPENDENT_CASE_ASSERTIONS_AND_AUTH_PROOF_PENDING');
}

async function main() {
  const mode = process.argv[2];
  const manifestFile = process.argv[3];
  if (!['--inventory','--catalog','--cases'].includes(mode) || !manifestFile) {
    stop('USAGE_INVENTORY_CATALOG_OR_CASES');
  }
  if (mode === '--cases') {
    // Every child psql inherits this process's Unix identity. Passing -U
    // cannot prove independently authenticated A/B/reviewer principals;
    // peer/pg_ident mappings have not been independently verified.
    stop('PEER_PG_IDENT_INDEPENDENT_ACTORS_NOT_PROVEN');
  }
  checkEnv();
  checkCluster();
  const m = checkManifest(manifestFile);
  console.log('NEXA_GATE_C_OFFLINE_EXECUTOR_NOT_RUN_IN_THIS_PR');
  console.log('SOURCES=PINNED_165_167_175_176');
  console.log('SCHEMA_ONLY=LOCAL_HASH_MATCH_NO_DATA_PRINTED');
  if (mode === '--inventory') {
    console.log('RESULT=INVENTORY_ONLY');
    console.log('ISOLATION=NOT_PROVEN');
    console.log('GATE_C=NO_GO_0_OF_19');
    return;
  }
  independentBoundary(m, process.argv.slice(4));
  checkServer(m);
  const psql = validPsql(m);
  catalog(m, psql);
  if (mode === '--cases') await runCases(m, psql);
}
main().catch(() => stop('UNEXPECTED_LOCAL_ERROR'));
