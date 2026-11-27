"""Runs only in a fresh, socket-only PostgreSQL 16 lab. The private schema is never copied."""
import hashlib
import os
import re
import secrets
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
from pathlib import Path

os.umask(0o077)
if len(sys.argv) != 2:
    raise SystemExit('usage: python3 run-nexa-s6-m4.lab.py <authorized-private-schema-only.sql>')
base = Path(__file__).resolve().parents[2]
pg = Path('/opt/homebrew/opt/postgresql@16/bin').resolve(strict=True)
origin = base/'supabase/proposals/V525/admin_preservation.CANDIDATE.sql'
fix = base/'supabase/proposals/V533/M4-active-admin.S6.REVIEW-ONLY.sql'
check = base/'tests/security/nexa-s6-m4-admin.lab.sql'
dump = Path(sys.argv[1])
dump_sha = '7107270aff58613dc6af676bc0433630716deecc303e0345b4b92f9e44c072db'
m4_sha = '7aeb3758591b18cc411d8f326da56576a7e9820011d3a4f78a64fd9555142e02'
cap_pin = '3e618471f2fd45089768c0bbe43ab4f4'
assert hashlib.sha256(origin.read_bytes()).hexdigest() == m4_sha
schema_only = dump.read_bytes()
assert hashlib.sha256(schema_only).hexdigest() == dump_sha
cap = re.search(rb'(?m)^CREATE FUNCTION public\.get_my_capabilities\(\).*?\$\$;', schema_only, re.S)
del schema_only
assert cap is not None
assert re.fullmatch(rb'CREATE FUNCTION public\.get_my_capabilities\(\).*?from public\.profiles p\s+where p\.id=auth\.uid\(\);\s*\$\$;', cap[0], re.S)
root = Path(tempfile.mkdtemp(prefix='s6pg-', dir='/private/tmp'))
st = root.lstat()
data, sock = root/'data', root/'socket'
sock.mkdir(0o700)
password = secrets.token_urlsafe(32)
pw = root/'password'
pw.write_text(password+'\n')
admin = 'postgres'
port, db = '55461', 'nexa_s6_m4_lab'
env = {'PATH':'/usr/bin:/bin','HOME':str(root),'LC_ALL':'C','LANG':'C','TZ':'UTC'}
proc = None

def run(cmd, **kw):
    return subprocess.run([str(x) for x in cmd], capture_output=True, timeout=12, env=env, **kw)

def sql(body, database=db):
    return subprocess.run([str(pg/'psql'), '-X','-qAt','-w','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',
                           '-h',str(sock),'-p',port,'-U',admin,'-d',database],
                          capture_output=True, input=body, timeout=12,
                          env=dict(env, PGPASSWORD=password, PGREQUIREAUTH='scram-sha-256'))

def success(result, stage):
    if result.returncode:
        print(stage, 'FAIL', result.returncode, result.stderr.decode().replace(str(root),'<LAB>')[:1800])
        raise SystemExit(1)
    return result.stdout.decode().strip()

try:
    assert b'16.' in run([pg/'postgres','--version']).stdout
    success(run([pg/'initdb','-D',data,'-U',admin,'--pwfile',pw,'--auth-local=scram-sha-256',
                 '--auth-host=scram-sha-256','--locale=C','--encoding=UTF-8','--no-instructions']), 'INITDB')
    pw.unlink()
    (data/'postgresql.conf').write_text("listen_addresses = ''\nunix_socket_permissions = 0700\nport = "+port+
                                      "\nunix_socket_directories = '"+str(sock)+"'\nlog_statement = 'none'\n")
    (data/'pg_hba.conf').write_text("local all all scram-sha-256\nhost all all 0.0.0.0/0 reject\nhost all all ::/0 reject\n")
    with (root/'postgres.log').open('xb') as log:
        proc=subprocess.Popen([str(pg/'postgres'),'-D',str(data)], cwd=data, env=env,
                              stdin=subprocess.DEVNULL, stdout=log, stderr=log)
    socket_file = sock/f'.s.PGSQL.{port}'
    for _ in range(100):
        assert proc.poll() is None
        pid_file = data/'postmaster.pid'
        if pid_file.is_file() and socket_file.exists():
            lines = pid_file.read_text().splitlines()
            if len(lines) >= 8 and lines[7].strip()=='ready': break
        time.sleep(.05)
    else: raise RuntimeError('POSTMASTER_NOT_READY')
    assert lines[0]==str(proc.pid) and lines[1]==str(data) and lines[4]==str(sock)
    assert stat.S_ISSOCK(socket_file.lstat().st_mode) and stat.S_IMODE(socket_file.stat().st_mode)==0o700
    fds = success(run(['/usr/sbin/lsof','-nP','-a','-p',proc.pid,'-F','pfnt']), 'LISTENERS')
    assert f'p{proc.pid}' in fds.splitlines() and '\ntunix' in fds and str(socket_file) in fds
    assert not re.search(r'^tIPv[46]$',fds,re.M)
    print('POSTGRES16_SOCKET_ONLY_PASS', proc.pid)
    success(sql(b'CREATE DATABASE nexa_s6_m4_lab;',database='postgres'), 'CREATE_LAB_DB')
    pre = b"""
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
CREATE TABLE public.profiles(id uuid PRIMARY KEY, display_name text, access_status text,
                            is_admin boolean, is_reviewer boolean, clinical_access boolean);
INSERT INTO public.profiles VALUES
('00000000-0000-4000-8000-000000000001','fixture','active',true,false,false),
('00000000-0000-4000-8000-000000000002','fixture','disabled',true,false,false),
('00000000-0000-4000-8000-000000000003','fixture','pending',true,false,false),
('00000000-0000-4000-8000-000000000004','fixture','active',false,false,true),
('00000000-0000-4000-8000-000000000005','fixture',NULL,true,false,false);
CREATE SCHEMA nexa_audio_backup;
CREATE SCHEMA nexa_capture;
CREATE TABLE nexa_audio_backup.manifests(owner_id uuid, encounter_id uuid, session_id uuid, source_version bigint, committed_at timestamptz);
CREATE TABLE nexa_audio_backup.chunks(owner_id uuid, encounter_id uuid, session_id uuid, source_version bigint,
                                     created_at timestamptz, size int, envelope jsonb);
CREATE TABLE nexa_audio_backup.session_keys(lab_only boolean);
CREATE TABLE nexa_capture.records(owner_id uuid, encounter_id uuid, kind text, recorded_at timestamptz);
INSERT INTO nexa_capture.records VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000021','radar',now());
"""
    success(sql(pre+cap[0]+b'\n'), 'FIXTURE')
    cap_md5=success(sql(b"SELECT md5(pg_get_functiondef('public.get_my_capabilities()'::regprocedure));"),'CAPABILITY_HASH')
    assert cap_md5 == cap_pin, 'CAPABILITY_HASH_MISMATCH'
    print('CAPABILITY_HASH', cap_md5, 'PIN_MATCH', True)
    success(sql(origin.read_bytes()),'M4_PINNED_LOAD')
    baseline=sql(check.read_bytes())
    assert baseline.returncode != 0 and b'M4_UNEXPECTED_ACCESS_DISABLED_ADMIN' in baseline.stderr and b'42501' in baseline.stderr
    print('PINNED_M4_DISABLED_ADMIN_FAIL',baseline.returncode,'42501','fixture_assertion')
    success(sql(fix.read_bytes()),'M4_REVIEW_FIX_LOAD')
    corrected=sql(check.read_bytes())
    success(corrected,'M4_REVIEW_REGRESSION')
    checks=re.findall(rb'M4_[A-Z_]+_PASS',corrected.stderr)
    assert len(checks)==7
    for item in checks: print(item.decode())
    print('M4_FOCAL_RESULT','PASS',len(checks))
finally:
    if proc is not None and proc.poll() is None:
        proc.send_signal(signal.SIGINT)
        proc.wait(timeout=15)
    assert not (data/'postmaster.pid').exists() and not (sock/f'.s.PGSQL.{port}').exists()
    assert root.resolve()==root and root.lstat().st_ino==st.st_ino
    shutil.rmtree(root)
    print('LAB_REMOVED')
