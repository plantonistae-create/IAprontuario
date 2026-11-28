import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const exec = promisify(execFile);
export const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const env = { PATH:'/usr/bin:/bin', LANG:'C', LC_ALL:'C', TZ:'UTC' };
const baseRoles = {
  s63_a:'s63_workers', s63_b:'s63_workers', s63_issuer:'s63_issuers', s63_reviewer:'s63_reviewers',
  anon:null, authenticated:null, service_role:null,
};
const db = 'nexa_s63_lab';
const port = '55463';

export async function startPostgresLab({s64=false}={}) {
  const roles={...baseRoles,...(s64?{s64_va:'s64_verifiers',s64_vb:'s64_verifiers'}:{})};
  const bin = await realpath('/opt/homebrew/opt/postgresql@16/bin');
  const version = (await exec(join(bin,'postgres'),['--version'],{env,timeout:5000})).stdout.trim();
  assert.match(version, /\b16\./);
  const parent = process.env.NEXA_S63_SANDBOX_ROOT || '/private/tmp';
  assert(/^\/private\/tmp(?:\/s63-sandbox\.[a-zA-Z0-9]+)?$/.test(parent) && await realpath(parent) === parent);
  const root = await mkdtemp(join(parent, 'pg-'));
  await chmod(root,0o700);
  const identity = await lstat(root);
  const data = join(root,'data'), socket = join(root,'s'), passwordFile = join(root,'bootstrap.pass');
  const socketFile = join(socket,'.s.PGSQL.' + port);
  const passwords = new Map(['postgres',...Object.keys(roles)].map(name => [name,randomBytes(30).toString('hex')]));
  let server;
  const clients = new Set();

  function launch(role, database) {
    if (!passwords.has(role) || !['postgres',db].includes(database)) throw Error('S63_LAB_LOGIN_REQUIRED');
    const client = spawn(join(bin,'psql'),['-X','-w','-qAt','-v','ON_ERROR_STOP=1','-h',socket,'-p',port,'-d',database,'-U',role],{
      env:{...env,HOME:root,PGPASSWORD:passwords.get(role),PGREQUIREAUTH:'scram-sha-256',PGCONNECT_TIMEOUT:'4',
        PGOPTIONS:'-c statement_timeout=9000 -c lock_timeout=6000 -c standard_conforming_strings=on'},
      stdio:['pipe','pipe','pipe'],
    });
    clients.add(client);
    client.once('close',()=>clients.delete(client));
    client.stdin.on('error',()=>{});
    let diagnostics = '';
    client.stderr.on('data',bytes => { if (diagnostics.length < 4000) diagnostics += bytes; });
    const exited = once(client,'close').then(([status]) => {
      if (status !== 0) {
        for (const secret of passwords.values()) diagnostics = diagnostics.replaceAll(secret,'<redacted>');
        throw Error(diagnostics.replaceAll(root,'<LAB>').slice(0,1500) || 'S63_PSQL_FAILED');
      }
    });
    void exited.catch(()=>{});
    return { client, exited };
  }
  async function sql(query, role = 'postgres', database = db) {
    const { client, exited } = launch(role,database);
    const output = [];
    client.stdout.on('data',bytes=>output.push(bytes));
    client.stdin.end(query + '\n');
    await exited;
    return Buffer.concat(output).toString('utf8').trim();
  }
  async function holdTransaction(query,role='postgres') {
    const {client,exited} = launch(role,db);
    const lines = createInterface({input:client.stdout});
    const ready = (async () => {
      for await (const line of lines) if (line === 'S63_TEST_LOCK_READY') return;
      await exited;
      throw Error('S63_LOCK_BARRIER_NOT_READY');
    })();
    client.stdin.write("BEGIN;\n" + query + "\nSELECT 'S63_TEST_LOCK_READY';\n");
    try { await ready; }
    catch (error) { client.kill('SIGTERM'); throw error; }
    return async (commit = true) => {
      client.stdin.end(commit ? 'COMMIT;\n' : 'ROLLBACK;\n');
      await exited;
    };
  }

  async function dispose() {
    const cleanup = [...clients].map(client => {
      if (client.exitCode !== null || client.signalCode !== null) return Promise.resolve();
      const closed = once(client,'close');
      client.kill('SIGTERM');
      return closed;
    });
    await Promise.all(cleanup);
    if (server && server.exitCode === null && server.signalCode === null) {
      const stopped = once(server,'close');
      server.kill('SIGINT');
      const result = await Promise.race([stopped,delay(10000, 'TIMEOUT',{ref:false})]);
      assert.notEqual(result, 'TIMEOUT','S63_POSTMASTER_STOP_UNPROVEN');
      assert.equal(result[0],0);
    }
    for (const path of [join(data,'postmaster.pid'),socketFile]) {
      await assert.rejects(lstat(path),{code:'ENOENT'});
    }
    const current = await lstat(root);
    assert(current.isDirectory() && current.dev === identity.dev && current.ino === identity.ino && await realpath(root) === root);
    await rm(root,{recursive:true});
    await assert.rejects(lstat(root),{code:'ENOENT'});
  }

  try {
    await mkdir(socket,{mode:0o700});
    await writeFile(passwordFile,passwords.get('postgres')+'\n',{flag:'wx',mode:0o600});
    await exec(join(bin,'initdb'),['-D',data,'-U','postgres','--pwfile',passwordFile,'--auth-local=scram-sha-256',
      '--auth-host=scram-sha-256','--encoding=UTF8','--locale=C','--no-instructions'],{env,timeout:15000});
    await rm(passwordFile);
    await writeFile(join(data,'postgresql.conf'),[
      "listen_addresses = ''", "unix_socket_directories = " + q(socket), 'unix_socket_permissions = 0700',
      'port = ' + port, "log_statement = 'none'", "log_min_error_statement = 'PANIC'", 'log_parameter_max_length_on_error = 0',
    ].join('\n')+'\n');
    await writeFile(join(data,'pg_hba.conf'),"local all all scram-sha-256\nhost all all 0.0.0.0/0 reject\nhost all all ::/0 reject\n");
    server = spawn(join(bin,'postgres'),['-D',data],{env,stdio:'ignore'});
    let ready;
    for (let i = 0; i < 100; i++) {
      const lines = (await readFile(join(data,'postmaster.pid'),'utf8').catch(()=>'' )).split('\n');
      if (lines[7]?.trim() === 'ready') { ready = lines; break; }
      if (server.exitCode !== null || server.signalCode !== null) break;
      await delay(50);
    }
    assert(ready,'S63_POSTMASTER_NOT_READY');
    assert.deepEqual([ready[0],ready[1],ready[3],ready[4]],[String(server.pid),data,port,socket]);
    const mode = await lstat(socketFile);
    assert(mode.isSocket() && (mode.mode & 0o777) === 0o700 && mode.uid === process.getuid());
    const {stdout: fds} = await exec('/usr/sbin/lsof',['-nP','-a','-p',String(server.pid),'-Fpfnt'],{env,timeout:5000});
    assert.match(fds,new RegExp('^p'+server.pid+'$','m'));
    assert(fds.includes('\ntunix') && fds.includes('\nn'+socketFile));
    assert.doesNotMatch(fds,/^tIPv[46]$/m);
    await sql('CREATE DATABASE ' + db + ';','postgres','postgres');
    await sql(await readFile(new URL('../../labs/nexa-s63/schema.LAB-ONLY.sql',import.meta.url),'utf8'));
    if(s64) await sql(await readFile(new URL('../../labs/nexa-s64/release-family.LAB-ONLY.sql',import.meta.url),'utf8'));
    for (const [role,group] of Object.entries(roles)) {
      await sql('CREATE ROLE '+role+' LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD '+
        q(passwords.get(role))+';'+(group?' GRANT '+group+' TO '+role+';':''));
    }
    return {sql,holdTransaction,dispose,version,pid:server.pid};
  } catch (error) {
    await dispose();
    throw error;
  }
}
