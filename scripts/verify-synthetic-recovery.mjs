/** Disposable logical export/restore probe. Never points to a hosted project. */
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {isolatedTarget} from './isolated-clinical-target.mjs';

const statusFile=process.env.NEXA_LOCAL_STATUS_JSON;
if(!statusFile?.startsWith('/tmp/nexa-pr92-stack-'))throw new Error('Disposable status file required');
const status=JSON.parse(readFileSync(statusFile,'utf8'));
const ref='local-nexa-pr92',url=status.API_URL,dbURL=status.DB_URL;
isolatedTarget({ref,ack:ref,url,dbURL,authURL:url+'/auth/v1',restURL:status.REST_URL,
 functionsURL:status.FUNCTIONS_URL,localOnly:true});
const db=new URL(dbURL);
const pgEnv={...process.env,PGHOST:db.hostname,PGPORT:db.port,
 PGUSER:decodeURIComponent(db.username),PGPASSWORD:decodeURIComponent(db.password),
 PGDATABASE:db.pathname.slice(1),PGSSLMODE:'disable'};
const psql=process.env.NEXA_LOCAL_PSQL_BIN||'psql';
function sql(query,input){
 const r=spawnSync(psql,['-X','-v','ON_ERROR_STOP=1','--quiet','--no-align','--tuples-only',
  '--command',query],{env:pgEnv,input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:30000});
 if(r.status!==0)throw new Error('Synthetic recovery SQL failed');
 return r.stdout.trim();
}
if(sql("SELECT to_regnamespace('nexa_recovery_probe') IS NULL")!=='t')
 throw new Error('Recovery probe schema already exists');
const expected='1,synthetic-alpha\n2,synthetic-beta';
let created=false;
try{
 sql("CREATE SCHEMA nexa_recovery_probe; CREATE TABLE nexa_recovery_probe.rows(id integer PRIMARY KEY,payload text NOT NULL); INSERT INTO nexa_recovery_probe.rows VALUES(1,'synthetic-alpha'),(2,'synthetic-beta')");
 created=true;
 const exportText=sql('COPY nexa_recovery_probe.rows(id,payload) TO STDOUT WITH (FORMAT csv)');
 if(exportText!==expected)throw new Error('Logical export differs from synthetic source');
 const digest=createHash('sha256').update(exportText).digest('hex');
 sql('DROP TABLE nexa_recovery_probe.rows; CREATE TABLE nexa_recovery_probe.rows(id integer PRIMARY KEY,payload text NOT NULL)');
 sql('COPY nexa_recovery_probe.rows(id,payload) FROM STDIN WITH (FORMAT csv)',exportText+'\n');
 const restored=sql('COPY nexa_recovery_probe.rows(id,payload) TO STDOUT WITH (FORMAT csv)');
 if(sql('SELECT count(*) FROM nexa_recovery_probe.rows')!=='2'||
   createHash('sha256').update(restored).digest('hex')!==digest)
  throw new Error('Synthetic logical restoration failed integrity check');
 console.log('Synthetic logical export and restoration: 2/2 rows, SHA-256 matched');
}finally{
 if(created)sql('DROP SCHEMA nexa_recovery_probe CASCADE');
}
if(sql("SELECT to_regnamespace('nexa_recovery_probe') IS NULL")!=='t')
 throw new Error('Recovery probe left residual schema');
