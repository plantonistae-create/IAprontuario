#!/bin/bash
# Runs only the S6.4 synthetic suite with the macOS kernel blocking IP networking.
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."
node="$(printenv NEXA_S63_NODE || command -v node)"
[[ "$node" == /* && -x "$node" ]]
root=$(mktemp -d /private/tmp/s63-sandbox.XXXXXXXX)
cleanup() {
  /bin/rm -f "$root/isolation.sb"
  /bin/rmdir "$root"
}
trap cleanup EXIT
cat > "$root/isolation.sb" <<POLICY
(version 1)
(allow default)
(deny network*)
(allow network-bind (local unix-socket (subpath "$root")))
(allow network-inbound (local unix-socket (subpath "$root")))
(allow network-outbound (remote unix-socket (subpath "$root")))
POLICY

offline() {
  /usr/bin/env -i PATH=/usr/bin:/bin HOME="$root" TMPDIR="$root" LANG=C \
    NEXA_S63_SANDBOX_ROOT="$root" /usr/bin/sandbox-exec -f "$root/isolation.sb" "$node" "$@"
}

offline --input-type=module - <<'JS'
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
async function canary() {
  const net = await import('node:net');
  const dgram = await import('node:dgram');
  const loopback = ['127.0.0.1','::1'];
  const denied = error => {
    if (!['EPERM','EACCES'].includes(error?.code)) throw Error('S63_IP_EGRESS_NOT_BLOCKED');
    return error.code;
  };
  const results = [];
  for (const [i, host] of loopback.entries()) {
    const tcp = await new Promise(resolve => {
      const client = net.connect({host,port:9});
      client.once('error',resolve);
      client.once('connect',()=>{ client.destroy(); resolve(); });
    });
    const udp = await new Promise(resolve => {
      const client = dgram.createSocket(i===0?'udp4':'udp6');
      const finish = error => {
        try { client.close(); } catch {}
        resolve(error);
      };
      client.once('error',finish);
      client.send(Buffer.from('synthetic'),9,host,finish);
    });
    results.push([denied(tcp),denied(udp)]);
  }
  console.log(JSON.stringify(results));
}
await canary();
const result = spawnSync(process.execPath,['--input-type=module','-e','(' + canary.toString() + ')().catch(()=>process.exit(1))'],
  {encoding:'utf8',timeout:5000});
assert.equal(result.status,0,'S63_CHILD_EGRESS_FAILED');
assert.match(result.stdout,/\[\["(?:EPERM|EACCES)","(?:EPERM|EACCES)"\],\["(?:EPERM|EACCES)","(?:EPERM|EACCES)"\]\]/);
console.log('S63_PARENT_AND_CHILD_TCP_UDP_IPV4_IPV6_DENIED',result.stdout.trim());
JS
offline --test --test-timeout=60000 "$@" tests/nexa-s64-release-family.lab.test.mjs
